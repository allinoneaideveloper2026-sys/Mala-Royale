import React from 'react';
import type { Product } from '../../domain/types';

/** A horizontal row of products (recently viewed, popular right now). */
export default function ProductRail({ title, products, onOpen }: { title: string; products: Product[]; onOpen: (id: string) => void }) {
  if (products.length === 0) return null;
  return (
    <section className="mr-wrap" aria-label={title}>
      <div className="mr-row-title"><h2>{title}</h2></div>
      <div className="mr-rail">
        {products.map(product => (
          <button key={product.id} type="button" onClick={() => onOpen(product.id)}>
            <img src={product.image} alt={product.name} loading="lazy" />
            <span><strong>{product.name}</strong><br />₹{product.offerPrice || product.price}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
