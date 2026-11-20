import React, { useState } from 'react';
import { DEFAULT_PAGES, SITE_PAGE_KEYS, type SitePageKey, type SitePages } from '../../domain/sitePages';
import { PageText } from '../storefront/SitePageView';

const LABELS: Record<SitePageKey, string> = { about: 'About us', contact: 'Contact', terms: 'Terms & Conditions' };

/** Developer editor for the About us, Contact and Terms & Conditions pages, with a live preview. */
export default function SitePagesEditor({
  pages,
  whatsapp,
  onSave,
}: {
  pages: SitePages;
  whatsapp: string;
  onSave: (pages: SitePages) => Promise<void>;
}) {
  const [draft, setDraft] = useState<SitePages>(pages);
  const [active, setActive] = useState<SitePageKey>('about');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(pages);

  const update = (patch: Partial<SitePages[SitePageKey]>) => { setSaved(false); setDraft(current => ({ ...current, [active]: { ...current[active], ...patch } })); };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await onSave(draft);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the pages.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: '#fff', border: '1px solid var(--mr-line)', borderRadius: '12px', padding: '1.2rem' }}>
      <h3 style={{ margin: '0 0 0.4rem' }}>📝 Site pages</h3>
      <p style={{ margin: '0 0 0.8rem', color: '#666', fontSize: '0.9rem' }}>
        Edit what customers read on About us, Contact and Terms &amp; Conditions. Format: <code>## Heading</code>, <code>- bullet</code>, a blank line between paragraphs, <code>**bold**</code>.
        <code>{' {{shop}}'}</code> and <code>{'{{whatsapp}}'}</code> fill in automatically. Have your CA or lawyer review the Terms before you rely on them.
      </p>
      <div className="mr-tabs" role="tablist" aria-label="Pages">
        {SITE_PAGE_KEYS.map(key => <button key={key} type="button" role="tab" className="mr-tab" aria-selected={active === key} onClick={() => setActive(key)}>{LABELS[key]}</button>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        <div style={{ display: 'grid', gap: '0.5rem', alignContent: 'start' }}>
          <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 700 }}>Page title
            <input value={draft[active].title} onChange={event => update({ title: event.target.value })} maxLength={80} style={{ padding: '0.55rem', fontWeight: 400 }} />
          </label>
          <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 700 }}>Text
            <textarea value={draft[active].body} onChange={event => update({ body: event.target.value })} rows={22} style={{ padding: '0.6rem', fontWeight: 400, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.85rem', lineHeight: 1.5 }} />
          </label>
        </div>
        <div style={{ border: '1px dashed var(--mr-gold)', borderRadius: '10px', padding: '0.8rem', maxHeight: '560px', overflowY: 'auto', background: 'var(--mr-ivory)' }}>
          <strong style={{ color: 'var(--mr-gold-deep)', fontSize: '0.8rem', letterSpacing: '0.1em' }}>PREVIEW</strong>
          <h2 style={{ margin: '0.3rem 0', color: 'var(--mr-primary)' }}>{draft[active].title}</h2>
          <PageText text={draft[active].body} shop="Mala Royale" whatsapp={whatsapp} />
        </div>
      </div>
      {error && <p role="alert" style={{ color: '#b00020' }}>{error}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', marginTop: '0.8rem' }}>
        <button type="button" className="mr-btn" disabled={!dirty || busy} onClick={() => void save()}>{busy ? 'Saving...' : 'Save pages'}</button>
        <button type="button" className="mr-btn mr-btn-ghost" onClick={() => { setSaved(false); setDraft(current => ({ ...current, [active]: DEFAULT_PAGES[active] })); }}>Reset this page to the default text</button>
        {saved && !dirty && <span role="status" style={{ color: '#1b5e20' }}>Saved. Customers see the new text.</span>}
      </div>
    </div>
  );
}
