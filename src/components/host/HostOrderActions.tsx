import React, { useState } from 'react';
import type { Order } from '../../domain/types';
import '../storefront/Storefront.css';
import ConfirmDialog, { type DialogReason } from './ConfirmDialog';
import { customerUpdateText } from '../../app/orderMessages';
import { whatsAppLink } from '../../app/shared';

export interface HostOrderActionsProps {
  order: Order;
  /** Rejecting is only offered while the order is still active. */
  canReject: boolean;
  onReject: (orderId: string, reason: string, note: string) => Promise<void>;
  /** Pause the order with a reason the customer can see. */
  onHold: (orderId: string, reason: string, note: string) => Promise<void>;
  onRelease: (orderId: string) => Promise<void>;
  onSaveMessage: (orderId: string, message: string) => Promise<void>;
}

const REFUND_LINE = 'Your refund will be processed within 2-3 working days.';

const HOLD_REASONS: DialogReason[] = [
  { label: 'Checking your payment with the bank', note: 'We are checking your payment with our bank and will confirm shortly.' },
  { label: 'Need to clarify your address', note: 'We need to confirm your delivery address. Please check your WhatsApp or reply to our message.' },
  { label: 'Item is being re-checked', note: 'We are re-checking the item before packing it for you.' },
  { label: 'Waiting for your reply', note: 'We have sent you a message and are waiting for your reply.' },
  { label: 'Other', note: '' },
];

const REASONS: DialogReason[] = [
  { label: 'Address not deliverable', note: 'Sorry, our courier cannot deliver to the address you gave. Please place the order again with a deliverable address.' },
  { label: 'No courier service on this pincode', note: 'Sorry, there is no courier service available for the pincode you entered.' },
  { label: 'Address incorrect or incomplete', note: 'The address looks incorrect or incomplete. Please check it and place the order again.' },
  { label: 'Item out of stock', note: 'Sorry, this item is no longer in stock.' },
  { label: 'Payment not received or UTR could not be verified', note: 'We could not verify your payment with the UTR you entered.' },
  { label: 'Other', note: '' },
];

export default function HostOrderActions({ order, canReject, onReject, onHold, onRelease, onSaveMessage }: HostOrderActionsProps) {
  const [message, setMessage] = useState(order.hostMessage ?? '');
  const [savingMessage, setSavingMessage] = useState(false);
  const [dialog, setDialog] = useState<'reject' | 'hold' | 'release' | null>(null);
  const [error, setError] = useState('');

  const messageChanged = message.trim() !== (order.hostMessage ?? '').trim();
  const isHeld = Boolean(order.isWithheld);
  const phone = (order.address?.phone || '').replace(/\D/g, '');

  const saveMessage = async () => {
    setSavingMessage(true);
    setError('');
    try {
      await onSaveMessage(order.orderId, message.trim());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the message.');
    } finally {
      setSavingMessage(false);
    }
  };

  const buttonStyle = (background: string) => ({ padding: '0.5rem 1rem', background, color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' } as const);

  return (
    <div style={{ marginTop: '0.9rem', padding: '0.8rem', borderRadius: '10px', background: 'var(--mr-tint)', border: '1px solid #eee', display: 'grid', gap: '0.9rem' }}>
      {isHeld && (
        <p role="status" style={{ margin: 0, padding: '0.5rem 0.7rem', background: '#fff3cd', border: '1px solid #ffe08a', borderRadius: '6px', fontSize: '0.88rem' }}>
          <strong>On hold:</strong> {order.holdReason || 'no reason recorded'}{order.holdNote ? ` · ${order.holdNote}` : ''}
          {order.heldAt && <span style={{ color: '#777' }}> · since {new Date(order.heldAt).toLocaleString()}</span>}
        </p>
      )}

      <div>
        <label style={{ display: 'grid', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
          Message to customer (shown on their order)
          <textarea
            value={message}
            onChange={event => setMessage(event.target.value)}
            rows={2}
            maxLength={400}
            placeholder="e.g. Your saree is packed and goes out with DTDC tomorrow."
            style={{ padding: '0.5rem', fontWeight: 'normal', resize: 'vertical' }}
          />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', marginTop: '0.4rem' }}>
          <button type="button" disabled={!messageChanged || savingMessage} onClick={() => void saveMessage()} style={{ padding: '0.4rem 0.9rem', background: 'var(--mr-primary)', color: '#fff', border: 'none', borderRadius: '4px', cursor: messageChanged ? 'pointer' : 'not-allowed', opacity: messageChanged ? 1 : 0.5 }}>
            {savingMessage ? 'Saving...' : 'Send message'}
          </button>
          {phone.length >= 10 && (
            <a href={whatsAppLink(phone, customerUpdateText(order))} target="_blank" rel="noreferrer" style={{ backgroundColor: '#25d366', color: '#fff', textDecoration: 'none', fontWeight: 'bold', padding: '0.4rem 0.8rem', borderRadius: '4px' }}>
              Notify customer on WhatsApp
            </a>
          )}
          {order.hostMessageAt && <span style={{ fontSize: '0.75rem', color: '#777' }}>Last sent {new Date(order.hostMessageAt).toLocaleString()}</span>}
        </div>
      </div>

      {canReject && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
          {isHeld
            ? <button type="button" onClick={() => setDialog('release')} style={buttonStyle('#2e7d32')}>Release hold</button>
            : <button type="button" onClick={() => setDialog('hold')} style={buttonStyle('#b26a00')}>Put on hold</button>}
          <button type="button" onClick={() => setDialog('reject')} style={buttonStyle('#c62828')}>Reject order</button>
        </div>
      )}

      {error && <p role="alert" style={{ margin: 0, color: '#b00020', fontSize: '0.85rem' }}>{error}</p>}

      {dialog === 'hold' && (
        <ConfirmDialog
          title={`Put order ${order.orderId} on hold?`}
          tone="hold"
          confirmLabel="Put on hold"
          reasons={HOLD_REASONS}
          details="The order stops moving forward until you release it. The customer sees the reason on their order."
          onCancel={() => setDialog(null)}
          onConfirm={async ({ reason, note }) => { await onHold(order.orderId, reason, note); setDialog(null); }}
        />
      )}
      {dialog === 'release' && (
        <ConfirmDialog
          title={`Release the hold on ${order.orderId}?`}
          tone="accept"
          confirmLabel="Release hold"
          details="The order can continue to the next stage."
          onCancel={() => setDialog(null)}
          onConfirm={async () => { await onRelease(order.orderId); setDialog(null); }}
        />
      )}
      {dialog === 'reject' && (
        <ConfirmDialog
          title={`Reject order ${order.orderId}?`}
          tone="danger"
          confirmLabel="Reject order"
          reasons={REASONS}
          extraLabel={`Add: "${REFUND_LINE}"`}
          extraDefault={Boolean(order.itemPayment)}
          details="The customer will see the reason, and will be asked for refund details. Stock is put back."
          onCancel={() => setDialog(null)}
          onConfirm={async ({ reason, note, extra }) => {
            await onReject(order.orderId, reason, [note, extra ? REFUND_LINE : ''].filter(Boolean).join('\n'));
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
