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

export function getOrderStatus(order: Order): string {
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
