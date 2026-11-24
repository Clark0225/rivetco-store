// POST /.netlify/functions/create-payment
// Checks the cart against live prices and stock, creates a Paymob payment intention,
// and returns the Paymob checkout URL for the browser to open.
//
// Netlify environment variables (Site configuration → Environment variables):
//   PAYMOB_SECRET_KEY       Paymob dashboard → Settings → Account info → Secret key
//   PAYMOB_PUBLIC_KEY       Paymob dashboard → Settings → Account info → Public key
//   PAYMOB_INTEGRATION_IDS  Comma-separated integration IDs (e.g. card, Apple Pay): "1234567,1234568"
//   PAYMOB_API_BASE         Optional. Defaults to https://accept.paymob.com (Egypt)

const { loadContent, shippingFee, priceCart, json } = require("../lib/store");

const clip = (v, n) => String(v == null ? "" : v).trim().slice(0, n) || "NA";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const { PAYMOB_SECRET_KEY, PAYMOB_PUBLIC_KEY, PAYMOB_INTEGRATION_IDS } = process.env;
  const API = (process.env.PAYMOB_API_BASE || "https://accept.paymob.com").replace(/\/$/, "");
  if (!PAYMOB_SECRET_KEY || !PAYMOB_PUBLIC_KEY || !PAYMOB_INTEGRATION_IDS) {
    console.error("Paymob keys are missing from the Netlify environment variables.");
    return json(503, { error: "Online payment isn't switched on yet. Please contact us to order." });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Invalid request." }); }
  const c = body.customer || {};
  const phone = String(c.phone || "").replace(/[\s-]/g, "");
  if (!/^(\+?20|0)?1[0125]\d{8}$/.test(phone)) return json(400, { error: "Please enter a valid Egyptian mobile number." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email || "")) return json(400, { error: "Please enter a valid email." });
  for (const k of ["first_name", "last_name", "governorate", "city", "address"]) {
    if (!String(c[k] || "").trim()) return json(400, { error: "Please complete your delivery details." });
  }
  const e164 = "+20" + phone.replace(/^(\+?20|0)/, "");

  const origin = new URL(event.rawUrl).origin;
  try {
    const [{ products = [] }, settings] = await Promise.all([loadContent(origin, "products"), loadContent(origin, "settings")]);
    const lines = priceCart(products, body.items);
    const subtotal = lines.reduce((n, l) => n + l.total, 0);
    const shipping = shippingFee(settings, c.governorate, subtotal);
    const total = subtotal + shipping;
    const cents = (n) => Math.round(n * 100);

    // One Paymob item per cart line (quantity 1, line total) so the amounts always add up exactly.
    const items = lines.map((l) => ({
      name: clip(`${l.product.name}${l.product.color ? " " + l.product.color : ""} / ${l.size}${l.qty > 1 ? " x" + l.qty : ""}`, 50),
      amount: cents(l.total),
      description: clip(`${l.product.id} | size ${l.size} | qty ${l.qty} | ${l.unit} EGP each`, 255),
      quantity: 1,
    }));
    if (shipping > 0) items.push({ name: "Shipping", amount: cents(shipping), description: clip(`Delivery to ${c.governorate}`, 255), quantity: 1 });

    const reference = `RVT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const payload = {
      amount: cents(total),
      currency: "EGP",
      payment_methods: PAYMOB_INTEGRATION_IDS.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (/^\d+$/.test(s) ? Number(s) : s)),
      items,
      billing_data: {
        first_name: clip(c.first_name, 50),
        last_name: clip(c.last_name, 50),
        email: clip(c.email, 100),
        phone_number: e164,
        street: clip(c.address, 200),
        building: "NA",
        floor: clip(c.floor, 20),
        apartment: clip(c.apartment, 20),
        city: clip(c.city, 60),
        state: clip(c.governorate, 60),
        country: "EG",
        shipping_method: clip(c.notes ? `Notes: ${c.notes}` : "Standard", 255),
      },
      customer: { first_name: clip(c.first_name, 50), last_name: clip(c.last_name, 50), email: clip(c.email, 100) },
      special_reference: reference,
      notification_url: `${origin}/.netlify/functions/paymob-webhook`,
      redirection_url: `${origin}/thank-you.html`,
      extras: { governorate: c.governorate, notes: String(c.notes || "").slice(0, 300) },
    };

    const res = await fetch(`${API}/v1/intention/`, {
      method: "POST",
      headers: { Authorization: `Token ${PAYMOB_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.client_secret) {
      console.error("Paymob intention failed", res.status, JSON.stringify(out).slice(0, 1000));
      return json(502, { error: "We couldn't reach the payment provider. Please try again in a moment." });
    }

    const checkout_url = `${API}/unifiedcheckout/?publicKey=${encodeURIComponent(PAYMOB_PUBLIC_KEY)}&clientSecret=${encodeURIComponent(out.client_secret)}`;
    return json(200, { checkout_url, reference, total });
  } catch (err) {
    if (err.userFacing) return json(400, { error: err.message });
    console.error("create-payment error", err);
    return json(500, { error: "Something went wrong starting your payment. Please try again." });
  }
};
