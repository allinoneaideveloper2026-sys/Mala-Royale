import React, { useEffect, useState } from 'react';
import { buildUpiLink } from '../../domain/upi';
import { makeQrDataUrl } from '../../app/makeQr';

/**
 * Payment box with the exact amount filled in. With the shop's UPI ID it shows a QR made for THIS order,
 * and an "open UPI app" button for customers paying from the same phone. Without a UPI ID it shows the
 * uploaded static QR image, as before.
 */
export default function UpiPayBox({
  upiId,
  payeeName,
  amount,
  note,
  fallbackQrUrl,
  tr,
}: {
  upiId: string;
  payeeName: string;
  amount: number;
  note: string;
  fallbackQrUrl: string;
  tr: (text: string) => string;
}) {
  const [qr, setQr] = useState('');
  const [failed, setFailed] = useState(false);
  const link = upiId ? buildUpiLink({ upiId, payeeName, amount, note }) : '';

  useEffect(() => {
    let cancelled = false;
    setQr('');
    setFailed(false);
    if (!link) return undefined;
    makeQrDataUrl(link)
      .then(url => { if (!cancelled) setQr(url); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [link]);

  if (!upiId) {
    return fallbackQrUrl
      ? <img src={fallbackQrUrl} alt={tr('Host payment QR code')} style={{ width: '200px', height: '200px', maxWidth: '100%', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
      : <p role="status" style={{ marginBottom: 0, color: '#8a4b08' }}>{tr('The host has not added a payment QR yet.')}</p>;
  }

  return (
    <div style={{ textAlign: 'center', display: 'grid', gap: '0.5rem', justifyItems: 'center' }}>
      <strong style={{ fontSize: '1.05rem' }}>{tr('Pay exactly')} ₹{amount}</strong>
      {qr && <img src={qr} alt={tr('Payment QR for this order')} style={{ width: '200px', height: '200px', maxWidth: '100%' }} />}
      {!qr && !failed && <span role="status" style={{ color: '#666' }}>{tr('Preparing your payment QR...')}</span>}
      {failed && fallbackQrUrl && <img src={fallbackQrUrl} alt={tr('Host payment QR code')} style={{ width: '200px', height: '200px', maxWidth: '100%', objectFit: 'contain' }} />}
      <a href={link} style={{ backgroundColor: '#1b5e20', color: '#fff', padding: '0.6rem 1rem', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold' }}>
        {tr('Pay in your UPI app')} ₹{amount}
      </a>
      <span style={{ fontSize: '0.8rem', color: '#555' }}>
        {tr('On your phone, tap the button. On another device, scan the QR. UPI ID:')} <code>{upiId}</code>
      </span>
      {failed && !fallbackQrUrl && <span role="status" style={{ fontSize: '0.8rem', color: '#8a4b08' }}>{tr('The QR could not load. Use the button or pay to the UPI ID.')}</span>}
      <span style={{ fontSize: '0.78rem', color: '#8a4b08' }}>{tr('Do not change the amount. Your order is checked against ₹')}{amount}.</span>
    </div>
  );
}
