import React, { useState } from 'react';
import type { Order } from '../../domain/types';

export const PAYMENT_ISSUE_TYPES = [
  'I paid but my order is not confirmed',
  'I paid a different amount',
  'Money was debited but the payment failed',
  'I paid twice',
  'My screenshot was not accepted',
  'Other problem with my payment',
] as const;

/** Lets a customer report a problem with the payment on one of their orders. The host sees it in Enquiries. */
export default function ReportPaymentIssue({
  order,
  onSubmit,
  whatsappUrl,
}: {
  order: Order;
  onSubmit: (order: Order, issueType: string, details: string) => Promise<void>;
  whatsappUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const [issueType, setIssueType] = useState<string>(PAYMENT_ISSUE_TYPES[0]);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  if (sent) {
    return <p role="status" style={{ margin: '0.5rem 0', color: '#1b5e20', fontSize: '0.88rem' }}>Your report was sent. We will contact you on WhatsApp about order {order.orderId}.</p>;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ margin: '0.5rem 0', background: 'none', border: 0, color: '#8b1e2d', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: '0.88rem' }}>
        Report a problem with this payment
      </button>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit(order, issueType, details.trim());
      setSent(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not send your report. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ margin: '0.6rem 0', padding: '0.8rem', border: '1px solid #f5b5bd', background: '#fff8f8', borderRadius: '8px', display: 'grid', gap: '0.5rem' }}>
      <strong>Report a problem with the payment for {order.orderId}</strong>
      <select value={issueType} onChange={event => setIssueType(event.target.value)} style={{ padding: '0.5rem' }} aria-label="Type of problem">
        {PAYMENT_ISSUE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
      </select>
      <textarea value={details} onChange={event => setDetails(event.target.value)} maxLength={600} rows={3} placeholder="Tell us what happened (amount, time, which app you used)" style={{ padding: '0.5rem' }} />
      {error && <span role="alert" style={{ color: '#8b1e2d', fontSize: '0.85rem' }}>{error}</span>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <button type="submit" disabled={busy} style={{ backgroundColor: '#8b1e2d', color: '#fff', border: 0, borderRadius: '6px', padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 'bold' }}>{busy ? 'Sending...' : 'Send report'}</button>
        {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noreferrer" style={{ color: '#1b5e20', fontWeight: 'bold' }}>Message us on WhatsApp</a>}
        <button type="button" onClick={() => setOpen(false)} style={{ background: 'none', border: 0, cursor: 'pointer', color: '#555' }}>Cancel</button>
      </div>
    </form>
  );
}
