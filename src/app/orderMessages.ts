import type { Order } from '../domain/types';
import { getOrderStatus } from './utils';

/** The words of a WhatsApp update the host can send to a customer for this order's current stage. */
export function customerUpdateText(order: Order): string {
  const name = order.address?.fullName?.trim() || 'there';
  const lines = [`Hello ${name}, an update on your Mala Royale order ${order.orderId}:`, `Status: ${getOrderStatus(order)}`];
  if (order.isWithheld && order.stage !== 'NOT_ACCEPTED' && order.stage !== 'DELIVERED') {
    lines.push(`Your order is on hold: ${order.holdReason || 'we need a moment to check something'}.`);
    if (order.holdNote) lines.push(order.holdNote);
  }
  if (order.stage === 'NOT_ACCEPTED') {
    if (order.rejectionReason) lines.push(`Reason: ${order.rejectionReason}`);
    if (order.rejectionNote) lines.push(order.rejectionNote);
    lines.push('Please open your order on our website and share your UPI ID or UPI phone number for the refund.');
  }
  const rejectedLines = (order.items || []).filter(item => item.status === 'REJECTED');
  if (rejectedLines.length > 0 && order.stage !== 'NOT_ACCEPTED') {
    lines.push(`Some items were rejected: ${rejectedLines.map(item => `${item.name}${item.color ? ` (${item.color})` : ''} - ${item.rejectionReason || 'no reason given'}`).join('; ')}.`);
    if (order.refundDue) lines.push(`We will refund ₹${order.refundDue}. Please open your order on our website and share your UPI ID or UPI phone number.`);
  }
  if (order.hostMessage) lines.push(order.hostMessage);
  return lines.join('\n');
}

/** A short fingerprint of what the customer would see for this order. When it changes, the customer has an update. */
export function orderUpdateKey(order: Order): string {
  return [getOrderStatus(order), order.hostMessageAt || '', order.heldAt || '', order.refundDetails ? 'refund' : '', order.rejectedTotal || 0].join('|');
}
