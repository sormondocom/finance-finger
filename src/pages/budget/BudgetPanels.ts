import {
  Chart,
  DoughnutController,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { fmt, fmtCents } from '@/utils/finance';
import type { ExpenseCategory } from '@/types';

Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

export interface CategoryTotals {
  cat: ExpenseCategory | null;
  monthlyTotal: number;
}

export function renderSummary(income: number, expenses: number, surplus: number): HTMLElement {
  const pct = income > 0 ? Math.round(Math.abs(surplus) / income * 100) : 0;
  const div = document.createElement('div');
  div.className = 'budget-summary';
  div.setAttribute('data-testid', 'budget-summary');
  div.innerHTML = `
    <div class="budget-stat" data-testid="budget-stat-income">
      <div class="budget-stat-label">Monthly Income</div>
      <div class="budget-stat-value" data-testid="budget-income-value">${income > 0 ? fmtCents.format(income) : '—'}</div>
      <div class="budget-stat-sub">Active sources only</div>
    </div>
    <div class="budget-stat" data-testid="budget-stat-expenses">
      <div class="budget-stat-label">Monthly Expenses</div>
      <div class="budget-stat-value" data-testid="budget-expenses-value">${expenses > 0 ? fmtCents.format(expenses) : '—'}</div>
      <div class="budget-stat-sub">Recurring only</div>
    </div>
    <div class="budget-stat" data-testid="budget-stat-surplus">
      <div class="budget-stat-label">${surplus >= 0 ? 'Surplus' : 'Shortfall'}</div>
      <div class="budget-stat-value ${surplus >= 0 ? 'positive' : 'negative'}" data-testid="budget-surplus-value">
        ${income > 0 ? fmtCents.format(Math.abs(surplus)) : '—'}
      </div>
      <div class="budget-stat-sub">${income > 0 ? `${pct}% of income · recurring expenses only` : 'Add income to see this'}</div>
    </div>
  `;
  return div;
}

export function renderDonut(totals: CategoryTotals[], total: number): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card budget-chart-card';
  card.setAttribute('data-testid', 'budget-chart-card');

  const h3 = document.createElement('h3');
  h3.className = 'font-serif';
  h3.style.fontSize = 'var(--text-lg)';
  h3.textContent = 'Spending by category';
  card.appendChild(h3);

  const wrap = document.createElement('div');
  wrap.className = 'chart-canvas-wrap';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  card.appendChild(wrap);

  const colors = totals.map((t) => t.cat?.color ?? '#999999');
  const labels = totals.map((t) => t.cat?.name ?? 'Uncategorized');
  const data = totals.map((t) => t.monthlyTotal);

  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: getComputedStyle(document.documentElement)
          .getPropertyValue('--color-bg-elevated').trim() || '#fff',
        borderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      cutout: '62%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed as number;
              const pct = total > 0 ? Math.round(val / total * 100) : 0;
              return ` ${fmt.format(val)}/mo (${pct}%)`;
            },
          },
        },
      },
    },
  });

  const legend = document.createElement('div');
  legend.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-2);margin-top:var(--space-3)';
  totals.forEach((t) => {
    const pct = total > 0 ? Math.round(t.monthlyTotal / total * 100) : 0;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-xs)';
    row.innerHTML = `
      <span style="width:10px;height:10px;border-radius:50%;background:${t.cat?.color ?? '#999'};flex-shrink:0"></span>
      <span style="flex:1;color:var(--color-text-muted)">${t.cat?.name ?? 'Uncategorized'}</span>
      <span style="font-weight:600">${pct}%</span>
    `;
    legend.appendChild(row);
  });
  card.appendChild(legend);

  return card;
}

export function renderBreakdown(totals: CategoryTotals[], monthlyIncome: number): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('data-testid', 'budget-breakdown-card');

  const h3 = document.createElement('h3');
  h3.className = 'font-serif';
  h3.style.cssText = 'font-size:var(--text-lg);margin-bottom:var(--space-5)';
  h3.textContent = 'Category breakdown';
  card.appendChild(h3);

  const table = document.createElement('div');
  table.className = 'breakdown-table';

  const maxVal = totals[0]?.monthlyTotal ?? 1;

  totals.forEach((t) => {
    const pct = Math.round(t.monthlyTotal / maxVal * 100);
    const ofIncome = monthlyIncome > 0
      ? Math.round(t.monthlyTotal / monthlyIncome * 100)
      : 0;

    const row = document.createElement('div');
    row.className = 'breakdown-row';
    row.setAttribute('data-testid', 'budget-breakdown-row');
    row.innerHTML = `
      <div class="breakdown-label">
        <span class="breakdown-dot" style="background:${t.cat?.color ?? '#999'}"></span>
        <span>${t.cat?.name ?? 'Uncategorized'}</span>
      </div>
      <div class="breakdown-bar-wrap">
        <div class="breakdown-bar-fill" style="width:${pct}%;background:${t.cat?.color ?? '#999'}"></div>
      </div>
      <div class="breakdown-amount">
        ${fmtCents.format(t.monthlyTotal)}<span class="text-xs text-muted" style="font-weight:400"> (${ofIncome}%)</span>
      </div>
    `;
    table.appendChild(row);
  });

  card.appendChild(table);
  return card;
}

export function renderCashFlow(income: number, expenses: number, surplus: number): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card cashflow-card';
  card.setAttribute('data-testid', 'budget-cashflow-card');

  const h3 = document.createElement('h3');
  h3.className = 'font-serif';
  h3.style.cssText = 'font-size:var(--text-lg);margin-bottom:var(--space-4)';
  h3.textContent = 'Monthly cash flow';
  card.appendChild(h3);

  const bars: { label: string; value: number; color: string; pct: number }[] = [
    { label: 'Income', value: income, color: 'var(--ff-green)', pct: 100 },
    { label: 'Expenses', value: expenses, color: 'var(--ff-rust)', pct: income > 0 ? Math.min(Math.round(expenses / income * 100), 100) : 0 },
    {
      label: surplus >= 0 ? 'Surplus' : 'Shortfall',
      value: Math.abs(surplus),
      color: surplus >= 0 ? 'var(--ff-gold)' : 'var(--color-danger)',
      pct: income > 0 ? Math.min(Math.round(Math.abs(surplus) / income * 100), 100) : 0,
    },
  ];

  bars.forEach(({ label, value, color, pct }) => {
    const group = document.createElement('div');
    group.className = 'cashflow-bar-group';
    group.innerHTML = `
      <div class="cashflow-bar-label">${label}</div>
      <div class="cashflow-bar-track">
        <div class="cashflow-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <div class="cashflow-bar-value" style="color:${color}">${fmtCents.format(value)}</div>
    `;
    card.appendChild(group);
  });

  return card;
}

export function renderEmpty(): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = `
    <h1 class="font-serif">Budget Overview</h1>
    <div class="budget-empty" data-testid="budget-empty">
      <div class="budget-empty-icon">📊</div>
      <h3>Nothing to show yet</h3>
      <p>Add some income sources and recurring expenses, then come back here to see your budget picture.</p>
    </div>
  `;
  return div;
}
