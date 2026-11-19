import React from 'react';

/** Full-width banner with the brand artwork and two shortcuts. */
export function HeroBanner({ onShop, tr }: { onShop: (category: string) => void; tr: (text: string) => string }) {
  return (
    <section className="mr-hero" aria-label="Mala Royale">
      <h1 className="mr-sr-only">Mala Royale - Where Tradition Meets Royalty</h1>
      <img src="./brand/hero-banner.webp" alt="" width="1254" height="578" fetchPriority="high" />
      <div className="mr-hero-cta">
        <button type="button" className="mr-btn mr-btn-gold" onClick={() => onShop('Sarees')}>{tr('Shop Sarees')}</button>
        <button type="button" className="mr-btn" style={{ background: 'rgba(16,29,56,0.85)', color: 'var(--mr-gold)', borderColor: 'var(--mr-gold)' }} onClick={() => onShop('Custom Kuchu')}>{tr('Kuchu Work')}</button>
      </div>
    </section>
  );
}

export interface CategoryTile {
  name: string;
  count: number;
  image?: string;
}

const iconFor = (name: string) => (/kuchu/i.test(name) ? './brand/icon-kuchu.png' : /saree/i.test(name) ? './brand/icon-sarees.png' : './brand/icon-collections.png');

/** Round category tiles with the first product photo of each category (Nykaa-style browsing row). */
export function CategoryTiles({ tiles, active, onSelect, tr }: { tiles: CategoryTile[]; active: string; onSelect: (name: string) => void; tr: (text: string) => string }) {
  if (tiles.length === 0) return null;
  return (
    <section className="mr-wrap" aria-label={tr('Shop by category')}>
      <div className="mr-row-title"><h2>{tr('Shop by category')}</h2></div>
      <div className="mr-tiles">
        {tiles.map(tile => (
          <button key={tile.name} type="button" className="mr-tile" aria-pressed={active === tile.name} onClick={() => onSelect(tile.name)}>
            <div className="mr-tile-img">
              <span>
                {tile.image
                  ? <img src={tile.image} alt="" loading="lazy" />
                  : <img className="mr-tile-icon" src={iconFor(tile.name)} alt="" loading="lazy" />}
              </span>
            </div>
            <div className="mr-tile-label">{tr(tile.name)} <span style={{ color: '#888', fontWeight: 400 }}>({tile.count})</span></div>
          </button>
        ))}
      </div>
    </section>
  );
}

export interface ColorTile {
  name: string;
  hex: string;
  count: number;
}

/** "Shop by colour": tap a colour to see every design that comes in it. */
export function ColorRow({ colors, active, onSelect, tr }: { colors: ColorTile[]; active: string; onSelect: (name: string) => void; tr: (text: string) => string }) {
  if (colors.length === 0) return null;
  return (
    <section className="mr-wrap" aria-label={tr('Shop by colour')}>
      <div className="mr-row-title"><h2>{tr('Shop by colour')}</h2>{active && <button type="button" className="mr-chip" onClick={() => onSelect('')}>{tr('Clear colour')}</button>}</div>
      <div className="mr-colors">
        {colors.map(color => (
          <button key={color.name} type="button" className="mr-color" aria-pressed={active === color.name} onClick={() => onSelect(active === color.name ? '' : color.name)}>
            <span className="mr-color-dot" style={{ background: color.hex }} />
            {tr(color.name)}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Placeholder cards shown while the catalog loads, so the page never looks empty. */
export function ProductSkeletons({ count = 6 }: { count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.8rem' }} aria-busy="true" aria-label="Loading products">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} style={{ background: '#fff', borderRadius: '10px', overflow: 'hidden' }}>
          <div className="mr-skeleton" style={{ height: '300px', borderRadius: 0 }} />
          <div style={{ padding: '1rem', display: 'grid', gap: '0.6rem' }}>
            <div className="mr-skeleton" style={{ height: '18px', width: '70%' }} />
            <div className="mr-skeleton" style={{ height: '14px', width: '40%' }} />
            <div className="mr-skeleton" style={{ height: '36px' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
