import React, { useState } from 'react';
import { Product, ProductStatus } from '../../domain/types';
import { productCreatedMs } from '../../analytics/orderMetrics';
import { effectiveStatus, STATUS_LABELS, STATUS_COLORS } from '../../app/shared';

export default function ProductManagerRow({
  product,
  categories,
  onSave,
  onDelete,
}: {
  product: Product;
  categories: string[];
  onSave: (productId: string, changes: { name: string; category: string; price: number; offerPrice?: number; quantity: number; status: ProductStatus }) => Promise<void>;
  onDelete: (product: Product) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState(product.category);
  const [price, setPrice] = useState(String(product.price));
  const [offerPrice, setOfferPrice] = useState(product.offerPrice ? String(product.offerPrice) : '');
  const [quantity, setQuantity] = useState(typeof product.quantity === 'number' ? String(product.quantity) : '');
  const [status, setStatus] = useState<ProductStatus>(product.status || 'AVAILABLE');
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
    setBusy(true);
    setError('');
    try {
      await onSave(product.id, { name: name.trim(), category, price: nextPrice, offerPrice: nextOffer, quantity: nextQuantity, status });
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
            {product.category} · ₹{product.price}
            {product.offerPrice ? <span> · Offer ₹{product.offerPrice}</span> : <span> · No offer</span>}
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
          <select aria-label="Category" value={category} onChange={event => setCategory(event.target.value)} style={{ padding: '0.5rem' }}>
            {Array.from(new Set([...categories, product.category])).map(option => <option key={option} value={option}>{option}</option>)}
          </select>
          <select aria-label="Availability" value={status} onChange={event => setStatus(event.target.value as ProductStatus)} style={{ padding: '0.5rem' }}>
            <option value="AVAILABLE">Available (auto "Out of stock" at 0)</option>
            <option value="COMING_SOON">Coming soon</option>
            <option value="OUT_OF_STOCK">Out of stock (pause sales)</option>
          </select>
          <button type="submit" disabled={busy} style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 0, borderRadius: '4px', padding: '0.5rem 0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>{busy ? 'Saving...' : 'Save changes'}</button>
        </form>
      )}
      {error && <p role="alert" style={{ color: '#b00020', margin: '0.5rem 0 0' }}>{error}</p>}
    </div>
  );
}
