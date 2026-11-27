import { describe, expect, it } from 'vitest';
import { OrderBook } from '../src/domain/OrderBook';
import { validateRefundDetails } from '../src/domain/refund';
import { getOrderStatusStyle, newestFirst } from '../src/app/utils';

const address = { fullName: 'A', phone: '9999999999', pincode: '580020' } as any;
const items = [{ productId: 'p1', name: 'Saree', price: 1000, quantity: 1 }] as any;

describe('refund details', () => {
  it('accepts valid UPI ids and phone numbers', () => {
    expect(validateRefundDetails('UPI_ID', 'asha.k@okbank')).toBe('');
    expect(validateRefundDetails('UPI_PHONE', '9876543210')).toBe('');
  });
  it('rejects malformed values', () => {
    expect(validateRefundDetails('UPI_ID', 'no-at-sign')).not.toBe('');
    expect(validateRefundDetails('UPI_PHONE', '12345')).not.toBe('');
    expect(validateRefundDetails('UPI_PHONE', '5876543210')).not.toBe('');
  });
  it('is only recorded for cancelled orders', () => {
    const book = new OrderBook();
    const order = book.createOrder('u1', items, 1000, address, true);
    expect(() => book.submitRefundDetails(order.orderId, 'UPI_ID', 'a@b')).toThrow(/cancelled/);
    book.markNotAccepted(order.orderId);
    const saved = book.submitRefundDetails(order.orderId, 'UPI_PHONE', '9876543210');
    expect(saved.refundDetails?.value).toBe('9876543210');
  });
});

describe('order lists', () => {
  it('sorts newest first by full timestamp', () => {
    const make = (orderId: string, createdAt: string) => ({ orderId, createdAt }) as any;
    const sorted = [make('a', '2026-11-01T10:00:00.000Z'), make('b', '2026-11-03T08:00:00.000Z'), make('c', '2026-11-03T09:30:00.000Z')].sort(newestFirst);
    expect(sorted.map((o: any) => o.orderId)).toEqual(['c', 'b', 'a']);
  });
  it('colours delivered green and cancelled red', () => {
    expect(getOrderStatusStyle({ stage: 'DELIVERED' } as any).color).toBe('#1b5e20');
    expect(getOrderStatusStyle({ stage: 'NOT_ACCEPTED' } as any).color).toBe('#8b1e2d');
  });
});

import { isProofUrl, validateProofFile } from '../src/domain/paymentProof';

describe('payment screenshot', () => {
  it('only accepts Cloudinary links', () => {
    expect(isProofUrl('https://res.cloudinary.com/demo/image/upload/v1/a.jpg')).toBe(true);
    expect(isProofUrl('https://evil.example.com/a.jpg')).toBe(false);
    expect(isProofUrl('uploaded_proof.png')).toBe(false);
    expect(isProofUrl(undefined)).toBe(false);
  });
  it('requires an image under 10 MB', () => {
    expect(validateProofFile(null)).not.toBe('');
    expect(validateProofFile({ type: 'application/pdf', size: 10 } as any)).not.toBe('');
    expect(validateProofFile({ type: 'image/png', size: 11 * 1024 * 1024 } as any)).not.toBe('');
    expect(validateProofFile({ type: 'image/png', size: 500000 } as any)).toBe('');
  });
});

import { fingerprintFile } from '../src/domain/paymentProof';

describe('screenshot fingerprint', () => {
  const fileOf = (text: string) => ({ arrayBuffer: async () => new TextEncoder().encode(text).buffer }) as any;
  it('is the same for the same file and different otherwise', async () => {
    const a = await fingerprintFile(fileOf('screenshot-1'));
    expect(a).toBe(await fingerprintFile(fileOf('screenshot-1')));
    expect(a).not.toBe(await fingerprintFile(fileOf('screenshot-2')));
    expect(a.length).toBe(64);
  });
});

import { amountAppears, classifyUtrSource, extractUtr, isValidUtr } from '../src/domain/paymentProof';

describe('reading UTR and amount from screenshot text', () => {
  it('finds a labelled UTR (PhonePe style)', () => {
    const text = 'Payment Successful\n₹3,500\nPaid to Mala Royale\nTransaction ID\nT2611171234567890123\nUTR: 432112345678\n17 Nov 2026, 10:42 AM';
    expect(extractUtr(text)).toBe('432112345678');
    expect(amountAppears(text, 3500)).toBe(true);
  });
  it('finds a UTR printed under its label (Google Pay style)', () => {
    const text = 'Completed\n₹1,200\nUPI transaction ID\n612345678901\nTo: Mala Royale\nGoogle Transaction ID CICAgOi123456';
    expect(extractUtr(text)).toBe('612345678901');
    expect(amountAppears(text, 1200)).toBe(true);
  });
  it('does not guess when two unlabelled 12-digit numbers appear', () => {
    expect(extractUtr('111111111111\n222222222222')).toBe('');
  });
  it('ignores phone numbers and longer account numbers', () => {
    expect(extractUtr('Mobile 9876543210\nA/c 123456789012345678')).toBe('');
  });
  it('uses a single unlabelled 12-digit number', () => {
    expect(extractUtr('Paid\n123456789012')).toBe('123456789012');
  });
  it('detects when the amount is missing, even if the rupee sign was misread', () => {
    expect(amountAppears('2 3500 paid', 3500)).toBe(true);
    expect(amountAppears('₹350 paid', 3500)).toBe(false);
    expect(amountAppears('₹3,500.00', 3500)).toBe(true);
  });
  it('validates 12-digit UTRs and classifies where they came from', () => {
    expect(isValidUtr('123456789012')).toBe(true);
    expect(isValidUtr('12345')).toBe(false);
    expect(classifyUtrSource('123456789012', '123456789012')).toBe('auto');
    expect(classifyUtrSource('123456789012', '123456789013')).toBe('edited');
    expect(classifyUtrSource('', '123456789013')).toBe('manual');
  });
});

import { classifyAmount, classifyPaymentTime, readPaymentTime } from '../src/domain/paymentProof';
import { buildUpiLink, isValidUpiId } from '../src/domain/upi';

describe('amount must match the order total after offers', () => {
  it('matches the exact amount and reports a different one', () => {
    expect(classifyAmount('Paid ₹3,500', 3500).status).toBe('match');
    const wrong = classifyAmount('Paid ₹2,500\nUTR 123456789012', 3500);
    expect(wrong.status).toBe('mismatch');
    expect(wrong.seen).toEqual([2500]);
    expect(classifyAmount('Payment successful', 3500).status).toBe('notfound');
  });
});

describe('payment time must be close to now', () => {
  const now = new Date(2026, 10, 17, 10, 50);
  it('reads common date and time layouts', () => {
    const a = readPaymentTime('Paid\n17 Nov 2026, 10:42 AM\nUTR');
    expect(a?.date.getHours()).toBe(10);
    expect(a?.date.getMinutes()).toBe(42);
    const b = readPaymentTime('Nov 17, 2026 at 10:42 am');
    expect(b?.date.getDate()).toBe(17);
    const c = readPaymentTime('17/11/2026 22:15');
    expect(c?.date.getHours()).toBe(22);
    const d = readPaymentTime('10:42 PM, 17 Nov 2026');
    expect(d?.date.getHours()).toBe(22);
    expect(readPaymentTime('no date here')).toBe(null);
  });
  it('accepts recent payments and rejects old or future ones', () => {
    expect(classifyPaymentTime(readPaymentTime('17 Nov 2026, 10:42 AM'), now)).toBe('fresh');
    expect(classifyPaymentTime(readPaymentTime('17 Nov 2026, 09:00 AM'), now)).toBe('stale');
    expect(classifyPaymentTime(readPaymentTime('15 Nov 2026, 10:42 AM'), now)).toBe('stale');
    expect(classifyPaymentTime(readPaymentTime('17 Nov 2026, 11:30 AM'), now)).toBe('future');
    expect(classifyPaymentTime(readPaymentTime('17 Nov 2026'), now)).toBe('fresh');
    expect(classifyPaymentTime(null, now)).toBe('unknown');
  });
});

describe('UPI link', () => {
  it('fills in the amount and validates the UPI id', () => {
    const link = buildUpiLink({ upiId: 'malaroyale@okhdfcbank', payeeName: 'Mala Royale', amount: 3500, note: 'Order' });
    expect(link).toBe('upi://pay?pa=malaroyale%40okhdfcbank&pn=Mala%20Royale&am=3500.00&cu=INR&tn=Order');
    expect(isValidUpiId('malaroyale@okhdfcbank')).toBe(true);
    expect(isValidUpiId('not an id')).toBe(false);
  });
});

import { customerUpdateText, orderUpdateKey } from '../src/app/orderMessages';

describe('order updates for customers', () => {
  const base = { orderId: 'MR-1', stage: 'ORDER_RECEIVED', isWithheld: false, address: { fullName: 'Asha' } } as any;
  it('shows the hold reason in the WhatsApp text', () => {
    const text = customerUpdateText({ ...base, isWithheld: true, holdReason: 'Checking your payment with the bank', holdNote: 'Back in an hour.' });
    expect(text.includes('Status: On hold')).toBe(true);
    expect(text.includes('Checking your payment with the bank')).toBe(true);
  });
  it('mentions the reason and the refund step for a rejected order', () => {
    const text = customerUpdateText({ ...base, stage: 'NOT_ACCEPTED', rejectionReason: 'Item out of stock' });
    expect(text.includes('Item out of stock')).toBe(true);
    expect(text.includes('refund')).toBe(true);
  });
  it('changes the update key when the status, a message or a hold changes', () => {
    const before = orderUpdateKey(base);
    expect(orderUpdateKey({ ...base, hostMessageAt: '2026-11-17T10:00:00Z' })).not.toBe(before);
    expect(orderUpdateKey({ ...base, isWithheld: true, heldAt: '2026-11-17T10:00:00Z' })).not.toBe(before);
    expect(orderUpdateKey(base)).toBe(before);
  });
});

import { buildVerdict, parseModelJson, sanitizeReading } from '../src/domain/proofVerdict';

describe('AI screenshot reading (server side logic)', () => {
  const nowMs = Date.UTC(2026, 10, 17, 5, 20); // 10:50 India time
  it('parses the model answer even with extra words around it', () => {
    const raw = parseModelJson('Here you go: {"status":"success","amount":"₹3,500","utr":"4321 1234 5678","date":"2026-11-17","time":"10:42"} thanks');
    const reading = sanitizeReading(raw);
    expect(reading.utr).toBe('432112345678');
    expect(reading.amount).toBe(3500);
    expect(reading.paymentStatus).toBe('success');
  });
  it('never accepts a UTR that is not 12 digits', () => {
    expect(sanitizeReading({ utr: '12345' }).utr).toBe('');
    expect(sanitizeReading(null).paymentStatus).toBe('unknown');
  });
  it('matches the exact amount and a recent India-time payment', () => {
    const verdict = buildVerdict(sanitizeReading({ amount: 3500, date: '2026-11-17', time: '10:42', status: 'success' }), 3500, nowMs);
    expect(verdict.amountStatus).toBe('match');
    expect(verdict.timeStatus).toBe('fresh');
  });
  it('flags a different amount, an old payment, and a failed payment', () => {
    expect(buildVerdict(sanitizeReading({ amount: 2500 }), 3500, nowMs).amountStatus).toBe('mismatch');
    expect(buildVerdict(sanitizeReading({ amount: 3500, date: '2026-11-17', time: '08:00' }), 3500, nowMs).timeStatus).toBe('stale');
    expect(sanitizeReading({ status: 'Payment failed' }).paymentStatus).toBe('failed');
  });
});

import { DEFAULT_SHIPPING, evaluateCourierRules, normalizePincode, parsePrefixes } from '../src/domain/shipping';

describe('courier charge rules', () => {
  const now = Date.UTC(2026, 10, 17, 10, 0);
  const prior = (hoursAgo: number, over: any = {}) => ({ userId: 'u1', stage: 'ORDER_RECEIVED', createdAt: new Date(now - hoursAgo * 3600000).toISOString(), address: { pincode: '580020' }, ...over }) as any;
  const base = { items: [{ quantity: 1 }], pincode: '580020', userId: 'u1', recentOrders: [] as any[], config: DEFAULT_SHIPPING, now };

  it('Rule A waives a single saree', () => {
    expect(evaluateCourierRules(base)).toEqual({ rule: 'A', waived: true, reason: 'Single saree: no courier charge.' });
  });
  it('Rule A falls back to C when the same customer ordered to the same pincode within 24 hours', () => {
    const decision = evaluateCourierRules({ ...base, recentOrders: [prior(5)] });
    expect(decision.rule).toBe('C');
    expect(decision.waived).toBe(false);
  });
  it('ignores cancelled orders, other pincodes, other customers and orders older than 24 hours', () => {
    expect(evaluateCourierRules({ ...base, recentOrders: [prior(5, { stage: 'NOT_ACCEPTED' })] }).rule).toBe('A');
    expect(evaluateCourierRules({ ...base, recentOrders: [prior(5, { address: { pincode: '580021' } })] }).rule).toBe('A');
    expect(evaluateCourierRules({ ...base, recentOrders: [prior(5, { userId: 'u2' })] }).rule).toBe('A');
    expect(evaluateCourierRules({ ...base, recentOrders: [prior(25)] }).rule).toBe('A');
  });
  it('Rule B waives Bangalore even when Rule A would not apply', () => {
    const decision = evaluateCourierRules({ ...base, items: [{ quantity: 1 }, { quantity: 2 }], pincode: '560001', recentOrders: [prior(2, { address: { pincode: '560001' } })] });
    expect(decision.rule).toBe('B');
    expect(decision.waived).toBe(true);
  });
  it('Rule C applies to several items outside Bangalore, and when rules are switched off', () => {
    expect(evaluateCourierRules({ ...base, items: [{ quantity: 2 }] }).rule).toBe('C');
    expect(evaluateCourierRules({ ...base, config: { ...DEFAULT_SHIPPING, ruleAEnabled: false } }).rule).toBe('C');
    expect(evaluateCourierRules({ ...base, pincode: '12' }).rule).toBe('C');
  });
  it('normalizes pincodes and prefix lists', () => {
    expect(normalizePincode(' 560 001 ')).toBe('560001');
    expect(normalizePincode('5600')).toBe('');
    expect(parsePrefixes('560, 561 ; abc 562')).toEqual(['560', '561', '562']);
  });
});

import { isAddressComplete, missingAddressFields } from '../src/domain/address';

describe('delivery address needs state and country', () => {
  const full = { fullName: 'Asha', phone: '9876543210', street1: '12 MG Road', landmark1: 'Temple', city: 'Hubballi', district: 'Dharwad', state: 'Karnataka', country: 'India', pincode: '580020' } as any;
  it('is complete when everything is filled', () => {
    expect(isAddressComplete(full)).toBe(true);
  });
  it('lists a missing state or country', () => {
    expect(missingAddressFields({ ...full, state: '' })).toEqual(['state']);
    expect(missingAddressFields({ ...full, country: ' ' })).toEqual(['country']);
    expect(missingAddressFields({ ...full, pincode: '58002' })).toEqual(['pincode']);
  });
});

import { PALETTE, buildItemCode, categoryCodeFor, colorCodeFor, designKeyFor, groupVariants, isValidItemCode, itemCodeTaken, suggestColors } from '../src/domain/itemCode';
import { acceptedTotal, activeLines, activeQuantityByProduct, rejectLine, rejectedTotal } from '../src/domain/orderItems';

describe('item IDs', () => {
  it('builds the two example formats', () => {
    expect(buildItemCode({ category: 'silk', pattern: 'zri', color: 'mar', kuchu: 'kch03', size: '6.3m' })).toBe('SILK-ZRI-MAR-KCH03-63M');
    expect(buildItemCode({ category: 'SILK', pattern: 'ZRI', color: 'MAR', size: '63M' })).toBe('SILK-ZRI-MAR-63M');
  });
  it('validates the shape and finds duplicates', () => {
    expect(isValidItemCode('SILK-ZRI-MAR-63M')).toBe(true);
    expect(isValidItemCode('SILK-ZRI-MAR-KCH03-63M')).toBe(true);
    expect(isValidItemCode('SILK-ZRI')).toBe(false);
    expect(isValidItemCode('silk-zri-mar-63m')).toBe(false);
    expect(itemCodeTaken('silk-zri-mar-63m', [{ id: 'p1', itemCode: 'SILK-ZRI-MAR-63M' } as any])).toBe(true);
    expect(itemCodeTaken('SILK-ZRI-MAR-63M', [{ id: 'p1', itemCode: 'SILK-ZRI-MAR-63M' } as any], 'p1')).toBe(false);
  });
  it('makes colour and category codes', () => {
    expect(colorCodeFor('Maroon')).toBe('MAR');
    expect(colorCodeFor('Mint')).toBe('MIN');
    expect(categoryCodeFor('Sarees')).toBe('SARE');
  });
});

describe('colour suggestions from a photo', () => {
  const fill = (rgb: [number, number, number], count: number) => Array.from({ length: count }, () => [rgb[0], rgb[1], rgb[2], 255]).flat();
  it('picks the saree colour and ignores a white background', () => {
    const pixels = [...fill([250, 250, 250], 700), ...fill([128, 0, 20], 300)];
    expect(suggestColors(pixels)[0].name).toBe('Maroon');
  });
  it('can suggest more than one colour, strongest first', () => {
    const pixels = [...fill([30, 90, 180], 400), ...fill([201, 162, 39], 150)];
    const names = suggestColors(pixels).map(color => color.name);
    expect(names[0]).toBe('Blue');
    expect(names.includes('Gold')).toBe(true);
    expect(PALETTE.length > 20).toBe(true);
  });
});

describe('variants of one design', () => {
  it('groups by design key and keeps single items alone', () => {
    const products = [
      { id: 'a', designKey: designKeyFor('SILK', 'ZRI'), color: 'Maroon' },
      { id: 'b' },
      { id: 'c', designKey: designKeyFor('SILK', 'ZRI'), color: 'Blue' },
    ] as any[];
    const groups = groupVariants(products);
    expect(groups.length).toBe(2);
    expect(groups[0].variants.map((p: any) => p.id)).toEqual(['a', 'c']);
    expect(designKeyFor('SILK', '')).toBe('');
  });
});

describe('rejecting selected items', () => {
  const order = () => ({
    stage: 'ORDER_RECEIVED',
    itemTotal: 6000,
    items: [
      { productId: 'p1', name: 'Saree A', price: 2500, quantity: 1 },
      { productId: 'p2', name: 'Saree B', price: 3000, quantity: 1 },
      { productId: 'p3', name: 'Kuchu', price: 500, quantity: 1 },
    ],
  }) as any;
  it('rejects one line and works out the refund', () => {
    const result = rejectLine(order(), 1, 'Damaged piece', '', 'Asha', '2026-11-18T10:00:00Z');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rejectedTotal).toBe(3000);
      const updated = { ...order(), items: result.items };
      expect(acceptedTotal(updated)).toBe(3000);
      expect(activeLines(updated).length).toBe(2);
      expect(rejectedTotal(updated)).toBe(3000);
      expect(activeQuantityByProduct(updated)).toEqual([['p1', 1], ['p3', 1]]);
    }
  });
  it('refuses the last item, repeats and dispatched orders', () => {
    let current = order();
    const first = rejectLine(current, 0, 'x', '', 'a', 'now');
    if (first.ok) current = { ...current, items: first.items };
    const second = rejectLine(current, 1, 'x', '', 'a', 'now');
    if (second.ok) current = { ...current, items: second.items };
    expect(rejectLine(current, 2, 'x', '', 'a', 'now').ok).toBe(false);
    expect(rejectLine(current, 0, 'x', '', 'a', 'now').ok).toBe(false);
    expect(rejectLine({ ...order(), stage: 'SUBMITTED_FOR_DISPATCH' }, 0, 'x', '', 'a', 'now').ok).toBe(false);
  });
});

describe('customer update text after rejecting an item', () => {
  it('names the rejected item, the reason and the refund', () => {
    const order = {
      orderId: 'MR-9', stage: 'ORDER_RECEIVED', isWithheld: false, address: { fullName: 'Asha' }, refundDue: 3000,
      items: [{ productId: 'p1', name: 'Saree A', price: 2500, quantity: 1 }, { productId: 'p2', name: 'Saree B', color: 'Maroon', price: 3000, quantity: 1, status: 'REJECTED', rejectionReason: 'Damaged piece' }],
    } as any;
    const text = customerUpdateText(order);
    expect(text.includes('Saree B (Maroon)')).toBe(true);
    expect(text.includes('Damaged piece')).toBe(true);
    expect(text.includes('refund ₹3000')).toBe(true);
  });
});

import { compatibleKuchu, itemCodeWithKuchu, lineKey, lineRegularPrice, lineUnitPrice, validateKuchuId } from '../src/domain/kuchu';

describe('Kuchu pricing, IDs and cart lines', () => {
  const saree = { id: 'p1', price: 4000, offerPrice: 3500, compatibleKuchuIds: ['KCH01', 'KCH03'] } as any;
  const kuchus = [
    { id: 'KCH01', name: 'Peacock', price: 400, active: true, photos: [] },
    { id: 'KCH02', name: 'Mango', price: 350, active: true, photos: [] },
    { id: 'KCH03', name: 'Lotus', price: 450, active: false, photos: [] },
  ] as any[];
  it('adds the Kuchu price to the saree price and goes back without it', () => {
    expect(lineUnitPrice(saree, kuchus[0])).toBe(3900);
    expect(lineUnitPrice(saree, null)).toBe(3500);
    expect(lineRegularPrice(saree, kuchus[0])).toBe(4400);
  });
  it('offers only tagged, visible designs', () => {
    expect(compatibleKuchu(saree, kuchus).map((k: any) => k.id)).toEqual(['KCH01']);
  });
  it('puts the Kuchu before the size in the item ID', () => {
    expect(itemCodeWithKuchu('SILK-ZRI-MAR-63M', 'KCH03')).toBe('SILK-ZRI-MAR-KCH03-63M');
    expect(itemCodeWithKuchu(undefined, 'KCH03')).toBe('');
  });
  it('validates unique alphanumeric Kuchu IDs', () => {
    expect(validateKuchuId('KCH03', [])).toBe('');
    expect(validateKuchuId('kch', [])).not.toBe('');
    expect(validateKuchuId('KCH01', kuchus)).not.toBe('');
    expect(validateKuchuId('KCH01', kuchus, 'KCH01')).toBe('');
  });
  it('keeps the same saree with different Kuchu or thread as separate cart lines', () => {
    expect(lineKey({ product: saree })).not.toBe(lineKey({ product: saree, kuchu: kuchus[0], threadColor: 'Gold' }));
    expect(lineKey({ product: saree, kuchu: kuchus[0], threadColor: 'Gold' })).toBe(lineKey({ product: saree, kuchu: kuchus[0], threadColor: 'Gold' }));
  });
});

import { DEFAULT_PAGES, FINAL_SALE_LINE, boldParts, fillTokens, mergePages, parseBlocks } from '../src/domain/sitePages';

describe('editable site pages', () => {
  it('turns text into headings, paragraphs and lists', () => {
    const blocks = parseBlocks('## Title\n\nHello **world**\n- one\n- two\n\nLast');
    expect(blocks.map(block => block.kind)).toEqual(['heading', 'paragraph', 'list', 'paragraph']);
    expect((blocks[2] as any).items).toEqual(['one', 'two']);
    expect(boldParts('a **b** c').map(part => part.bold)).toEqual([false, true, false]);
  });
  it('keeps pasted HTML as plain text', () => {
    const blocks = parseBlocks('<script>alert(1)</script>');
    expect(blocks[0].kind).toBe('paragraph');
  });
  it('fills the shop name and WhatsApp number', () => {
    expect(fillTokens('Hi {{shop}} {{whatsapp}}', { shop: 'Mala Royale', whatsapp: '+91 98765 43210' })).toBe('Hi Mala Royale +91 98765 43210');
    expect(fillTokens('{{whatsapp}}', { shop: 'x', whatsapp: '' }).includes('add your WhatsApp')).toBe(true);
  });
  it('ships a terms page that states the final-sale rule', () => {
    expect(DEFAULT_PAGES.terms.body.includes(FINAL_SALE_LINE)).toBe(true);
    expect(DEFAULT_PAGES.terms.body.includes('NO RETURN and NO REFUND')).toBe(true);
  });
  it('uses stored text where present and the default otherwise', () => {
    const merged = mergePages({ about: { title: 'Our story', body: 'Custom text' } });
    expect(merged.about.title).toBe('Our story');
    expect(merged.contact.title).toBe('Contact us');
  });
});

import { choiceKey } from '../src/domain/kuchu';

describe('Kuchu choice stays when the colour changes', () => {
  it('uses the design key so every colour of a design shares the choice', () => {
    expect(choiceKey({ id: 'p1', designKey: 'SILK-ZRI' })).toBe(choiceKey({ id: 'p2', designKey: 'SILK-ZRI' }));
    expect(choiceKey({ id: 'p3' })).toBe('p3');
  });
});

import { applyPriceFilter, buildMessages, chunkPages, cosine, deliveryFacts, fallbackAnswer, findColors, hybridRank, isAvailable, lexicalScore, maskPersonalData, parsePriceFilter, routeIntent, sanitizeHistory, type CatalogItem } from '../src/domain/assistant';

const item = (over: Partial<CatalogItem>): CatalogItem => ({ id: 'p', name: 'Saree', category: 'Sarees', description: '', price: 4000, kuchuNames: [], ...over });

describe('smart search ranking', () => {
  it('computes cosine similarity', () => {
    expect(Math.round(cosine([1, 0], [1, 0]) * 100)).toBe(100);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
  it('matches words in names and colours first', () => {
    const maroon = item({ id: 'a', name: 'Maroon Zari Silk Saree', color: 'Maroon' });
    const blue = item({ id: 'b', name: 'Blue Cotton Saree', color: 'Blue' });
    expect(lexicalScore('maroon silk', maroon)).toBeGreaterThan(lexicalScore('maroon silk', blue));
  });
  it('mixes meaning and words, and drops weak matches', () => {
    const items = [item({ id: 'a', name: 'Maroon Silk' }), item({ id: 'b', name: 'Green Cotton' })];
    const ranked = hybridRank('maroon silk saree', items, [0.8, 0.35]);
    expect(ranked[0].item.id).toBe('a');
    expect(ranked.some(entry => entry.item.id === 'b')).toBe(false);
  });
  it('works with words only when the AI is not available', () => {
    const ranked = hybridRank('maroon', [item({ id: 'a', name: 'Maroon Silk' }), item({ id: 'b', name: 'Blue' })], []);
    expect(ranked.map(entry => entry.item.id)).toEqual(['a']);
  });
});

describe('understanding the question', () => {
  it('reads price limits', () => {
    expect(parsePriceFilter('maroon sarees under 5000')).toEqual({ max: 5000 });
    expect(parsePriceFilter('below ₹4k')).toEqual({ max: 4000 });
    expect(parsePriceFilter('above 3,000')).toEqual({ min: 3000 });
    expect(parsePriceFilter('between 3000 and 6000')).toEqual({ min: 3000, max: 6000 });
    expect(parsePriceFilter('hello')).toEqual({});
  });
  it('filters by price after offers', () => {
    const items = [item({ id: 'a', price: 6000, offerPrice: 4500 }), item({ id: 'b', price: 7000 })];
    expect(applyPriceFilter(items, { max: 5000 }).map(entry => entry.id)).toEqual(['a']);
  });
  it('finds colours and routes the question', () => {
    expect(findColors('a maroon and gold saree')).toEqual(['Maroon', 'Gold']);
    expect(routeIntent('what is your return policy').policy).toBe(true);
    expect(routeIntent('courier charge to 560001').pincode).toBe('560001');
    expect(routeIntent('show me maroon silk sarees').products).toBe(true);
    expect(routeIntent('can I return it?').products).toBe(false);
  });
  it('knows what is on sale', () => {
    expect(isAvailable(item({ quantity: 0 }))).toBe(false);
    expect(isAvailable(item({ status: 'OUT_OF_STOCK' }))).toBe(false);
    expect(isAvailable(item({ quantity: 3 }))).toBe(true);
  });
});

describe('assistant safety and answers', () => {
  it('hides phone numbers and emails but keeps pincodes', () => {
    expect(maskPersonalData('call 98765 43210 or a@b.com pin 580020')).toBe('call [number] or [email] pin 580020');
  });
  it('keeps only recent, clean history', () => {
    const history = sanitizeHistory([{ role: 'user', content: 'x' }, { role: 'system', content: 'bad' }, ...Array.from({ length: 10 }, (_, index) => ({ role: 'assistant', content: `m${index}` }))]);
    expect(history.length).toBe(6);
    expect(history.every(turn => turn.role === 'assistant')).toBe(true);
  });
  it('splits pages into chunks at headings', () => {
    const chunks = chunkPages({ terms: { title: 'Terms', body: '## Orders\nOne\n\n## Returns\nNo returns' } });
    expect(chunks.map(chunk => chunk.heading)).toEqual(['Orders', 'Returns']);
  });
  it('answers delivery from the real courier rules', () => {
    const text = deliveryFacts('560001', { ruleAEnabled: true, ruleBEnabled: true, bangalorePrefixes: ['560'] });
    expect(text.includes('Bangalore')).toBe(true);
  });
  it('builds a prompt with only the facts it was given and a plain fallback answer', () => {
    const context = { products: [item({ id: 'a', name: 'Maroon Silk', price: 4000, color: 'Maroon' })], policies: [], delivery: '' };
    const messages = buildMessages('maroon saree', [], context, '+91 90000 00000');
    expect(messages[0].content.includes('Maroon Silk')).toBe(true);
    expect(messages[0].content.includes('Never invent')).toBe(true);
    expect(fallbackAnswer(context, '').includes('Maroon Silk')).toBe(true);
    expect(fallbackAnswer({ products: [], policies: [], delivery: '' }, '').includes('could not find')).toBe(true);
  });
});

import { cleanEvents, popularIds, summarize, viewedButNotAdded } from '../src/domain/signals';

describe('shopper signals', () => {
  it('keeps only well-formed events and masks personal data', () => {
    const events = cleanEvents([
      { k: 'view', id: 'p1' },
      { k: 'view', id: '<script>' },
      { k: 'search', q: '  Maroon   Silk 98765 43210 ', n: 3 },
      { k: 'bogus', q: 'x' },
      { k: 'ask', q: 'return policy?', n: 0, f: 1 },
      'junk',
    ]);
    expect(events.length).toBe(3);
    expect(events[1].q).toBe('maroon silk [number]');
    expect(events[2].f).toBe(1);
  });
  it('limits the size of a batch', () => {
    expect(cleanEvents(Array.from({ length: 100 }, () => ({ k: 'view', id: 'p1' }))).length).toBe(40);
  });
  it('counts searches, no-result searches, questions and product activity', () => {
    const summary = summarize([
      { day: 'd', events: [{ k: 'search', q: 'maroon', n: 2 }, { k: 'search', q: 'green kuchu', n: 0 }, { k: 'view', id: 'a' }, { k: 'cart', id: 'a' }] },
      { day: 'd', events: [{ k: 'search', q: 'maroon', n: 2 }, { k: 'search', q: 'green kuchu', n: 0 }, { k: 'ask', q: 'do you do blouses', n: 0, f: 1 }, { k: 'view', id: 'b' }] },
    ]);
    expect(summary.topSearches[0]).toEqual({ q: 'green kuchu', count: 2 });
    expect(summary.noResultSearches).toEqual([{ q: 'green kuchu', count: 2 }]);
    expect(summary.unansweredQuestions[0].q).toBe('do you do blouses');
    expect(summary.products.find(product => product.id === 'a')?.carts).toBe(1);
  });
  it('ranks popular items by sales first and skips unavailable ones', () => {
    const summary = summarize([{ day: 'd', events: [{ k: 'view', id: 'a' }, { k: 'view', id: 'a' }, { k: 'cart', id: 'b' }, { k: 'view', id: 'c' }] }]);
    const ids = popularIds(summary, new Map([['c', 2]]), id => id !== 'b');
    expect(ids).toEqual(['c', 'a']);
  });
  it('finds items that are viewed a lot but never added', () => {
    const summary = summarize([{ day: 'd', events: Array.from({ length: 12 }, () => ({ k: 'view' as const, id: 'a' })) }]);
    expect(viewedButNotAdded(summary)[0].id).toBe('a');
  });
});

import { benefitText, bestDiscount, discountFor, nextOffer, offerHeadline, parseRules, ruleIsLive, validateRule, type DiscountRule } from '../src/domain/discounts';
import { acceptedTotal as acceptedAfterOffer, refundShare as refundAfterOffer } from '../src/domain/orderItems';

describe('host offers (discount rules)', () => {
  const five: DiscountRule = { id: 'a', name: 'Festive 5%', type: 'PERCENT', value: 5, minSpend: 5000, active: true };
  const flat: DiscountRule = { id: 'b', name: 'Flat 400', type: 'FLAT', value: 400, minSpend: 3000, active: true };
  const now = Date.UTC(2026, 10, 23, 5, 0);

  it('gives 5% only from the minimum spend', () => {
    expect(discountFor(five, 4999)).toBe(0);
    expect(discountFor(five, 5000)).toBe(250);
    expect(discountFor(five, 5750)).toBe(287); // rounded down to a whole rupee
  });
  it('respects the cap and never makes the bag free', () => {
    expect(discountFor({ ...five, maxDiscount: 200 }, 10000)).toBe(200);
    expect(discountFor({ ...flat, minSpend: 0, value: 999 }, 500)).toBe(499);
  });
  it('picks the offer that saves the most, and ignores switched-off or out-of-date ones', () => {
    expect(bestDiscount(9000, [five, flat], now)?.ruleId).toBe('a'); // 5% = 450 beats a flat 400
    expect(bestDiscount(6000, [five, flat], now)?.ruleId).toBe('b'); // 5% = 300, flat 400 saves more
    expect(bestDiscount(3200, [five, flat], now)?.ruleId).toBe('b');
    expect(bestDiscount(6000, [{ ...five, active: false }], now)).toBe(null);
    expect(ruleIsLive({ ...five, endsOn: '2026-11-22' }, now)).toBe(false);
    expect(ruleIsLive({ ...five, startsOn: '2026-11-24' }, now)).toBe(false);
    expect(ruleIsLive({ ...five, startsOn: '2026-11-23', endsOn: '2026-11-23' }, now)).toBe(true);
  });
  it('tells the customer what to add to reach the next offer', () => {
    const next = nextOffer(4000, [five, flat], now);
    expect(next?.rule.id).toBe('a');
    expect(next?.shortBy).toBe(1000);
    expect(nextOffer(9000, [five], now)).toBe(null);
  });
  it('writes the banner text', () => {
    expect(offerHeadline(five)).toBe('Spend ₹5,000 or more and get 5% off');
    expect(benefitText({ ...five, maxDiscount: 500 })).toBe('5% off (up to ₹500)');
    expect(offerHeadline({ ...flat, minSpend: 0 })).toBe('Get ₹400 off on your order');
  });
  it('rejects nonsense and keeps only valid saved rules', () => {
    expect(validateRule({ ...five, value: 95 })).not.toBe('');
    expect(validateRule({ ...flat, value: 3500 })).not.toBe('');
    expect(validateRule({ ...five, name: ' ' })).not.toBe('');
    expect(validateRule(five)).toBe('');
    expect(parseRules([five, { id: 'x', name: '', type: 'PERCENT', value: 5, minSpend: 0, active: true }, 'junk']).length).toBe(1);
  });
  it('refunds only the share the customer actually paid when an offer was applied', () => {
    const order = { subtotal: 6000, itemTotal: 5700, items: [{ productId: 'p', name: 'x', price: 3000, quantity: 1, status: 'REJECTED' }, { productId: 'q', name: 'y', price: 3000, quantity: 1 }] } as any;
    expect(refundAfterOffer(order, 3000)).toBe(2850);
    expect(acceptedAfterOffer(order)).toBe(2850);
    expect(acceptedAfterOffer({ itemTotal: 6000, items: [{ productId: 'p', name: 'x', price: 3000, quantity: 1, status: 'REJECTED' }] } as any)).toBe(3000);
  });
});
