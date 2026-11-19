// What customers are told at each stage of an order. Pure text-building, shared by the server and the tests.
import type { Consent, Order } from './types';

export type NotifyEvent = 'ORDER_PLACED' | 'COURIER_QUOTE_ADDED' | 'PAYMENT_VERIFIED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED' | 'ITEM_REJECTED';

export const NOTIFY_EVENTS: NotifyEvent[] = ['ORDER_PLACED', 'COURIER_QUOTE_ADDED', 'PAYMENT_VERIFIED', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'ITEM_REJECTED'];

export const isNotifyEvent = (value: unknown): value is NotifyEvent => typeof value === 'string' && (NOTIFY_EVENTS as string[]).includes(value);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (value: string | undefined | null): value is string => typeof value === 'string' && value.length <= 254 && EMAIL_PATTERN.test(value.trim());

/** WhatsApp numbers are digits with the country code: a 10-digit Indian mobile number gets 91 in front. */
export function normalizeWhatsAppNumber(phone: string | undefined | null): string {
  const digits = String(phone ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) return `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : '';
}

export function newConsent(input: { email: string; whatsapp: string; consentEmail: boolean; consentWhatsapp: boolean; consentPromos: boolean }, nowIso: string): Consent {
  return {
    consent_email: input.consentEmail && isEmail(input.email),
    consent_whatsapp: input.consentWhatsapp && Boolean(normalizeWhatsAppNumber(input.whatsapp)),
    consent_promos: input.consentPromos,
    ...(isEmail(input.email) ? { email: input.email.trim().toLowerCase() } : {}),
    ...(normalizeWhatsAppNumber(input.whatsapp) ? { whatsapp: normalizeWhatsAppNumber(input.whatsapp) } : {}),
    at: nowIso,
  };
}

export interface ShopInfo {
  name: string;
  siteUrl: string;
}

export interface ComposedMessage {
  subject: string;
  text: string;
  html: string;
  /** Values for a WhatsApp template: customer name, order number, short status line. */
  whatsappParams: string[];
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));

function lineText(item: Order['items'][number]): string {
  return `${item.name}${item.color ? ` (${item.color})` : ''}${item.kuchuName ? ` + Kuchu ${item.kuchuName}` : ''} x ${item.quantity} - Rs ${item.price * item.quantity}`;
}

export function composeMessage(event: NotifyEvent, order: Order, shop: ShopInfo): ComposedMessage {
  const name = order.address?.fullName?.trim() || 'there';
  const id = order.orderId;
  const activeItems = (order.items || []).filter(item => item.status !== 'REJECTED');
  const rejectedItems = (order.items || []).filter(item => item.status === 'REJECTED');
  const rejectedTotal = rejectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = Math.max(0, order.itemTotal - rejectedTotal);
  const courier = order.courierBill;
  const tracking = [courier?.courierName || order.deliveryPartner, courier?.trackingId].filter(Boolean).join(' - tracking ');

  let subject = '';
  let status = '';
  const body: string[] = [];
  switch (event) {
    case 'ORDER_PLACED':
      subject = `We received your order ${id}`;
      status = 'Order received';
      body.push('Thank you for your order. We are checking your payment and will confirm it shortly.', '', ...activeItems.map(lineText), '', `Items total: Rs ${total}`);
      if (order.courierWaived) body.push('Courier charge: none for this order.');
      else body.push('If a courier charge applies, we will send you the amount to pay.');
      break;
    case 'COURIER_QUOTE_ADDED':
      subject = `Courier charge for order ${id}`;
      status = 'Courier charge added';
      body.push(`We have added the courier charge for your order: ${courier?.courierName || 'courier'}, Rs ${courier?.amount ?? ''}.`, 'Please open your order on our website, pay the courier charge and attach the screenshot of that payment.');
      break;
    case 'PAYMENT_VERIFIED':
      subject = `Payment received for order ${id}`;
      status = 'Payment confirmed';
      body.push('We have confirmed your payment. Your order will be packed and sent soon.');
      break;
    case 'DISPATCHED':
      subject = `Your order ${id} is on its way`;
      status = 'Dispatched';
      body.push('Your order has been dispatched.', tracking ? `Courier: ${tracking}` : '', order.deliveryComments || '');
      break;
    case 'DELIVERED':
      subject = `Your order ${id} was delivered`;
      status = 'Delivered';
      body.push('Your order has been delivered. Thank you for shopping with us.');
      break;
    case 'CANCELLED':
      subject = `Your order ${id} was cancelled`;
      status = 'Cancelled, refund pending';
      body.push(`We are sorry, we could not accept your order.${order.rejectionReason ? ` Reason: ${order.rejectionReason}.` : ''}`, order.rejectionNote || '', 'To receive your refund, please open your order on our website and send your UPI ID or UPI phone number.');
      break;
    case 'ITEM_REJECTED':
      subject = `An update on the items in order ${id}`;
      status = 'Item rejected, refund pending';
      body.push('We could not accept some items in your order:', ...rejectedItems.map(item => `${lineText(item)} - ${item.rejectionReason || 'no reason given'}`), '', `We will refund Rs ${order.refundDue ?? rejectedTotal}. Please open your order on our website and send your UPI ID or UPI phone number. The rest of your order continues.`);
      break;
    default:
      subject = `An update on your order ${id}`;
      status = 'Update';
  }
  const lines = [`Hello ${name},`, '', ...body.filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== '')), '', `Open your order: ${shop.siteUrl}`, '', `- ${shop.name}`];
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">${text.split('\n').map(line => (line ? `<p style="margin:0 0 8px">${escapeHtml(line)}</p>` : '')).join('')}</div>`;
  return { subject, text, html, whatsappParams: [name, id, status] };
}
