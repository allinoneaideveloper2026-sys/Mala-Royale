import React from 'react';
import { useTr } from '../../lang/ui';
import { CustomerAddress } from '../../domain/types';

export default function DeliveryAddressFields({
  address,
  setAddress,
  isCheckingPincode,
  onCheckPincode,
}: {
  address: CustomerAddress;
  setAddress: React.Dispatch<React.SetStateAction<CustomerAddress>>;
  isCheckingPincode: boolean;
  onCheckPincode: () => void;
}) {
  const tr = useTr();
  const fields: Array<{ key: keyof CustomerAddress; label: string; required?: boolean; numeric?: boolean }> = [
    { key: 'fullName', label: tr('Customer name'), required: true },
    { key: 'phone', label: tr('WhatsApp / phone number'), required: true, numeric: true },
    { key: 'houseNameOrNumber', label: tr('House name / number') },
    { key: 'street1', label: tr('Address line 1 (primary address details)'), required: true },
    { key: 'street2', label: tr('Address line 2 (apartment, suite or other details) [optional]') },
    { key: 'landmark1', label: tr('Landmark 1'), required: true },
    { key: 'landmark2', label: tr('Landmark 2') },
    { key: 'city', label: tr('City'), required: true },
    { key: 'taluk', label: tr('Taluk [optional]') },
    { key: 'district', label: tr('District'), required: true },
    { key: 'pincode', label: tr('Pincode'), required: true, numeric: true },
  ];

  return (
    <>
      <p style={{ margin: 0, color: '#666', fontSize: '0.85rem' }}>{tr('Address details are collected only to deliver this order. The host will use your WhatsApp number to confirm your order and share delivery updates.')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.6rem' }}>
        {fields.map(field => (
          <label key={field.key} style={{ display: 'grid', gap: '0.2rem', fontSize: '0.85rem' }}>
            {field.label}{field.required ? ' *' : ''}
            <input
              value={String(address[field.key] || '')}
              onChange={event => setAddress(previous => ({
                ...previous,
                [field.key]: event.target.value,
                ...(field.key === 'pincode' ? { pincodeCheck: undefined } : {}),
              }))}
              required={field.required}
              inputMode={field.numeric ? 'numeric' : 'text'}
              maxLength={field.key === 'pincode' ? 6 : undefined}
              pattern={field.key === 'pincode' ? '[0-9]{6}' : undefined}
            />
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
        <button type="button" disabled={isCheckingPincode || address.pincode.length !== 6} onClick={onCheckPincode} style={{ padding: '0.55rem 0.8rem' }}>
          {isCheckingPincode ? tr('Checking pincode...') : tr('Check pincode online')}
        </button>
        {address.pincodeCheck && (
          <span role="status" style={{ color: address.pincodeCheck.status === 'NOT_FOUND' || address.pincodeCheck.status === 'NOT_SERVICEABLE' ? '#b00020' : '#555', fontSize: '0.85rem' }}>
            {address.pincodeCheck.provider}: {address.pincodeCheck.message}
          </span>
        )}
      </div>
    </>
  );
}
