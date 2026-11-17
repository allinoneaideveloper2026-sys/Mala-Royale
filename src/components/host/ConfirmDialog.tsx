import React, { useEffect, useRef, useState } from 'react';

export interface DialogReason {
  label: string;
  note: string;
}

export interface DialogResult {
  reason: string;
  note: string;
  extra: boolean;
}

export interface ConfirmDialogProps {
  title: string;
  /** What is about to happen and to which order, in plain words. */
  details?: React.ReactNode;
  confirmLabel: string;
  tone?: 'accept' | 'hold' | 'danger';
  /** When given, the host must choose a reason (and may edit the note shown to the customer). */
  reasons?: DialogReason[];
  /** Optional tick box (for example "add the refund line"). */
  extraLabel?: string;
  extraDefault?: boolean;
  onConfirm: (result: DialogResult) => void | Promise<void>;
  onCancel: () => void;
}

const TONES = {
  accept: '#2e7d32',
  hold: '#b26a00',
  danger: '#c62828',
};

/** A confirmation pop-up for every host decision on an order: accept, put on hold, or reject with a reason. */
export default function ConfirmDialog({ title, details, confirmLabel, tone = 'accept', reasons, extraLabel, extraDefault = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const [reason, setReason] = useState(reasons?.[0]?.label ?? '');
  const [note, setNote] = useState(reasons?.[0]?.note ?? '');
  const [extra, setExtra] = useState(extraDefault);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const pickReason = (label: string) => {
    setReason(label);
    const preset = reasons?.find(item => item.label === label);
    if (preset) setNote(preset.note);
  };

  const confirm = async () => {
    if (reasons && reason === 'Other' && !note.trim()) {
      setError('Please write a short reason for the customer.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onConfirm({ reason, note: note.trim(), extra });
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Could not complete this action.');
      setBusy(false);
    }
  };

  return (
    <div role="presentation" onClick={() => { if (!busy) onCancel(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: '1rem' }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', padding: '1.2rem', width: 'min(460px, 100%)', maxHeight: '90vh', overflowY: 'auto', display: 'grid', gap: '0.8rem', borderTop: `5px solid ${TONES[tone]}` }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {details && <div style={{ fontSize: '0.9rem', color: '#444' }}>{details}</div>}
        {reasons && (
          <>
            <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
              Reason
              <select value={reason} onChange={event => pickReason(event.target.value)} style={{ padding: '0.5rem', fontWeight: 'normal' }}>
                {reasons.map(item => <option key={item.label} value={item.label}>{item.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
              Note to the customer (they will see this)
              <textarea value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={400} style={{ padding: '0.5rem', fontWeight: 'normal', resize: 'vertical' }} />
            </label>
          </>
        )}
        {extraLabel && (
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={extra} onChange={event => setExtra(event.target.checked)} />
            {extraLabel}
          </label>
        )}
        {error && <p role="alert" style={{ margin: 0, color: '#b00020', fontSize: '0.85rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #bbb', background: '#fff', cursor: 'pointer' }}>Cancel</button>
          <button type="button" disabled={busy} onClick={() => void confirm()} style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 0, background: TONES[tone], color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>
            {busy ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
