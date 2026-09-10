import { fmtCents } from '@/utils/finance';
import { makeReportCard } from './ReportsUtils';
import type { Expense, DebtAccount, IncomeFrequency } from '@/types';

const ANNUAL_FACTORS: Record<IncomeFrequency, number> = {
  weekly:      52,
  biweekly:    26,
  semimonthly: 24,
  monthly:     12,
  quarterly:   4,
  annual:      1,
  once:        1,
  hourly:      0, // not applicable for expense schedules
};

const FREQ_LABELS: Record<string, string> = {
  annual:      'Annual',
  quarterly:   'Quarterly',
  semimonthly: 'Twice Monthly',
  monthly:     'Monthly',
  biweekly:    'Every 2 Weeks',
  weekly:      'Weekly',
};

const FREQ_ORDER = ['annual', 'quarterly', 'semimonthly', 'monthly', 'biweekly', 'weekly'];

interface PayeeRow {
  name: string;
  amountPerPeriod: number;
  annualTotal: number;
  dueDay?: number;
  source: 'bill' | 'debt';
}

export function buildPayeeSchedule(
  expenses: Expense[],
  accounts: DebtAccount[],
): HTMLElement {
  const card = makeReportCard(
    'Payee Schedule',
    'All recurring obligations grouped by payment frequency — see who you owe and when throughout the year',
  );

  const byFreq = new Map<string, PayeeRow[]>();

  // Recurring expenses (bills)
  expenses
    .filter(e => e.recurring && e.recurringFrequency && e.recurringFrequency !== 'once' && e.recurringFrequency !== 'hourly')
    .forEach(e => {
      const freq = e.recurringFrequency!;
      const annual = e.amount * (ANNUAL_FACTORS[freq] ?? 0);
      const rows = byFreq.get(freq) ?? [];
      rows.push({ name: e.description, amountPerPeriod: e.amount, annualTotal: annual, dueDay: e.dueDay, source: 'bill' });
      byFreq.set(freq, rows);
    });

  // Debt accounts — minimum monthly obligation
  accounts.forEach(acct => {
    if (acct.minimumPaymentValue == null) return;
    const minPayment = acct.minimumPaymentType === 'fixed'
      ? Math.min(acct.balance, acct.minimumPaymentValue)
      : Math.min(acct.balance, Math.max(25, acct.balance * (acct.minimumPaymentValue / 100)));
    if (minPayment <= 0) return;
    const rows = byFreq.get('monthly') ?? [];
    rows.push({ name: acct.name + ' (min payment)', amountPerPeriod: minPayment, annualTotal: minPayment * 12, source: 'debt' });
    byFreq.set('monthly', rows);
  });

  if (byFreq.size === 0) {
    const empty = document.createElement('div');
    empty.className = 'reports-empty';
    empty.innerHTML = `<span class="reports-empty-icon">📅</span><p>No recurring expenses or debt accounts found. Add recurring bills to see your payee schedule.</p>`;
    card.appendChild(empty);
    return card;
  }

  // Summary totals
  let grandAnnual = 0;
  byFreq.forEach(rows => rows.forEach(r => { grandAnnual += r.annualTotal; }));
  const grandMonthly = grandAnnual / 12;

  const summary = document.createElement('div');
  summary.className = 'payee-schedule-summary';
  summary.innerHTML = `
    <div class="payee-schedule-summary-item">
      <span class="payee-schedule-summary-label">Total annual commitment</span>
      <span class="payee-schedule-summary-value">${fmtCents.format(grandAnnual)}</span>
    </div>
    <div class="payee-schedule-summary-item">
      <span class="payee-schedule-summary-label">Monthly equivalent</span>
      <span class="payee-schedule-summary-value">${fmtCents.format(grandMonthly)}/mo</span>
    </div>
  `;
  card.appendChild(summary);

  const list = document.createElement('div');
  list.className = 'payee-schedule-list';

  FREQ_ORDER.forEach(freq => {
    const rows = byFreq.get(freq);
    if (!rows || rows.length === 0) return;

    rows.sort((a, b) => b.annualTotal - a.annualTotal);
    const groupAnnual = rows.reduce((s, r) => s + r.annualTotal, 0);

    const group = document.createElement('div');
    group.className = 'payee-schedule-group';

    const header = document.createElement('div');
    header.className = 'payee-schedule-group-header';
    header.innerHTML = `
      <span class="payee-schedule-freq-label">${FREQ_LABELS[freq] ?? freq}</span>
      <span class="payee-schedule-group-meta">${rows.length} payee${rows.length !== 1 ? 's' : ''} · ${fmtCents.format(groupAnnual)}/yr</span>
    `;
    group.appendChild(header);

    const table = document.createElement('div');
    table.className = 'payee-schedule-table';

    rows.forEach(row => {
      const periodLabel = freq === 'annual' ? '/yr'
        : freq === 'quarterly' ? '/qtr'
        : freq === 'semimonthly' ? '/half-mo'
        : freq === 'monthly' ? '/mo'
        : freq === 'biweekly' ? '/2wk'
        : '/wk';

      const rowEl = document.createElement('div');
      rowEl.className = `payee-schedule-row${row.source === 'debt' ? ' payee-schedule-row--debt' : ''}`;
      rowEl.innerHTML = `
        <span class="payee-schedule-name">${row.name}${row.dueDay ? ` <span class="payee-schedule-due">due ${row.dueDay}${ordinal(row.dueDay)}</span>` : ''}</span>
        <span class="payee-schedule-amount">${fmtCents.format(row.amountPerPeriod)}${periodLabel}</span>
        <span class="payee-schedule-annual">${fmtCents.format(row.annualTotal)}/yr</span>
      `;
      table.appendChild(rowEl);
    });

    group.appendChild(table);
    list.appendChild(group);
  });

  card.appendChild(list);
  return card;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0]!;
}
