import React from 'react';
import type { KuchuDesign, Product } from '../../domain/types';
import { compatibleKuchu } from '../../domain/kuchu';

/** Saree > colour > Kuchu work: a drop-down with No Kuchu and the compatible designs. Only one can be chosen. */
export default function KuchuPicker({
  product,
  kuchuList,
  selectedId,
  onKuchu,
  tr,
}: {
  product: Product;
  kuchuList: KuchuDesign[];
  selectedId: string;
  onKuchu: (id: string) => void;
  tr: (text: string) => string;
}) {
  const options = compatibleKuchu(product, kuchuList);
  if (options.length === 0) return null;
  const selected = options.find(option => option.id === selectedId) || null;
  return (
    <div style={{ margin: '0.6rem 0', display: 'grid', gap: '0.4rem' }}>
      <label style={{ display: 'grid', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 700, color: 'var(--mr-primary)' }}>
        {tr('Kuchu work')}
        <select value={selected ? selected.id : ''} onChange={event => onKuchu(event.target.value)} style={{ padding: '0.55rem', borderRadius: '8px', border: '1px solid var(--mr-line)', background: '#fff', fontWeight: 400, fontSize: '0.9rem' }}>
          <option value="">{tr('No Kuchu')}</option>
          {options.map(kuchu => <option key={kuchu.id} value={kuchu.id}>{kuchu.name} (+₹{kuchu.price})</option>)}
        </select>
      </label>
      {selected && (
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {selected.photos.slice(0, 4).map(photo => (
            <a key={photo.url} href={photo.url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>
              <img src={photo.url} alt={`${selected.name} preview`} loading="lazy" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--mr-line)' }} />
            </a>
          ))}
          <span style={{ fontSize: '0.78rem', color: '#555' }}>{selected.name} <code>{selected.id}</code></span>
        </div>
      )}
    </div>
  );
}
