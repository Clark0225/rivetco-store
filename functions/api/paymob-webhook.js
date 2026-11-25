// POST /api/paymob-webhook
// Paymob calls this after every transaction ("Transaction processed callback").
// It checks Paymob's HMAC signature, and for successful payments emails the order to the store.
//
// Cloudflare environment variables:
//   PAYMOB_HMAC_SECRET   Paymob dashboard → Settings → Account info → HMAC   (type: Secret)
//   RESEND_API_KEY, STORE_EMAIL, EMAIL_FROM   see functions/_lib/store.js

import { json, sendEmail, escapeHtml } from "../_lib/store.js";

const HMAC_FIELDS = [
  "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id",
  "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded", "is_standalone_payment",
  "is_voided", "order.id", "owner", "pending", "source_data.pan", "source_data.sub_type",
  "source_data.type", "success",
];

const pick = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
const str = (v) => (v === true ? "true" : v === false ? "false" : v == null ? "" : String(v));

async function hmacSha512Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function validHmac(obj, received, secret) {
  if (!received || !secret) return false;
  const message = HMAC_FIELDS.map((f) => str(pick(obj, f))).join("");
  return safeEqual(await hmacSha512Hex(secret, message), String(received).toLowerCase());
}

export function orderFromTransaction(obj) {
  const order = obj.order || {};
  const ship = order.shipping_data || obj.billing_data || {};
  const items = (order.items || []).filter((i) => i.name !== "Shipping");
  const shippingItem = (order.items || []).find((i) => i.name === "Shipping");
  const egp = (c) => (Number(c || 0) / 100).toFixed(2);
  return {
    reference: order.merchant_order_id || "",
    paymob_order_id: String(order.id || ""),
    transaction_id: String(obj.id || ""),
    amount: egp(obj.amount_cents),
    shipping: shippingItem ? egp(shippingItem.amount_cents) : "0.00",
    name: `${ship.first_name || ""} ${ship.last_name || ""}`.trim(),
    phone: ship.phone_number || "",
    email: ship.email || "",
    governorate: ship.state || "",
    city: ship.city || "",
    address: [ship.street, ship.floor && ship.floor !== "NA" ? `Floor ${ship.floor}` : "", ship.apartment && ship.apartment !== "NA" ? `Apt ${ship.apartment}` : ""].filter(Boolean).join(", "),
    notes: ship.shipping_method && ship.shipping_method !== "Standard" ? ship.shipping_method : "",
    items: items.map((i) => ({ name: i.name, price: egp(i.amount_cents), detail: i.description || "" })),
  };
}

function orderEmail(o) {
  const rows = [
    ["Order reference", o.reference], ["Amount paid", `${o.amount} EGP`], ["Shipping", `${o.shipping} EGP`],
    ["Customer", o.name], ["Phone", o.phone], ["Email", o.email],
    ["Governorate", o.governorate], ["City / area", o.city], ["Address", o.address], ["Notes", o.notes],
    ["Paymob order", o.paymob_order_id], ["Paymob transaction", o.transaction_id],
  ].filter((r) => r[1]);
  const html = `<h2>New paid order ${escapeHtml(o.reference)}</h2>
<table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
${rows.map(([k, v]) => `<tr><td style="color:#666">${escapeHtml(k)}</td><td><strong>${escapeHtml(v)}</strong></td></tr>`).join("")}
</table>
<h3>Items</h3><ul>${o.items.map((i) => `<li>${escapeHtml(i.name)} — ${escapeHtml(i.price)} EGP<br><small style="color:#666">${escapeHtml(i.detail)}</small></li>`).join("")}</ul>`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n") + "\n\nItems:\n" + o.items.map((i) => `- ${i.name} — ${i.price} EGP (${i.detail})`).join("\n");
  return { subject: `New paid order ${o.reference} — ${o.amount} EGP`, html, text };
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { return json(400, { error: "Bad JSON" }); }
  const obj = body && body.obj;
  if (body.type !== "TRANSACTION" || !obj) return json(200, { ignored: true }); // e.g. card-token callbacks

  const hmac = new URL(request.url).searchParams.get("hmac");
  if (!(await validHmac(obj, hmac, env.PAYMOB_HMAC_SECRET))) {
    console.warn("Rejected Paymob callback with invalid HMAC", obj && obj.id);
    return json(401, { error: "Invalid signature" });
  }

  const paid = obj.success === true && obj.pending === false && !obj.is_refunded && !obj.is_voided;
  console.log(`Paymob transaction ${obj.id} order ${obj.order && obj.order.id}: success=${obj.success} pending=${obj.pending}`);
  if (!paid) return json(200, { received: true, recorded: false });

  const order = orderFromTransaction(obj);
  // Always log, so the order can be found in Cloudflare's function logs even if email fails.
  // The payment and customer details are also always in the Paymob dashboard.
  console.log("PAID ORDER", JSON.stringify(order));
  const sent = await sendEmail(env, { ...orderEmail(order), replyTo: order.email || undefined });
  return json(200, { received: true, recorded: true, emailed: sent });
}

export const onRequest = () => json(405, { error: "Method not allowed" });
