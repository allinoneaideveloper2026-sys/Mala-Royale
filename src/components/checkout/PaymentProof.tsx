import React, { useEffect, useState } from 'react';
import { classifyUtrSource, isProofUrl, type TimeStatus, type UtrSource } from '../../domain/paymentProof';
import { readPaymentProof } from '../../app/readProof';

export interface ProofCheck {
  utrSource: UtrSource;
  amountFound: boolean | null;
  paidAt?: string;
  timeStatus?: TimeStatus;
  /** When set, the order must not be placed: the screenshot does not match this payment. */
  blocking?: string;
}

/**
 * Payment screenshot picker. When a screenshot is chosen, the UTR and amount are read from it automatically
 * (in the customer's browser). The UTR box is pre-filled so the customer only has to check it; if the
 * screenshot cannot be read, they type the 12-digit UTR as before.
 */
export function PaymentProofCapture({
  file,
  onFile,
  utr,
  onUtr,
  expectedAmount,
  onCheck,
  label,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  utr: string;
  onUtr: (value: string) => void;
  expectedAmount: number;
  onCheck: (check: ProofCheck | null) => void;
  label: string;
}) {
  const [preview, setPreview] = useState('');
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [readUtr, setReadUtr] = useState('');
  const [amountFound, setAmountFound] = useState<boolean | null>(null);
  const [paidAt, setPaidAt] = useState('');
  const [timeStatus, setTimeStatus] = useState<TimeStatus>('unknown');
  const [blocking, setBlocking] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!file) {
      setPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    let cancelled = false;
    setReadUtr('');
    setAmountFound(null);
    setPaidAt('');
    setTimeStatus('unknown');
    setBlocking('');
    setNote('');
    onUtr('');
    if (!file) return undefined;
    setReading(true);
    setProgress(0);
    readPaymentProof(file, expectedAmount, fraction => { if (!cancelled) setProgress(fraction); })
      .then(result => {
        if (cancelled) return;
        setReadUtr(result.utr);
        setAmountFound(result.amountStatus === 'match');
        setTimeStatus(result.timeStatus);
        setPaidAt(result.paidAtIso);
        const paidText = result.paidAtIso ? new Date(result.paidAtIso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        if (result.paymentStatus === 'failed' || result.paymentStatus === 'pending') {
          setBlocking(`This screenshot shows a payment that is ${result.paymentStatus === 'failed' ? 'not successful' : 'still pending'}. Please wait until the payment succeeds, then attach the final screenshot.`);
        } else if (result.amountStatus === 'mismatch') {
          setBlocking(`This screenshot shows ₹${result.seen.join(', ₹')}, but your order total (after offers) is ₹${expectedAmount}. Please pay exactly ₹${expectedAmount} and attach that screenshot. If you believe this is a mistake, use "Report a problem" on your order or message us.`);
        } else if (result.amountStatus === 'notfound') {
          setBlocking(`We could not find ₹${expectedAmount} in this screenshot. Please attach a clear screenshot of your payment of exactly ₹${expectedAmount}.`);
        } else if (result.timeStatus === 'stale') {
          setBlocking(`This screenshot shows a payment made on ${paidText}, which is not recent. Please attach the screenshot of the payment you just made.`);
        } else if (result.timeStatus === 'future') {
          setBlocking(`This screenshot shows a payment time (${paidText}) that is in the future. Please attach the screenshot of the payment you just made.`);
        }
        if (result.utr) onUtr(result.utr);
        else setNote('We could not read the UTR from this screenshot. Please type the 12-digit UTR shown in your payment app.');
      })
      .catch(() => {
        if (!cancelled) setNote('Automatic reading is not available right now. Please type the 12-digit UTR shown in your payment app.');
      })
      .finally(() => { if (!cancelled) setReading(false); });
    return () => { cancelled = true; };
    // Re-read only when a different screenshot is chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  useEffect(() => {
    onCheck(file ? { utrSource: classifyUtrSource(readUtr, utr), amountFound, ...(paidAt ? { paidAt } : {}), timeStatus, ...(blocking ? { blocking } : {}) } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, readUtr, utr, amountFound, paidAt, timeStatus, blocking]);

  return (
    <div style={{ display: 'grid', gap: '0.5rem', margin: '0.6rem 0', fontSize: '0.9rem' }}>
      <label style={{ display: 'block' }}>
        <span style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 'bold' }}>{label}</span>
        <input
          type="file"
          accept="image/*"
          required
          onChange={event => onFile(event.target.files && event.target.files[0] ? event.target.files[0] : null)}
          style={{ display: 'block', width: '100%', boxSizing: 'border-box' }}
        />
      </label>
      {preview && <img src={preview} alt="Payment screenshot preview" style={{ maxHeight: '140px', maxWidth: '100%', borderRadius: '6px', border: '1px solid #ddd' }} />}
      {reading && <span role="status" style={{ color: '#555' }}>Reading your screenshot{progress > 0 ? ` (${Math.round(progress * 100)}%)` : '...'} This can take a few seconds.</span>}
      {file && !reading && (
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 'bold' }}>
            UTR (12 digits){readUtr && readUtr === utr.trim() ? ' - read from your screenshot, please check it' : ''}
          </span>
          <input
            value={utr}
            onChange={event => onUtr(event.target.value.replace(/\D/g, '').slice(0, 12))}
            required
            inputMode="numeric"
            pattern="[0-9]{12}"
            maxLength={12}
            title="Enter the 12-digit UTR"
            style={{ display: 'block', boxSizing: 'border-box', width: '100%', padding: '0.55rem' }}
          />
        </label>
      )}
      {note && <span role="status" style={{ color: '#8a4b08' }}>{note}</span>}
      {blocking && <span role="alert" style={{ color: '#8b1e2d', background: '#fdecea', border: '1px solid #f5b5bd', borderRadius: '6px', padding: '0.5rem' }}>{blocking}</span>}
      {file && !reading && !blocking && amountFound === true && <span role="status" style={{ color: '#1b5e20' }}>Amount ₹{expectedAmount} found{timeStatus === 'fresh' ? ' and the payment time looks right' : ''}.</span>}
    </div>
  );
}

/** Small hints for the host, from the automatic reading done on the customer's phone. A hint, not proof of payment. */
export function ProofCheckBadges({ check, expectedAmount }: { check?: ProofCheck; expectedAmount: number }) {
  if (!check) return null;
  const chip = (text: string, good: boolean) => (
    <span key={text} style={{ fontSize: '0.72rem', padding: '0.15rem 0.5rem', borderRadius: '999px', backgroundColor: good ? '#e8f5e9' : '#fff3cd', color: good ? '#1b5e20' : '#664d03', border: `1px solid ${good ? '#a5d6a7' : '#ffe08a'}` }}>{text}</span>
  );
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.3rem', marginLeft: '0.4rem' }}>
      {check.utrSource === 'auto' && chip('UTR read from screenshot', true)}
      {check.utrSource === 'edited' && chip('UTR changed by customer after reading', false)}
      {check.utrSource === 'manual' && chip('UTR typed by customer', false)}
      {check.amountFound === true && chip(`₹${expectedAmount} found in screenshot`, true)}
      {check.amountFound === false && chip(`₹${expectedAmount} not found in screenshot`, false)}
      {check.timeStatus === 'fresh' && chip('Payment time matches order time', true)}
      {(check.timeStatus === 'unknown' || !check.timeStatus) && chip('Payment time not read', false)}
      {check.timeStatus === 'stale' && chip('Payment time is old', false)}
      {check.timeStatus === 'future' && chip('Payment time is in the future', false)}
    </span>
  );
}

/** Shows an uploaded payment screenshot as a thumbnail that opens the full image in a new tab. */
export function PaymentProofView({ url, caption = 'Payment screenshot' }: { url?: string; caption?: string }) {
  if (!isProofUrl(url)) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.78rem', color: '#6e1a3a', textDecoration: 'none' }}>
      <img src={url} alt={caption} loading="lazy" style={{ maxHeight: '110px', maxWidth: '160px', borderRadius: '6px', border: '1px solid #ddd', objectFit: 'cover' }} />
      <span>{caption} (tap to enlarge)</span>
    </a>
  );
}
