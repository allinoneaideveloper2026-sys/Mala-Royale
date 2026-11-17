// Refund details the customer provides after the host cancels (does not accept) an order.
// These patterns are mirrored in firestore.rules; change both together.
const UPI_ID_PATTERN = /^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,30}$/;
const UPI_PHONE_PATTERN = /^[6-9][0-9]{9}$/;

export function validateRefundDetails(method: 'UPI_ID' | 'UPI_PHONE', value: string): string {
  const trimmed = value.trim();
  if (method === 'UPI_PHONE') return UPI_PHONE_PATTERN.test(trimmed) ? '' : 'Enter the 10-digit mobile number linked to your UPI.';
  return UPI_ID_PATTERN.test(trimmed) ? '' : 'Enter a valid UPI ID, for example name@bank.';
}
