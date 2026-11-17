import React, { useState } from 'react';
import { useTr } from '../../lang/ui';
import { Order, CourierBill } from '../../domain/types';

export function CourierBillForm({
  order,
  onSave,
}: {
  order: Order;
  onSave: (orderId: string, bill: Omit<CourierBill, 'billId'>) => Promise<void>;
}) {
  const [courierName, setCourierName] = useState(order.courierBill?.courierName || '');
  const [trackingId, setTrackingId] = useState(order.courierBill?.trackingId || '');
  const [amount, setAmount] = useState(order.courierBill ? String(order.courierBill.amount) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!courierName.trim() || !trackingId.trim() || Number(amount) <= 0) return;
    setSaving(true);
    setError('');
    try {
      await onSave(order.orderId, {
        courierName: courierName.trim(),
        trackingId: trackingId.trim(),
        amount: Number(amount),
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Courier bill could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', marginTop: '0.8rem' }}>
      <input aria-label="Courier name" placeholder="Courier name" value={courierName} onChange={event => setCourierName(event.target.value)} required />
      <input aria-label="Tracking ID" placeholder="Tracking ID" value={trackingId} onChange={event => setTrackingId(event.target.value)} required />
      <input aria-label="Courier amount in rupees" type="number" min="1" step="0.01" placeholder="Amount (₹)" value={amount} onChange={event => setAmount(event.target.value)} required />
      <button type="submit" disabled={saving} style={{ backgroundColor: '#0288d1', color: '#fff', border: 0, borderRadius: '4px', padding: '0.55rem 0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>
        {saving ? 'Saving bill...' : order.courierBill ? 'Update courier bill' : 'Add courier bill'}
      </button>
      {error && <span role="alert" style={{ gridColumn: '1 / -1', color: '#b00020' }}>{error}</span>}
    </form>
  );
}

export function CourierPaymentForm({
  order,
  paymentQrUrl,
  canSubmit,
  onSubmit,
}: {
  order: Order;
  paymentQrUrl: string;
  canSubmit: boolean;
  onSubmit: (orderId: string, utr: string) => Promise<void>;
}) {
  const tr = useTr();
  const [utr, setUtr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!order.courierBill) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(order.orderId, utr.trim());
      setUtr('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Courier payment could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ marginTop: '0.7rem', padding: '0.8rem', backgroundColor: '#f7f2ef', borderRadius: '6px' }}>
      <p style={{ margin: '0 0 0.35rem' }}>{tr('Courier charge:')} <strong>₹{order.courierBill.amount}</strong></p>
      {paymentQrUrl && <img src={paymentQrUrl} alt={tr('Courier payment QR')} style={{ width: '150px', height: '150px', objectFit: 'contain', display: 'block', margin: '0.6rem 0' }} />}
      {order.courierPayment ? (
        <p role="status" style={{ marginBottom: 0, color: order.courierPayment.verified ? '#1b5e20' : '#8a4b08' }}>
          {order.courierPayment.verified ? tr('Courier payment confirmed by host.') : tr('Courier payment submitted; waiting for host confirmation.')}
          {' '}{tr('UTR:')} {order.courierPayment.utr}
        </p>
      ) : !canSubmit ? (
        <p role="status" style={{ marginBottom: 0 }}>{tr('Sign in to submit this courier payment.')}</p>
      ) : (
        <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.6rem' }}>
          <label style={{ flex: '1 1 190px' }}>
            {tr('Courier payment UTR')}
            <input value={utr} onChange={event => setUtr(event.target.value)} required inputMode="numeric" pattern="[0-9]{12}" maxLength={12} title={tr('Enter the 12-digit UTR')} style={{ display: 'block', boxSizing: 'border-box', width: '100%', padding: '0.55rem' }} />
          </label>
          <button type="submit" disabled={submitting} style={{ alignSelf: 'end', backgroundColor: '#6e1a3a', color: '#fff', border: 0, borderRadius: '4px', padding: '0.6rem 0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>
            {submitting ? tr('Submitting...') : `Submit ₹${order.courierBill.amount} payment`}
          </button>
          {error && <span role="alert" style={{ flexBasis: '100%', color: '#b00020' }}>{error}</span>}
        </form>
      )}
    </div>
  );
}
