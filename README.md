# Rivet.Co store: setup guide

A free-hosted replacement for the Shopify store at rivetcoeg.com.

- **Hosting:** GitHub (stores the files) + Netlify (runs the site). Free plan.
- **Payments:** Paymob (Visa, Mastercard, Meeza, Apple Pay). The client pays Paymob's per-transaction fee, which is 2.75% + EGP 3 per card payment at the standard rate.
- **Admin panel:** `yoursite.com/admin`. The client logs in there to edit products, prices, stock, photos, the home page, shipping fees, FAQs and policies. No code needed.
- **Orders:** every paid order is emailed to the store by Netlify and also appears in the Paymob dashboard.

---

## What's in the folder

| Path | What it is |
|---|---|
| `index.html`, `shop.html`, `product.html`, `cart.html`, `checkout.html`, `thank-you.html`, `collections.html`, `faq.html`, `policy.html`, `contact.html`, `404.html` | The pages |
| `content/*.json` | All store content: products, home page, settings, FAQ, policies. The admin panel edits these. |
| `assets/` | Design (CSS), site logic (JS), favicon |
| `admin/` | The admin panel |
| `netlify/functions/` | The payment code that runs on Netlify's servers |
| `netlify.toml` | Netlify settings, plus redirects so old Shopify links keep working |

---

## Step 1: Put the files on GitHub

1. Sign in at github.com and click **New repository**. Name it `rivetco-store`. **Private** is fine. Click **Create repository**.
2. On the new repo page, click **uploading an existing file**.
3. Unzip `rivetco-store.zip` and drag **everything inside the folder** (not the folder itself) into the upload box.
4. Click **Commit changes**.

## Step 2: Put the site on Netlify

1. Sign in at app.netlify.com (use "Sign up with GitHub").
2. Go to **Add new site → Import an existing project → GitHub** and pick `rivetco-store`.
3. Leave **Build command** empty. Set **Publish directory** to `.` (the netlify.toml file already does this).
4. Click **Deploy**. You'll get a free address such as `rivetco-store.netlify.app`.

## Step 3: Turn on order and contact emails (Netlify Forms)

1. In Netlify, open the site, then go to **Forms** and click **Enable form detection**.
2. Under **Deploys**, click **Trigger deploy → Deploy site** so Netlify finds the forms.
3. Two forms will appear:
   - `paid-orders`: one entry per successful payment
   - `contact`: messages from the Contact page
4. Under **Forms → Form notifications → Add notification → Email notification**, add the client's email for each form.

## Step 4: Give the client the admin panel

1. In Netlify, go to **Site configuration → Identity** and click **Enable Identity**.
2. Under **Registration**, choose **Invite only**. This is important: otherwise anyone could sign up.
3. Under **Identity → Services → Git Gateway**, click **Enable Git Gateway**.
4. Go to the **Identity** tab and click **Invite users**. Enter the client's email (add yours too).
5. The client opens the invite email, sets a password, and lands on `/admin`. From then on they log in at `yoursite.com/admin`.

When the client clicks **Publish** in the admin panel, the change is saved to GitHub and the live site updates in about a minute.

## Step 5: Connect Paymob

The client needs a Paymob merchant account. Paymob verifies the business, so the client may need their commercial registration and tax card.

1. In the Paymob dashboard, under **Settings → Account info**, copy:
   - **Secret key**
   - **Public key**
   - **HMAC**
2. Under **Developers → Payment integrations**, note the **Integration ID** of each payment method: online card, and Apple Pay if it's enabled.
3. In Netlify, go to **Site configuration → Environment variables** and add:

   | Key | Value |
   |---|---|
   | `PAYMOB_SECRET_KEY` | the Secret key |
   | `PAYMOB_PUBLIC_KEY` | the Public key |
   | `PAYMOB_INTEGRATION_IDS` | the integration IDs, comma-separated, e.g. `4851234,4851240` |
   | `PAYMOB_HMAC_SECRET` | the HMAC |

4. Redeploy: **Deploys → Trigger deploy**.
5. In Paymob, for each integration, set:
   - **Transaction processed callback:** `https://YOUR-SITE/.netlify/functions/paymob-webhook`
   - **Transaction response callback:** `https://YOUR-SITE/thank-you.html`

**Test first.** Use Paymob's *test* keys and test integration IDs. Place an order with a Paymob test card and check three things:
- the thank-you page appears
- the cart empties
- a `paid-orders` entry and email arrive

Then switch the four variables to the *live* values and redeploy.

Until the keys are added, the checkout shows "Online payment isn't switched on yet". Nothing breaks.

## Step 6: Move rivetcoeg.com over (do this last)

1. Netlify: **Domain management → Add a domain** → `rivetcoeg.com`. Follow its DNS instructions at the domain registrar, or in Shopify if the domain was bought through Shopify.
2. Netlify adds free HTTPS automatically.
3. Update the Paymob callback URLs to the real domain.
4. **Before cancelling Shopify:** the product photos are currently loaded from Shopify's servers and will disappear when the store closes. Download each photo from the current site and re-upload it in **Admin → Products**. Do the same for the home page images.

Old Shopify links (`/products/...`, `/collections/...`, `/pages/...`, `/policies/...`) automatically redirect to the new pages.

---

## Check with the client before launch

- **Shipping fees:** I used placeholders: **70 EGP** for Cairo & Giza and **100 EGP** for other governorates. Set the real fees in **Admin → Store settings → Shipping**.
- **Free shipping threshold:** the old site's banner says **1000 EGP**, but its Shipping Policy says **2000 EGP**. The new site uses 1000. Confirm which is right.
- **Email:** the old footer shows `info@rivetcoeg.com`, but its link goes to `rivet.co.eg@gmail.com`. Confirm which inbox is real.
- **Policies:** shipping and refunds are rewritten from the old site. Privacy and terms are short drafts. The client should review all four, or paste their exact text, in **Admin → Policies**.
- **Categories:** the boxy tees are filed under Men. On Shopify, the Jet Black sweatpants description said "Light Heather Grey"; that's corrected here.
- **Track order / account login:** these were on Shopify but are not on this site. Customers contact the store instead. This is mentioned in the FAQ.

## Costs

- GitHub and Netlify: free plans. Netlify's free plan has monthly usage limits; a small store fits comfortably. Check **Netlify → Usage** occasionally.
- Paymob: fee per payment. No monthly fee at the standard rate.
- Domain: the yearly renewal of rivetcoeg.com still applies.

## Editing content without the admin panel

Every product and setting is in `content/*.json`. Edit the file on GitHub (pencil icon) and commit. Netlify redeploys automatically.
