import { Chart } from 'chart.js';
import type { ChartDataset } from 'chart.js';
import { fmtCents, sourceMonthly } from '@/utils/finance';
import { C, SERIES, USD2, mKey, mLabel, monthKeys, makeReportCard, makeReportEmpty } from './ReportsUtils';
import type { Expense, CardCharge, IncomeSource, DebtAccount, DebtPayment, ExpensePaidRecord } from '@/types';
import { userLocale } from '@/utils/locale';
import { getPaydaysInMonth } from '@/utils/paydays';
import { escapeHtml } from '@/utils/escapeHtml';

const FREQ_TAG: Record<string, string> = {
  weekly:      'weekly',
  biweekly:    'biweekly',
  semimonthly: '2×/mo',
  monthly:     'monthly',
  quarterly:   'quarterly',
  annual:      'annual',
  once:        'one-time',
  hourly:      'hourly',
};

function ord(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0]!;
}

export function buildSpendingOverTime(
  expenses: Expense[],
  charges: CardCharge[],
  paidRecords: ExpensePaidRecord[],
  debtPayments: DebtPayment[],
  rangeStart: Date,
  rangeEnd: Date,
  activeCharts: Chart[],
): HTMLElement {
  const card = makeReportCard('Spending Over Time', 'Monthly totals — one-time expenses, bill payments, card charges, and debt payments');

  const keys = monthKeys(rangeStart, rangeEnd);
  const hasAny = expenses.length > 0 || charges.length > 0 || paidRecords.length > 0 || debtPayments.length > 0;
  if (keys.length === 0 || !hasAny) {
    card.appendChild(makeReportEmpty('No spending data in this range'));
    return card;
  }

  // One-time expenses + bill payments combined as "Expenses"
  const expMap  = new Map(keys.map((k) => [k, 0]));
  const chgMap  = new Map(keys.map((k) => [k, 0]));
  const debtMap = new Map(keys.map((k) => [k, 0]));

  expenses.filter(e => !e.recurring).forEach((e) => {
    const k = mKey(e.date); if (expMap.has(k)) expMap.set(k, expMap.get(k)! + e.amount);
  });
  paidRecords.forEach((r) => {
    const k = mKey(r.date); if (expMap.has(k)) expMap.set(k, expMap.get(k)! + r.amount);
  });
  charges.forEach((c)  => { const k = mKey(c.date); if (chgMap.has(k))  chgMap.set(k, chgMap.get(k)!  + c.amount); });
  debtPayments.forEach((p) => { const k = mKey(p.date); if (debtMap.has(k)) debtMap.set(k, debtMap.get(k)! + p.amount); });

  const labels   = keys.map(mLabel);
  const expData  = keys.map((k) => expMap.get(k)!);
  const chgData  = keys.map((k) => chgMap.get(k)!);
  const debtData = keys.map((k) => debtMap.get(k)!);
  const hasChg   = charges.length > 0;
  const hasDebt  = debtPayments.length > 0;

  const wrap = document.createElement('div');
  wrap.className = 'reports-chart-wrap reports-chart-wrap--lg';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  card.appendChild(wrap);

  const datasets: ChartDataset<'bar', number[]>[] = [];
  if (hasDebt) {
    datasets.push({ label: 'Debt Payments', data: debtData, backgroundColor: C.gold + 'CC', borderRadius: 3, stack: 'spending' });
  }
  if (hasChg) {
    datasets.push({ label: 'Card Charges', data: chgData, backgroundColor: C.navy + 'CC', borderRadius: 3, stack: 'spending' });
  }
  datasets.push({ label: 'Expenses & Bills', data: expData, backgroundColor: C.rust + 'CC', borderRadius: 3, stack: 'spending' });

  activeCharts.push(new Chart(canvas, {
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

export function buildIncomeVsSpending(
  expenses: Expense[],
  charges: CardCharge[],
  paidRecords: ExpensePaidRecord[],
  debtPayments: DebtPayment[],
  startTs: number,
  endTs: number,
  rangeStart: Date,
  rangeEnd: Date,
  incomeSources: IncomeSource[],
  activeCharts: Chart[],
): HTMLElement {
  const card = makeReportCard('Income vs Spending', 'Monthly income vs total outflows — expenses, bills, card charges, and debt payments');

  const keys = monthKeys(rangeStart, rangeEnd);
  if (keys.length === 0) { card.appendChild(makeReportEmpty('No data in this range')); return card; }

  const spendMap = new Map(keys.map((k) => [k, 0]));
  expenses.filter(e => !e.recurring).forEach((e) => { const k = mKey(e.date); if (spendMap.has(k)) spendMap.set(k, spendMap.get(k)! + e.amount); });
  paidRecords.forEach((r) => { const k = mKey(r.date); if (spendMap.has(k)) spendMap.set(k, spendMap.get(k)! + r.amount); });
  charges.forEach((c)  => { const k = mKey(c.date); if (spendMap.has(k)) spendMap.set(k, spendMap.get(k)! + c.amount); });
  debtPayments.forEach((p) => { const k = mKey(p.date); if (spendMap.has(k)) spendMap.set(k, spendMap.get(k)! + p.amount); });

  const incomeMap = new Map(keys.map((k) => [k, 0]));
  const monthly = incomeSources.filter((s) => s.active && s.frequency !== 'once').reduce((s, src) => s + sourceMonthly(src), 0);
  keys.forEach((k) => incomeMap.set(k, monthly));
  incomeSources
    .filter((s) => s.frequency === 'once' && s.date !== undefined && s.date >= startTs && s.date < endTs)
    .forEach((src) => { const k = mKey(src.date!); if (incomeMap.has(k)) incomeMap.set(k, incomeMap.get(k)! + src.amount); });

  const hasIncome = [...incomeMap.values()].some((v) => v > 0);

  if (!hasIncome && expenses.length === 0 && charges.length === 0) {
    card.appendChild(makeReportEmpty('No income or spending data in this range'));
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

  activeCharts.push(new Chart(canvas, {
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

  if (hasIncome) {
    const schedule = document.createElement('div');
    schedule.className = 'reports-income-schedule';

    const scheduleLabel = document.createElement('p');
    scheduleLabel.className = 'reports-income-schedule-label';
    scheduleLabel.textContent = 'Income payment schedule';
    schedule.appendChild(scheduleLabel);

    const chips = document.createElement('div');
    chips.className = 'reports-income-chips';

    keys.forEach((k, i) => {
      const net = incData[i]! - spendData[i]!;
      const [yr, mo] = k.split('-').map(Number);
      const year = yr!;
      const month = mo! - 1;

      const chip = document.createElement('div');
      chip.className = 'reports-income-chip';

      // Header: month + income total + net
      const incomeTotal = incData[i]!;
      const head = document.createElement('div');
      head.className = 'reports-ic-head';
      head.innerHTML = `
        <span class="reports-ic-month">${labels[i]}</span>
        <span class="reports-ic-net" style="color:${net >= 0 ? C.green : C.danger}">${net >= 0 ? '+' : ''}${USD2.format(net)}</span>
      `;
      chip.appendChild(head);

      const totals = document.createElement('div');
      totals.className = 'reports-ic-totals';
      totals.innerHTML = `
        <span class="reports-ic-total-label">Income</span>
        <span class="reports-ic-total-val">${USD2.format(incomeTotal)}</span>
        <span class="reports-ic-total-label">Spending</span>
        <span class="reports-ic-total-val reports-ic-total-val--spend">${USD2.format(spendData[i]!)}</span>
      `;
      chip.appendChild(totals);

      // Divider
      const divider = document.createElement('hr');
      divider.className = 'reports-ic-divider';
      chip.appendChild(divider);

      // One-time income events landing in this month
      incomeSources
        .filter(s => s.active && s.frequency === 'once' && s.date != null)
        .filter(s => { const d = new Date(s.date!); return d.getFullYear() === year && d.getMonth() === month; })
        .forEach(src => {
          const day = new Date(src.date!).getDate();
          chip.appendChild(makeIncomeRow(src.name, USD2.format(src.amount), 'one-time', `${day}${ord(day)}`));
        });

      // Recurring income sources
      incomeSources
        .filter(s => s.active && s.frequency !== 'once')
        .forEach(src => {
          const days = getPaydaysInMonth(src, year, month);
          // Quarterly/annual with a known schedule: only show in months they actually pay
          if (days.length === 0 && src.paydayRef != null && (src.frequency === 'quarterly' || src.frequency === 'annual')) return;

          const daysStr = days.length > 0
            ? days.map(d => `${d}${ord(d)}`).join(' & ')
            : '';

          const amtStr = src.frequency === 'semimonthly' && src.amount2 != null && src.amount2 !== src.amount
            ? `${USD2.format(src.amount)} / ${USD2.format(src.amount2)}`
            : USD2.format(src.amount);

          chip.appendChild(makeIncomeRow(src.name, amtStr, FREQ_TAG[src.frequency] ?? src.frequency, daysStr));
        });

      // No income at all this month
      if (chip.querySelectorAll('.reports-ic-row').length === 0) {
        const none = document.createElement('p');
        none.className = 'reports-ic-none';
        none.textContent = 'No income this month';
        chip.appendChild(none);
      }

      chips.appendChild(chip);
    });

    schedule.appendChild(chips);
    card.appendChild(schedule);
  }

  return card;
}

function makeIncomeRow(name: string, amount: string, freq: string, days: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'reports-ic-row';
  row.innerHTML = `
    <span class="reports-ic-name">${escapeHtml(name)}</span>
    <span class="reports-ic-meta">
      <span class="reports-ic-amt">${amount}</span>
      <span class="reports-ic-freq">${escapeHtml(freq)}</span>
      ${days ? `<span class="reports-ic-days">📅 ${escapeHtml(days)}</span>` : '<span class="reports-ic-days reports-ic-days--none">no schedule</span>'}
    </span>
  `;
  return row;
}

export function buildCardBalanceTrend(
  cardAccounts: DebtAccount[],
  payments: DebtPayment[],
  activeCharts: Chart[],
): HTMLElement {
  const card = makeReportCard('Card Balance Trend', 'Reconstructed balance history from recorded payments — a rising line means the card is creeping up');

  const series: { account: DebtAccount; points: { date: number; balance: number }[] }[] = [];

  cardAccounts.forEach((acct) => {
    const acctPayments = payments
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
    card.appendChild(makeReportEmpty('No payment history recorded for card accounts yet'));
    return card;
  }

  const allDates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort((a, b) => a - b);
  const labels = allDates.map((d) =>
    new Date(d).toLocaleDateString(userLocale, { month: 'short', day: 'numeric', year: '2-digit' }),
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

  activeCharts.push(new Chart(canvas, {
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
