import React, { useMemo, useState } from 'react';
import type { Enquiry, Order, Product } from '../../domain/types';
import { answerQuestion, computeMetrics, generateInsights, type DataSnapshot } from '../../analytics/insights';

export interface HostAnalyticsProps {
  orders: Order[];
  products: Product[];
  enquiries: Enquiry[];
  /** Learned importance of each kind of advice, moved by the thumbs up / down below. */
  weights: Record<string, number>;
  onFeedback: (insightKey: string, useful: boolean) => void;
  /** Only the developer login sees the reset button. */
  isDeveloper?: boolean;
  onReset?: () => Promise<void> | void;
}

type RangeKey = '7' | '30' | '90' | '365' | 'ALL' | 'CUSTOM';

const RANGE_OPTIONS: Array<[RangeKey, string]> = [
  ['7', 'Last 7 days'],
  ['30', 'Last 30 days'],
  ['90', 'Last 90 days'],
  ['365', 'Last 12 months'],
  ['ALL', 'All time'],
  ['CUSTOM', 'Custom dates'],
];

function resolveRange(key: RangeKey, customFrom: string, customTo: string): { from: number; to: number; label: string } {
  const now = Date.now();
  if (key === 'ALL') return { from: 0, to: now, label: 'all time' };
  if (key === 'CUSTOM') {
    const from = customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : 0;
    const to = customTo ? new Date(`${customTo}T23:59:59.999`).getTime() : now;
    return { from: Number.isFinite(from) ? from : 0, to: Number.isFinite(to) ? to : now, label: 'selected dates' };
  }
  const days = Number(key);
  return { from: now - days * 24 * 60 * 60 * 1000, to: now, label: key === '365' ? '12 months' : `${days} days` };
}

interface ChatTurn {
  id: number;
  role: 'host' | 'assistant';
  text: string;
  sources?: string[];
}

const SUGGESTIONS = [
  'What should I restock?',
  'Which products should I put on offer?',
  'How are sales this week?',
  'Who are my best customers?',
  'Is courier cost hurting me?',
  'What are customers asking about?',
];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const inr = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;

const cardStyle: React.CSSProperties = { backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' };

/** Optional: a server-side proxy to a language model. The retrieved facts are sent as context. */
const AI_PROXY_URL: string = (import.meta.env.VITE_AI_PROXY_URL as string | undefined) || '';

export default function HostAnalytics({ orders, products, enquiries, weights, onFeedback, isDeveloper = false, onReset }: HostAnalyticsProps) {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [voted, setVoted] = useState<Record<string, boolean>>({});

  const [rangeKey, setRangeKey] = useState<RangeKey>('30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const range = useMemo(() => resolveRange(rangeKey, customFrom, customTo), [rangeKey, customFrom, customTo]);

  const snapshot: DataSnapshot = useMemo(() => {
    const inRange = (isoDate: string) => {
      const at = Date.parse(isoDate) || 0;
      return at >= range.from && at <= range.to;
    };
    return {
      orders: orders.filter(order => inRange(order.createdAt)),
      products,
      enquiries: enquiries.filter(enquiry => inRange(enquiry.createdAt)),
      now: range.to,
    };
  }, [orders, products, enquiries, range]);
  const metrics = useMemo(() => computeMetrics(snapshot), [snapshot]);
  const insights = useMemo(() => generateInsights(snapshot, weights).slice(0, 8), [snapshot, weights]);

  const maxCategory = Math.max(1, ...metrics.categories.map(category => category.revenue));
  const maxDay = Math.max(1, ...metrics.weekdays);
  const courierShare = metrics.revenue > 0 ? Math.round((metrics.courierTotal / metrics.revenue) * 100) : 0;

  const ask = async (raw: string) => {
    const text = raw.trim();
    if (!text || thinking) return;
    setTurns(current => [...current, { id: Date.now(), role: 'host', text }]);
    setQuestion('');
    setThinking(true);

    const local = answerQuestion(text, snapshot, weights);
    let reply = local.text;
    if (AI_PROXY_URL) {
      try {
        const response = await fetch(AI_PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: text, context: local.context }),
        });
        if (response.ok) {
          const body = await response.json() as { answer?: unknown };
          if (typeof body.answer === 'string' && body.answer.trim()) reply = body.answer;
        }
      } catch {
        /* keep the built-in answer */
      }
    }
    setTurns(current => [...current, { id: Date.now() + 1, role: 'assistant', text: reply, sources: local.sources }]);
    setThinking(false);
  };

  const vote = (key: string, useful: boolean) => {
    if (voted[key] !== undefined) return;
    setVoted(current => ({ ...current, [key]: useful }));
    onFeedback(key, useful);
  };

  const stats: Array<[string, string]> = [
    [`Revenue (${range.label})`, inr(metrics.revenue)],
    [`Orders (${range.label})`, String(metrics.salesCount)],
    ['Average order', inr(metrics.aov)],
    ['Awaiting payment check', String(metrics.pendingCount)],
    ['Discounts given', inr(metrics.discount)],
    ['Courier as % of items', `${courierShare}%`],
  ];

  return (
    <section aria-label="AI insights" style={{ display: 'grid', gap: '1.2rem' }}>
      <div>
        <h3 style={{ margin: '0 0 0.3rem' }}>AI insights</h3>
        <p style={{ margin: 0, color: '#666', fontSize: '0.85rem' }}>
          Built from your own orders, products and enquiries. It re-reads everything each time you open it, so it gets sharper as your history grows.
          {AI_PROXY_URL ? ' Answers are written by a connected language model using your data as context.' : ' Answers come from the built-in analyst; no data leaves your account.'}
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 'bold' }} htmlFor="insights-range">Period</label>
        <select id="insights-range" value={rangeKey} onChange={event => setRangeKey(event.target.value as RangeKey)} style={{ padding: '0.4rem' }}>
          {RANGE_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        {rangeKey === 'CUSTOM' && (
          <>
            <input type="date" aria-label="From date" value={customFrom} max={customTo || undefined} onChange={event => setCustomFrom(event.target.value)} style={{ padding: '0.35rem' }} />
            <span style={{ fontSize: '0.85rem' }}>to</span>
            <input type="date" aria-label="To date" value={customTo} min={customFrom || undefined} onChange={event => setCustomTo(event.target.value)} style={{ padding: '0.35rem' }} />
          </>
        )}
        {isDeveloper && onReset && (
          <button type="button" onClick={() => void onReset()} style={{ marginLeft: 'auto', backgroundColor: '#fff', color: '#8b1e2d', border: '1px solid #8b1e2d', borderRadius: '4px', padding: '0.4rem 0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>
            Reset AI learning (developer only)
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.7rem' }}>
        {stats.map(([label, value]) => (
          <div key={label} style={{ ...cardStyle, padding: '0.7rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#777' }}>{label}</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#6e1a3a' }}>{value}</div>
          </div>
        ))}
      </div>

      <div>
        <h4 style={{ margin: '0 0 0.6rem' }}>Recommended actions</h4>
        {insights.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic' }}>Nothing to flag yet. Once orders and enquiries arrive, advice will appear here.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.7rem' }}>
            {insights.map(insight => (
              <article key={insight.key + insight.title} style={{ ...cardStyle, borderLeft: `4px solid ${insight.impact >= 75 ? '#c62828' : insight.impact >= 50 ? '#ef8f00' : '#2e7d32'}` }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <strong>{insight.title}</strong>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#777' }}>{insight.agent}</span>
                </div>
                <p style={{ margin: '0.3rem 0', color: '#555', fontSize: '0.88rem' }}>{insight.detail}</p>
                <p style={{ margin: '0.3rem 0', fontSize: '0.88rem' }}><strong>Suggested action:</strong> {insight.action}</p>
                {insight.evidence.length > 0 && (
                  <p style={{ margin: '0.3rem 0', color: '#777', fontSize: '0.78rem' }}>Evidence: {insight.evidence.join(' · ')}</p>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.4rem' }}>
                  <button type="button" disabled={voted[insight.key] !== undefined} onClick={() => vote(insight.key, true)} style={{ padding: '0.25rem 0.7rem', cursor: 'pointer' }}>👍 Useful</button>
                  <button type="button" disabled={voted[insight.key] !== undefined} onClick={() => vote(insight.key, false)} style={{ padding: '0.25rem 0.7rem', cursor: 'pointer' }}>👎 Not useful</button>
                  {voted[insight.key] !== undefined && <span style={{ fontSize: '0.78rem', color: '#2e7d32' }}>Thanks, I will adjust.</span>}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        <div style={cardStyle}>
          <h4 style={{ margin: '0 0 0.6rem' }}>Revenue by category</h4>
          {metrics.categories.length === 0 ? <p style={{ color: '#777', margin: 0 }}>No confirmed sales yet.</p> : metrics.categories.map(category => (
            <div key={category.label} style={{ marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span>{category.label}</span><span>{inr(category.revenue)}</span>
              </div>
              <div style={{ height: '8px', background: '#f1e6ea', borderRadius: '4px' }}>
                <div style={{ width: `${(category.revenue / maxCategory) * 100}%`, height: '100%', background: '#6e1a3a', borderRadius: '4px' }} />
              </div>
            </div>
          ))}
        </div>
        <div style={cardStyle}>
          <h4 style={{ margin: '0 0 0.6rem' }}>Orders by weekday</h4>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '110px' }}>
            {metrics.weekdays.map((count, day) => (
              <div key={WEEKDAY_SHORT[day]} style={{ flex: 1, textAlign: 'center', fontSize: '0.7rem' }}>
                <div style={{ height: `${(count / maxDay) * 80}px`, minHeight: count ? '4px' : '1px', background: '#6e1a3a', borderRadius: '3px 3px 0 0' }} title={`${count} orders`} />
                <div>{WEEKDAY_SHORT[day]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h4 style={{ margin: '0 0 0.6rem' }}>Ask your data</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.7rem' }}>
          {SUGGESTIONS.map(suggestion => (
            <button key={suggestion} type="button" onClick={() => void ask(suggestion)} style={{ backgroundColor: '#fff', border: '1px solid #bbb', borderRadius: '999px', padding: '0.3rem 0.7rem', fontSize: '0.78rem', cursor: 'pointer' }}>{suggestion}</button>
          ))}
        </div>
        <div style={{ display: 'grid', gap: '0.6rem', maxHeight: '360px', overflowY: 'auto', marginBottom: '0.7rem' }}>
          {turns.map(turn => (
            <div key={turn.id} style={{ alignSelf: turn.role === 'host' ? 'end' : 'start', backgroundColor: turn.role === 'host' ? '#f1e6ea' : '#f5f8fa', borderRadius: '8px', padding: '0.6rem 0.8rem', whiteSpace: 'pre-wrap', fontSize: '0.88rem' }}>
              {turn.text}
              {turn.sources && turn.sources.length > 0 && (
                <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: '#777' }}>Based on: {turn.sources.join(' · ')}</div>
              )}
            </div>
          ))}
          {thinking && <div style={{ color: '#777', fontSize: '0.85rem' }}>Looking through your data...</div>}
        </div>
        <form onSubmit={(event: React.FormEvent) => { event.preventDefault(); void ask(question); }} style={{ display: 'flex', gap: '0.5rem' }}>
          <input aria-label="Ask a question about your business" value={question} onChange={event => setQuestion(event.target.value)} placeholder="e.g. Which saree should I restock first?" style={{ flex: 1, padding: '0.55rem' }} />
          <button type="submit" disabled={thinking || !question.trim()} style={{ backgroundColor: '#6e1a3a', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.55rem 1rem', fontWeight: 'bold', cursor: 'pointer' }}>Ask</button>
        </form>
      </div>
    </section>
  );
}
