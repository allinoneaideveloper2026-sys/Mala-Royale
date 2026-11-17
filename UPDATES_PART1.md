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
