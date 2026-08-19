import './reports.css';
import {
  Chart,
  BarController, BarElement,
  ArcElement, DoughnutController,
  LineController, LineElement, PointElement,
  LinearScale, CategoryScale,
  Tooltip, Legend,
} from 'chart.js';
import type { ChartDataset } from 'chart.js';
import {
  getExpenses, getCategories, getCardCharges, getIncomeSources,
  getDebtAccounts, getDebtPayments, getExpensePaidRecords,
} from '@/db';
import { fmtCents, sourceMonthly } from '@/utils/finance';
import type {
  Expense, ExpenseCategory, CardCharge, IncomeSource, DebtAccount, DebtPayment, ExpensePaidRecord,
} from '@/types';

Chart.register(
  BarController, BarElement, ArcElement, DoughnutController,
  LineController, LineElement, PointElement, LinearScale, CategoryScale,
  Tooltip, Legend,
);

// ── Palette ───────────────────────────────────────────────────────────────────

const C = {
  rust:   '#B45309',
  navy:   '#1B2A4A',
  green:  '#2D5A27',
  gold:   '#C9A84C',
  danger: '#DC2626',
  blue:   '#2563EB',
};

const SERIES = [
  '#2D5A27', '#1B2A4A', '#C9A84C', '#B45309', '#7C3AED',
  '#0891B2', '#BE185D', '#374151', '#065F46', '#6B21A8',
  '#1D4ED8', '#0F766E', '#B91C1C', '#92400E', '#6D28D9',
];

// ── Date helpers ──────────────────────────────────────────────────────────────

function localStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function mLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y!, m! - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function monthKeys(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endTs = new Date(end.getFullYear(), end.getMonth(), 1).getTime();
  while (cur.getTime() <= endTs) {
    keys.push(mKey(cur.getTime()));
    cur.setMonth(cur.getMonth() + 1);
  }
  return keys;
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const USD2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Preset ranges ─────────────────────────────────────────────────────────────

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
    case 'this-month': return { start: new Date(y, m, 1), end: now };
    case 'last-month': return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
    case 'last-3':     return { start: new Date(y, m - 3, d), end: now };
    case 'last-6':     return { start: new Date(y, m - 6, d), end: now };
    case 'this-year':  return { start: new Date(y, 0, 1), end: now };
    case 'last-year':  return { start: new Date(y - 1, 0, 1), end: new Date(y - 1, 11, 31) };
    case 'all-time':   return { start: new Date(2000, 0, 1), end: now };
    default:           return { start: new Date(y, m, 1), end: now };
  }
}

// ── Page class ────────────────────────────────────────────────────────────────

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

  constructor() {
    const r = presetRange('this-month');
    this.rangeStart = r.start;
    this.rangeEnd = r.end;
  }

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'reports-page';
    this.container.innerHTML = '<p class="text-muted" style="padding:var(--space-6)">Loading…</p>';
    this.load();
    return this.container;
  }

  private async load(): Promise<void> {
    [this.expenses, this.categories, this.charges, this.incomeSources, this.accounts, this.payments, this.paidRecords] = await Promise.all([
      getExpenses(), getCategories(), getCardCharges(),
      getIncomeSources(), getDebtAccounts(), getDebtPayments(), getExpensePaidRecords(),
    ]);
    this.paint();
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

    // Full-width: Spending Over Time
    this.container.appendChild(this.buildSpendingOverTime(expenses, charges));

    // Half/Half: Category breakdown + Top Merchants
    const row1 = document.createElement('div');
    row1.className = 'reports-grid-2';
    row1.appendChild(this.buildCategoryBreakdown(expenses, charges));
    row1.appendChild(this.buildTopMerchants(charges));
    this.container.appendChild(row1);

    // Full-width: Income vs Spending
    this.container.appendChild(this.buildIncomeVsSpending(expenses, charges, startTs, endTs));

    // Half/Half: Day of week + Biggest transactions
    const row2 = document.createElement('div');
    row2.className = 'reports-grid-2';
    row2.appendChild(this.buildSpendingByDay(expenses, charges));
    row2.appendChild(this.buildBiggestTransactions(expenses, charges));
    this.container.appendChild(row2);

    // Full-width: Card Balance Trend (only if card accounts exist with payments)
    const cardAccounts = this.accounts.filter((a) => a.type === 'card');
    if (cardAccounts.length > 0) {
      this.container.appendChild(this.buildCardBalanceTrend(cardAccounts));
    }

    // Half/Half: Spending by week-of-month + Recurring vs One-time
    const row3 = document.createElement('div');
    row3.className = 'reports-grid-2';
    row3.appendChild(this.buildSpendingByWeekOfMonth(expenses, charges));
    row3.appendChild(this.buildRecurringVsOneTime(expenses));
    this.container.appendChild(row3);

    // Full-width: Common Overage Offenders (always shows all-time data when thresholds exist)
    this.container.appendChild(this.buildOverageOffenders());
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

    const presets = document.createElement('div');
    presets.className = 'reports-presets';

    let customRow: HTMLElement;

    PRESETS.forEach(({ key, label }) => {
      const btn = document.createElement('button');
      btn.className = `reports-preset-btn${this.preset === key ? ' active' : ''}`;
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

    // Custom date row
    customRow = document.createElement('div');
    customRow.className = 'reports-custom-row';
    customRow.style.display = this.preset === 'custom' ? 'flex' : 'none';

    const startInput = document.createElement('input');
    startInput.type = 'date';
    startInput.value = this.customStartStr || localStr(this.rangeStart);

    const arrow = document.createElement('span');
    arrow.textContent = '→';
    arrow.style.color = 'var(--color-text-muted)';

    const endInput = document.createElement('input');
    endInput.type = 'date';
    endInput.value = this.customEndStr || localStr(this.rangeEnd);

    const apply = document.createElement('button');
    apply.className = 'btn btn-primary btn-sm';
    apply.textContent = 'Apply';
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
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    lbl.textContent = `${fmt(this.rangeStart)} – ${fmt(this.rangeEnd)}`;
    wrap.appendChild(lbl);

    return wrap;
  }

  // ── KPI chips ─────────────────────────────────────────────────────────────

  private buildKpis(expenses: Expense[], charges: CardCharge[], startTs: number, endTs: number): HTMLElement {
    const totalSpending = expenses.reduce((s, e) => s + e.amount, 0)
                        + charges.reduce((s, c) => s + c.amount, 0);

    const months = monthKeys(this.rangeStart, this.rangeEnd);
    const active = this.incomeSources.filter((s) => s.active && s.frequency !== 'once');
    const onceItems = this.incomeSources.filter((s) => s.frequency === 'once' && s.date !== undefined && s.date >= startTs && s.date < endTs);

    const monthlyRate = active.reduce((s, src) => s + sourceMonthly(src), 0);
    const totalIncome = monthlyRate * months.length
                      + onceItems.reduce((s, src) => s + src.amount, 0);

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

    const chips: { label: string; value: string; sub?: string; color: string }[] = [
      {
        label: 'Total Spending',
        value: fmtCents.format(totalSpending),
        sub: `${expenses.length + charges.length} transactions`,
        color: 'var(--ff-rust)',
      },
      {
        label: 'Total Income',
        value: hasIncome ? USD.format(totalIncome) : '—',
        sub: hasIncome ? `${months.length} month${months.length !== 1 ? 's' : ''} of data` : 'No income sources',
        color: 'var(--ff-green)',
      },
      {
        label: 'Net Cash Flow',
        value: hasIncome ? (net >= 0 ? '+' : '') + USD.format(net) : '—',
        ...(hasIncome ? { sub: net >= 0 ? 'surplus' : 'deficit' } : {}),
        color: !hasIncome ? 'var(--color-text-muted)' : net >= 0 ? 'var(--ff-green)' : 'var(--color-danger)',
      },
      {
        label: hasIncome ? 'Savings Rate' : 'Top Category',
        value: hasIncome ? savingsRate.toFixed(1) + '%' : topCatName,
        ...(hasIncome ? { sub: savingsRate >= 20 ? '✓ On track' : savingsRate < 0 ? 'Spending exceeds income' : 'Below 20% target' } : {}),
        color: hasIncome
          ? (savingsRate >= 20 ? 'var(--ff-green)' : savingsRate < 0 ? 'var(--color-danger)' : 'var(--ff-gold-dark)')
          : 'var(--color-text)',
      },
    ];

    chips.forEach(({ label, value, sub, color }) => {
      const chip = document.createElement('div');
      chip.className = 'reports-kpi';
      chip.innerHTML = `
        <span class="reports-kpi-label">${label}</span>
        <span class="reports-kpi-value" style="color:${color}">${value}</span>
        ${sub ? `<span class="reports-kpi-sub">${sub}</span>` : ''}
      `;
      grid.appendChild(chip);
    });

    return grid;
  }

  // ── Spending Over Time ──────────────────────────────────────────────────

  private buildSpendingOverTime(expenses: Expense[], charges: CardCharge[]): HTMLElement {
    const card = this.card('Spending Over Time', 'Monthly totals for all tracked expenses and card charges');

    const keys = monthKeys(this.rangeStart, this.rangeEnd);
    if (keys.length === 0 || (expenses.length === 0 && charges.length === 0)) {
      card.appendChild(this.empty('No spending data in this range'));
      return card;
    }

    const expMap = new Map(keys.map((k) => [k, 0]));
    const chgMap = new Map(keys.map((k) => [k, 0]));
    expenses.forEach((e) => { const k = mKey(e.date); if (expMap.has(k)) expMap.set(k, expMap.get(k)! + e.amount); });
    charges.forEach((c)  => { const k = mKey(c.date); if (chgMap.has(k)) chgMap.set(k, chgMap.get(k)! + c.amount); });

    const labels   = keys.map(mLabel);
    const expData  = keys.map((k) => expMap.get(k)!);
    const chgData  = keys.map((k) => chgMap.get(k)!);
    const hasChg   = charges.length > 0;

    const wrap = document.createElement('div');
    wrap.className = 'reports-chart-wrap reports-chart-wrap--lg';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    card.appendChild(wrap);

    const datasets: ChartDataset<'bar', number[]>[] = [];
    if (hasChg) {
      datasets.push({ label: 'Card Charges', data: chgData, backgroundColor: C.navy + 'CC', borderRadius: 3, stack: 'spending' });
    }
    datasets.push({ label: 'Expenses', data: expData, backgroundColor: C.rust + 'CC', borderRadius: 3, stack: 'spending' });

    this.activeCharts.push(new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${USD2.format(c.parsed.y ?? 0)}` } },
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { callback: (v) => `$${Number(v).toLocaleString()}` } },
        },
      },
    }));
    return card;
  }

  // ── Category Breakdown ──────────────────────────────────────────────────

  private buildCategoryBreakdown(expenses: Expense[], charges: CardCharge[]): HTMLElement {
    const card = this.card('By Category', 'Spending share across expense categories');

    const catMap = new Map(this.categories.map((c) => [c.id, c]));
    const totals = new Map<string, { cat: ExpenseCategory; total: number }>();

    const addToCategory = (categoryId: string | undefined, amount: number) => {
      if (!categoryId) return;
      const cat = catMap.get(categoryId);
      if (!cat) return;
      const entry = totals.get(categoryId) ?? { cat, total: 0 };
      entry.total += amount;
      totals.set(categoryId, entry);
    };

    expenses.forEach((e) => addToCategory(e.categoryId, e.amount));
    charges.forEach((c) => addToCategory(c.categoryId, c.amount));

    if (totals.size === 0) {
      card.appendChild(this.empty('No categorized spending in this range'));
      return card;
    }

    const sorted = [...totals.values()].sort((a, b) => b.total - a.total);
    const grandTotal = sorted.reduce((s, e) => s + e.total, 0);

    const wrap = document.createElement('div');
    wrap.className = 'reports-chart-wrap reports-chart-wrap--sm';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    card.appendChild(wrap);

    this.activeCharts.push(new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: sorted.map((e) => e.cat.name),
        datasets: [{
          data: sorted.map((e) => e.total),
          backgroundColor: sorted.map((e) => e.cat.color + 'CC'),
          borderColor: sorted.map((e) => e.cat.color),
          borderWidth: 1.5,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => {
                const pct = ((c.parsed / grandTotal) * 100).toFixed(1);
                return `${c.label}: ${USD2.format(c.parsed)} (${pct}%)`;
              },
            },
          },
        },
      },
    }));

    const table = document.createElement('div');
    table.className = 'reports-table';
    sorted.slice(0, 10).forEach(({ cat, total }) => {
      const pct = ((total / grandTotal) * 100).toFixed(1);
      const row = document.createElement('div');
      row.className = 'reports-table-row';
      row.innerHTML = `
        <span class="reports-color-dot" style="background:${cat.color}"></span>
        <span class="reports-table-name">${cat.name}</span>
        <span class="reports-table-pct">${pct}%</span>
        <span class="reports-table-value">${fmtCents.format(total)}</span>
      `;
      table.appendChild(row);
    });
    card.appendChild(table);

    return card;
  }

  // ── Top Merchants ───────────────────────────────────────────────────────

  private buildTopMerchants(charges: CardCharge[]): HTMLElement {
    const card = this.card('Top Merchants', 'Where your card charges are going — top 12 by total spend');

    if (charges.length === 0) {
      card.appendChild(this.empty('No card charges in this range'));
      return card;
    }

    const totals = new Map<string, number>();
    charges.forEach((c) => totals.set(c.merchant, (totals.get(c.merchant) ?? 0) + c.amount));
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

    const wrap = document.createElement('div');
    wrap.className = 'reports-chart-wrap';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    card.appendChild(wrap);

    this.activeCharts.push(new Chart(canvas, {
      type: 'bar',
      data: {
        labels: sorted.map(([m]) => m),
        datasets: [{
          label: 'Total',
          data: sorted.map(([, v]) => v),
          backgroundColor: sorted.map((_, i) => (SERIES[i % SERIES.length]!) + 'CC'),
          borderRadius: 3,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => USD2.format(c.parsed.x ?? 0) } },
        },
        scales: {
          x: { beginAtZero: true, ticks: { callback: (v) => `$${Number(v).toLocaleString()}` } },
          y: { grid: { display: false } },
        },
      },
    }));

    return card;
  }

  // ── Income vs Spending ──────────────────────────────────────────────────

  private buildIncomeVsSpending(expenses: Expense[], charges: CardCharge[], startTs: number, endTs: number): HTMLElement {
    const card = this.card('Income vs Spending', 'Monthly income compared to total spending with net cash flow');

    const keys = monthKeys(this.rangeStart, this.rangeEnd);
    if (keys.length === 0) { card.appendChild(this.empty('No data in this range')); return card; }

    const spendMap = new Map(keys.map((k) => [k, 0]));
    expenses.forEach((e) => { const k = mKey(e.date); if (spendMap.has(k)) spendMap.set(k, spendMap.get(k)! + e.amount); });
    charges.forEach((c)  => { const k = mKey(c.date); if (spendMap.has(k)) spendMap.set(k, spendMap.get(k)! + c.amount); });

    const incomeMap = new Map(keys.map((k) => [k, 0]));
    const monthly = this.incomeSources.filter((s) => s.active && s.frequency !== 'once').reduce((s, src) => s + sourceMonthly(src), 0);
    keys.forEach((k) => incomeMap.set(k, monthly));
    this.incomeSources
      .filter((s) => s.frequency === 'once' && s.date !== undefined && s.date >= startTs && s.date < endTs)
      .forEach((src) => { const k = mKey(src.date!); if (incomeMap.has(k)) incomeMap.set(k, incomeMap.get(k)! + src.amount); });

    const hasIncome = [...incomeMap.values()].some((v) => v > 0);

    if (!hasIncome && expenses.length === 0 && charges.length === 0) {
      card.appendChild(this.empty('No income or spending data in this range'));
      return card;
    }

    const labels    = keys.map(mLabel);
    const incData   = keys.map((k) => incomeMap.get(k)!);
    const spendData = keys.map((k) => spendMap.get(k)!);

    const wrap = document.createElement('div');
    wrap.className = 'reports-chart-wrap reports-chart-wrap--lg';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    card.appendChild(wrap);

    const datasets: ChartDataset<'bar', number[]>[] = [];
    if (hasIncome) {
      datasets.push({ label: 'Income', data: incData, backgroundColor: C.green + 'CC', borderRadius: 3 });
    }
    datasets.push({ label: 'Spending', data: spendData, backgroundColor: C.rust + 'CC', borderRadius: 3 });

    this.activeCharts.push(new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${USD2.format(c.parsed.y ?? 0)}` } },
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { callback: (v) => `$${Number(v).toLocaleString()}` } },
        },
      },
    }));

    // Net cash flow chips per month (only when income exists)
    if (hasIncome) {
      const summary = document.createElement('div');
      summary.className = 'reports-net-summary';
      keys.forEach((k, i) => {
        const net = incData[i]! - spendData[i]!;
        const chip = document.createElement('div');
        chip.className = 'reports-net-chip';
        chip.innerHTML = `
          <span class="text-xs text-muted">${labels[i]}</span>
          <span class="reports-net-chip-value" style="color:${net >= 0 ? C.green : C.danger}">
            ${net >= 0 ? '+' : ''}${USD.format(net)}
          </span>
        `;
        summary.appendChild(chip);
      });
      card.appendChild(summary);
    }

    return card;
  }

  // ── Spending by Day of Week ─────────────────────────────────────────────

  private buildSpendingByDay(expenses: Expense[], charges: CardCharge[]): HTMLElement {
    const card = this.card('Spending by Day', 'Which days of the week cost you the most');

    const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const byDay = [0, 0, 0, 0, 0, 0, 0];
    expenses.forEach((e) => { byDay[new Date(e.date).getDay()]! += e.amount; });
    charges.forEach((c)  => { byDay[new Date(c.date).getDay()]! += c.amount; });

    if (byDay.every((v) => v === 0)) { card.appendChild(this.empty('No spending data in this range')); return card; }

    const wrap = document.createElement('div');
    wrap.className = 'reports-chart-wrap reports-chart-wrap--sm';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    card.appendChild(wrap);

    const maxVal = Math.max(...byDay);
    this.activeCharts.push(new Chart(canvas, {
      type: 'bar',
      data: {
        labels: DAY,
        datasets: [{
          label: 'Spending',
          data: byDay,
          backgroundColor: byDay.map((v) => v === maxVal ? C.rust + 'EE' : C.rust + '66'),
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => USD2.format(c.parsed.y ?? 0) } },
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { callback: (v) => `$${Number(v).toLocaleString()}` } },
        },
      },
    }));

    const worst = DAY[byDay.indexOf(maxVal)]!;
    const note = document.createElement('p');
    note.className = 'text-xs text-muted';
    note.textContent = `Heaviest spending day: ${worst} (${fmtCents.format(maxVal)} total in range)`;
    card.appendChild(note);

    return card;
  }

  // ── Biggest Transactions ────────────────────────────────────────────────

  private buildBiggestTransactions(expenses: Expense[], charges: CardCharge[]): HTMLElement {
    const card = this.card('Biggest Transactions', 'Largest individual expenses and card charges in this range');

    type Row = { name: string; amount: number; date: number; kind: 'expense' | 'charge' };
    const all: Row[] = [
      ...expenses.map((e) => ({ name: e.description, amount: e.amount, date: e.date, kind: 'expense' as const })),
      ...charges.map((c)  => ({ name: c.merchant,    amount: c.amount, date: c.date, kind: 'charge'  as const })),
    ];

    if (all.length === 0) { card.appendChild(this.empty('No transactions in this range')); return card; }

    all.sort((a, b) => b.amount - a.amount);

    const table = document.createElement('div');
    table.className = 'reports-table';
    all.slice(0, 12).forEach(({ name, amount, date, kind }) => {
      const row = document.createElement('div');
      row.className = 'reports-table-row';
      const dateStr = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      row.innerHTML = `
        <span class="reports-type-badge reports-type-badge--${kind}">${kind === 'charge' ? 'Card' : 'Exp.'}</span>
        <span class="reports-table-name">${name}</span>
        <span class="text-xs text-muted" style="white-space:nowrap">${dateStr}</span>
        <span class="reports-table-value">${fmtCents.format(amount)}</span>
      `;
      table.appendChild(row);
    });
    card.appendChild(table);

    return card;
  }

  // ── Card Balance Trend ──────────────────────────────────────────────────

  private buildCardBalanceTrend(cardAccounts: DebtAccount[]): HTMLElement {
    const card = this.card('Card Balance Trend', 'Reconstructed balance history from recorded payments — a rising line means the card is creeping up');

    const series: { account: DebtAccount; points: { date: number; balance: number }[] }[] = [];

    cardAccounts.forEach((acct) => {
      const acctPayments = this.payments
        .filter((p) => p.accountId === acct.id)
        .sort((a, b) => a.date - b.date);

      if (acctPayments.length === 0) return;

      let balance = acct.balance;
      const points: { date: number; balance: number }[] = [{ date: Date.now(), balance }];
      for (let i = acctPayments.length - 1; i >= 0; i--) {
        balance += acctPayments[i]!.amount;
        points.unshift({ date: acctPayments[i]!.date, balance });
      }
      series.push({ account: acct, points });
    });

    if (series.length === 0) {
      card.appendChild(this.empty('No payment history recorded for card accounts yet'));
      return card;
    }

    const allDates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort((a, b) => a - b);
    const labels = allDates.map((d) =>
      new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
    );

    const wrap = document.createElement('div');
    wrap.className = 'reports-chart-wrap reports-chart-wrap--lg';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    card.appendChild(wrap);

    const datasets = series.map((s, i) => {
      const pointMap = new Map(s.points.map((p) => [p.date, p.balance]));
      let last = s.points[0]?.balance ?? 0;
      const data = allDates.map((d) => {
        if (pointMap.has(d)) last = pointMap.get(d)!;
        return last;
      });
      const color = SERIES[i % SERIES.length]!;
      return {
        label: s.account.name,
        data,
        borderColor: color,
        backgroundColor: color + '18',
        fill: false,
        tension: 0.25,
        pointRadius: 4,
        pointHoverRadius: 6,
      };
    });

    this.activeCharts.push(new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${USD2.format(c.parsed.y ?? 0)}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
          y: { beginAtZero: true, ticks: { callback: (v) => `$${Number(v).toLocaleString()}` } },
        },
      },
    }));

    // Creep warnings
    series.forEach(({ account, points }) => {
      if (points.length < 2) return;
      const first = points[0]!.balance;
      const last  = points[points.length - 1]!.balance;
      if (last > first * 1.05) {
        const warn = document.createElement('div');
        warn.className = 'reports-creep-warn';
        warn.innerHTML = `⚠️ <strong>${account.name}</strong> has grown ${fmtCents.format(last - first)} since the first recorded payment — balance may be creeping up.`;
        card.appendChild(warn);
      }
    });

    return card;
  }

  // ── Common Overage Offenders ────────────────────────────────────────────

  private buildOverageOffenders(): HTMLElement {
    const card = this.card(
      'Common Overage Offenders',
      'Recurring expenses with a monthly target — showing actual paid amounts vs your threshold across months',
    );

    // Only recurring expenses that have a threshold + at least one paid record
    const tracked = this.expenses.filter((e) => e.recurring && e.threshold != null && e.threshold > 0);
    if (tracked.length === 0) {
      const tip = document.createElement('div');
      tip.className = 'reports-empty';
      tip.innerHTML = `
        <span class="reports-empty-icon">⚡</span>
        <p>No threshold targets set yet.</p>
        <p style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:var(--space-2)">
          Edit any recurring expense and set a <strong>Monthly threshold</strong> to start tracking overages.
        </p>
      `;
      card.appendChild(tip);
      return card;
    }

    const offenders = tracked
      .map((expense) => {
        const records = this.paidRecords
          .filter((r) => r.expenseId === expense.id)
          .sort((a, b) => a.date - b.date);
        return { expense, records };
      })
      .filter(({ records }) => records.length > 0)
      .sort((a, b) => {
        // Sort by over-budget frequency desc
        const aOver = a.records.filter((r) => r.amount > a.expense.threshold!).length;
        const bOver = b.records.filter((r) => r.amount > b.expense.threshold!).length;
        return bOver - aOver;
      });

    if (offenders.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'reports-empty';
      empty.innerHTML = `
        <span class="reports-empty-icon">✓</span>
        <p>No payment history yet for threshold-tracked expenses.</p>
        <p style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:var(--space-2)">
          Mark bills as paid to start building overage history.
        </p>
      `;
      card.appendChild(empty);
      return card;
    }

    const wrap = document.createElement('div');
    wrap.className = 'overage-offenders-list';

    offenders.forEach(({ expense, records }) => {
      const threshold = expense.threshold!;
      const overCount = records.filter((r) => r.amount > threshold).length;
      const total = records.length;
      const worst = Math.max(...records.map((r) => r.amount));
      const worstOver = worst > threshold ? worst - threshold : 0;
      const isChronicOffender = overCount >= 3 || (total >= 2 && overCount === total);

      const item = document.createElement('div');
      item.className = `overage-offender-item${isChronicOffender ? ' overage-offender-item--chronic' : ''}`;

      // Header row
      const header = document.createElement('div');
      header.className = 'overage-offender-header';
      header.innerHTML = `
        <span class="overage-offender-name">${expense.description}</span>
        <span class="overage-offender-meta">
          Target: ${USD2.format(threshold)}
          · <span class="${overCount > 0 ? 'overage-count-badge' : 'text-muted'}">${overCount} of ${total} over budget</span>
          ${worstOver > 0 ? `· Worst: +${USD2.format(worstOver)} over` : ''}
          ${isChronicOffender ? ' 🔥' : ''}
        </span>
      `;
      item.appendChild(header);

      // Month-by-month cells
      const monthGrid = document.createElement('div');
      monthGrid.className = 'overage-month-grid';

      records.forEach((r) => {
        const d = new Date(r.date);
        const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
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

      // Seasonal pattern detection
      const overMonths = records
        .filter((r) => r.amount > threshold)
        .map((r) => new Date(r.date).getMonth()); // 0-indexed
      const summerMonths = overMonths.filter((m) => m >= 5 && m <= 7).length;   // Jun–Aug
      const winterMonths = overMonths.filter((m) => m === 11 || m <= 1).length; // Dec–Feb
      const springMonths = overMonths.filter((m) => m >= 2 && m <= 4).length;   // Mar–May
      const fallMonths   = overMonths.filter((m) => m >= 8 && m <= 10).length;  // Sep–Nov

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

  // ── Spending by Week of Month ───────────────────────────────────────────

  private buildSpendingByWeekOfMonth(expenses: Expense[], charges: CardCharge[]): HTMLElement {
    const card = this.card('Spending by Week of Month', 'Which part of the month sees the most activity');

    const weeks = [0, 0, 0, 0]; // weeks 1–4
    const weekOf = (ts: number) => Math.min(Math.floor((new Date(ts).getDate() - 1) / 7), 3);
    expenses.forEach((e) => { weeks[weekOf(e.date)]! += e.amount; });
    charges.forEach((c)  => { weeks[weekOf(c.date)]! += c.amount; });

    if (weeks.every((v) => v === 0)) { card.appendChild(this.empty('No data in this range')); return card; }

    const wrap = document.createElement('div');
    wrap.className = 'reports-chart-wrap reports-chart-wrap--sm';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    card.appendChild(wrap);

    const maxVal = Math.max(...weeks);
    this.activeCharts.push(new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Week 1\n(1–7)', 'Week 2\n(8–14)', 'Week 3\n(15–21)', 'Week 4\n(22+)'],
        datasets: [{
          label: 'Spending',
          data: weeks,
          backgroundColor: weeks.map((v) => v === maxVal ? C.gold + 'EE' : C.gold + '88'),
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => USD2.format(c.parsed.y ?? 0) } },
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { callback: (v) => `$${Number(v).toLocaleString()}` } },
        },
      },
    }));

    return card;
  }

  // ── Recurring vs One-time Expenses ─────────────────────────────────────

  private buildRecurringVsOneTime(expenses: Expense[]): HTMLElement {
    const card = this.card('Recurring vs One-time', 'How much of your spending is predictable each month');

    const recurringTotal  = expenses.filter((e) => e.recurring).reduce((s, e) => s + e.amount, 0);
    const onetimeTotal    = expenses.filter((e) => !e.recurring).reduce((s, e) => s + e.amount, 0);
    const grandTotal      = recurringTotal + onetimeTotal;

    if (grandTotal === 0) { card.appendChild(this.empty('No expense data in this range')); return card; }

    const wrap = document.createElement('div');
    wrap.className = 'reports-chart-wrap reports-chart-wrap--sm';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    card.appendChild(wrap);

    this.activeCharts.push(new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Recurring', 'One-time'],
        datasets: [{
          data: [recurringTotal, onetimeTotal],
          backgroundColor: [C.navy + 'CC', C.rust + 'CC'],
          borderColor:      [C.navy, C.rust],
          borderWidth: 1.5,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } },
          tooltip: {
            callbacks: {
              label: (c) => {
                const pct = ((c.parsed / grandTotal) * 100).toFixed(1);
                return `${c.label}: ${USD2.format(c.parsed)} (${pct}%)`;
              },
            },
          },
        },
      },
    }));

    const recap = document.createElement('div');
    recap.className = 'reports-table';
    [
      { label: 'Recurring', value: recurringTotal, color: C.navy },
      { label: 'One-time',  value: onetimeTotal,  color: C.rust },
    ].forEach(({ label, value, color }) => {
      const row = document.createElement('div');
      row.className = 'reports-table-row';
      const pct = ((value / grandTotal) * 100).toFixed(1);
      row.innerHTML = `
        <span class="reports-color-dot" style="background:${color}"></span>
        <span class="reports-table-name">${label}</span>
        <span class="reports-table-pct">${pct}%</span>
        <span class="reports-table-value">${fmtCents.format(value)}</span>
      `;
      recap.appendChild(row);
    });
    card.appendChild(recap);

    return card;
  }

  // ── Shared helpers ─────────────────────────────────────────────────────

  private card(title: string, subtitle?: string): HTMLElement {
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

  private empty(msg: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'reports-empty';
    el.innerHTML = `<span class="reports-empty-icon">📊</span><p>${msg}</p>`;
    return el;
  }
}
