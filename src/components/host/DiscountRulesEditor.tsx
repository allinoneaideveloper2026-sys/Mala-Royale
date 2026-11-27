import React, { useState } from 'react';
import { benefitText, offerHeadline, ruleIsLive, validateRule, type DiscountRule } from '../../domain/discounts';

const blank = (): DiscountRule => ({ id: `r${Date.now().toString(36)}`, name: '', type: 'PERCENT', value: 5, minSpend: 5000, active: false });

/** The host's offers: add as many as needed, each with its own on/off switch. Switched-on offers appear in the banner. */
export default function DiscountRulesEditor({ rules, onSave }: { rules: DiscountRule[]; onSave: (rules: DiscountRule[]) => Promise<void> }) {
  const [draft, setDraft] = useState<DiscountRule[]>(rules);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(rules);

  const update = (id: string, patch: Partial<DiscountRule>) => { setSaved(false); setDraft(current => current.map(rule => (rule.id === id ? { ...rule, ...patch } : rule))); };
  const remove = (id: string) => { setSaved(false); setDraft(current => current.filter(rule => rule.id !== id)); };
  const numberOr = (value: string): number => (value === '' ? 0 : Number(value));

  const save = async () => {
    setError('');
    for (const rule of draft) {
      const problem = validateRule(rule);
      if (problem) { setError(`${rule.name || 'An offer'}: ${problem}`); return; }
    }
    setBusy(true);
    try {
      await onSave(draft);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the offers.');
    } finally {
      setBusy(false);
    }
  };

  const field = { padding: '0.5rem', border: '1px solid var(--mr-line)', borderRadius: '6px', width: '100%', boxSizing: 'border-box' } as const;
  const label = { display: 'grid', gap: '0.2rem', fontSize: '0.78rem', fontWeight: 700 } as const;

  return (
    <div style={{ backgroundColor: '#fff', padding: '1.2rem', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '2rem' }}>
      <h3 style={{ margin: '0 0 0.4rem' }}>Offers and discounts</h3>
      <p style={{ margin: '0 0 0.9rem', color: '#666', fontSize: '0.9rem' }}>
        Example: <em>spend at least ₹5,000, get 5% off</em>. Switch an offer on and it shows in a banner on the shop and is applied automatically at checkout.
        The bag total is counted after each product's own offer price. If several offers fit a bag, the one that saves the customer most is used (offers do not add together).
      </p>
      {draft.length === 0 && <p style={{ color: '#888' }}>No offers yet.</p>}
      <div style={{ display: 'grid', gap: '0.8rem' }}>
        {draft.map(rule => (
          <div key={rule.id} style={{ border: '1px solid var(--mr-line)', borderRadius: '10px', padding: '0.8rem', background: rule.active ? 'var(--mr-tint)' : '#fff' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', alignItems: 'center', marginBottom: '0.6rem' }}>
              <label className="mr-switch" style={{ margin: 0 }} title={rule.active ? 'Switch off' : 'Switch on'}>
                <input type="checkbox" checked={rule.active} onChange={event => update(rule.id, { active: event.target.checked })} aria-label={`Offer ${rule.name || ''} on or off`} />
                <span className="mr-switch-track" aria-hidden="true" />
                <strong>{rule.active ? (ruleIsLive(rule, Date.now()) ? 'ON, showing now' : 'ON, outside its dates') : 'OFF'}</strong>
              </label>
              <button type="button" onClick={() => remove(rule.id)} style={{ marginLeft: 'auto', color: '#c62828', background: '#fff', border: '1px solid #c62828', borderRadius: '4px', padding: '0.3rem 0.7rem', cursor: 'pointer' }}>Delete offer</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.6rem' }}>
              <label style={label}>Name customers see<input value={rule.name} maxLength={40} onChange={event => update(rule.id, { name: event.target.value })} placeholder="Festive 5%" style={field} /></label>
              <label style={label}>Type
                <select value={rule.type} onChange={event => update(rule.id, { type: event.target.value === 'FLAT' ? 'FLAT' : 'PERCENT' })} style={field}>
                  <option value="PERCENT">Percent off</option>
                  <option value="FLAT">Flat rupees off</option>
                </select>
              </label>
              <label style={label}>{rule.type === 'PERCENT' ? 'Percent (%)' : 'Rupees off (₹)'}<input type="number" min="1" value={rule.value || ''} onChange={event => update(rule.id, { value: numberOr(event.target.value) })} style={field} /></label>
              <label style={label}>Minimum spend (₹)<input type="number" min="0" value={rule.minSpend || ''} onChange={event => update(rule.id, { minSpend: numberOr(event.target.value) })} style={field} /></label>
              {rule.type === 'PERCENT' && <label style={label}>Most they can save (₹, optional)<input type="number" min="1" value={rule.maxDiscount || ''} onChange={event => update(rule.id, { maxDiscount: event.target.value === '' ? undefined : Number(event.target.value) })} style={field} /></label>}
              <label style={label}>Starts (optional)<input type="date" value={rule.startsOn || ''} onChange={event => update(rule.id, { startsOn: event.target.value || undefined })} style={field} /></label>
              <label style={label}>Ends (optional)<input type="date" value={rule.endsOn || ''} min={rule.startsOn || undefined} onChange={event => update(rule.id, { endsOn: event.target.value || undefined })} style={field} /></label>
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: '#444' }}>Customers will read: <strong>{validateRule(rule) ? '(fill in the details)' : `${offerHeadline(rule)}`}</strong> {!validateRule(rule) && rule.type === 'PERCENT' ? `· ${benefitText(rule)}` : ''}</div>
          </div>
        ))}
      </div>
      {error && <p role="alert" style={{ color: '#b00020' }}>{error}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', marginTop: '0.9rem' }}>
        <button type="button" className="mr-btn mr-btn-ghost" disabled={draft.length >= 12} onClick={() => { setSaved(false); setDraft(current => [...current, blank()]); }}>+ Add an offer</button>
        <button type="button" className="mr-btn" disabled={!dirty || busy} onClick={() => void save()}>{busy ? 'Saving...' : 'Save offers'}</button>
        {saved && !dirty && <span role="status" style={{ color: '#1b5e20' }}>Saved. Switched-on offers are live.</span>}
      </div>
    </div>
  );
}
