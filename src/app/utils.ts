import { Order } from '../domain/types';

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      value => { window.clearTimeout(timer); resolve(value); },
      error => { window.clearTimeout(timer); reject(error); },
    );
  });
}

// Newest first, using the full date and time the order was placed.
export function newestFirst(left: Order, right: Order): number {
  const byTime = (Date.parse(right.createdAt) || 0) - (Date.parse(left.createdAt) || 0);
  return byTime !== 0 ? byTime : right.orderId.localeCompare(left.orderId);
}

const TONES = {
  green: { backgroundColor: '#e8f5e9', color: '#1b5e20', border: '1px solid #a5d6a7' },
  blue: { backgroundColor: '#e3f2fd', color: '#0d47a1', border: '1px solid #90caf9' },
  teal: { backgroundColor: '#e0f2f1', color: '#00695c', border: '1px solid #80cbc4' },
  amber: { backgroundColor: '#fff3cd', color: '#664d03', border: '1px solid #ffe08a' },
  red: { backgroundColor: '#fdecea', color: '#8b1e2d', border: '1px solid #f5b5bd' },
  grey: { backgroundColor: '#eceff1', color: '#37474f', border: '1px solid #cfd8dc' },
};

/** Colour for the status chip: green delivered, blue dispatched, teal confirmed, amber waiting, red cancelled. */
export function getOrderStatusStyle(order: Order): { backgroundColor: string; color: string; border: string } {
  const status = getOrderStatus(order);
  if (status === 'Delivered') return TONES.green;
  if (status === 'Dispatched') return TONES.blue;
  if (status === 'Not accepted' || status === 'Cancelled') return TONES.red;
  if (status === 'On hold') return TONES.amber;
  if (/awaiting/i.test(status)) return TONES.amber;
  if (status === 'Order received') return TONES.grey;
  return TONES.teal;
}

export function getOrderStatus(order: Order): string {
  if (order.isWithheld && order.stage !== 'NOT_ACCEPTED' && order.stage !== 'CANCELLED' && order.stage !== 'DELIVERED') return 'On hold';
  if (order.stage === 'NOT_ACCEPTED') return 'Not accepted';
  if (order.stage === 'CANCELLED') return 'Cancelled';
  if (order.stage === 'DELIVERED') return 'Delivered';
  if (order.stage === 'SUBMITTED_FOR_DISPATCH') return 'Dispatched';
  if (order.courierPayment?.verified) return 'Courier payment confirmed';
  if (order.courierPayment) return 'Courier payment awaiting host confirmation';
  if (order.courierBill) return 'Courier charge awaiting customer payment';
  if (order.stage === 'COURIER_CHARGE_VERIFIED') return 'Courier payment confirmed';
  if (order.stage === 'COURIER_RECEIPT_UPLOADED') return 'Courier bill ready';
  if (order.stage === 'PACKING') return 'Packing';
  if (order.itemPayment && !order.deliveryConfirmed) return 'Delivery address awaiting host confirmation';
  if (order.itemPayment?.verified) return 'Item payment confirmed';
  if (order.itemPayment) return 'Item payment awaiting host confirmation';
  return 'Order received';
}
