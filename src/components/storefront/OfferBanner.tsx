import React, { useEffect, useState } from 'react';
import { benefitText, offerEnds, offerHeadline, ruleIsLive, type DiscountRule } from '../../domain/discounts';

/** The host's live offers, shown as an eye-catching band under the header. Several offers take turns. */
export default function OfferBanner({ rules, onShop, tr }: { rules: DiscountRule[]; onShop: () => void; tr: (text: string) => string }) {
  const live = rules.filter(rule => ruleIsLive(rule, Date.now()));
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (live.length < 2) return undefined;
    const timer = window.setInterval(() => setIndex(current => current + 1), 4500);
    return () => window.clearInterval(timer);
  }, [live.length]);
  if (live.length === 0) return null;
  const rule = live[index % live.length];
  const ends = offerEnds(rule);
  return (
    <section className="mr-offer" aria-label={tr('Offers')}>
      <div className="mr-offer-inner" key={rule.id}>
        <span className="mr-offer-spark" aria-hidden="true">✨</span>
        <div style={{ textAlign: 'center' }}>
          <div className="mr-offer-title">{rule.name}</div>
          <div className="mr-offer-line">{offerHeadline(rule)}</div>
          <div className="mr-offer-small">
            {tr('Applied automatically at checkout')}{ends ? ` · ${tr('ends')} ${ends}` : ''}{rule.type === 'PERCENT' && rule.maxDiscount ? '' : ''}
          </div>
        </div>
        <span className="mr-offer-spark" aria-hidden="true">✨</span>
        <button type="button" className="mr-btn mr-btn-gold" onClick={onShop} style={{ padding: '0.5rem 1.2rem' }}>{tr('Shop now')}</button>
      </div>
      {live.length > 1 && (
        <div className="mr-offer-dots" aria-hidden="true">{live.map((item, position) => <i key={item.id} style={{ opacity: position === index % live.length ? 1 : 0.35 }} />)}</div>
      )}
      <span className="mr-sr-only" aria-live="polite">{benefitText(rule)}</span>
    </section>
  );
}
