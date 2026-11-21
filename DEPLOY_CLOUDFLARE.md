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

## Smart search and the shopping assistant ("Ask Mala")
Both run in the Worker on Cloudflare's free Workers AI allowance (shared with the screenshot reader). They need no keys.

- **What they read:** your public catalog, Kuchu list, About / Contact / Terms pages and courier rules (cached for 10 minutes), and only that.
- **What they can do:** find sarees by meaning, colour and price ("maroon silk under 5000"), explain delivery and policies, and answer from your own pages. They **cannot** place orders, change anything or see orders and customer details.
- **Privacy:** phone numbers and emails typed into the chat are masked before they reach the AI. Payment screenshots never go to it.
- **Safety nets:** each visitor is limited per minute and per hour, and a daily cap applies. If the AI is off, busy or fails, search falls back to normal word search and the assistant shows a plain answer or matching items.
- **Switch off:** set `"ASSISTANT_ENABLED": "false"` in `wrangler.jsonc` and push.
- **Models** (optional, in `wrangler.jsonc` vars): `AI_CHAT_MODEL` (default `@cf/meta/llama-3.1-8b-instruct`) and `AI_EMBED_MODEL` (default `@cf/baai/bge-base-en-v1.5`, English only).
- **If search never turns "smart":** the Worker reads Firestore without a login. If your project refuses that, add your Firebase web API key as the var `FIREBASE_API_KEY` in `wrangler.jsonc`.

## Recommendations, shopper signals and the host assistant (Phase 3)
- **More like this / Recently viewed / Popular right now.** "More like this" on a product uses the server's meaning search (falls back to the same category). "Recently viewed" lives only in the shopper's browser. "Popular right now" shows a list you publish.
- **Anonymous shopper signals.** The website sends small batches (searches, product views, bag adds, saves, assistant questions; no names, phone numbers or accounts, personal data masked) to `/api/signals`. The Worker stores them in the Firestore collection `signals` using an anonymous sign-in. **To switch this on, set `FIREBASE_API_KEY` in `wrangler.jsonc` to your Firebase web API key (it is public) and make sure Authentication -> Sign-in method -> Anonymous is enabled.** Without the key nothing is stored and everything else still works. Shoppers can turn statistics off in the footer; the Terms page mentions it.
- **Host panel.** Host -> Insights now has "Shopper signals": top searches, searches with no results, questions the assistant could not answer, items viewed a lot but rarely added, and a "Publish this list" button for "Popular right now".
- **Host assistant (drafts only).** In Upload item, "Suggest description from the photo" drafts a description and suggests colours (needs the AI licence step from earlier). In Enquiries, "Draft reply" writes a WhatsApp reply you edit and send yourself. Staff only; nothing is sent automatically.
- **Cleaning up.** Signals are one small document per batch. The developer can delete old ones in the Firebase console (collection `signals`). Publish the new `firestore.rules`.
