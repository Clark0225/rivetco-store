// POST /api/contact — emails Contact page messages to the store (via Resend).

import { json, sendEmail, escapeHtml } from "../_lib/store.js";

export async function onRequestPost({ request, env }) {
  let d;
  try { d = await request.json(); } catch (e) { return json(400, { error: "Invalid request." }); }
  if (d.company) return json(200, { ok: true }); // honeypot field filled → spam bot; pretend success
  const name = String(d.name || "").trim().slice(0, 100);
  const email = String(d.email || "").trim().slice(0, 150);
  const message = String(d.message || "").trim().slice(0, 4000);
  const phone = String(d.phone || "").trim().slice(0, 30);
  const order = String(d.order || "").trim().slice(0, 60);
  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: "Please fill in your name, email and message." });
  }
  const rows = [["Name", name], ["Email", email], ["Phone", phone], ["Order reference", order]].filter((r) => r[1]);
  const sent = await sendEmail(env, {
    subject: `Website message from ${name}`,
    replyTo: email,
    html: `<table cellpadding="6" style="font-family:Arial,sans-serif;font-size:14px">${rows.map(([k, v]) => `<tr><td style="color:#666">${k}</td><td>${escapeHtml(v)}</td></tr>`).join("")}</table>
<p style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${escapeHtml(message)}</p>`,
    text: rows.map(([k, v]) => `${k}: ${v}`).join("\n") + "\n\n" + message,
  });
  if (!sent) {
    console.log("CONTACT MESSAGE (email not sent)", JSON.stringify({ name, email, phone, order, message }));
    return json(503, { error: "Sorry, messages can't be sent right now. Please email or WhatsApp us instead." });
  }
  return json(200, { ok: true });
}

export const onRequest = () => json(405, { error: "Method not allowed" });
