// GET /api/auth — starts the GitHub login for the admin panel (/admin).
// Env: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (from a GitHub OAuth App whose callback URL is
//      https://YOUR-SITE/api/callback).

export async function onRequestGet({ request, env }) {
  if (!env.GITHUB_CLIENT_ID) {
    return new Response("Admin login isn't set up yet: GITHUB_CLIENT_ID is missing.", { status: 503 });
  }
  const url = new URL(request.url);
  const state = crypto.randomUUID();
  const scope = url.searchParams.get("scope") || "repo";
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", `${url.origin}/api/callback`);
  authorize.searchParams.set("scope", scope);
  authorize.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Set-Cookie": `rivet_oauth_state=${state}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      "Cache-Control": "no-store",
    },
  });
}
