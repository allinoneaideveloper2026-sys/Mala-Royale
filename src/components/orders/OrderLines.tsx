import React from 'react';
import type { Order } from '../../domain/types';
import { isLineRejected, lineAmount } from '../../domain/orderItems';

/**
 * The items of an order with the exact photo, name and chosen colour. Rejected items are crossed out with their reason.
 * Hosts get a "Reject item" button on each active line (when allowed).
 */
export default function OrderLines({
  items,
  onRejectItem,
}: {
  items: Order['items'];
  onRejectItem?: (index: number) => void;
}) {
  return (
    <ul style={{ listStyle: 'none', margin: '0.5rem 0', padding: 0, display: 'grid', gap: '0.5rem' }}>
      {items.map((item, index) => {
        const rejected = isLineRejected(item);
        return (
          <li key={`${item.productId}-${index}`} style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', opacity: rejected ? 0.7 : 1 }}>
            {item.image
              ? <img src={item.image} alt={item.name} loading="lazy" style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #eee', flex: '0 0 52px' }} />
              : <span aria-hidden="true" style={{ width: '52px', height: '52px', borderRadius: '6px', background: '#f1ebe8', flex: '0 0 52px' }} />}
            <div style={{ flex: 1, minWidth: 0, textDecoration: rejected ? 'line-through' : 'none' }}>
              <strong>{item.name}</strong>
              {item.color && <span style={{ marginLeft: '0.4rem', fontSize: '0.78rem', padding: '0.1rem 0.5rem', borderRadius: '999px', background: '#f3e9ef', color: '#6e1a3a', fontWeight: 'bold' }}>{item.color}</span>}
              {item.kuchuName && <div style={{ fontSize: '0.78rem', color: '#6e1a3a' }}>Kuchu: {item.kuchuName} <code>{item.kuchuId}</code> (+₹{item.kuchuPrice}){item.threadColor ? ` · Thread: ${item.threadColor}` : ''}</div>}
              <div style={{ fontSize: '0.8rem', color: '#555' }}>
                {item.itemCode && <code style={{ marginRight: '0.5rem' }}>{item.itemCode}</code>}
                × {item.quantity} · ₹{lineAmount(item)}
              </div>
            </div>
            {rejected && <span style={{ fontSize: '0.78rem', color: '#8b1e2d', fontWeight: 'bold' }}>Rejected: {item.rejectionReason || 'no reason given'}</span>}
            {!rejected && onRejectItem && (
              <button type="button" onClick={() => onRejectItem(index)} style={{ background: '#fff', color: '#c62828', border: '1px solid #c62828', borderRadius: '4px', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.8rem' }}>Reject item</button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
