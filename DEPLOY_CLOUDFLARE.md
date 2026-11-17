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
