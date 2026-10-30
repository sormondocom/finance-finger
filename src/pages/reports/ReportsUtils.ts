export const C = {
  rust:   '#B45309',
  navy:   '#1B2A4A',
  green:  '#2D5A27',
  gold:   '#C9A84C',
  danger: '#DC2626',
  blue:   '#2563EB',
};

export const SERIES = [
  '#2D5A27', '#1B2A4A', '#C9A84C', '#B45309', '#7C3AED',
  '#0891B2', '#BE185D', '#374151', '#065F46', '#6B21A8',
  '#1D4ED8', '#0F766E', '#B91C1C', '#92400E', '#6D28D9',
];

import { fmt as USD, fmtCents as USD2 } from '@/utils/finance';
import { userLocale } from '@/utils/locale';
export { USD, USD2 };

export function mKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function mLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString(userLocale, { month: 'short', year: '2-digit' });
}

export function monthKeys(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endTs = new Date(end.getFullYear(), end.getMonth(), 1).getTime();
  while (cur.getTime() <= endTs) {
    keys.push(mKey(cur.getTime()));
    cur.setMonth(cur.getMonth() + 1);
  }
  return keys;
}

export function makeReportCard(title: string, subtitle?: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'card reports-card';
  el.innerHTML = `
    <div class="reports-card-header">
      <h2 class="font-serif" style="font-size:var(--text-lg)">${title}</h2>
      ${subtitle ? `<p class="text-xs text-muted">${subtitle}</p>` : ''}
    </div>
  `;
  addCardPrintButton(el);
  return el;
}

// Appends a per-card "print just this one" button into a card's header.
// Every report built via makeReportCard() gets this automatically; cards
// with a custom header (Leaky Bucket) call it directly with where to put
// the button.
export function addCardPrintButton(card: HTMLElement, header?: HTMLElement): void {
  const target = header ?? card.querySelector<HTMLElement>('.reports-card-header');
  if (!target) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-secondary btn-sm no-print reports-card-print-btn';
  btn.textContent = '🖨 Print';
  btn.setAttribute('data-testid', 'reports-card-print-btn');
  btn.addEventListener('click', () => printOnlyCard(card));
  target.appendChild(btn);
}

// Prints a single report card without the rest of the page: walks up from
// the card to the Reports page root, hiding every other top-level section
// along the way — and, for a section that's a wrapper around the card (the
// two-column rows some cards share), hiding only its other children rather
// than the whole wrapper. Restores visibility once the print dialog closes.
// No per-card "is this printable" marker needed — isolation is purely
// structural (does this ancestor contain the target card or not).
export function printOnlyCard(card: HTMLElement): void {
  const page = card.closest<HTMLElement>('.reports-page');
  if (!page) { window.print(); return; }

  const hidden: HTMLElement[] = [];
  const hide = (el: HTMLElement): void => { el.classList.add('print-isolate-hide'); hidden.push(el); };

  Array.from(page.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return;
    if (child === card) return;
    if (child.contains(card)) {
      Array.from(child.children).forEach((grandchild) => {
        if (grandchild instanceof HTMLElement && grandchild !== card && !grandchild.contains(card)) {
          hide(grandchild);
        }
      });
      return;
    }
    hide(child);
  });

  // The whole-page print puts every report section on its own page (see
  // reports.css), using nth-child position to decide what counts as "not
  // the front page". That positional rule doesn't know the card is now the
  // only visible thing — left alone it'd force a blank leading page here.
  // Suppress it while isolated.
  page.classList.add('reports-page--isolate');

  const cleanup = (): void => {
    page.classList.remove('reports-page--isolate');
    hidden.forEach((el) => el.classList.remove('print-isolate-hide'));
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

export function makeReportEmpty(msg: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'reports-empty';
  el.innerHTML = `<span class="reports-empty-icon">📊</span><p>${msg}</p>`;
  return el;
}
