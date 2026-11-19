import React, { useEffect, useRef, useState } from 'react';
import type { KuchuDesign, PincodeCheck, Product } from '../../domain/types';
import type { CourierDecision } from '../../domain/shipping';
import { PALETTE } from '../../domain/itemCode';
import { compatibleKuchu, lineRegularPrice, lineUnitPrice } from '../../domain/kuchu';
import { isPurchasable } from '../../app/shared';
import { ProductGallery } from './ProductMedia';
import KuchuPicker from './KuchuPicker';
import { HeartIcon } from './Icons';

/** Full product page in a pop-up: photos, colour choices, Kuchu and thread, delivery check, and "more like this". */
export default function ProductQuickView({
  product,
  variants,
  related,
  kuchuList,
  kuchuId,
  thread,
  wished,
  badges,
  onKuchu,
  onThread,
  onVariant,
  onOpen,
  onAdd,
  onBuy,
  onToggleWish,
  onShare,
  onClose,
  onView,
  courierFor,
  checkPincode,
  tr,
}: {
  product: Product;
  variants: Product[];
  related: Product[];
  kuchuList: KuchuDesign[];
  kuchuId: string;
  thread: string;
  wished: boolean;
  badges: string[];
  onKuchu: (id: string) => void;
  onThread: (color: string) => void;
  onVariant: (id: string) => void;
  onOpen: (id: string) => void;
  onAdd: () => boolean;
  onBuy: () => void;
  onToggleWish: () => void;
  onShare: () => void;
  onClose: () => void;
  onView: () => void;
  courierFor: (pincode: string) => CourierDecision;
  checkPincode: (pincode: string) => Promise<PincodeCheck>;
  tr: (text: string) => string;
}) {
  const [pin, setPin] = useState('');
  const [pinResult, setPinResult] = useState<PincodeCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [added, setAdded] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const kuchu = compatibleKuchu(product, kuchuList).find(item => item.id === kuchuId) || null;
  const price = lineUnitPrice(product, kuchu);
  const regular = lineRegularPrice(product, kuchu);
  const percent = regular > price ? Math.round(((regular - price) / regular) * 100) : 0;
  const purchasable = isPurchasable(product);

  useEffect(() => {
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  useEffect(() => { setAdded(false); }, [product.id, kuchuId, thread]);

  useEffect(() => {
    setPinResult(null);
    if (!/^\d{6}$/.test(pin)) return undefined;
    let cancelled = false;
    setChecking(true);
    checkPincode(pin).then(result => { if (!cancelled) setPinResult(result); }).finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const courier = /^\d{6}$/.test(pin) ? courierFor(pin) : null;
  const add = () => { if (onAdd()) setAdded(true); };

  return (
    <div className="mr-modal-back" role="presentation" onClick={onClose}>
      <div className="mr-modal" role="dialog" aria-modal="true" aria-label={product.name} onClick={event => event.stopPropagation()}>
        <button ref={closeRef} type="button" className="mr-modal-close" onClick={onClose} aria-label={tr('Close')}>×</button>
        <div className="mr-pdp">
          <div>
            <ProductGallery key={product.id} product={product} badges={badges} onView={onView} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'flex-start' }}>
              <h2>{product.name}</h2>
              <button type="button" className="mr-icon-btn" aria-pressed={wished} aria-label={tr('Save for later')} onClick={onToggleWish} style={wished ? { color: '#C2185B' } : undefined}><HeartIcon filled={wished} /></button>
            </div>
            <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>
              {product.category}{product.size ? ` · ${product.size}` : ''}{product.itemCode && <> · <code>{product.itemCode}</code></>}
            </div>
            <div style={{ margin: '0.6rem 0' }}>
              <span className="mr-price">₹{price}{percent > 0 && <s>₹{regular}</s>}</span>
              {percent > 0 && <span className="mr-off">{percent}% {tr('OFF')}</span>}
            </div>
            {typeof product.quantity === 'number' && product.quantity > 0 && product.quantity <= 3 && <div style={{ color: '#b45309', fontWeight: 600, fontSize: '0.85rem' }}>{tr('Only a few left')}</div>}

            {variants.length > 1 && (
              <>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginTop: '0.6rem' }}>{tr('Colour')}: <span style={{ fontWeight: 400 }}>{product.color || '-'}</span></div>
                <div className="mr-swatch-row" role="group" aria-label={tr('Colours')}>
                  {variants.map(variant => {
                    const swatch = PALETTE.find(option => option.code === variant.colorCode || option.name === variant.color);
                    return (
                      <button key={variant.id} type="button" className="mr-swatch" aria-pressed={variant.id === product.id} onClick={() => onVariant(variant.id)} style={{ opacity: isPurchasable(variant) ? 1 : 0.55 }} title={isPurchasable(variant) ? variant.color : `${variant.color} (${tr('not available')})`}>
                        <i style={{ background: swatch?.hex || '#ddd' }} />{variant.color || variant.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <KuchuPicker product={product} kuchuList={kuchuList} selectedId={kuchuId} threadColor={thread} onKuchu={onKuchu} onThread={onThread} tr={tr} />

            <div className="mr-pdp-actions">
              <button type="button" className="mr-btn" disabled={!purchasable} onClick={add}>{added ? `✓ ${tr('Added to bag')}` : tr('Add to bag')}</button>
              <button type="button" className="mr-btn mr-btn-gold" disabled={!purchasable} onClick={onBuy}>{tr('Buy now')}</button>
              <button type="button" className="mr-btn mr-btn-ghost" onClick={onShare}>{tr('Share')}</button>
            </div>
            {!purchasable && <p role="status" style={{ color: '#b45309' }}>{tr('This item is not available right now.')}</p>}

            <div style={{ background: '#fff', border: '1px solid var(--mr-line)', borderRadius: '12px', padding: '0.8rem', margin: '0.8rem 0' }}>
              <label style={{ display: 'grid', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 600 }}>
                {tr('Check delivery')}
                <input inputMode="numeric" maxLength={6} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ''))} placeholder={tr('Enter your 6-digit pincode')} style={{ padding: '0.55rem', border: '1px solid var(--mr-line)', borderRadius: '8px', fontWeight: 400 }} />
              </label>
              {checking && <p role="status" style={{ margin: '0.4rem 0 0', color: '#666', fontSize: '0.85rem' }}>{tr('Checking...')}</p>}
              {pinResult && !checking && <p role="status" style={{ margin: '0.4rem 0 0', fontSize: '0.85rem' }}>{[pinResult.taluk, pinResult.district, pinResult.state].filter(Boolean).join(', ')} · {tr(pinResult.status === 'NOT_SERVICEABLE' ? 'Not serviceable' : pinResult.status === 'SERVICEABLE' ? 'Delivery available' : pinResult.status === 'POSTAL_CODE_FOUND' ? 'Valid pincode' : 'Could not confirm online')}</p>}
              {courier && <p role="status" style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: courier.waived ? '#1b5e20' : '#444', fontWeight: courier.waived ? 700 : 400 }}>{tr(courier.reason)}</p>}
            </div>

            <p style={{ color: '#444', lineHeight: 1.55, fontSize: '0.92rem' }}>{product.description}</p>
          </div>
        </div>

        {related.length > 0 && (
          <div style={{ padding: '0 1.2rem 1.2rem' }}>
            <h3 style={{ margin: '0 0 0.6rem', color: 'var(--mr-primary)' }}>{tr('More like this')}</h3>
            <div className="mr-more">
              {related.map(item => (
                <button key={item.id} type="button" onClick={() => onOpen(item.id)}>
                  <img src={item.image} alt={item.name} loading="lazy" />
                  <span><strong>{item.name}</strong><br />₹{item.offerPrice || item.price}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mr-sticky-bar">
          <strong style={{ flex: 1 }}>₹{price}</strong>
          <button type="button" className="mr-btn" disabled={!purchasable} onClick={add}>{added ? `✓ ${tr('Added')}` : tr('Add to bag')}</button>
          <button type="button" className="mr-btn mr-btn-gold" disabled={!purchasable} onClick={onBuy}>{tr('Buy now')}</button>
        </div>
      </div>
    </div>
  );
}
