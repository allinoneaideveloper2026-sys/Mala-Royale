import React, { useState } from 'react';
import type { Order } from '../../domain/types';

const METHOD_LABELS = { UPI_ID: 'UPI ID', UPI_PHONE: 'UPI phone number' } as const;

export function describeRefund(order: Order): string {
  return order.refundDetails ? `${METHOD_LABELS[order.refundDetails.method]}: ${order.refundDetails.value}` : '';
}

/**
 * Shown to the customer when the host has cancelled (not accepted) their order.
 * Asks where to send the refund: a UPI ID or the mobile number linked to UPI.
 */
export default function RefundPrompt({
  order,
  onSubmit,
  validate,
}: {
  order: Order;
  onSubmit: (orderId: string, method: 'UPI_ID' | 'UPI_PHONE', value: string) => Promise<void>;
  validate: (method: 'UPI_ID' | 'UPI_PHONE', value: string) => string;
}) {
  const [method, setMethod] = useState<'UPI_ID' | 'UPI_PHONE'>('UPI_ID');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const partial = order.stage !== 'NOT_ACCEPTED';
  const refundAmount = partial ? (order.refundDue || 0) : order.itemTotal;

  if (order.refundDetails) {
    return (
      <div role="status" style={{ margin: '0.7rem 0', padding: '0.7rem', background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '8px', fontSize: '0.9rem' }}>
        <strong>Refund details received.</strong> We will refund ₹{refundAmount} to your {describeRefund(order)}.
      </div>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validate(method, value);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(order.orderId, method, value.trim());
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save your refund details. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ margin: '0.7rem 0', padding: '0.8rem', background: '#fdecea', border: '1px solid #f5b5bd', borderRadius: '8px', display: 'grid', gap: '0.5rem' }}>
      <strong style={{ color: '#8b1e2d' }}>{partial ? 'Some items in your order were rejected' : `Your order was cancelled${order.rejectionReason ? `: ${order.rejectionReason}` : ''}`}</strong>
      <span style={{ fontSize: '0.88rem' }}>To refund ₹{refundAmount}, tell us where to send it.</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.9rem' }}>
        {(Object.keys(METHOD_LABELS) as Array<keyof typeof METHOD_LABELS>).map(option => (
          <label key={option} style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
            <input type="radio" name={`refund-${order.orderId}`} checked={method === option} onChange={() => { setMethod(option); setError(''); }} />
            {METHOD_LABELS[option]}
          </label>
        ))}
      </div>
      <input
        aria-label={METHOD_LABELS[method]}
        value={value}
        onChange={event => setValue(event.target.value)}
        inputMode={method === 'UPI_PHONE' ? 'numeric' : 'email'}
        placeholder={method === 'UPI_PHONE' ? '10-digit mobile number' : 'yourname@bank'}
        maxLength={method === 'UPI_PHONE' ? 10 : 80}
        style={{ padding: '0.55rem' }}
      />
      {error && <span role="alert" style={{ color: '#8b1e2d', fontSize: '0.85rem' }}>{error}</span>}
      <button type="submit" disabled={busy} style={{ backgroundColor: 'var(--mr-primary)', color: '#fff', border: 0, borderRadius: '6px', padding: '0.55rem 1rem', fontWeight: 'bold', cursor: 'pointer', justifySelf: 'start' }}>
        {busy ? 'Saving...' : 'Send refund details'}
      </button>
    </form>
  );
}
