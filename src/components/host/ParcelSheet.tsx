import React, { useEffect, useState } from 'react';
import { Order, CustomerAddress, ParcelParty } from '../../domain/types';
import { getOrderStatus } from '../../app/utils';

export function customerParcelParty(address: CustomerAddress): ParcelParty {
  return {
    fullName: address.fullName,
    phone: address.phone,
    addressLine1: [address.houseNameOrNumber, address.street1].filter(Boolean).join(', ') || address.street || '',
    addressLine2: [address.street2, address.landmark1, address.landmark2].filter(Boolean).join(', '),
    city: address.city || address.taluk || '',
    state: address.state || address.district || '',
    pincode: address.pincode,
    country: 'India',
  };
}

export default function ParcelSheet({
  order,
  onSave,
}: {
  order: Order;
  onSave: (orderId: string, from: ParcelParty, to: ParcelParty) => Promise<void>;
}) {
  const [from, setFrom] = useState<ParcelParty>(order.parcelDetails?.from || {
    fullName: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: '', pincode: '', country: 'India',
  });
  const [to, setTo] = useState<ParcelParty>(order.parcelDetails?.to || customerParcelParty(order.address));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedSnapshot, setSavedSnapshot] = useState(order.parcelDetails ? JSON.stringify({ from: order.parcelDetails.from, to: order.parcelDetails.to }) : '');
  const currentSnapshot = JSON.stringify({ from, to });
  const saved = Boolean(savedSnapshot) && currentSnapshot === savedSnapshot;

  useEffect(() => {
    if (!order.parcelDetails) return;
    setFrom(order.parcelDetails.from);
    setTo(order.parcelDetails.to);
    setSavedSnapshot(JSON.stringify({ from: order.parcelDetails.from, to: order.parcelDetails.to }));
  }, [order.orderId, order.parcelDetails?.savedAt]);

  const updateParty = (side: 'from' | 'to', field: keyof ParcelParty, value: string) => {
    const setter = side === 'from' ? setFrom : setTo;
    setter(party => ({ ...party, [field]: value }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!from.fullName.trim() || !from.phone.trim() || !from.addressLine1.trim() || !from.city.trim() || !from.pincode.trim()) {
      setError('Complete the From name, phone, address line 1, city and pincode.');
      return;
    }
    if (!to.fullName.trim() || !to.phone.trim() || !to.addressLine1.trim() || !to.city.trim() || !to.pincode.trim()) {
      setError('Complete the To name, phone, address line 1, city and pincode.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(order.orderId, from, to);
      setSavedSnapshot(currentSnapshot);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Parcel details could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    if (!saved) return;
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const left = 18;
    let y = 18;
    pdf.setFontSize(18);
    pdf.text('PARCEL SHEET', left, y);
    y += 10;
    pdf.setFontSize(10);
    pdf.text(`Order: ${order.orderId}`, left, y);
    pdf.text(`Status: ${getOrderStatus(order)}`, 110, y);
    y += 6;
    pdf.text(`Order date: ${new Date(order.createdAt).toLocaleString()}`, left, y);
    y += 12;

    const drawParty = (title: string, party: ParcelParty, x: number) => {
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text(title, x, y);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      const addressLines = [
        party.fullName,
        party.phone,
        party.addressLine1,
        party.addressLine2,
        [party.city, party.state, party.pincode].filter(Boolean).join(', '),
        party.country,
      ].filter(Boolean).flatMap(line => pdf.splitTextToSize(line, 78));
      pdf.text(addressLines, x, y + 7);
    };

    drawParty('FROM', from, left);
    drawParty('TO', to, 110);
    y += 52;
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('ORDER CONTENTS', left, y);
    y += 7;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    order.items.forEach(item => {
      const lines = pdf.splitTextToSize(`${item.name}  x${item.quantity}  Rs ${item.price * item.quantity}`, 170);
      if (y + lines.length * 5 > 275) {
        pdf.addPage();
        y = 18;
      }
      pdf.text(lines, left, y);
      y += lines.length * 5 + 2;
    });
    y += 3;
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Items total: Rs ${order.itemTotal}`, left, y);
    if (order.courierBill) pdf.text(`Courier charge: Rs ${order.courierBill.amount}`, 110, y);
    pdf.save(`parcel-${order.orderId}.pdf`);
  };

  const partyFields: Array<[keyof ParcelParty, string]> = [
    ['fullName', 'Name'],
    ['phone', 'Phone'],
    ['addressLine1', 'Address line 1 (primary address details)'],
    ['addressLine2', 'Address line 2 (apartment, suite, landmark) [optional]'],
    ['city', 'City'],
    ['state', 'State'],
    ['pincode', 'Pincode'],
    ['country', 'Country'],
  ];

  return (
    <details style={{ marginTop: '0.8rem', border: '1px solid #ddd', borderRadius: '6px', padding: '0.7rem' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Parcel sheet · From / To</summary>
      <form onSubmit={save} style={{ marginTop: '0.8rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem' }}>
          {(['from', 'to'] as const).map(side => (
            <fieldset key={side} style={{ display: 'grid', gap: '0.5rem', border: '1px solid #ddd', padding: '0.75rem', minWidth: 0 }}>
              <legend style={{ fontWeight: 'bold' }}>{side === 'from' ? 'FROM · Host' : 'TO · Customer'}</legend>
              {partyFields.map(([field, label]) => (
                <label key={field} style={{ display: 'grid', gap: '0.2rem', fontSize: '0.85rem' }}>
                  {label}
                  <input value={side === 'from' ? from[field] : to[field]} onChange={event => updateParty(side, field, event.target.value)} required={['fullName', 'phone', 'addressLine1', 'city', 'pincode'].includes(field)} />
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        {order.parcelDetails && <p style={{ color: '#666', fontSize: '0.8rem' }}>Last saved by {order.parcelDetails.savedBy} · {new Date(order.parcelDetails.savedAt).toLocaleString()}</p>}
        {error && <p role="alert" style={{ color: '#b00020' }}>{error}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.8rem' }}>
          <button type="submit" disabled={saving || saved} style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 0, padding: '0.55rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}>
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save parcel details'}
          </button>
          <button type="button" disabled={!saved} onClick={downloadPdf} style={{ backgroundColor: '#2e7d32', color: '#fff', border: 0, padding: '0.55rem 0.8rem', borderRadius: '4px', cursor: saved ? 'pointer' : 'not-allowed' }}>
            Download parcel PDF
          </button>
        </div>
      </form>
    </details>
  );
}
