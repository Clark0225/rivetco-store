# Rivet.Co store: setup guide (Cloudflare)

A free-hosted replacement for the Shopify store at rivetcoeg.com.

- **Hosting:** GitHub (stores the files) + Cloudflare Pages (runs the site). Free plan.
- **Payments:** Paymob (Visa, Mastercard, Meeza, Apple Pay). Paymob charges a fee per payment.
- **Order and contact emails:** sent through Resend (free plan).
- **Admin panel:** `yoursite/admin`. The client logs in with a GitHub account to edit products, prices, stock, photos, the home page, shipping fees, FAQs and policies.

> Why not Netlify: since June 2026, `*.netlify.app` sites (and many Netlify custom domains) don't open from Egyptian internet providers without a VPN.

---

## What's in the folder

| Path | What it is |
|---|---|
| `public/` | The website itself. Cloudflare publishes only this folder. |
| `public/content/*.json` | All store content. The admin panel edits these. |
| `public/admin/` | The admin panel |
| `public/_redirects` | Keeps old Shopify links working |
| `public/_headers` | Security and caching headers |
| `functions/api/` | Code that runs on Cloudflare: payment, Paymob callback, contact form, admin login |
| `README.md` | This guide (not published on the site) |

---

## Step 1: Put the files on GitHub

The old upload was laid out for Netlify. Start the repo fresh so old files don't get mixed in:

1. Open the repo → **Settings** → scroll to the bottom → **Delete this repository**. (This also disconnects the old Netlify site.)
2. Create it again: **New repository** → name `rivetco-store` → **Private** → **Create repository**.
3. Click **uploading an existing file**. Unzip `rivetco-store.zip`, open the `rivetco-store` folder, press **Ctrl+A**, and drag everything into the upload box.
4. Check that `public` and `functions` appear in the list, then **Commit changes**.

## Step 2: Put the site on Cloudflare Pages

1. Sign up at dash.cloudflare.com (free).
2. Go to **Workers & Pages → Create → Pages** tab → **Connect to Git**. Make sure it's **Pages**, not Workers.
3. Connect GitHub, allow access to `rivetco-store` only, and pick the repo.
4. Build settings:
   - Framework preset: **None**
   - Build command: leave **empty**
   - Build output directory: **`public`**
5. **Save and Deploy.** The site will be at `https://rivetco-store.pages.dev` (or a similar name).
6. **Test on Egyptian internet** (Wi-Fi and mobile data) before going further.

Every time something changes on GitHub (including Publish in the admin panel), Cloudflare updates the site in about a minute.

## Step 3: Add the settings (environment variables)

In Cloudflare: your Pages project → **Settings → Variables and Secrets → Add**. Use type **Secret** for anything marked secret. After adding or changing any, go to **Deployments** → latest → **⋯ → Retry deployment** so the site picks them up.

| Name | What | Type |
|---|---|---|
| `STORE_EMAIL` | Where order and contact emails go | Text |
| `RESEND_API_KEY` | From Resend (Step 4) | Secret |
| `GITHUB_CLIENT_ID` | From GitHub (Step 5) | Text |
| `GITHUB_CLIENT_SECRET` | From GitHub (Step 5) | Secret |
| `PAYMOB_SECRET_KEY` | Paymob → Settings → Account info | Secret |
| `PAYMOB_PUBLIC_KEY` | Paymob → Settings → Account info | Text |
| `PAYMOB_INTEGRATION_IDS` | Paymob → Developers → Payment integrations, comma-separated | Text |
| `PAYMOB_HMAC_SECRET` | Paymob → Settings → Account info → HMAC | Secret |

Anything missing just switches that feature off with a friendly message. Nothing breaks.

## Step 4: Order and contact emails (Resend)

1. Sign up at resend.com **using the store's email address** (the one you'll put in `STORE_EMAIL`).
2. **API Keys → Create API key** → copy it into `RESEND_API_KEY`.
3. Until a domain is verified, Resend only delivers to the email address of the Resend account, so `STORE_EMAIL` must be that same address.
4. Later, once rivetcoeg.com is set up: **Domains → Add domain** in Resend, then add `EMAIL_FROM` = `Rivet.Co Store <orders@rivetcoeg.com>`. After that, `STORE_EMAIL` can be any address (comma-separate several).

Each paid order emails the store with the customer's name, phone, address, items and amount. Replying to the email replies to the customer. Every payment is also in the Paymob dashboard.

## Step 5: Admin panel login (GitHub)

The admin panel saves edits straight to the GitHub repo, so whoever edits needs a GitHub account with access to the repo.

1. Go to github.com/settings/developers → **OAuth Apps → New OAuth App**.
   - Application name: `Rivet.Co admin`
   - Homepage URL: `https://rivetco-store.pages.dev` (your real Pages address)
   - Authorization callback URL: `https://rivetco-store.pages.dev/api/callback`
2. **Register application** → copy the **Client ID** into `GITHUB_CLIENT_ID`.
3. **Generate a new client secret** → copy it into `GITHUB_CLIENT_SECRET`.
4. Redeploy (Step 3), then open `https://rivetco-store.pages.dev/admin` → **Login with GitHub**.
5. For the client: they create a free GitHub account; you add them under the repo's **Settings → Collaborators** (they accept the email invite). Then they log in at `/admin` the same way.

If the repo later moves to the client's GitHub account, change `repo:` at the top of `public/admin/config.yml`. When the domain changes, update both URLs in the OAuth App.

## Step 6: Connect Paymob

1. Add the four `PAYMOB_…` variables (Step 3) and redeploy.
2. In Paymob, for each payment integration set:
   - **Transaction processed callback:** `https://YOUR-SITE/api/paymob-webhook`
   - **Transaction response callback:** `https://YOUR-SITE/thank-you`
3. Test with Paymob's **test** keys and a test card first: check the thank-you page shows, the cart empties, and the order email arrives. Then switch to the **live** keys and redeploy.

## Step 7: Move rivetcoeg.com (do this last)

1. Before cancelling Shopify, transfer the domain out: Shopify → Settings → Domains → rivetcoeg.com → **Transfer → Transfer to another provider**. You can transfer it to Cloudflare Registrar (add the domain to Cloudflare first) or to another registrar such as Namecheap. Transfers can take up to 7–10 days.
2. In the Pages project → **Custom domains → Set up a custom domain** → `rivetcoeg.com`, and also `www.rivetcoeg.com`.
3. Update the Paymob callback URLs and the GitHub OAuth App URLs to the real domain.
4. **Before cancelling Shopify:** product and home page photos still load from Shopify's servers. Re-upload each one in the admin panel. Also export orders and customers from Shopify as CSV.
5. Then cancel Shopify.

---

## Check with the client before launch

- **Shipping fees:** placeholders are 70 EGP for Cairo & Giza and 100 EGP elsewhere. Set the real fees in Admin → Store settings → Shipping.
- **Free shipping:** the old site's banner says 1000 EGP, its shipping policy says 2000 EGP. The new site uses 1000.
- **Email:** the old footer shows info@rivetcoeg.com but links to rivet.co.eg@gmail.com.
- **Policies:** shipping and refund are rewritten from the old site; privacy and terms are short drafts.
- **Not included:** customer accounts and order tracking (customers contact the store instead).

## Costs

- GitHub, Cloudflare Pages, Resend: free plans. Cloudflare's free plan allows 500 deploys a month and 100,000 function requests a day; a small store fits comfortably.
- Paymob: fee per payment.
- Domain: yearly renewal of rivetcoeg.com.

## Editing without the admin panel

Every product and setting is in `public/content/*.json`. Edit the file on GitHub (pencil icon) and commit. Cloudflare redeploys automatically.
