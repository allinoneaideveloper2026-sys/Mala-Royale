import React, { useEffect, useRef } from 'react';
import { boldParts, fillTokens, parseBlocks, type SitePage } from '../../domain/sitePages';

/** Renders page text (headings, paragraphs, bullets, **bold**) as safe React elements. */
export function PageText({ text, shop, whatsapp }: { text: string; shop: string; whatsapp: string }) {
  const blocks = parseBlocks(fillTokens(text, { shop, whatsapp }));
  const line = (value: string) => boldParts(value).map((part, index) => (part.bold ? <strong key={index}>{part.text}</strong> : <React.Fragment key={index}>{part.text}</React.Fragment>));
  return (
    <div style={{ lineHeight: 1.65, fontSize: '0.95rem', color: '#2a3142' }}>
      {blocks.map((block, index) => {
        if (block.kind === 'heading') return <h3 key={index} style={{ margin: '1.4rem 0 0.4rem', color: 'var(--mr-primary)', fontSize: '1.35rem' }}>{block.text}</h3>;
        if (block.kind === 'list') return <ul key={index} style={{ paddingLeft: '1.2rem', margin: '0.4rem 0' }}>{block.items.map((item, itemIndex) => <li key={itemIndex} style={{ marginBottom: '0.3rem' }}>{line(item)}</li>)}</ul>;
        return <p key={index} style={{ margin: '0.5rem 0' }}>{line(block.text)}</p>;
      })}
    </div>
  );
}

/** A site page (About us, Contact, Terms) shown in a pop-up. */
export default function SitePageView({
  page,
  shop,
  whatsapp,
  whatsappUrl,
  onClose,
  tr,
}: {
  page: SitePage;
  shop: string;
  whatsapp: string;
  whatsappUrl?: string;
  onClose: () => void;
  tr: (text: string) => string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return (
    <div className="mr-modal-back" role="presentation" onClick={onClose}>
      <div className="mr-modal" role="dialog" aria-modal="true" aria-label={page.title} onClick={event => event.stopPropagation()} style={{ width: 'min(760px, 100%)' }}>
        <div className="mr-modal-bar"><button ref={closeRef} type="button" className="mr-modal-close" onClick={onClose}>✕ {tr('Close')}</button></div>
        <div style={{ padding: '1.6rem' }}>
          <h2 style={{ margin: '0 0 0.6rem', color: 'var(--mr-primary)', fontSize: 'clamp(1.8rem, 4vw, 2.4rem)' }}>{page.title}</h2>
          <hr className="mr-gold-rule" />
          <PageText text={page.body} shop={shop} whatsapp={whatsapp} />
          {whatsappUrl && <p style={{ marginTop: '1.2rem' }}><a className="mr-btn mr-btn-gold" href={whatsappUrl} target="_blank" rel="noreferrer">{tr('Chat on WhatsApp')}</a></p>}
        </div>
      </div>
    </div>
  );
}
