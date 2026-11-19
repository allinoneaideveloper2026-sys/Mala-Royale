import React, { useState } from 'react';
import type { KuchuDesign } from '../../domain/types';
import { cleanKuchuId, validateKuchuId } from '../../domain/kuchu';

/** "Upload Kuchu Section": add Kuchu designs (ID, name, price, several photos) and manage the common Kuchu list. */
export default function KuchuManager({
  list,
  onPublish,
  onUpdate,
  onDelete,
}: {
  list: KuchuDesign[];
  onPublish: (kuchu: Omit<KuchuDesign, 'photos' | 'createdAt'>, files: File[]) => Promise<void>;
  onUpdate: (id: string, changes: { name: string; price: number; active: boolean }) => Promise<void>;
  onDelete: (kuchu: KuchuDesign) => Promise<void>;
}) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const priceValue = Number(price);
    const problem = validateKuchuId(id, list);
    if (problem) { setError(problem); return; }
    if (!name.trim()) { setError('Enter the Kuchu name.'); return; }
    if (!Number.isFinite(priceValue) || priceValue <= 0) { setError('Enter a price greater than zero.'); return; }
    if (files.length === 0) { setError('Add at least one photo so customers can preview the design.'); return; }
    if (files.length > 8) { setError('Use at most 8 photos.'); return; }
    setBusy(true);
    setError('');
    try {
      await onPublish({ id, name: name.trim(), price: priceValue, active: true }, files);
      setId(''); setName(''); setPrice(''); setFiles([]);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Could not publish the Kuchu.');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (kuchu: KuchuDesign) => {
    const priceValue = Number(editPrice);
    if (!editName.trim() || !Number.isFinite(priceValue) || priceValue <= 0) { setError('Enter a name and a price greater than zero.'); return; }
    setBusy(true);
    setError('');
    try {
      await onUpdate(kuchu.id, { name: editName.trim(), price: priceValue, active: kuchu.active });
      setEditing(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ backgroundColor: '#fff', padding: '1.2rem', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '2rem' }}>
      <h3 style={{ margin: '0 0 0.6rem' }}>Upload Kuchu Section</h3>
      <p style={{ margin: '0 0 0.8rem', color: '#666', fontSize: '0.9rem' }}>
        Add each Kuchu design once. When you upload or edit a saree, tick the Kuchu designs that suit it. Customers can then pick one (or none) on that saree.
      </p>
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.6rem', alignItems: 'center' }}>
        <input aria-label="Kuchu ID" placeholder="Kuchu ID (e.g. KCH03) *" value={id} onChange={e => setId(cleanKuchuId(e.target.value))} maxLength={12} required style={{ padding: '0.55rem', fontFamily: 'monospace' }} />
        <input aria-label="Kuchu name" placeholder="Kuchu name *" value={name} onChange={e => setName(e.target.value)} maxLength={60} required style={{ padding: '0.55rem' }} />
        <input aria-label="Kuchu price" type="number" min="1" step="0.01" placeholder="Price (₹) *" value={price} onChange={e => setPrice(e.target.value)} required style={{ padding: '0.55rem' }} />
        <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem' }}>
          Design photos (up to 8)
          <input type="file" accept="image/*" multiple onChange={e => setFiles(Array.from(e.target.files || []))} />
        </label>
        <button type="submit" disabled={busy} style={{ backgroundColor: 'var(--mr-primary)', color: '#fff', border: 'none', padding: '0.6rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>{busy ? 'Saving...' : 'Publish Kuchu'}</button>
      </form>
      {error && <p role="alert" style={{ color: '#b00020', fontSize: '0.85rem' }}>{error}</p>}

      <div style={{ display: 'grid', gap: '0.5rem', marginTop: '1rem' }}>
        <strong>Kuchu designs ({list.length})</strong>
        {list.length === 0 && <span style={{ color: '#666' }}>None yet.</span>}
        {list.map(kuchu => (
          <div key={kuchu.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.7rem', alignItems: 'center', padding: '0.5rem', border: '1px solid #eee', borderRadius: '8px', opacity: kuchu.active ? 1 : 0.6 }}>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              {kuchu.photos.slice(0, 3).map(photo => <img key={photo.url} src={photo.url} alt={kuchu.name} loading="lazy" style={{ width: '46px', height: '46px', objectFit: 'cover', borderRadius: '4px' }} />)}
            </div>
            <div style={{ flex: '1 1 180px' }}>
              {editing === kuchu.id ? (
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <input aria-label="Name" value={editName} onChange={e => setEditName(e.target.value)} maxLength={60} style={{ padding: '0.4rem' }} />
                  <input aria-label="Price" type="number" min="1" step="0.01" value={editPrice} onChange={e => setEditPrice(e.target.value)} style={{ padding: '0.4rem', width: '100px' }} />
                  <button type="button" disabled={busy} onClick={() => void saveEdit(kuchu)}>Save</button>
                  <button type="button" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              ) : (
                <>
                  <strong>{kuchu.name}</strong> <code>{kuchu.id}</code> · ₹{kuchu.price}{kuchu.active ? '' : ' · hidden'}
                  <div style={{ fontSize: '0.75rem', color: '#777' }}>{kuchu.photos.length} photo(s)</div>
                </>
              )}
            </div>
            {editing !== kuchu.id && (
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button type="button" disabled={busy} onClick={() => { setEditing(kuchu.id); setEditName(kuchu.name); setEditPrice(String(kuchu.price)); }}>Edit</button>
                <button type="button" disabled={busy} onClick={() => void onUpdate(kuchu.id, { name: kuchu.name, price: kuchu.price, active: !kuchu.active })}>{kuchu.active ? 'Hide' : 'Show'}</button>
                <button type="button" disabled={busy} onClick={() => void onDelete(kuchu)} style={{ color: '#c62828' }}>Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
