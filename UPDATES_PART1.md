# Part 1 updates

1. Stock is blocked when the order is placed (and restored if the host cancels it). Needs the new firestore.rules published.
2. After a host cancels an order, the customer is asked for a UPI ID or UPI phone number for the refund. The host sees it on the order.
3. Recent Orders, Incoming Orders and Courier Billing lists are newest first. Status chips are colour coded.
4. Manage Catalog shows each product's upload date and time.
5. AI insights have a period selector (7/30/90 days, 12 months, all time, custom dates). "Reset AI learning" shows only for the developer login.
6. The "direct image link" box was removed from Upload Item.

## Payment screenshots
Checkout and the courier payment form now require a screenshot (PhonePe, GPay, Paytm, bank app). It is shrunk, uploaded to Cloudinary, and shown to the host and the customer in the order history. Publish the new firestore.rules. Optional: add VITE_CLOUDINARY_PROOF_PRESET.

## Payment screenshot + automatic UTR reading
Checkout and the courier payment form require a payment screenshot. The 12-digit UTR is read from it automatically in the customer's browser (OCR from the jsDelivr CDN) and pre-filled for the customer to check. If it cannot be read, the customer types it. The UTR rules (12 digits, no reuse) are unchanged, and the same screenshot file cannot be used twice. The host sees the UTR, the screenshot, and small hints (UTR read automatically / changed, amount found or not). Publish the new firestore.rules.

## Exact-amount payments, time check, dynamic QR, report a problem
- Checkout and courier payment now block a screenshot whose amount differs from the order total after offers, or whose payment time is not recent (30 minutes).
- Host: Manage QR tab -> "Dynamic payment QR": enter UPI ID + name. Checkout then shows a QR and a "Pay in your UPI app" button with the exact amount.
- Customers can "Report a problem with this payment" on each order. It arrives in the host's Enquiries tab as a Payment problem. Publish the new firestore.rules.

## Stage decisions with pop-ups, hold, and customer updates
- Every host decision opens a pop-up: accept address, accept payment (item and courier), dispatch, delivered. Put on hold and Reject ask for a reason the customer sees. Release hold also asks.
- A held order cannot move to the next stage until released. Reject is still possible while on hold.
- Customers see an "Updates on your orders" banner when an order changes since they last looked, and a hold box with the reason. The host has a "Notify customer on WhatsApp" button with the text ready.
- No automatic push, email or SMS is sent. That needs a server and a messaging service.

## Part 2, batch 1
- Worker + AI screenshot reader (UTR, amount, date, time, success/failed) with browser fallback.
- Host management: Host ID, Gmail, nickname, on/off switch, delete. Audit trail with nickname/ID and server time.
- Delete Row in Order History and Master Ledger (hidden, restorable by the developer; permanent delete is developer only).
- Courier rules A, B, C with host settings and a re-check on the host side.
Still to come: item IDs and colour variants, partial item rejection, Kuchu catalogue, notifications.

## Part 2, batch 2
- Item IDs: CATEGORY-PATTERN-COLOR-KUCHU-SIZE (e.g. SILK-ZRI-MAR-KCH03-63M, or SILK-ZRI-MAR-63M without Kuchu). Built from parts at upload, editable in the inventory, unique.
- Colour variants: colour field with suggestions read from the first photo; "Add another colour of this design"; the storefront groups products with the same category code + pattern code as one listing with colour choices.
- The chosen colour, item ID and photo are saved on each order line, and shown (photo, name, colour) to the customer and in the host's order cards, parcel sheet and ledger text.
- Reject selected items: each active order line has "Reject item" for the host (before dispatch). Stock goes back, the refund amount is worked out, the customer is asked for refund details, totals and the ledger use the accepted amount. The last item cannot be rejected this way (reject the whole order).
- Publish the new firestore.rules (partial refund details).

## Part 2, batch 3 (Kuchu)
- Inventory edit now sets Category code and Pattern code (and the design key), so older products can be grouped as colours of one design.
- Upload Kuchu Section (Upload tab): unique alphanumeric ID, name, price, up to 8 photos. List with Edit, Hide/Show and Delete.
- Tag compatible Kuchu designs and thread colours on a saree (upload form and inventory edit).
- Customers choose "No Kuchu" or exactly one design (radio buttons). The price shown is saree + Kuchu, and goes back when "No Kuchu" is chosen. A thread colour is required when a Kuchu is chosen.
- Final-sale rule shown on sarees with Kuchu options and accepted at checkout (NO RETURN, NO REFUND once confirmed; host-rejected or cancelled orders are still refunded).
- Order lines keep the Kuchu, thread colour and the item ID with Kuchu (e.g. SILK-ZRI-MAR-KCH03-63M). The server check now rejects an order whose prices do not match the live catalog.
- Publish the new firestore.rules (kuchu collection).

## Part 2, batch 4 (notifications)
- Checkout consent: email updates, WhatsApp updates, offers (consent_email, consent_whatsapp, consent_promos) stored on the order.
- worker/notificationService.ts with adapters: Gmail script (free), Resend, WhatsApp Cloud API. All OFF by default (wrangler.jsonc).
- Events: order placed, courier quote added, payment verified, dispatched, delivered, cancelled, item rejected. Duplicates are blocked.
- Setup guide: docs/gmail-notifier.gs and DEPLOY_CLOUDFLARE.md. Publish the new firestore.rules (notificationLog).

## Phase 1: brand and storefront redesign
- Brand: Royal Navy #101D38, Soft Gold #D9BD83, Ivory #FAF5E9, Classic Blue #263C60 (src/styles/brand.css). Logo, monogram, app icon, hero banner and icons in public/brand (cut from the brand sheet).
- Sticky header with logo, category menu, search, saved items and bag. Hero banner, round category tiles, shop by colour, sticky filter bar, product cards with saved heart, quick view and colour swatches, product page with delivery check, loading skeletons, smooth transitions.
- Developer view has two tabs: Developer Telemetry & Host Access (Home), and Host Management Panel.
- Fonts (Cormorant Garamond, Inter) load from Google Fonts; the headers file allows them.

## Feedback round after Phase 1
- Removed the All / Saree / Custom Kuchu tabs and the Kuchu home section. The header shows About us and Contact links instead.
- Kuchu is chosen from a drop-down under the colour choice (No Kuchu or one design). Thread colours are removed. The choice carries into the cart, the order line and the item ID (e.g. SILK-ZRI-MAR-KCH03-63M).
- The final-sale line is shown only at the bottom of checkout, in small text, when the bag has a Kuchu.
- About us, Contact and Terms & Conditions pages with a footer. The developer edits them in the new "Site Pages" tab. Publish the new firestore.rules.
- A friendly "collection is being prepared" message when the catalog is empty.

## Phase 2: smart search and shopping assistant
- Smart search (meaning + words) with automatic fallback to normal search.
- "Ask Mala" assistant: answers from the catalog, Kuchu list, About/Contact/Terms and courier rules. Read-only; masks phone numbers and emails; rate limited; plain-answer fallback.
- See DEPLOY_CLOUDFLARE.md for switches and limits.

## Phase 3: recommendations, learning loop, host assistant
- More like this (meaning-based), Recently viewed, Popular right now.
- Anonymous shopper signals (opt-out in the footer) and a Shopper signals panel in Host Insights.
- Host assistant drafts: description from photo, WhatsApp reply drafts.
