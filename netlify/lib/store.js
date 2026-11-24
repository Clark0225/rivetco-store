// Shared helpers for the payment functions.
// Prices are always re-read from the live site's /content files here, so a shopper
// can't change prices in their browser.

async function loadContent(origin, name) {
  const res = await fetch(`${origin}/content/${name}.json`, { headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`Could not load ${name}.json (${res.status})`);
  return res.json();
}

function shippingFee(settings, governorate, subtotal) {
  const sh = settings.shipping || {};
  if (sh.free_over && subtotal >= Number(sh.free_over)) return 0;
  const zone = (sh.zones || []).find((z) => (z.governorates || []).includes(governorate));
  return Number(zone ? zone.fee : sh.default_fee) || 0;
}

// Turn the shopper's cart [{id,size,qty}] into priced lines, or throw a friendly error.
function priceCart(products, items) {
  if (!Array.isArray(items) || !items.length) throw userError("Your cart is empty.");
  if (items.length > 25) throw userError("Too many items in cart.");
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  return items.map((i) => {
    const p = byId[i && i.id];
    const qty = Math.floor(Number(i && i.qty));
    if (!p) throw userError("An item in your cart is no longer available. Please review your cart.");
    if (!(qty >= 1 && qty <= 10)) throw userError("Invalid quantity in cart.");
    const size = (p.sizes || []).find((s) => s.size === i.size);
    if (!size || !size.in_stock) throw userError(`${p.name}${p.color ? " " + p.color : ""} in size ${i.size} is out of stock.`);
    const unit = Number(p.price);
    if (!(unit > 0)) throw userError("An item in your cart has no price. Please contact us.");
    return { product: p, size: i.size, qty, unit, total: unit * qty };
  });
}

function userError(message) {
  const e = new Error(message);
  e.userFacing = true;
  return e;
}

const json = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

module.exports = { loadContent, shippingFee, priceCart, userError, json };
