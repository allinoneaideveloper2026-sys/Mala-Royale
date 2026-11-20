import React from 'react';
import type { SitePageKey, SitePages } from '../../domain/sitePages';

/** Footer: help block, page links and the brand line (same layout idea as the reference store). */
export default function SiteFooter({
  pages,
  whatsapp,
  whatsappUrl,
  onOpen,
  tr,
}: {
  pages: SitePages;
  whatsapp: string;
  whatsappUrl?: string;
  onOpen: (key: SitePageKey) => void;
  tr: (text: string) => string;
}) {
  const link = (key: SitePageKey) => (
    <li><button type="button" onClick={() => onOpen(key)} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '3px', font: 'inherit' }}>{pages[key].title}</button></li>
  );
  return (
    <footer style={{ background: 'var(--mr-ink)', color: 'var(--mr-ivory)', marginTop: '3rem' }}>
      <div className="mr-wrap" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '2rem', padding: '2.4rem 1rem' }}>
        <div>
          <img src="./brand/logo-monogram.png" alt="Mala Royale" width="72" height="72" style={{ width: '72px', height: '72px' }} />
          <p className="mr-display" style={{ fontSize: '1.3rem', margin: '0.6rem 0 0', color: 'var(--mr-gold)' }}>Where Tradition Meets Royalty.</p>
        </div>
        <div>
          <h3 style={{ color: 'var(--mr-gold)', marginTop: 0 }}>{tr('Help customers')}</h3>
          <p style={{ margin: '0 0 0.6rem', fontSize: '0.9rem', opacity: 0.9 }}>{tr('Questions about a saree, a colour or Kuchu work? Message us.')}</p>
          {whatsappUrl
            ? <a href={whatsappUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--mr-gold)', fontWeight: 700 }}>WhatsApp {whatsapp}</a>
            : <button type="button" onClick={() => onOpen('contact')} style={{ background: 'none', border: 0, padding: 0, color: 'var(--mr-gold)', cursor: 'pointer', font: 'inherit', fontWeight: 700 }}>{pages.contact.title}</button>}
        </div>
        <div>
          <h3 style={{ color: 'var(--mr-gold)', marginTop: 0 }}>{tr('Quick links')}</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem', fontSize: '0.95rem' }}>
            {link('about')}
            {link('contact')}
            {link('terms')}
          </ul>
        </div>
      </div>
      <div style={{ borderTop: '1px solid rgba(217,189,131,0.25)', padding: '0.9rem 1rem', textAlign: 'center', fontSize: '0.8rem', opacity: 0.8 }}>
        © {new Date().getFullYear()} Mala Royale
      </div>
    </footer>
  );
}
