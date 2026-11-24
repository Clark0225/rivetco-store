// POST /.netlify/functions/paymob-webhook
// Paymob calls this after every transaction ("Transaction processed callback").
// It checks Paymob's HMAC signature, and for successful payments saves the order to the
// Netlify form "paid-orders" — Netlify then emails the order to the store.
//
// Netlify environment variable:
//   PAYMOB_HMAC_SECRET   Paymob dashboard → Settings → Account info → HMAC

const crypto = require("crypto");
const { json } = require("../lib/store");

const HMAC_FIELDS = [
  "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id",
  "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded", "is_standalone_payment",
  "is_voided", "order.id", "owner", "pending", "source_data.pan", "source_data.sub_type",
  "source_data.type", "success",
];

const pick = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
const str = (v) => (v === true ? "true" : v === false ? "false" : v == null ? "" : String(v));

function validHmac(obj, received, secret) {
  if (!received || !secret) return false;
  const message = HMAC_FIELDS.map((f) => str(pick(obj, f))).join("");
  const expected = crypto.createHmac("sha512", secret).update(message).digest("hex");
  const a = Buffer.from(expected, "utf8"), b = Buffer.from(String(received).toLowerCase(), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "Bad JSON" }); }
  const obj = body.obj;
  if (body.type !== "TRANSACTION" || !obj) return json(200, { ignored: true }); // e.g. card-token callbacks

  const hmac = (event.queryStringParameters || {}).hmac;
  if (!validHmac(obj, hmac, process.env.PAYMOB_HMAC_SECRET)) {
    console.warn("Rejected Paymob callback with invalid HMAC", obj && obj.id);
    return json(401, { error: "Invalid signature" });
  }

  const paid = obj.success === true && obj.pending === false && !obj.is_refunded && !obj.is_voided;
  console.log(`Paymob transaction ${obj.id} order ${obj.order && obj.order.id}: success=${obj.success} pending=${obj.pending}`);
  if (!paid) return json(200, { received: true, recorded: false });

  const order = obj.order || {};
  const ship = order.shipping_data || obj.billing_data || {};
  const items = (order.items || []).filter((i) => i.name !== "Shipping");
  const shippingItem = (order.items || []).find((i) => i.name === "Shipping");
  const fields = {
    "form-name": "paid-orders",
    order_reference: order.merchant_order_id || "",
    paymob_order_id: String(order.id || ""),
    paymob_transaction_id: String(obj.id || ""),
    amount_egp: (Number(obj.amount_cents || 0) / 100).toFixed(2),
    customer_name: `${ship.first_name || ""} ${ship.last_name || ""}`.trim(),
    phone: ship.phone_number || "",
    email: ship.email || "",
    governorate: ship.state || "",
    city: ship.city || "",
    address: [ship.street, ship.floor && ship.floor !== "NA" ? `Floor ${ship.floor}` : "", ship.apartment && ship.apartment !== "NA" ? `Apt ${ship.apartment}` : ""].filter(Boolean).join(", "),
    items: items.map((i) => `${i.name} — ${(Number(i.amount_cents || 0) / 100).toFixed(2)} EGP${i.description ? ` (${i.description})` : ""}`).join("\n"),
    shipping_egp: shippingItem ? (Number(shippingItem.amount_cents || 0) / 100).toFixed(2) : "0.00",
    notes: ship.shipping_method && ship.shipping_method !== "Standard" ? ship.shipping_method : "",
  };

  try {
    const origin = process.env.URL || new URL(event.rawUrl).origin;
    const res = await fetch(`${origin}/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
    if (!res.ok) console.error("Saving order to Netlify Forms failed", res.status);
  } catch (err) {
    // The payment is still safe in the Paymob dashboard; log so it can be found in Netlify function logs.
    console.error("Could not save paid order", JSON.stringify(fields), err);
  }
  return json(200, { received: true, recorded: true });
};
