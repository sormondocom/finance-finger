import { USD2, makeReportCard } from './ReportsUtils';
import type { Expense, ExpensePaidRecord } from '@/types';
import { userLocale } from '@/utils/locale';

export function buildOverageOffenders(
  expenses: Expense[],
  paidRecords: ExpensePaidRecord[],
): HTMLElement {
  const card = makeReportCard(
    'Common Overage Offenders',
    'Recurring expenses — showing actual paid amounts vs the monthly threshold across months',
  );

  const tracked = expenses.filter((e) => e.recurring && e.amount > 0);
  if (tracked.length === 0) {
    const tip = document.createElement('div');
    tip.className = 'reports-empty';
    tip.innerHTML = `
      <span class="reports-empty-icon">⚡</span>
      <p>No recurring expenses yet.</p>
      <p style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:var(--space-2)">
        Add recurring expenses and record payments to start seeing overage history.
      </p>
    `;
    card.appendChild(tip);
    return card;
  }

  const offenders = tracked
    .map((expense) => {
      const records = paidRecords
        .filter((r) => r.expenseId === expense.id)
        .sort((a, b) => a.date - b.date);
      return { expense, records };
    })
    .filter(({ records }) => records.length > 0)
    .sort((a, b) => {
      const aOver = a.records.filter((r) => r.amount > a.expense.amount).length;
      const bOver = b.records.filter((r) => r.amount > b.expense.amount).length;
      return bOver - aOver;
    });

  if (offenders.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'reports-empty';
    empty.innerHTML = `
      <span class="reports-empty-icon">✓</span>
      <p>No payment history yet for recurring expenses.</p>
      <p style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:var(--space-2)">
        Record payments on your bills to start building overage history.
      </p>
    `;
    card.appendChild(empty);
    return card;
  }

  const wrap = document.createElement('div');
  wrap.className = 'overage-offenders-list';

  offenders.forEach(({ expense, records }) => {
    const threshold = expense.amount;
    const overCount = records.filter((r) => r.amount > threshold).length;
    const total = records.length;
    const worst = Math.max(...records.map((r) => r.amount));
    const worstOver = worst > threshold ? worst - threshold : 0;
    const isChronicOffender = overCount >= 3 || (total >= 2 && overCount === total);

    const item = document.createElement('div');
    item.className = `overage-offender-item${isChronicOffender ? ' overage-offender-item--chronic' : ''}`;

    const header = document.createElement('div');
    header.className = 'overage-offender-header';
    header.innerHTML = `
      <span class="overage-offender-name">${expense.description}</span>
      <span class="overage-offender-meta">
        Monthly Threshold: ${USD2.format(threshold)}
        · <span class="${overCount > 0 ? 'overage-count-badge' : 'text-muted'}">${overCount} of ${total} over budget</span>
        ${worstOver > 0 ? `· Worst: +${USD2.format(worstOver)} over` : ''}
        ${isChronicOffender ? ' 🔥' : ''}
      </span>
    `;
    item.appendChild(header);

    const monthGrid = document.createElement('div');
    monthGrid.className = 'overage-month-grid';

    records.forEach((r) => {
      const d = new Date(r.date);
      const monthLabel = d.toLocaleDateString(userLocale, { month: 'short', year: '2-digit' });
      const isOver = r.amount > threshold;
      const diff = r.amount - threshold;
      const cell = document.createElement('div');
      cell.className = `overage-month-cell${isOver ? ' overage-month-cell--over' : ' overage-month-cell--ok'}`;
      cell.title = isOver
        ? `${monthLabel}: ${USD2.format(r.amount)} — over by ${USD2.format(diff)}`
        : `${monthLabel}: ${USD2.format(r.amount)} — within target`;
      cell.innerHTML = `
        <span class="overage-month-label">${monthLabel}</span>
        <span class="overage-month-amount">${USD2.format(r.amount)}</span>
        ${isOver ? `<span class="overage-month-diff">+${USD2.format(diff)}</span>` : '<span class="overage-month-ok">✓</span>'}
      `;
      monthGrid.appendChild(cell);
    });

    item.appendChild(monthGrid);

    const overMonths = records
      .filter((r) => r.amount > threshold)
      .map((r) => new Date(r.date).getMonth());
    const summerMonths = overMonths.filter((m) => m >= 5 && m <= 7).length;
    const winterMonths = overMonths.filter((m) => m === 11 || m <= 1).length;
    const springMonths = overMonths.filter((m) => m >= 2 && m <= 4).length;
    const fallMonths   = overMonths.filter((m) => m >= 8 && m <= 10).length;

    const patterns: string[] = [];
    if (summerMonths >= 2) patterns.push('☀️ tends to spike in summer');
    if (winterMonths >= 2) patterns.push('❄️ tends to spike in winter');
    if (springMonths >= 2) patterns.push('🌱 tends to spike in spring');
    if (fallMonths >= 2)   patterns.push('🍂 tends to spike in fall');

    if (patterns.length > 0) {
      const patternEl = document.createElement('p');
      patternEl.className = 'overage-season-note';
      patternEl.textContent = `Seasonal pattern: ${patterns.join(', ')}. Plan ahead.`;
      item.appendChild(patternEl);
    }

    wrap.appendChild(item);
  });

  card.appendChild(wrap);
  return card;
}
