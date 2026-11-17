import { describe, expect, it } from 'vitest';
import { OrderBook } from '../src/domain/OrderBook';

const address = { fullName: 'A', phone: '9999999999', pincode: '580020' } as any;
const items = [{ productId: 'p1', name: 'Saree', price: 1000, quantity: 1 }] as any;

function newBook() {
  const book = new OrderBook();
  const order = book.createOrder('u1', items, 1000, address, true);
  return { book, order };
}

describe('OrderBook', () => {
  it('requires the courier notice to be accepted', () => {
    expect(() => new OrderBook().createOrder('u1', items, 1000, address, false)).toThrow(/Courier charge notice/);
  });

  it('rejects a reused UTR across orders', () => {
    const { book, order } = newBook();
    book.submitItemPayment(order.orderId, 1000, '123456789012', 'shot.png');
    const second = book.createOrder('u2', items, 1000, address, true);
    expect(() => book.submitItemPayment(second.orderId, 1000, '123456789012', 'x.png')).toThrow(/UTR/);
  });

  it('will not confirm item payment before the address is confirmed', () => {
    const { book, order } = newBook();
    book.submitItemPayment(order.orderId, 1000, '111111111111', 's.png');
    expect(() => book.verifyPayment(order.orderId, 'ITEM')).toThrow(/confirm the delivery address/);
  });

  it('validates the courier UTR format', () => {
    const { book, order } = newBook();
    book.attachCourierBill(order.orderId, { amount: 80, courierName: 'X', trackingId: 'T1' } as any);
    expect(() => book.submitCourierPayment(order.orderId, 'u1', 'abc')).toThrow(/12-digit/);
  });

  it('cannot dispatch until the address is confirmed', () => {
    const { book, order } = newBook();
    expect(() => book.submitForDispatch(order.orderId)).toThrow(/confirm the delivery address/);
  });

  it('only dispatched orders can be marked delivered', () => {
    const { book, order } = newBook();
    expect(() => book.markDelivered(order.orderId)).toThrow(/dispatched/);
  });
});
