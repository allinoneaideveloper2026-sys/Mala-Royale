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
