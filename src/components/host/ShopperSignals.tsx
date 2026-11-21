import React, { useEffect, useState } from 'react';
import type { Order, Product } from '../../domain/types';
import { loadSignals } from '../../domain/adminStore';
import { popularIds, summarize, viewedButNotAdded, type SignalSummary } from '../../domain/signals';
import { activeQuantityByProduct } from '../../domain/orderItems';
import { isAvailable } from '../../domain/assistant';

const empty: SignalSummary = { sessions: 0, topSearches: [], noResultSearches: [], unansweredQuestions: [], products: [] };

/** What shoppers did in the last 14 days (anonymous), with a button to publish the "Popular right now" row. */
export default function ShopperSignals({ products, orders, onPublish }: { products: Product[]; orders: Order[]; onPublish: (ids: string[]) => Promise<void> }) {
  const [summary, setSummary] = useState<SignalSummary>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [published, setPublished] = useState('');

  const load = async () => {
    setBusy(true);
    setError('');
    try {
      setSummary(summarize(await loadSignals(14)));
      setLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the shopper signals.');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const nameOf = (id: string) => products.find(product => product.id === id)?.name || id;

  // Units sold per product from orders that were not cancelled or rejected.
  const orderCounts = new Map<string, number>();
  orders.filter(order => !order.deletedAt && !['NOT_ACCEPTED', 'CANCELLED'].includes(order.stage)).forEach(order => {
    activeQuantityByProduct(order).forEach(([id, quantity]) => orderCounts.set(id, (orderCounts.get(id) || 0) + quantity));
  });
  const available = (id: string) => { const product = products.find(item => item.id === id); return Boolean(product) && isAvailable({ id, name: '', category: '', description: '', price: 1, quantity: product?.quantity, status: product?.status, kuchuNames: [] }); };
  const proposed = popularIds(summary, orderCounts, available, 8);
  const lowConversion = viewedButNotAdded(summary);

  const publish = async () => {
    setBusy(true);
    setError('');
    try {
      await onPublish(proposed);
      setPublished(`Published ${proposed.length} items.`);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Could not publish.');
    } finally {
      setBusy(false);
    }
  };

  const list = (title: string, rows: Array<{ q: string; count: number }>, hint: string) => (
    <div style={{ background: '#fff', border: '1px solid var(--mr-line)', borderRadius: '10px', padding: '0.8rem' }}>
      <strong>{title}</strong>
      <div style={{ fontSize: '0.75rem', color: '#777', margin: '0.15rem 0 0.4rem' }}>{hint}</div>
      {rows.length === 0 ? <span style={{ color: '#888', fontSize: '0.85rem' }}>Nothing yet.</span> : rows.map(row => <div key={row.q} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.15rem 0' }}><span>{row.q}</span><strong>{row.count}</strong></div>)}
    </div>
  );

  return (
    <section style={{ background: 'var(--mr-tint)', border: '1px solid var(--mr-line)', borderRadius: '12px', padding: '1.1rem', margin: '1.5rem 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>🛍️ Shopper signals (last 14 days)</h3>
        <button type="button" className="mr-btn mr-btn-ghost" disabled={busy} onClick={() => void load()}>{busy ? 'Loading...' : 'Refresh'}</button>
      </div>
      <p style={{ margin: '0.4rem 0 0.8rem', fontSize: '0.85rem', color: '#555' }}>
        Anonymous: no names or phone numbers. {loaded ? `${summary.sessions} recorded visits.` : ''} {summary.sessions === 0 && loaded ? 'Nothing recorded yet. If this stays empty after real visits, check that FIREBASE_API_KEY is set in wrangler.jsonc.' : ''}
      </p>
      {error && <p role="alert" style={{ color: '#b00020' }}>{error}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.8rem' }}>
        {list('What people search for', summary.topSearches, 'Make sure you stock and describe these.')}
        {list('Searches with no results', summary.noResultSearches, 'Customers want these but nothing matched. Add them or improve descriptions.')}
        {list('Questions the assistant could not answer', summary.unansweredQuestions, 'Add the answer to your About, Contact or Terms pages.')}
        <div style={{ background: '#fff', border: '1px solid var(--mr-line)', borderRadius: '10px', padding: '0.8rem' }}>
          <strong>Viewed a lot, rarely added to the bag</strong>
          <div style={{ fontSize: '0.75rem', color: '#777', margin: '0.15rem 0 0.4rem' }}>Check the price, photos or description.</div>
          {lowConversion.length === 0 ? <span style={{ color: '#888', fontSize: '0.85rem' }}>Nothing stands out.</span> : lowConversion.map(row => <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.15rem 0' }}><span>{nameOf(row.id)}</span><strong>{row.views} views, {row.carts} added</strong></div>)}
        </div>
      </div>
      <div style={{ marginTop: '1rem', background: '#fff', border: '1px solid var(--mr-line)', borderRadius: '10px', padding: '0.8rem' }}>
        <strong>"Popular right now" for customers</strong>
        <div style={{ fontSize: '0.8rem', color: '#666', margin: '0.2rem 0 0.5rem' }}>Worked out from sales (counted most), bag adds, saves and views. Only items in stock are listed.</div>
        <div style={{ fontSize: '0.88rem', marginBottom: '0.6rem' }}>{proposed.length === 0 ? 'Not enough activity yet.' : proposed.map(nameOf).join(', ')}</div>
        <button type="button" className="mr-btn" disabled={busy || proposed.length === 0} onClick={() => void publish()}>Publish this list</button>
        {published && <span role="status" style={{ marginLeft: '0.8rem', color: '#1b5e20' }}>{published}</span>}
      </div>
    </section>
  );
}
