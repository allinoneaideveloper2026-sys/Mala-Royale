// Editable site pages (About us, Contact, Terms & Conditions). The developer edits the text; customers read it.
// The text uses a tiny format so nothing risky can be pasted in:  "## Heading", "- bullet", blank line between paragraphs,
// and **bold** inside a line. {{shop}} and {{whatsapp}} are filled in automatically.

export type SitePageKey = 'about' | 'contact' | 'terms';

export interface SitePage {
  title: string;
  body: string;
}

export type SitePages = Record<SitePageKey, SitePage>;

export const SITE_PAGE_KEYS: SitePageKey[] = ['about', 'contact', 'terms'];

export const FINAL_SALE_LINE = 'FINAL SALE: once your order is confirmed there is NO RETURN and NO REFUND.';

export const DEFAULT_PAGES: SitePages = {
  about: {
    title: 'About us',
    body: `## Where Tradition Meets Royalty

{{shop}} is a boutique for premium sarees, finished with custom Kuchu (tassel) work. Every saree is chosen for its weave, its colours and the way it drapes, and every Kuchu is matched to the saree by our design experts so the colours sit together beautifully.

## What makes us different

- **Chosen with care:** each saree is checked by hand before it is listed.
- **Kuchu work by design experts:** the Kuchu design and its thread colours are matched to the saree's colour combination for you.
- **Honest photos and details:** we show real photographs, colours and sizes, with an item ID on every piece.
- **Personal service:** talk to us on WhatsApp before or after you order.

## Our promise

We want every saree to feel special when it arrives. If anything is unclear about a colour, a Kuchu or delivery, ask us before you order.`,
  },
  contact: {
    title: 'Contact us',
    body: `## We are happy to help

Message us on WhatsApp for questions about sarees, colours, Kuchu work, delivery or an existing order.

- **WhatsApp:** {{whatsapp}}
- **Email:** [add your email address here]
- **Address:** [add your shop or pickup address here]
- **Hours:** [add your hours, for example Monday to Saturday, 10 am to 7 pm]

## About an existing order

Open **My orders** on this website to see the latest status, your payment screenshot and any message from us. If something is wrong with a payment, use **Report a problem with this payment** on that order.

## Response time

We usually reply within one working day.`,
  },
  terms: {
    title: 'Terms & Conditions',
    body: `## 1. About these terms

By placing an order on this website you agree to these terms. {{shop}} may update them from time to time; the version on this page when you place your order applies to that order.

## 2. Orders

- An order is placed when you submit your payment details at checkout. It is **confirmed** only after we check and accept your payment.
- We may reject or cancel an order or an item, for example if an item is out of stock, damaged, or the payment cannot be verified. In that case you will be told why, and you will be refunded the amount you paid for it.
- Please check your name, phone number, address and pincode carefully. We deliver to the address you give us.

## 3. Prices and payment

- Prices are in Indian rupees and include any offer shown on the product. The price shown for a saree with a Kuchu is the saree price plus the price of the Kuchu you choose.
- You pay by UPI to the shop's QR or UPI ID and attach the screenshot of your payment. The amount must match your order total exactly. We may ask for more proof if needed.
- Any courier charge is shown or quoted separately, as described below.

## 4. Colours, photos and Kuchu work

- Colours can look slightly different on different screens and in different light.
- The Kuchu work and its thread colours are matched to the saree's colour combination by our design experts. Kuchu is custom work and is made for your order.

## 5. Shipping and courier charges

- Courier charge is waived for a single saree (one saree, quantity one) unless you have already placed another order to the same pincode in the last 24 hours, and for deliveries within Bangalore.
- In other cases we will tell you the courier details and charge. You pay it, and we verify the payment before we dispatch.
- Delivery times depend on the courier and your location. We will share the courier name and tracking details when we dispatch.

## 6. No return and no refund (final sale)

**${FINAL_SALE_LINE}**

- Sarees and Kuchu work are not returnable or exchangeable, and we do not give a refund for a change of mind, a colour or design preference, or a size or fit preference.
- This does not apply when **we** reject or cancel your order or an item. In that case we refund the amount you paid for it to the UPI ID or UPI phone number you share with us.
- If an item arrives damaged or is different from what you ordered, tell us within 48 hours of delivery on WhatsApp with clear photos or an unboxing video, and we will resolve it. [edit this period to suit your shop]

## 7. Refunds we owe you

After we reject or cancel an order or item, open your order on this website and send your UPI ID or UPI phone number. We send the refund there. Please allow a few working days.

## 8. Updates and offers

If you tick the boxes at checkout, we send order updates by email or WhatsApp, and offers only if you chose to receive them. You can ask us to stop at any time.

## 9. Your information

We use your name, phone number, address and email to process and deliver your order and to contact you about it. We do not sell your information. Payment screenshots are used only to verify your payment.

## 10. Law

These terms are governed by the laws of India.`,
  },
};

export const fillTokens = (text: string, values: { shop: string; whatsapp: string }): string =>
  text.replace(/\{\{shop\}\}/g, values.shop).replace(/\{\{whatsapp\}\}/g, values.whatsapp || '[add your WhatsApp number here]');

export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

/** Turns the page text into simple blocks. Anything else (HTML, links) stays plain text. */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let list: string[] | null = null;
  const flush = () => { if (list) { blocks.push({ kind: 'list', items: list }); list = null; } };
  for (const rawLine of text.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith('## ')) { flush(); blocks.push({ kind: 'heading', text: line.slice(3) }); continue; }
    if (line.startsWith('- ')) { (list ||= []).push(line.slice(2)); continue; }
    flush();
    blocks.push({ kind: 'paragraph', text: line });
  }
  flush();
  return blocks;
}

/** Splits a line into plain and **bold** parts. */
export function boldParts(text: string): Array<{ bold: boolean; text: string }> {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(part => (part.startsWith('**') && part.endsWith('**') ? { bold: true, text: part.slice(2, -2) } : { bold: false, text: part }));
}

export function mergePages(stored: Partial<Record<SitePageKey, Partial<SitePage>>> | undefined): SitePages {
  const result = { ...DEFAULT_PAGES };
  for (const key of SITE_PAGE_KEYS) {
    const page = stored?.[key];
    if (page && typeof page.body === 'string' && page.body.trim()) {
      result[key] = { title: (typeof page.title === 'string' && page.title.trim()) || DEFAULT_PAGES[key].title, body: page.body };
    }
  }
  return result;
}
