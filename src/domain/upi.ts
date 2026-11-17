// Builds the standard UPI payment link. Apps such as PhonePe, GPay and Paytm open it with the amount already filled in.
// The same link is shown as a QR code so a customer on another device can scan it.
const UPI_ID_PATTERN = /^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,30}$/;

export const isValidUpiId = (value: string): boolean => UPI_ID_PATTERN.test(value.trim());

export function buildUpiLink({ upiId, payeeName, amount, note }: { upiId: string; payeeName: string; amount: number; note?: string }): string {
  const params = [
    `pa=${encodeURIComponent(upiId.trim())}`,
    `pn=${encodeURIComponent(payeeName.trim() || 'Shop')}`,
    `am=${amount.toFixed(2)}`,
    'cu=INR',
  ];
  if (note) params.push(`tn=${encodeURIComponent(note.slice(0, 40))}`);
  return `upi://pay?${params.join('&')}`;
}
