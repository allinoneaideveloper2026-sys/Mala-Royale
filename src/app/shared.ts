import React from 'react';
import { Product, ProductStatus } from '../domain/types';

export const INITIAL_CATALOG: Product[] = [
  {
    id: 'p1',
    name: 'Kanjeevaram Silk Saree',
    category: 'Sarees',
    price: 14999,
    offerPrice: 13999,
    description: 'Pure zari woven Kanjeevaram silk saree with rich pallu.',
    image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&q=80&w=600',
  },
  {
    id: 'p2',
    name: 'Tassel & Bead Kuchu Work',
    category: 'Custom Kuchu',
    price: 1499,
    description: 'Handcrafted traditional silk thread Kuchu with pearl embellishments.',
    image: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&q=80&w=600',
  },
  {
    id: 'p3',
    name: 'Banarasi Soft Silk Saree',
    category: 'Sarees',
    price: 9800,
    offerPrice: 8999,
    description: 'Lightweight Banarasi silk with floral brocade pattern.',
    image: 'https://images.unsplash.com/photo-1583391733956-6c78276477e2?auto=format&fit=crop&q=80&w=600',
  }
];

export const MAX_PRODUCT_IMAGES = 6;
export const MAX_PRODUCT_VIDEOS = 1;
export const MAX_VIDEO_SECONDS = 30;
export const LOGO_URL = 'https://res.cloudinary.com/yydehgmd/image/upload/w_400,q_auto,f_auto/v1793990131/MalaRoyale.jpg';

export type HostOrderTab = 'ACTIVE' | 'DISPATCHED' | 'HISTORY';
export type HostTab = 'ORDERS' | 'LEDGER' | 'UPLOAD' | 'CATALOG' | 'QR' | 'ENQUIRIES' | 'FEEDBACK' | 'INSIGHTS';
export type SortKey = 'featured' | 'newest' | 'price-asc' | 'price-desc' | 'discount' | 'in-stock';

export const DEFAULT_CATEGORIES = ['Sarees', 'Custom Kuchu'];
export const NEW_CATEGORY_VALUE = '__new__';

export type CartLine = { product: Product; quantity: number };
export const MAX_CART_QUANTITY = 10;
export const unitPrice = (product: Product) => product.offerPrice || product.price;

// Stock-aware availability: zero quantity automatically shows "Out of stock" to customers.
export const effectiveStatus = (product: Product): ProductStatus => {
  if (product.status === 'COMING_SOON') return 'COMING_SOON';
  if (product.status === 'OUT_OF_STOCK') return 'OUT_OF_STOCK';
  if (typeof product.quantity === 'number' && product.quantity <= 0) return 'OUT_OF_STOCK';
  return 'AVAILABLE';
};
export const isPurchasable = (product: Product) => effectiveStatus(product) === 'AVAILABLE';
export const maxOrderable = (product: Product) => (
  typeof product.quantity === 'number' ? Math.max(0, Math.min(product.quantity, MAX_CART_QUANTITY)) : MAX_CART_QUANTITY
);

export const linkButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#128c7e',
  cursor: 'pointer',
  fontWeight: 'bold',
  padding: 0,
  fontSize: '0.8rem',
};

export const STATUS_LABELS: Record<ProductStatus, string> = {
  AVAILABLE: 'Available',
  OUT_OF_STOCK: 'Out of stock',
  COMING_SOON: 'Coming soon',
};

export const STATUS_COLORS: Record<ProductStatus, { backgroundColor: string; color: string }> = {
  AVAILABLE: { backgroundColor: '#e8f5e9', color: '#1b5e20' },
  OUT_OF_STOCK: { backgroundColor: '#fdecea', color: '#8b1e2d' },
  COMING_SOON: { backgroundColor: '#fff3cd', color: '#664d03' },
};

export const mediaButtonStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  color: '#6e1a3a',
  border: '1px solid #6e1a3a',
  borderRadius: '20px',
  padding: '0.5rem 0.9rem',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '0.9rem',
};

export function whatsAppLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}
