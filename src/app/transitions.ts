import { flushSync } from 'react-dom';

/**
 * Runs a state update inside a smooth cross-fade (the browser's View Transitions) when available.
 * Visitors who prefer reduced motion, and browsers without the feature, just get the instant update.
 */
export function withViewTransition(update: () => void): void {
  const doc = document as Document & { startViewTransition?: (callback: () => void) => unknown };
  const reduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduced) {
    update();
    return;
  }
  doc.startViewTransition(() => { flushSync(update); });
}
