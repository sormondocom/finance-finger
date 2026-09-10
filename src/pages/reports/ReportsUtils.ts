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
  return el;
}

export function makeReportEmpty(msg: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'reports-empty';
  el.innerHTML = `<span class="reports-empty-icon">📊</span><p>${msg}</p>`;
  return el;
}
