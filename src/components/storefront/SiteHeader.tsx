import React from 'react';
import { BagIcon, HeartIcon, SearchIcon } from './Icons';

/** Sticky header: logo, category menu, search, saved items and the bag. */
export default function SiteHeader({
  links,
  onHome,
  search,
  onSearch,
  wishlistCount,
  wishlistActive,
  onWishlist,
  cartCount,
  onCart,
  shopping,
  tr,
}: {
  /** Page links such as About us and Contact. */
  links: Array<{ label: string; onClick: () => void }>;
  onHome: () => void;
  search: string;
  onSearch: (value: string) => void;
  wishlistCount: number;
  wishlistActive: boolean;
  onWishlist: () => void;
  cartCount: number;
  onCart: () => void;
  /** Staff do not need the bag and saved-items buttons. */
  shopping: boolean;
  tr: (text: string) => string;
}) {
  return (
    <header className="mr-header">
      <div className="mr-header-row">
        <a className="mr-logo" href="#top" aria-label="Mala Royale home" onClick={event => { event.preventDefault(); onHome(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <img className="mr-logo-wordmark" src="./brand/logo-wordmark-ivory.webp" alt="Mala Royale - Where Tradition Meets Royalty" width="132" height="48" />
        </a>
        {shopping && (
          <div className="mr-search" role="search">
            <SearchIcon />
            <input type="search" value={search} onChange={event => onSearch(event.target.value)} placeholder={tr('Search sarees, colours, Kuchu...')} aria-label={tr('Search')} />
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.2rem', marginLeft: shopping ? 0 : 'auto' }}>
          {shopping && (
            <button type="button" className="mr-icon-btn" onClick={onWishlist} aria-pressed={wishlistActive} aria-label={`${tr('Saved items')} (${wishlistCount})`} style={wishlistActive ? { background: 'var(--mr-tint-strong)' } : undefined}>
              <HeartIcon filled={wishlistActive} />
              {wishlistCount > 0 && <span className="mr-badge-dot">{wishlistCount}</span>}
            </button>
          )}
          {shopping && (
            <button type="button" className="mr-icon-btn" onClick={onCart} aria-label={`${tr('Bag')} (${cartCount})`}>
              <BagIcon />
              {cartCount > 0 && <span key={cartCount} className="mr-badge-dot mr-bump">{cartCount}</span>}
            </button>
          )}
        </div>
      </div>
      {links.length > 0 && (
        <nav className="mr-nav" aria-label={tr('Information')}>
          {links.map(link => <button key={link.label} type="button" onClick={link.onClick}>{link.label}</button>)}
        </nav>
      )}
    </header>
  );
}
