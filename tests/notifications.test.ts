import { describe, expect, it } from 'vitest';
import { composeMessage, isEmail, newConsent, normalizeWhatsAppNumber } from '../src/domain/notifications';
import { decodeFields } from '../worker/firestoreRest';
import { emailProviderFor, sendNotifications, whatsappProviderFor } from '../worker/notificationService';

const order = (over: any = {}) => ({
  orderId: 'MR-ABC123', userId: 'u1', stage: 'ORDER_RECEIVED', itemTotal: 6000,
  address: { fullName: 'Asha' },
  items: [{ productId: 'p1', name: 'Saree A', price: 2500, quantity: 1 }, { productId: 'p2', name: 'Saree B', color: 'Maroon', price: 3500, quantity: 1 }],
  consent: { consent_email: true, consent_whatsapp: true, consent_promos: false, email: 'asha@example.com', whatsapp: '919876543210', at: 'x' },
  ...over,
}) as any;

const recorder = () => {
  const calls: Array<{ url: string; body: any }> = [];
  const fetchFn = async (url: string, init?: any) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
  };
  return { calls, fetchFn };
};

describe('consent and contact details', () => {
  it('normalizes WhatsApp numbers and emails', () => {
    expect(normalizeWhatsAppNumber('98765 43210')).toBe('919876543210');
    expect(normalizeWhatsAppNumber('09876543210')).toBe('919876543210');
    expect(normalizeWhatsAppNumber('123')).toBe('');
    expect(isEmail('a@b.com')).toBe(true);
    expect(isEmail('nope')).toBe(false);
  });
  it('only records a consent for a channel that has a usable contact', () => {
    const consent = newConsent({ email: 'bad', whatsapp: '9876543210', consentEmail: true, consentWhatsapp: true, consentPromos: true }, 'now');
    expect(consent.consent_email).toBe(false);
    expect(consent.consent_whatsapp).toBe(true);
    expect(consent.whatsapp).toBe('919876543210');
    expect(consent.consent_promos).toBe(true);
  });
});

describe('message text', () => {
  const shop = { name: 'Mala Royale', siteUrl: 'https://example.com' };
  it('confirms a new order with the items and total', () => {
    const message = composeMessage('ORDER_PLACED', order(), shop);
    expect(message.subject).toBe('We received your order MR-ABC123');
    expect(message.text.includes('Saree B (Maroon)')).toBe(true);
    expect(message.text.includes('Items total: Rs 6000')).toBe(true);
    expect(message.whatsappParams).toEqual(['Asha', 'MR-ABC123', 'Order received']);
  });
  it('mentions the courier charge, tracking and refunds', () => {
    expect(composeMessage('COURIER_QUOTE_ADDED', order({ courierBill: { courierName: 'DTDC', amount: 80, trackingId: 'T1' } }), shop).text.includes('Rs 80')).toBe(true);
    expect(composeMessage('DISPATCHED', order({ courierBill: { courierName: 'DTDC', amount: 80, trackingId: 'T1' } }), shop).text.includes('tracking T1')).toBe(true);
    const rejected = order({ items: [{ productId: 'p1', name: 'Saree A', price: 2500, quantity: 1 }, { productId: 'p2', name: 'Saree B', price: 3500, quantity: 1, status: 'REJECTED', rejectionReason: 'Damaged piece' }], refundDue: 3500 });
    const text = composeMessage('ITEM_REJECTED', rejected, shop).text;
    expect(text.includes('Damaged piece')).toBe(true);
    expect(text.includes('refund Rs 3500')).toBe(true);
  });
  it('escapes HTML in names', () => {
    expect(composeMessage('DELIVERED', order({ address: { fullName: '<b>X</b>' } }), shop).html.includes('<b>X</b>')).toBe(false);
  });
});

describe('sending', () => {
  it('sends nothing while the channels are switched off', async () => {
    const { calls, fetchFn } = recorder();
    const results = await sendNotifications({ env: { EMAIL_PROVIDER: 'off', WHATSAPP_PROVIDER: 'off' }, event: 'ORDER_PLACED', order: order(), fetchFn });
    expect(calls.length).toBe(0);
    expect(results.email).toBe('skipped: email is switched off');
    expect(results.whatsapp).toBe('skipped: WhatsApp is switched off');
  });
  it('sends email through the Gmail script when switched on', async () => {
    const { calls, fetchFn } = recorder();
    const env = { EMAIL_PROVIDER: 'gmail', GMAIL_SCRIPT_URL: 'https://script.example/exec', GMAIL_SCRIPT_SECRET: 's3cret' };
    const results = await sendNotifications({ env, event: 'PAYMENT_VERIFIED', order: order(), fetchFn });
    expect(results.email).toBe('sent');
    expect(calls[0].body.to).toBe('asha@example.com');
    expect(calls[0].body.secret).toBe('s3cret');
  });
  it('does not send to a customer who did not agree', async () => {
    const { calls, fetchFn } = recorder();
    const env = { EMAIL_PROVIDER: 'gmail', GMAIL_SCRIPT_URL: 'https://script.example/exec', GMAIL_SCRIPT_SECRET: 's' };
    const results = await sendNotifications({ env, event: 'DELIVERED', order: order({ consent: { consent_email: false, consent_whatsapp: false, consent_promos: false, at: 'x' } }), fetchFn });
    expect(calls.length).toBe(0);
    expect(results.email).toBe('skipped: not agreed');
  });
  it('sends a WhatsApp template and Resend email when configured', async () => {
    const { calls, fetchFn } = recorder();
    const env = { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_x', EMAIL_FROM: 'shop@example.com', WHATSAPP_PROVIDER: 'cloud', WHATSAPP_ACCESS_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '123' };
    const results = await sendNotifications({ env, event: 'DISPATCHED', order: order(), fetchFn });
    expect(results.email).toBe('sent');
    expect(results.whatsapp).toBe('sent');
    expect(calls.some(call => call.url === 'https://api.resend.com/emails')).toBe(true);
    const whatsapp = calls.find(call => call.url.includes('graph.facebook.com'));
    expect(whatsapp?.body.template.name).toBe('mr_dispatched');
    expect(whatsapp?.body.to).toBe('919876543210');
  });
  it('reports a failure without throwing', async () => {
    const failing = async () => ({ ok: false, status: 500, text: async () => 'boom' });
    const results = await sendNotifications({ env: { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.com' }, event: 'DELIVERED', order: order(), fetchFn: failing });
    expect(results.email.startsWith('failed:')).toBe(true);
  });
  it('needs the keys before a provider is used', () => {
    const { fetchFn } = recorder();
    expect(emailProviderFor({ EMAIL_PROVIDER: 'gmail' }, fetchFn)).toBe(null);
    expect(whatsappProviderFor({ WHATSAPP_PROVIDER: 'cloud' }, fetchFn)).toBe(null);
  });
});

describe('reading Firestore documents', () => {
  it('turns the REST format into plain values', () => {
    const data = decodeFields({
      orderId: { stringValue: 'MR-1' }, itemTotal: { integerValue: '6000' }, ok: { booleanValue: true },
      address: { mapValue: { fields: { fullName: { stringValue: 'Asha' } } } },
      items: { arrayValue: { values: [{ mapValue: { fields: { price: { doubleValue: 2500.5 } } } }] } },
    } as any) as any;
    expect(data.itemTotal).toBe(6000);
    expect(data.address.fullName).toBe('Asha');
    expect(data.items[0].price).toBe(2500.5);
  });
});
