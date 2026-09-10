import './reports.css';
import { makeHelpBtn } from '@/utils/helpNav';
import { showPageError } from '@/utils/errorUI';
import browser from 'webextension-polyfill';
import {
  Chart,
  BarController, BarElement,
  ArcElement, DoughnutController,
  LineController, LineElement, PointElement,
  LinearScale, CategoryScale,
  Tooltip, Legend,
} from 'chart.js';
import {
  getExpenses, getCategories, getCardCharges, getIncomeSources,
  getDebtAccounts, getDebtPayments, getExpensePaidRecords,
} from '@/db';
import { fmtCents, sourceMonthly } from '@/utils/finance';
import { buildLeakyBucketCard } from './LeakyBucket';
import { BUCK_SVG, PENNY_SVG } from '@/mascot/svgs';
import { USD, monthKeys } from './ReportsUtils';
import { buildSpendingOverTime, buildIncomeVsSpending, buildCardBalanceTrend } from './ReportsTrends';
import { buildPayeeSchedule } from './ReportsPayeeSchedule';
import {
  buildCategoryBreakdown, buildTopMerchants, buildSpendingByDay,
  buildBiggestTransactions, buildSpendingByWeekOfMonth, buildRecurringVsOneTime,
} from './ReportsBreakdowns';
import { buildOverageOffenders } from './ReportsOffenders';
import type {
  Expense, ExpenseCategory, CardCharge, IncomeSource, DebtAccount, DebtPayment, ExpensePaidRecord,
  MascotGender,
} from '@/types';
import { userLocale } from '@/utils/locale';
import { getPaydaysInMonth } from '@/utils/paydays';
import { escapeHtml } from '@/utils/escapeHtml';

Chart.register(
  BarController, BarElement, ArcElement, DoughnutController,
  LineController, LineElement, PointElement, LinearScale, CategoryScale,
  Tooltip, Legend,
);

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type PresetKey = 'this-week' | 'this-month' | 'last-month' | 'last-3' | 'last-6' | 'this-year' | 'last-year' | 'all-time' | 'custom';

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'this-week',  label: 'This Week' },
  { key: 'this-month', label: 'This Month' },
  { key: 'last-month', label: 'Last Month' },
  { key: 'last-3',     label: 'Last 3 Mo.' },
  { key: 'last-6',     label: 'Last 6 Mo.' },
  { key: 'this-year',  label: 'This Year' },
  { key: 'last-year',  label: 'Last Year' },
  { key: 'all-time',   label: 'All Time' },
  { key: 'custom',     label: 'Custom…' },
];

function presetRange(key: PresetKey): { start: Date; end: Date } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  switch (key) {
    case 'this-week':  return { start: new Date(y, m, d - now.getDay()), end: now };
    case 'this-month': return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) };
    case 'last-month': return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
    case 'last-3':     return { start: new Date(y, m - 3, d), end: now };
    case 'last-6':     return { start: new Date(y, m - 6, d), end: now };
    case 'this-year':  return { start: new Date(y, 0, 1), end: now };
    case 'last-year':  return { start: new Date(y - 1, 0, 1), end: new Date(y - 1, 11, 31) };
    case 'all-time':   return { start: new Date(2000, 0, 1), end: now };
    default:           return { start: new Date(y, m, 1), end: now };
  }
}

export class ReportsPage {
  private container!: HTMLElement;
  private preset: PresetKey = 'this-month';
  private rangeStart: Date;
  private rangeEnd: Date;
  private customStartStr = '';
  private customEndStr = '';
  private activeCharts: Chart[] = [];

  private expenses: Expense[] = [];
  private categories: ExpenseCategory[] = [];
  private charges: CardCharge[] = [];
  private incomeSources: IncomeSource[] = [];
  private accounts: DebtAccount[] = [];
  private payments: DebtPayment[] = [];
  private paidRecords: ExpensePaidRecord[] = [];
  private mascotGender: MascotGender = 'buck';

  constructor() {
    const r = presetRange('this-month');
    this.rangeStart = r.start;
    this.rangeEnd = r.end;
  }

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'reports-page';
    this.container.innerHTML = '<p class="text-muted" style="padding:var(--space-6)">Loading…</p>';
    void this.load();
    return this.container;
  }

  private async load(): Promise<void> {
    try {
      const [configResult, ...rest] = await Promise.all([
        browser.storage.local.get('vaultConfig'),
        getExpenses(), getCategories(), getCardCharges(),
        getIncomeSources(), getDebtAccounts(), getDebtPayments(), getExpensePaidRecords(),
      ]);
      const cfg = (configResult as Record<string, unknown>)['vaultConfig'] as { mascotGender?: MascotGender } | undefined;
      this.mascotGender = cfg?.mascotGender ?? 'buck';
      [this.expenses, this.categories, this.charges, this.incomeSources, this.accounts, this.payments, this.paidRecords] = rest as [
        Expense[], ExpenseCategory[], CardCharge[], IncomeSource[], DebtAccount[], DebtPayment[], ExpensePaidRecord[]
      ];
      this.paint();
    } catch (err) {
      showPageError(this.container, err instanceof Error ? err.message : 'Failed to load reports', () => { void this.load(); });
    }
  }

  private paint(): void {
    this.activeCharts.forEach((c) => c.destroy());
    this.activeCharts = [];
    this.container.innerHTML = '';

    const startTs = this.rangeStart.getTime();
    const endTs   = this.rangeEnd.getTime() + 86_400_000;

    const expenses = this.expenses.filter((e) => e.date >= startTs && e.date < endTs);
    const charges  = this.charges.filter((c) => c.date >= startTs && c.date < endTs);

    this.container.appendChild(this.buildRangePicker());
    this.container.appendChild(this.buildKpis(expenses, charges, startTs, endTs));

    const mascotSvg = this.mascotGender === 'buck' ? BUCK_SVG : PENNY_SVG;
    this.container.appendChild(buildLeakyBucketCard({
      expenses:      this.expenses,
      charges:       this.charges,
      incomeSources: this.incomeSources,
      paidRecords:   this.paidRecords,
      payments:      this.payments,
      accounts:      this.accounts,
      mascotSvg,
    }));

    this.container.appendChild(buildSpendingOverTime(expenses, charges, this.paidRecords, this.payments, this.rangeStart, this.rangeEnd, this.activeCharts));

    const row1 = document.createElement('div');
    row1.className = 'reports-grid-2';
    row1.appendChild(buildCategoryBreakdown(expenses, charges, this.categories, this.activeCharts));
    row1.appendChild(buildTopMerchants(charges, this.activeCharts));
    this.container.appendChild(row1);

    this.container.appendChild(buildIncomeVsSpending(expenses, charges, this.paidRecords, this.payments, startTs, endTs, this.rangeStart, this.rangeEnd, this.incomeSources, this.activeCharts));

    const row2 = document.createElement('div');
    row2.className = 'reports-grid-2';
    row2.appendChild(buildSpendingByDay(expenses, charges, this.activeCharts));
    row2.appendChild(buildBiggestTransactions(expenses, charges));
    this.container.appendChild(row2);

    const cardAccounts = this.accounts.filter((a) => a.type === 'card');
    if (cardAccounts.length > 0) {
      this.container.appendChild(buildCardBalanceTrend(cardAccounts, this.payments, this.activeCharts));
    }

    const row3 = document.createElement('div');
    row3.className = 'reports-grid-2';
    row3.appendChild(buildSpendingByWeekOfMonth(expenses, charges, this.activeCharts));
    row3.appendChild(buildRecurringVsOneTime(expenses, this.activeCharts));
    this.container.appendChild(row3);

    this.container.appendChild(buildOverageOffenders(this.expenses, this.paidRecords));

    this.container.appendChild(buildPayeeSchedule(this.expenses, this.accounts));
  }

  // ── Range picker ───────────────────────────────────────────────────────────

  private buildRangePicker(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';

    wrap.innerHTML = `
      <div class="reports-range-header">
        <h1 class="font-serif" style="font-size:var(--text-2xl)">Reports</h1>
        <p class="text-muted text-sm">Analyze spending patterns, income trends, and debt progress.</p>
      </div>
    `;
    wrap.querySelector('h1')?.appendChild(makeHelpBtn('reports'));

    const presets = document.createElement('div');
    presets.className = 'reports-presets';

    // eslint-disable-next-line prefer-const -- forward-referenced inside PRESETS forEach click handler before assignment below
    let customRow: HTMLElement;

    PRESETS.forEach(({ key, label }) => {
      const btn = document.createElement('button');
      btn.className = `reports-preset-btn${this.preset === key ? ' active' : ''}`;
      btn.dataset['testid'] = `reports-preset-${key}`;
      btn.textContent = label;
      btn.addEventListener('click', () => {
        if (key === 'custom') {
          this.preset = 'custom';
          presets.querySelectorAll('.reports-preset-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          customRow.style.display = 'flex';
          return;
        }
        const r = presetRange(key);
        this.preset = key;
        this.rangeStart = r.start;
        this.rangeEnd = r.end;
        this.paint();
      });
      presets.appendChild(btn);
    });
    wrap.appendChild(presets);

    customRow = document.createElement('div');
    customRow.className = 'reports-custom-row';
    customRow.style.display = this.preset === 'custom' ? 'flex' : 'none';

    const startInput = document.createElement('input');
    startInput.type = 'date';
    startInput.value = this.customStartStr || localStr(this.rangeStart);
    startInput.dataset['testid'] = 'reports-custom-start';

    const arrow = document.createElement('span');
    arrow.textContent = '→';
    arrow.style.color = 'var(--color-text-muted)';

    const endInput = document.createElement('input');
    endInput.type = 'date';
    endInput.value = this.customEndStr || localStr(this.rangeEnd);
    endInput.dataset['testid'] = 'reports-custom-end';

    const apply = document.createElement('button');
    apply.className = 'btn btn-primary btn-sm';
    apply.textContent = 'Apply';
    apply.dataset['testid'] = 'reports-custom-apply';
    apply.addEventListener('click', () => {
      if (!startInput.value || !endInput.value) return;
      this.customStartStr = startInput.value;
      this.customEndStr = endInput.value;
      this.rangeStart = new Date(startInput.value + 'T00:00:00');
      this.rangeEnd   = new Date(endInput.value   + 'T00:00:00');
      this.paint();
    });

    customRow.appendChild(startInput);
    customRow.appendChild(arrow);
    customRow.appendChild(endInput);
    customRow.appendChild(apply);
    wrap.appendChild(customRow);

    const lbl = document.createElement('p');
    lbl.className = 'text-xs text-muted reports-range-label';
    lbl.dataset['testid'] = 'reports-range-label';
    const fmt = (d: Date) => d.toLocaleDateString(userLocale, { month: 'short', day: 'numeric', year: 'numeric' });
    lbl.textContent = `${fmt(this.rangeStart)} – ${fmt(this.rangeEnd)}`;
    wrap.appendChild(lbl);

    return wrap;
  }

  // ── KPI chips ─────────────────────────────────────────────────────────────

  private buildKpis(expenses: Expense[], charges: CardCharge[], startTs: number, endTs: number): HTMLElement {
    const filteredPaidRecs = this.paidRecords.filter(r => r.date >= startTs && r.date < endTs);
    const filteredPayments = this.payments.filter(p => p.date >= startTs && p.date < endTs);

    const totalSpending = expenses.filter(e => !e.recurring).reduce((s, e) => s + e.amount, 0)
                        + charges.reduce((s, c) => s + c.amount, 0)
                        + filteredPaidRecs.reduce((s, r) => s + r.amount, 0)
                        + filteredPayments.reduce((s, p) => s + p.amount, 0);

    const months = monthKeys(this.rangeStart, this.rangeEnd);
    const active = this.incomeSources.filter((s) => s.active && s.frequency !== 'once');
    const onceItems = this.incomeSources.filter((s) => s.frequency === 'once' && s.date !== undefined && s.date >= startTs && s.date < endTs);

    const monthlyRate = active.reduce((s, src) => s + sourceMonthly(src), 0);
    const totalIncome = monthlyRate * months.length + onceItems.reduce((s, src) => s + src.amount, 0);

    const hasIncome = totalIncome > 0;
    const net = totalIncome - totalSpending;
    const savingsRate = hasIncome ? ((net / totalIncome) * 100) : 0;

    const catMap = new Map(this.categories.map((c) => [c.id, c]));
    const catTotals = new Map<string, number>();
    expenses.forEach((e) => catTotals.set(e.categoryId, (catTotals.get(e.categoryId) ?? 0) + e.amount));
    const topCatEntry = [...catTotals.entries()].sort((a, b) => b[1] - a[1])[0];
    const topCatName = topCatEntry ? (catMap.get(topCatEntry[0])?.name ?? '—') : '—';

    const grid = document.createElement('div');
    grid.className = 'reports-kpis';

    // ── Total Spending (expandable) ──────────────────────────────────────────
    const txCount = expenses.filter(e => !e.recurring).length + charges.length + filteredPaidRecs.length + filteredPayments.length;
    const spendChip = document.createElement('div');
    spendChip.className = 'reports-kpi reports-kpi--expandable';
    spendChip.dataset['testid'] = 'reports-kpi-spending';
    spendChip.innerHTML = `
      <span class="reports-kpi-label">Total Spending</span>
      <span class="reports-kpi-value" style="color:var(--ff-rust)">${fmtCents.format(totalSpending)}</span>
      <span class="reports-kpi-sub reports-kpi-toggle">${txCount} transactions ▾</span>
    `;
    const spendDetail = this.buildSpendingDetail(expenses, charges, filteredPaidRecs, filteredPayments);
    spendChip.appendChild(spendDetail);
    spendChip.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.reports-kpi-detail')) return;
      spendDetail.hidden = !spendDetail.hidden;
      const t = spendChip.querySelector<HTMLElement>('.reports-kpi-toggle');
      if (t) t.textContent = `${txCount} transactions ${spendDetail.hidden ? '▾' : '▴'}`;
    });
    grid.appendChild(spendChip);

    // ── Total Income (expandable) ────────────────────────────────────────────
    const incomeChip = document.createElement('div');
    incomeChip.className = `reports-kpi${hasIncome ? ' reports-kpi--expandable' : ''}`;
    incomeChip.dataset['testid'] = 'reports-kpi-income';
    incomeChip.innerHTML = `
      <span class="reports-kpi-label">Total Income</span>
      <span class="reports-kpi-value" style="color:var(--ff-green)">${hasIncome ? fmtCents.format(totalIncome) : '—'}</span>
      <span class="reports-kpi-sub reports-kpi-toggle">${hasIncome ? `${months.length} month${months.length !== 1 ? 's' : ''} of data ▾` : 'No income sources'}</span>
    `;
    if (hasIncome) {
      const incomeDetail = this.buildIncomeDetail(months);
      incomeChip.appendChild(incomeDetail);
      incomeChip.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.reports-kpi-detail')) return;
        incomeDetail.hidden = !incomeDetail.hidden;
        const t = incomeChip.querySelector<HTMLElement>('.reports-kpi-toggle');
        if (t) t.textContent = `${months.length} month${months.length !== 1 ? 's' : ''} of data ${incomeDetail.hidden ? '▾' : '▴'}`;
      });
    }
    grid.appendChild(incomeChip);

    // ── Net Cash Flow ────────────────────────────────────────────────────────
    const netChip = document.createElement('div');
    netChip.className = 'reports-kpi';
    netChip.dataset['testid'] = 'reports-kpi-net';
    const netColor = !hasIncome ? 'var(--color-text-muted)' : net >= 0 ? 'var(--ff-green)' : 'var(--color-danger)';
    netChip.innerHTML = `
      <span class="reports-kpi-label">Net Cash Flow</span>
      <span class="reports-kpi-value" style="color:${netColor}">${hasIncome ? (net >= 0 ? '+' : '') + USD.format(net) : '—'}</span>
      ${hasIncome ? `<span class="reports-kpi-sub">${net >= 0 ? 'surplus' : 'deficit'}</span>` : ''}
    `;
    grid.appendChild(netChip);

    // ── Savings Rate / Top Category ──────────────────────────────────────────
    const srChip = document.createElement('div');
    srChip.className = 'reports-kpi';
    srChip.dataset['testid'] = 'reports-kpi-savings';
    const srColor = hasIncome
      ? (savingsRate >= 20 ? 'var(--ff-green)' : savingsRate < 0 ? 'var(--color-danger)' : 'var(--ff-gold-dark)')
      : 'var(--color-text)';
    srChip.innerHTML = `
      <span class="reports-kpi-label">${hasIncome ? 'Savings Rate' : 'Top Category'}</span>
      <span class="reports-kpi-value" style="color:${srColor}">${hasIncome ? savingsRate.toFixed(1) + '%' : topCatName}</span>
      ${hasIncome ? `<span class="reports-kpi-sub">${savingsRate >= 20 ? '✓ On track' : savingsRate < 0 ? 'Spending exceeds income' : 'Below 20% target'}</span>` : ''}
    `;
    grid.appendChild(srChip);

    return grid;
  }

  private buildSpendingDetail(
    expenses: Expense[], charges: CardCharge[],
    paidRecs: ExpensePaidRecord[], payments: DebtPayment[],
  ): HTMLElement {
    const detail = document.createElement('div');
    detail.className = 'reports-kpi-detail';
    detail.hidden = true;

    const rows: { date: number; name: string; amount: number; badge: string }[] = [];
    expenses.filter(e => !e.recurring).forEach(e =>
      rows.push({ date: e.date, name: e.description, amount: e.amount, badge: 'expense' }));
    charges.forEach(c =>
      rows.push({ date: c.date, name: c.merchant, amount: c.amount, badge: 'charge' }));
    paidRecs.forEach(r => {
      const ex = this.expenses.find(e => e.id === r.expenseId);
      rows.push({ date: r.date, name: ex?.description ?? 'Bill payment', amount: r.amount, badge: 'bill' });
    });
    payments.forEach(p => {
      const acct = this.accounts.find(a => a.id === p.accountId);
      rows.push({ date: p.date, name: acct?.name ?? 'Debt payment', amount: p.amount, badge: 'debt' });
    });
    rows.sort((a, b) => b.date - a.date);

    if (rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'reports-kpi-detail-empty';
      empty.textContent = 'No transactions in this range';
      detail.appendChild(empty);
      return detail;
    }

    rows.forEach(tx => {
      const row = document.createElement('div');
      row.className = 'reports-kpi-tx-row';
      const dateStr = new Date(tx.date).toLocaleDateString(userLocale, { month: 'short', day: 'numeric' });
      row.innerHTML = `
        <span class="reports-kpi-tx-date">${escapeHtml(dateStr)}</span>
        <span class="reports-kpi-tx-name">${escapeHtml(tx.name)}</span>
        <span class="reports-kpi-tx-badge reports-kpi-tx-badge--${tx.badge}">${tx.badge}</span>
        <span class="reports-kpi-tx-amt">${fmtCents.format(tx.amount)}</span>
      `;
      detail.appendChild(row);
    });

    return detail;
  }

  private buildIncomeDetail(months: string[]): HTMLElement {
    const detail = document.createElement('div');
    detail.className = 'reports-kpi-detail';
    detail.hidden = true;

    const FREQ_TAG: Record<string, string> = {
      weekly: 'weekly', biweekly: 'biweekly', semimonthly: '2×/mo',
      monthly: 'monthly', quarterly: 'quarterly', annual: 'annual', once: 'one-time',
    };
    const ord = (n: number): string => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return s[(v - 20) % 10] ?? s[v] ?? s[0]!;
    };

    months.forEach(k => {
      const [yr, mo] = k.split('-').map(Number);
      const year = yr!;
      const month = mo! - 1;

      const section = document.createElement('div');
      section.className = 'reports-kpi-inc-month';

      const heading = document.createElement('div');
      heading.className = 'reports-kpi-inc-heading';
      heading.textContent = new Date(year, month, 1).toLocaleDateString(userLocale, { month: 'long', year: 'numeric' });
      section.appendChild(heading);

      // One-time income landing this month
      this.incomeSources
        .filter(s => s.active && s.frequency === 'once' && s.date != null)
        .filter(s => { const d = new Date(s.date!); return d.getFullYear() === year && d.getMonth() === month; })
        .forEach(src => {
          const day = new Date(src.date!).getDate();
          section.appendChild(makeKpiIncRow(src.name, fmtCents.format(src.amount), 'one-time', `${day}${ord(day)}`));
        });

      // Recurring income
      this.incomeSources
        .filter(s => s.active && s.frequency !== 'once')
        .forEach(src => {
          const days = getPaydaysInMonth(src, year, month);
          if (days.length === 0 && src.paydayRef != null && (src.frequency === 'quarterly' || src.frequency === 'annual')) return;
          const daysStr = days.map(d => `${d}${ord(d)}`).join(' & ');
          const amtStr = src.frequency === 'semimonthly' && src.amount2 != null && src.amount2 !== src.amount
            ? `${fmtCents.format(src.amount)} / ${fmtCents.format(src.amount2)}`
            : fmtCents.format(src.amount);
          section.appendChild(makeKpiIncRow(src.name, amtStr, FREQ_TAG[src.frequency] ?? src.frequency, daysStr));
        });

      detail.appendChild(section);
    });

    return detail;
  }
}

function makeKpiIncRow(name: string, amount: string, freq: string, days: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'reports-kpi-inc-row';
  row.innerHTML = `
    <span class="reports-kpi-inc-name">${escapeHtml(name)}</span>
    <span class="reports-kpi-inc-meta">
      <span class="reports-kpi-inc-amt">${amount}</span>
      <span class="reports-kpi-inc-freq">${escapeHtml(freq)}</span>
      ${days ? `<span class="reports-kpi-inc-days">${escapeHtml(days)}</span>` : ''}
    </span>
  `;
  return row;
}
