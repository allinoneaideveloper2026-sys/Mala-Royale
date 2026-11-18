import type { CustomerAddress } from './types';

/** The delivery address fields a customer must fill. State and country are filled from the pincode when possible. */
export function missingAddressFields(address: CustomerAddress): string[] {
  const missing: string[] = [];
  if (!address.fullName?.trim()) missing.push('name');
  if (!address.phone?.trim()) missing.push('phone');
  if (!address.street1?.trim()) missing.push('address line 1');
  if (!address.landmark1?.trim()) missing.push('landmark 1');
  if (!address.city?.trim()) missing.push('city');
  if (!address.district?.trim()) missing.push('district');
  if (!address.state?.trim()) missing.push('state');
  if (!address.country?.trim()) missing.push('country');
  if (!/^\d{6}$/.test(address.pincode || '')) missing.push('pincode');
  return missing;
}

export const isAddressComplete = (address: CustomerAddress): boolean => missingAddressFields(address).length === 0;
