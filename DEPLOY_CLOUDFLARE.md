# Free, scalable hosting: Cloudflare Pages + Firebase

The site is static files, so Cloudflare Pages serves it free with unlimited bandwidth. Firebase stays as the
backend (login and database).

## One-time setup
1. Nothing to install locally. CI installs its own test tool (vitest) and does not change `package-lock.json`.
2. Cloudflare dashboard -> Workers & Pages -> Create -> Pages -> Connect to Git -> pick this repo.
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node version: add variable `NODE_VERSION` = `20`
3. Under Settings -> Variables and Secrets, add the same `VITE_*` values you use today
   (`VITE_FIREBASE_*`, `VITE_OWNER_EMAILS`, `VITE_DEVELOPER_EMAILS`, `VITE_CLOUDINARY_*`).
   Staff emails are no longer built in, so the two email variables are REQUIRED.
4. Firebase console -> Authentication -> Settings -> Authorized domains: add `yourproject.pages.dev`
   and your custom domain.
5. Google Cloud console -> Credentials -> your Browser API key: restrict to your domains (HTTP referrers).
6. Firebase console -> App Check: register the web app with reCAPTCHA v3, then enforce it for Firestore
   once you confirm the site still works.
7. Firebase console -> Usage and billing: set a budget alert (it only emails you; it does not stop spending).
8. Deploy the rules: `firebase deploy --only firestore:rules`.

## Keeping staff emails in sync
Edit emails only in `firestore.rules` (top of the file) and the `VITE_*` variables. `npm run check:config`
(also run in CI) fails if they differ.

## Security headers
`public/_headers` is deployed automatically. The Content-Security-Policy ships in Report-Only mode: open the site,
sign in, place a test order, and check the browser console. When there are no violations, rename
`Content-Security-Policy-Report-Only` to `Content-Security-Policy`.

## Free-tier reads
Customers load products, categories and settings through a 10-minute browser cache
(`src/domain/cache.ts`), so repeat visits cost no Firestore reads. Staff keep live updates.

## Server side (Cloudflare Worker): added in Part 2
`wrangler.jsonc` now also deploys `worker/index.ts`, a small server that runs next to the website on the same address.
It handles `/api/*` requests; everything else is served from `dist` as before. No extra project is needed.

1. **Nothing to install.** The next push builds and deploys it, the same way as the website.
2. **Workers AI.** The screenshot reader uses Cloudflare's free Workers AI allowance (the `ai` binding in `wrangler.jsonc`). It needs no key.
3. **One-time licence.** After the first deploy, sign in as developer, open the Developer panel and press
   "Accept AI model licence (one time)". The vision model needs this before its first use.
4. **If you change `FIREBASE_PROJECT_ID` or `DEVELOPER_EMAILS`**, edit them under `vars` in `wrangler.jsonc`.
5. **If the server part fails**, checkout still works: the app falls back to the reader in the browser, then to typing the UTR.
6. Secrets for later services (email, WhatsApp) go under Settings, Variables and secrets, as *secrets* (not build variables).

## Notifications (email, WhatsApp): built, switched OFF
Customers tick what they agree to at checkout (email updates, WhatsApp updates, offers). After each order event the app asks the
server (`/api/notify`, handled by `worker/notificationService.ts`) to send the message. Nothing is sent until you switch a channel on.

Events: order placed, courier charge added, payment verified, dispatched, delivered, cancelled, item rejected (refund).
The first request for an order and event is recorded (`notificationLog`), so a customer never gets the same message twice.

### Turn on email with your Gmail (free, no domain)
1. Open `docs/gmail-notifier.gs` and follow the steps at the top (a Google Apps Script web app that sends from your Gmail).
2. Cloudflare -> your project -> Settings -> Variables and secrets: add **secrets** `GMAIL_SCRIPT_URL` and `GMAIL_SCRIPT_SECRET`.
3. In `wrangler.jsonc` change `"EMAIL_PROVIDER": "off"` to `"gmail"`, and set `SITE_URL` to your real shop address. Push.
4. Place a test order with the email box ticked. The host sees "Customer notified by email" after each action.

### Later: Resend (needs your own domain)
Add secrets `RESEND_API_KEY` and `EMAIL_FROM` (an address on your verified domain) and set `"EMAIL_PROVIDER": "resend"`.

### Later: WhatsApp Cloud API (needs a Meta business account)
Add secrets `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`, create and get approved one utility template per event named
`mr_order_placed`, `mr_courier_quote_added`, `mr_payment_verified`, `mr_dispatched`, `mr_delivered`, `mr_cancelled`, `mr_item_rejected`,
each with three text values: {{1}} customer name, {{2}} order number, {{3}} status. Then set `"WHATSAPP_PROVIDER": "cloud"`.
Push notifications are not built yet; `PUSH_PROVIDER` is only a placeholder switch.

Secrets (keys, tokens) are never put in the website code or in `wrangler.jsonc`; only in Cloudflare's Variables and secrets.
