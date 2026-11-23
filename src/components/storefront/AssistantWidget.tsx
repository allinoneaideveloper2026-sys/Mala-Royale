import React, { useEffect, useRef, useState } from 'react';
import type { Product } from '../../domain/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  productIds?: string[];
  limited?: boolean;
}

const SUGGESTIONS = ['Maroon silk sarees under ₹5000', 'Courier charge to 560001?', 'What is your return policy?'];

/** Simple word match used only when the assistant cannot be reached, so the shopper still gets something useful. */
function localMatches(question: string, products: Product[]): Product[] {
  const tokens = question.toLowerCase().split(/\W+/).filter(token => token.length > 2);
  if (tokens.length === 0) return [];
  return products
    .map(product => ({ product, hits: tokens.filter(token => `${product.name} ${product.color || ''} ${product.category} ${product.description}`.toLowerCase().includes(token)).length }))
    .filter(entry => entry.hits > 0)
    .sort((left, right) => right.hits - left.hits)
    .slice(0, 3)
    .map(entry => entry.product);
}

/** "Ask Mala": a shopping assistant that answers from the shop's own catalog and policies. It can only look things up. */
export default function AssistantWidget({
  products,
  canQuickAdd,
  onView,
  onAdd,
  onOpenCart,
  onAsked,
  whatsappUrl,
  tr,
}: {
  products: Product[];
  canQuickAdd: (product: Product) => boolean;
  onView: (id: string) => void;
  onAdd: (product: Product) => boolean;
  onOpenCart?: () => void;
  /** Called after each answer (anonymous statistics): the question, how many products it found, and whether it was a plain fallback. */
  onAsked?: (question: string, count: number, plain: boolean) => void;
  whatsappUrl?: string;
  tr: (text: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy, open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const history = messages.slice(-6).map(message => ({ role: message.role, content: message.content }));
    setMessages(current => [...current, { role: 'user', content: question }]);
    setInput('');
    setBusy(true);
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 25000);
      const response = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: question, history }), signal: controller.signal });
      window.clearTimeout(timer);
      const body = await response.json() as { ok: boolean; answer?: string; products?: string[]; error?: string };
      if (!response.ok || !body.ok || !body.answer) throw new Error(body.error || 'unavailable');
      const shown = (body.products || []).filter(id => products.some(product => product.id === id));
      setMessages(current => [...current, { role: 'assistant', content: body.answer as string, productIds: shown }]);
      onAsked?.(question, shown.length, /could not find|not sure/i.test(body.answer as string));
    } catch (error) {
      const found = localMatches(question, products);
      onAsked?.(question, found.length, true);
      setMessages(current => [...current, {
        role: 'assistant',
        limited: true,
        content: found.length > 0
          ? tr('The assistant is resting right now. These items match your words:')
          : tr('The assistant is resting right now. Please try again in a few minutes, or message us on WhatsApp.'),
        productIds: found.map(product => product.id),
      }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!open && (
        <button type="button" className="mr-ask" onClick={() => setOpen(true)} aria-label={tr('Ask Mala, the shopping assistant')}>
          <span aria-hidden="true">✨</span> {tr('Ask Mala')}
        </button>
      )}
      {open && (
        <section className="mr-assistant" role="dialog" aria-label={tr('Shopping assistant')}>
          <header className="mr-assistant-head">
            <strong className="mr-display" style={{ fontSize: '1.2rem' }}>✨ {tr('Ask Mala')}</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label={tr('Close')} style={{ background: 'none', border: 0, color: 'var(--mr-gold)', fontSize: '1.4rem', cursor: 'pointer' }}>×</button>
          </header>
          <div className="mr-assistant-body" aria-live="polite">
            {messages.length === 0 && (
              <div>
                <p style={{ margin: '0 0 0.6rem' }}>{tr('Hello! I can help you find a saree, pick a colour or Kuchu, and answer questions about delivery and our policies.')}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {SUGGESTIONS.map(suggestion => <button key={suggestion} type="button" className="mr-chip" onClick={() => void send(suggestion)}>{tr(suggestion)}</button>)}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={index} className={message.role === 'user' ? 'mr-msg mr-msg-user' : 'mr-msg mr-msg-bot'}>
                <div>{message.content}</div>
                {message.productIds && message.productIds.length > 0 && (
                  <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.6rem' }}>
                    {message.productIds.map(id => products.find(product => product.id === id)).filter((product): product is Product => Boolean(product)).map(product => (
                      <div key={product.id} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', background: '#fff', border: '1px solid var(--mr-line)', borderRadius: '10px', padding: '0.4rem' }}>
                        <img src={product.image} alt={product.name} loading="lazy" style={{ width: '52px', height: '64px', objectFit: 'cover', borderRadius: '6px' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{product.name}</div>
                          <div style={{ fontSize: '0.8rem', color: '#555' }}>₹{product.offerPrice || product.price}{product.color ? ` · ${product.color}` : ''}</div>
                        </div>
                        <div style={{ display: 'grid', gap: '0.25rem' }}>
                          <button type="button" className="mr-chip" onClick={() => { onView(product.id); setOpen(false); }}>{tr('View')}</button>
                          {canQuickAdd(product) && (added.includes(product.id)
                            ? <button type="button" className="mr-chip mr-added" onClick={() => { onOpenCart?.(); setOpen(false); }}>✓ {tr('Added · View bag')}</button>
                            : <button type="button" className="mr-chip" onClick={() => { if (onAdd(product)) setAdded(current => [...current, product.id]); }}>{tr('Add')}</button>)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="mr-msg mr-msg-bot" role="status"><span className="mr-dots" aria-label={tr('Thinking')}><i /><i /><i /></span></div>}
            <div ref={endRef} />
          </div>
          <form className="mr-assistant-form" onSubmit={event => { event.preventDefault(); void send(input); }}>
            <input value={input} onChange={event => setInput(event.target.value)} maxLength={500} placeholder={tr('Ask about sarees, colours, Kuchu, delivery...')} aria-label={tr('Your question')} />
            <button type="submit" className="mr-btn" disabled={busy || input.trim().length < 2} style={{ padding: '0.55rem 1rem' }}>{tr('Send')}</button>
          </form>
          <p className="mr-assistant-note">
            {tr('AI answers can be wrong; check the product page. Please do not share phone numbers or payment details here.')}
            {whatsappUrl && <> <a href={whatsappUrl} target="_blank" rel="noreferrer">{tr('Chat with the shop on WhatsApp')}</a></>}
          </p>
        </section>
      )}
    </>
  );
}
