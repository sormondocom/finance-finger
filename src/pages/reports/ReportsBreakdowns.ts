import { Chart } from 'chart.js';
import { fmtCents } from '@/utils/finance';
import { C, SERIES, USD2, makeReportCard, makeReportEmpty } from './ReportsUtils';
import type { Expense, CardCharge, ExpenseCategory } from '@/types';
import { userLocale } from '@/utils/locale';

export function buildCategoryBreakdown(
  expenses: Expense[],
  charges: CardCharge[],
  categories: ExpenseCategory[],
  activeCharts: Chart[],
): HTMLElement {
  const card = makeReportCard('By Category', 'Spending share across expense categories');

  const catMap = new Map(categories.map((c) => [c.id, c]));
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
    card.appendChild(makeReportEmpty('No categorized spending in this range'));
    return card;
  }

  const sorted = [...totals.values()].sort((a, b) => b.total - a.total);
  const grandTotal = sorted.reduce((s, e) => s + e.total, 0);

  const wrap = document.createElement('div');
  wrap.className = 'reports-chart-wrap reports-chart-wrap--sm';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  card.appendChild(wrap);

  activeCharts.push(new Chart(canvas, {
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

export function buildTopMerchants(
  charges: CardCharge[],
  activeCharts: Chart[],
): HTMLElement {
  const card = makeReportCard('Top Merchants', 'Where your card charges are going — top 12 by total spend');

  if (charges.length === 0) {
    card.appendChild(makeReportEmpty('No card charges in this range'));
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

  activeCharts.push(new Chart(canvas, {
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

export function buildSpendingByDay(
  expenses: Expense[],
  charges: CardCharge[],
  activeCharts: Chart[],
): HTMLElement {
  const card = makeReportCard('Spending by Day', 'Which days of the week cost you the most');

  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const byDay = [0, 0, 0, 0, 0, 0, 0];
  expenses.forEach((e) => { byDay[new Date(e.date).getDay()]! += e.amount; });
  charges.forEach((c)  => { byDay[new Date(c.date).getDay()]! += c.amount; });

  if (byDay.every((v) => v === 0)) { card.appendChild(makeReportEmpty('No spending data in this range')); return card; }

  const wrap = document.createElement('div');
  wrap.className = 'reports-chart-wrap reports-chart-wrap--sm';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  card.appendChild(wrap);

  const maxVal = Math.max(...byDay);
  activeCharts.push(new Chart(canvas, {
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

export function buildBiggestTransactions(
  expenses: Expense[],
  charges: CardCharge[],
): HTMLElement {
  const card = makeReportCard('Biggest Transactions', 'Largest individual expenses and card charges in this range');

  type Row = { name: string; amount: number; date: number; kind: 'expense' | 'charge' };
  const all: Row[] = [
    ...expenses.map((e) => ({ name: e.description, amount: e.amount, date: e.date, kind: 'expense' as const })),
    ...charges.map((c)  => ({ name: c.merchant,    amount: c.amount, date: c.date, kind: 'charge'  as const })),
  ];

  if (all.length === 0) { card.appendChild(makeReportEmpty('No transactions in this range')); return card; }

  all.sort((a, b) => b.amount - a.amount);

  const table = document.createElement('div');
  table.className = 'reports-table';
  all.slice(0, 12).forEach(({ name, amount, date, kind }) => {
    const row = document.createElement('div');
    row.className = 'reports-table-row';
    const dateStr = new Date(date).toLocaleDateString(userLocale, { month: 'short', day: 'numeric' });
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

export function buildSpendingByWeekOfMonth(
  expenses: Expense[],
  charges: CardCharge[],
  activeCharts: Chart[],
): HTMLElement {
  const card = makeReportCard('Spending by Week of Month', 'Which part of the month sees the most activity');

  const weeks = [0, 0, 0, 0];
  const weekOf = (ts: number) => Math.min(Math.floor((new Date(ts).getDate() - 1) / 7), 3);
  expenses.forEach((e) => { weeks[weekOf(e.date)]! += e.amount; });
  charges.forEach((c)  => { weeks[weekOf(c.date)]! += c.amount; });

  if (weeks.every((v) => v === 0)) { card.appendChild(makeReportEmpty('No data in this range')); return card; }

  const wrap = document.createElement('div');
  wrap.className = 'reports-chart-wrap reports-chart-wrap--sm';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  card.appendChild(wrap);

  const maxVal = Math.max(...weeks);
  activeCharts.push(new Chart(canvas, {
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

export function buildRecurringVsOneTime(
  expenses: Expense[],
  activeCharts: Chart[],
): HTMLElement {
  const card = makeReportCard('Recurring vs One-time', 'How much of your spending is predictable each month');

  const recurringTotal = expenses.filter((e) => e.recurring).reduce((s, e) => s + e.amount, 0);
  const onetimeTotal   = expenses.filter((e) => !e.recurring).reduce((s, e) => s + e.amount, 0);
  const grandTotal     = recurringTotal + onetimeTotal;

  if (grandTotal === 0) { card.appendChild(makeReportEmpty('No expense data in this range')); return card; }

  const wrap = document.createElement('div');
  wrap.className = 'reports-chart-wrap reports-chart-wrap--sm';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  card.appendChild(wrap);

  activeCharts.push(new Chart(canvas, {
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
