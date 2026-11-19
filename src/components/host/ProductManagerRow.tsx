import React, { useState } from 'react';
import { KuchuDesign, Product, ProductStatus } from '../../domain/types';
import { productCreatedMs } from '../../analytics/orderMetrics';
import { colorCodeFor, isValidItemCode, itemCodeTaken, PALETTE } from '../../domain/itemCode';
import { effectiveStatus, STATUS_LABELS, STATUS_COLORS } from '../../app/shared';

export default function ProductManagerRow({
  product,
  categories,
  allProducts = [],
  kuchuList = [],
  onSave,
  onDelete,
}: {
  product: Product;
  categories: string[];
  /** Used to stop two products sharing one item ID. */
  allProducts?: Product[];
  kuchuList?: KuchuDesign[];
  onSave: (productId: string, changes: { name: string; category: string; price: number; offerPrice?: number; quantity: number; status: ProductStatus; itemCode?: string; color?: string; colorCode?: string; size?: string; categoryCode?: string; patternCode?: string; compatibleKuchuIds?: string[]; threadColors?: string[] }) => Promise<void>;
  onDelete: (product: Product) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState(product.category);
  const [price, setPrice] = useState(String(product.price));
  const [offerPrice, setOfferPrice] = useState(product.offerPrice ? String(product.offerPrice) : '');
  const [quantity, setQuantity] = useState(typeof product.quantity === 'number' ? String(product.quantity) : '');
  const [status, setStatus] = useState<ProductStatus>(product.status || 'AVAILABLE');
  const [itemCode, setItemCode] = useState(product.itemCode || '');
  const [color, setColor] = useState(product.color || '');
  const [size, setSize] = useState(product.size || '');
  const [categoryCode, setCategoryCode] = useState(product.categoryCode || '');
  const [patternCode, setPatternCode] = useState(product.patternCode || '');
  const [kuchuIds, setKuchuIds] = useState<string[]>(product.compatibleKuchuIds || []);
  const [threadColors, setThreadColors] = useState<string[]>(product.threadColors || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shownStatus = effectiveStatus(product);

  const openEditor = () => {
    setName(product.name);
    setCategory(product.category);
    setPrice(String(product.price));
    setOfferPrice(product.offerPrice ? String(product.offerPrice) : '');
    setQuantity(typeof product.quantity === 'number' ? String(product.quantity) : '');
    setStatus(product.status || 'AVAILABLE');
    setItemCode(product.itemCode || '');
    setColor(product.color || '');
    setSize(product.size || '');
    setCategoryCode(product.categoryCode || '');
    setPatternCode(product.patternCode || '');
    setKuchuIds(product.compatibleKuchuIds || []);
    setThreadColors(product.threadColors || []);
    setError('');
    setEditing(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextPrice = Number(price);
    const nextOffer = offerPrice.trim() === '' ? undefined : Number(offerPrice);
    const nextQuantity = Math.floor(Number(quantity));
    if (!name.trim()) {
      setError('Enter a product name.');
      return;
    }
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
      setError('Enter a regular price greater than zero.');
      return;
    }
    if (nextOffer !== undefined && (!Number.isFinite(nextOffer) || nextOffer <= 0 || nextOffer >= nextPrice)) {
      setError('The offer price must be lower than the regular price. Leave it blank for no offer.');
      return;
    }
    if (quantity.trim() === '' || !Number.isFinite(nextQuantity) || nextQuantity < 0) {
      setError('Enter the quantity in stock (0 or more).');
      return;
    }
    const nextCode = itemCode.trim().toUpperCase();
    if (nextCode && !isValidItemCode(nextCode)) {
      setError('Item ID must look like SILK-ZRI-MAR-63M (3 to 5 parts of letters and digits, joined by dashes).');
      return;
    }
    if (nextCode && itemCodeTaken(nextCode, allProducts, product.id)) {
      setError('Another product already uses this item ID.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave(product.id, { name: name.trim(), category, price: nextPrice, offerPrice: nextOffer, quantity: nextQuantity, status, ...(nextCode ? { itemCode: nextCode } : {}), color: color.trim(), colorCode: color.trim() ? colorCodeFor(color) : '', size: size.trim(), categoryCode: categoryCode.trim().toUpperCase(), patternCode: patternCode.trim().toUpperCase(), compatibleKuchuIds: kuchuIds, threadColors });
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the changes.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await onDelete(product);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not remove the product.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '0.7rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
        <img src={product.image} alt="" style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '4px', flex: '0 0 52px' }} />
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <strong>{product.name}</strong>
          <div style={{ fontSize: '0.85rem', color: '#666' }}>
            {product.category}{product.color ? ` · ${product.color}` : ''} · ₹{product.price}
            {product.offerPrice ? <span> · Offer ₹{product.offerPrice}</span> : <span> · No offer</span>}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#444', fontFamily: 'monospace' }}>
            {product.itemCode ? `Item ID: ${product.itemCode}` : 'Item ID: not set (edit to add one)'}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#666' }}>
            {typeof product.quantity === 'number' ? `Quantity in stock: ${product.quantity}` : 'Quantity not set'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#888' }}>
            {productCreatedMs(product) > 0
              ? `Uploaded ${new Date(productCreatedMs(product)).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : 'Upload time not recorded'}
          </div>
        </div>
        <span style={{ ...STATUS_COLORS[shownStatus], fontSize: '0.75rem', fontWeight: 'bold', padding: '0.2rem 0.6rem', borderRadius: '999px' }}>{STATUS_LABELS[shownStatus]}</span>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button type="button" disabled={busy} onClick={editing ? () => setEditing(false) : openEditor} style={{ padding: '0.4rem 0.8rem', cursor: 'pointer' }}>{editing ? 'Cancel' : 'Edit'}</button>
          <button type="button" disabled={busy} onClick={() => void remove()} style={{ padding: '0.4rem 0.8rem', backgroundColor: '#fff', color: '#8b1e2d', border: '1px solid #8b1e2d', borderRadius: '4px', cursor: 'pointer' }}>Remove</button>
        </div>
      </div>
      {editing && (
        <form onSubmit={save} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.6rem', marginTop: '0.7rem' }}>
          <input aria-label="Product name" placeholder="Product name" value={name} onChange={event => setName(event.target.value)} required style={{ padding: '0.5rem' }} />
          <input aria-label="Regular price" type="number" min="1" step="0.01" placeholder="Regular price (₹)" value={price} onChange={event => setPrice(event.target.value)} required style={{ padding: '0.5rem' }} />
          <input aria-label="Offer price (leave blank for no offer)" type="number" min="1" step="0.01" placeholder="Offer price (blank = no offer)" value={offerPrice} onChange={event => setOfferPrice(event.target.value)} style={{ padding: '0.5rem' }} />
          <input aria-label="Quantity in stock" type="number" min="0" step="1" placeholder="Quantity in stock" value={quantity} onChange={event => setQuantity(event.target.value)} required style={{ padding: '0.5rem' }} />
          <input aria-label="Item ID" placeholder="Item ID (SILK-ZRI-MAR-63M)" value={itemCode} onChange={event => setItemCode(event.target.value.toUpperCase())} maxLength={48} style={{ padding: '0.5rem', fontFamily: 'monospace' }} />
          <input aria-label="Colour" list="mr-color-names" placeholder="Colour" value={color} onChange={event => setColor(event.target.value)} maxLength={30} style={{ padding: '0.5rem' }} />
          <datalist id="mr-color-names">{PALETTE.map(option => <option key={option.code} value={option.name} />)}</datalist>
          <input aria-label="Category code" placeholder="Category code (SILK)" value={categoryCode} onChange={event => setCategoryCode(event.target.value.toUpperCase())} maxLength={6} style={{ padding: '0.5rem' }} />
          <input aria-label="Pattern code" placeholder="Pattern code (ZRI)" value={patternCode} onChange={event => setPatternCode(event.target.value.toUpperCase())} maxLength={6} style={{ padding: '0.5rem' }} />
          <input aria-label="Size" placeholder="Size (for example 6.3m)" value={size} onChange={event => setSize(event.target.value)} maxLength={20} style={{ padding: '0.5rem' }} />
          <select aria-label="Category" value={category} onChange={event => setCategory(event.target.value)} style={{ padding: '0.5rem' }}>
            {Array.from(new Set([...categories, product.category])).map(option => <option key={option} value={option}>{option}</option>)}
          </select>
          <select aria-label="Availability" value={status} onChange={event => setStatus(event.target.value as ProductStatus)} style={{ padding: '0.5rem' }}>
            <option value="AVAILABLE">Available (auto "Out of stock" at 0)</option>
            <option value="COMING_SOON">Coming soon</option>
            <option value="OUT_OF_STOCK">Out of stock (pause sales)</option>
          </select>
          <div style={{ gridColumn: '1 / -1', display: 'grid', gap: '0.4rem', fontSize: '0.85rem' }}>
            <span>Items with the same category code and pattern code are grouped as colours of one design.</span>
            {kuchuList.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                <strong>Compatible Kuchu:</strong>
                {kuchuList.map(kuchu => (
                  <label key={kuchu.id} style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" checked={kuchuIds.includes(kuchu.id)} onChange={event => setKuchuIds(event.target.checked ? [...kuchuIds, kuchu.id] : kuchuIds.filter(id => id !== kuchu.id))} />
                    {kuchu.name} <code>{kuchu.id}</code>
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
              <strong>Thread colours:</strong>
              {PALETTE.map(option => {
                const picked = threadColors.includes(option.name);
                return (
                  <button key={option.code} type="button" aria-pressed={picked} onClick={() => setThreadColors(picked ? threadColors.filter(name => name !== option.name) : [...threadColors, option.name])} style={{ display: 'inline-flex', gap: '0.25rem', alignItems: 'center', padding: '0.15rem 0.5rem', borderRadius: '999px', border: picked ? '2px solid var(--mr-primary)' : '1px solid #ccc', background: picked ? 'var(--mr-tint-strong)' : '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>
                    <span aria-hidden="true" style={{ width: '10px', height: '10px', borderRadius: '50%', background: option.hex, border: '1px solid #999' }} />{option.name}
                  </button>
                );
              })}
            </div>
          </div>
          <button type="submit" disabled={busy} style={{ backgroundColor: 'var(--mr-primary)', color: '#fff', border: 0, borderRadius: '4px', padding: '0.5rem 0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>{busy ? 'Saving...' : 'Save changes'}</button>
        </form>
      )}
      {error && <p role="alert" style={{ color: '#b00020', margin: '0.5rem 0 0' }}>{error}</p>}
    </div>
  );
}
