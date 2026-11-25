// Shared helpers for the Cloudflare Pages Functions.
// Prices are always re-read from the site's own /content files, so a shopper can't
// change prices in their browser.

export async function loadContent(env, request, name) {
  const url = new URL(`/content/${name}.json`, request.url);
  const res = env.ASSETS ? await env.ASSETS.fetch(url) : await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${name}.json (${res.status})`);
  return res.json();
}

export function shippingFee(settings, governorate, subtotal) {
  const sh = settings.shipping || {};
  if (sh.free_over && subtotal >= Number(sh.free_over)) return 0;
  const zone = (sh.zones || []).find((z) => (z.governorates || []).includes(governorate));
  return Number(zone ? zone.fee : sh.default_fee) || 0;
}

// Turn the shopper's cart [{id,size,qty}] into priced lines, or throw a friendly error.
export function priceCart(products, items) {
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

export function userError(message) {
  const e = new Error(message);
  e.userFacing = true;
  return e;
}

export const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export const escapeHtml = (v) => String(v == null ? "" : v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Send an email through Resend (https://resend.com). Returns true if sent.
// Env: RESEND_API_KEY, STORE_EMAIL (where alerts go), EMAIL_FROM (optional).
export async function sendEmail(env, { subject, html, text, replyTo }) {
  if (!env.RESEND_API_KEY || !env.STORE_EMAIL) {
    console.warn("Email not sent: RESEND_API_KEY or STORE_EMAIL is not set.", subject);
    return false;
  }
  const res = await fetch(`${env.RESEND_API_BASE || "https://api.resend.com"}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM || "Rivet.Co Store <onboarding@resend.dev>",
      to: env.STORE_EMAIL.split(",").map((s) => s.trim()).filter(Boolean),
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) {
    console.error("Resend error", res.status, (await res.text()).slice(0, 500));
    return false;
  }
  return true;
}
