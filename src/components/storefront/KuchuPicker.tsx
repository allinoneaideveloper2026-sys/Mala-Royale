import React from 'react';
import type { KuchuDesign, Product } from '../../domain/types';
import { FINAL_SALE_HEADLINE, compatibleKuchu } from '../../domain/kuchu';
import { PALETTE } from '../../domain/itemCode';

/** "Add a Kuchu (choose one)": No Kuchu or exactly one design, then a thread colour. Used on the card and the product page. */
export default function KuchuPicker({
  product,
  kuchuList,
  selectedId,
  threadColor,
  onKuchu,
  onThread,
  tr,
}: {
  product: Product;
  kuchuList: KuchuDesign[];
  selectedId: string;
  threadColor: string;
  onKuchu: (id: string) => void;
  onThread: (color: string) => void;
  tr: (text: string) => string;
}) {
  const options = compatibleKuchu(product, kuchuList);
  if (options.length === 0) return null;
  const selected = options.find(option => option.id === selectedId) || null;
  return (
    <fieldset style={{ margin: '0.5rem 0', padding: '0.5rem 0.6rem', border: '1px solid var(--mr-line)', borderRadius: '10px', display: 'grid', gap: '0.35rem' }}>
      <legend style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--mr-primary)', padding: '0 0.3rem' }}>{tr('Add a Kuchu (choose one)')}</legend>
      <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem', cursor: 'pointer' }}>
        <input type="radio" name={`kuchu-${product.id}`} checked={!selected} onChange={() => onKuchu('')} />
        {tr('No Kuchu')}
      </label>
      {options.map(kuchu => (
        <label key={kuchu.id} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem', cursor: 'pointer', flexWrap: 'wrap' }}>
          <input type="radio" name={`kuchu-${product.id}`} checked={selectedId === kuchu.id} onChange={() => onKuchu(kuchu.id)} />
          <span>{kuchu.name} <strong style={{ color: 'var(--mr-primary)' }}>+₹{kuchu.price}</strong></span>
          <span style={{ display: 'inline-flex', gap: '0.25rem' }}>
            {kuchu.photos.slice(0, 4).map(photo => (
              <a key={photo.url} href={photo.url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>
                <img src={photo.url} alt={`${kuchu.name} preview`} loading="lazy" style={{ width: '34px', height: '34px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--mr-line)' }} />
              </a>
            ))}
          </span>
        </label>
      ))}
      {selected && (product.threadColors || []).length > 0 && (
        <div role="radiogroup" aria-label={tr('Thread colour')} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center', fontSize: '0.8rem' }}>
          <span>{tr('Thread colour (matches the saree):')}</span>
          {(product.threadColors || []).map(colorName => {
            const swatch = PALETTE.find(option => option.name === colorName);
            const picked = threadColor === colorName;
            return (
              <button key={colorName} type="button" role="radio" aria-checked={picked} onClick={() => onThread(colorName)} style={{ display: 'inline-flex', gap: '0.25rem', alignItems: 'center', padding: '0.15rem 0.5rem', borderRadius: '999px', border: picked ? '2px solid var(--mr-primary)' : '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>
                <span aria-hidden="true" style={{ width: '12px', height: '12px', borderRadius: '50%', background: swatch?.hex || '#ddd', border: '1px solid #999' }} />{colorName}
              </button>
            );
          })}
        </div>
      )}
      <div role="note" style={{ marginTop: '0.2rem', padding: '0.4rem 0.5rem', background: '#fdecea', border: '1px solid #f5b5bd', borderRadius: '6px', fontSize: '0.78rem', color: '#8b1e2d' }}>
        <strong>{tr(FINAL_SALE_HEADLINE)}</strong>
      </div>
    </fieldset>
  );
}
