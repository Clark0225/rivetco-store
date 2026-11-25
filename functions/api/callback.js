// GET /api/callback — GitHub sends the admin back here after login. We swap the one-time
// code for an access token and hand it to the admin panel window (Decap CMS handshake).

function page(status, payload) {
  // payload is passed through JSON.stringify twice so it is a safe JS string literal.
  const message = JSON.stringify(`authorization:github:${status}:${JSON.stringify(payload)}`).replace(/</g, "\\u003c");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Signing in…</title></head>
<body style="font-family:Arial,sans-serif;padding:24px">${status === "success" ? "Signed in. You can close this window." : "Sign-in failed. Close this window and try again."}
<script>
(function () {
  var msg = ${message};
  if (!window.opener) { return; }
  function receive(e) {
    if (e.origin !== window.location.origin) return;
    window.opener.postMessage(msg, e.origin);
    window.removeEventListener("message", receive, false);
  }
  window.addEventListener("message", receive, false);
  window.opener.postMessage("authorizing:github", window.location.origin);
})();
</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": "rivet_oauth_state=; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = request.headers.get("Cookie") || "";
  const saved = (cookie.match(/(?:^|;\s*)rivet_oauth_state=([^;]+)/) || [])[1];
  if (!code || !state || !saved || state !== saved) {
    return page("error", { message: "Login expired or was tampered with. Please try again." });
  }
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return page("error", { message: "Admin login isn't set up yet." });
  }
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "rivetco-store" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/callback`,
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.access_token) {
    console.error("GitHub token exchange failed", res.status, out.error, out.error_description);
    return page("error", { message: out.error_description || "GitHub login failed." });
  }
  return page("success", { token: out.access_token, provider: "github" });
}
