import {
  deleteIncomeSource, deleteExpense,
  getExpensePaidRecords, deleteExpensePaidRecord,
} from '@/db';
import { openOneTimeIncomeForm, openOneTimeExpenseForm } from './DashboardForms';
import { fmt, fmtCents } from '@/utils/finance';
import type { ExpenseCategory, HouseholdMember, IncomeSource, Expense } from '@/types';
import { userLocale } from '@/utils/locale';

export interface MonthBucket {
  readonly year: number;
  readonly month: number;
  readonly label: string;
  readonly isPartial: boolean;
  readonly proratedFactor: number;
  readonly effectiveStart: Date;
  readonly effectiveEnd: Date;
  readonly recurringIncome: number;
  readonly oneTimeIncome: IncomeSource[];
  readonly recurringExpenses: number;
  readonly oneTimeExpenses: Expense[];
}

function buildMaRow(opts: {
  label: string;
  sub?: string | undefined;
  dotColor?: string | undefined;
  dateStr: string;
  amount: number;
  colorClass: string;
  prefix: string;
  onDelete: () => void | Promise<void>;
}): HTMLElement {
  const row = document.createElement('div');
  row.className = 'ma-row';
  row.setAttribute('data-testid', 'ma-row');

  if (opts.dotColor !== undefined) {
    const dot = document.createElement('span');
    dot.className = 'ma-dot';
    dot.style.background = opts.dotColor ?? 'var(--color-border)';
    row.appendChild(dot);
  }

  const labelWrap = document.createElement('span');
  labelWrap.className = 'ma-label';
  labelWrap.textContent = opts.label;
  if (opts.sub) {
    const sub = document.createElement('span');
    sub.className = 'ma-sub text-xs text-muted';
    sub.textContent = opts.sub;
    labelWrap.appendChild(sub);
  }
  row.appendChild(labelWrap);

  const dateEl = document.createElement('span');
  dateEl.className = 'ma-date text-muted text-xs';
  dateEl.textContent = opts.dateStr;
  row.appendChild(dateEl);

  const amt = document.createElement('span');
  amt.className = `ma-amount ${opts.colorClass}`;
  amt.textContent = `${opts.prefix}${fmtCents.format(opts.amount)}`;
  row.appendChild(amt);

  const del = document.createElement('button');
  del.className = 'icon-btn danger';
  del.setAttribute('data-testid', 'ma-delete');
  del.title = 'Delete';
  del.textContent = '🗑️';
  del.addEventListener('click', opts.onDelete);
  row.appendChild(del);

  return row;
}

function buildMonthActivityContent(
  container: HTMLElement,
  bucket: MonthBucket,
  categories: ExpenseCategory[],
  members: HouseholdMember[],
  onIncomeDeleted: (id: string) => void,
  onExpenseDeleted: (id: string) => void,
  onAddIncomeSaved: (src: IncomeSource) => void,
  onAddExpenseSaved: (expense: Expense) => void,
): void {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const memberMap = new Map(members.map((m) => [m.id, m]));

  const header = document.createElement('div');
  header.className = 'ma-header';
  header.innerHTML = `<h2 class="font-serif" style="font-size:var(--text-xl);margin:0">Monthly Activity</h2>`;
  container.appendChild(header);

  // ── One-time income ──
  const incSection = document.createElement('div');
  incSection.className = 'ma-section';
  const incHeader = document.createElement('div');
  incHeader.className = 'ma-section-header';
  incHeader.innerHTML = `<span class="ma-section-title ma-income">One-time Income</span>`;
  const addIncBtn = document.createElement('button');
  addIncBtn.className = 'btn btn-secondary btn-sm';
  addIncBtn.setAttribute('data-testid', 'add-unexpected-income-btn');
  addIncBtn.textContent = '+ Log';
  addIncBtn.addEventListener('click', () => openOneTimeIncomeForm(bucket, members, onAddIncomeSaved));
  incHeader.appendChild(addIncBtn);
  incSection.appendChild(incHeader);

  if (bucket.oneTimeIncome.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-muted text-sm ma-empty';
    empty.textContent = 'No one-time income this month.';
    incSection.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'ma-list';
    const incTotal = bucket.oneTimeIncome.reduce((s, i) => s + i.amount, 0);
    bucket.oneTimeIncome.forEach((src) => {
      const member = memberMap.get(src.memberId);
      const dateStr = src.date
        ? new Date(src.date).toLocaleDateString(userLocale, { month: 'short', day: 'numeric' })
        : '';
      list.appendChild(buildMaRow({
        label: src.name, sub: member?.name, dateStr,
        amount: src.amount, colorClass: 'ma-amount-income', prefix: '+',
        onDelete: async () => {
          if (!confirm(`Delete "${src.name}"?`)) return;
          await deleteIncomeSource(src.id);
          onIncomeDeleted(src.id);
        },
      }));
    });
    incSection.appendChild(list);
    const subtotal = document.createElement('div');
    subtotal.className = 'ma-subtotal';
    subtotal.innerHTML = `<span class="text-sm text-muted">Income total</span><span class="ma-amount-income">${fmtCents.format(incTotal)}</span>`;
    incSection.appendChild(subtotal);
  }
  container.appendChild(incSection);

  const divider = document.createElement('div');
  divider.className = 'ma-divider';
  container.appendChild(divider);

  // ── One-time expenses ──
  const expSection = document.createElement('div');
  expSection.className = 'ma-section';
  const expHeader = document.createElement('div');
  expHeader.className = 'ma-section-header';
  expHeader.innerHTML = `<span class="ma-section-title ma-expense">One-time Expenses</span>`;
  const addExpBtn = document.createElement('button');
  addExpBtn.className = 'btn btn-secondary btn-sm';
  addExpBtn.setAttribute('data-testid', 'add-surprise-expense-btn');
  addExpBtn.textContent = '+ Log';
  addExpBtn.addEventListener('click', () => openOneTimeExpenseForm(bucket, categories, onAddExpenseSaved));
  expHeader.appendChild(addExpBtn);
  expSection.appendChild(expHeader);

  if (bucket.oneTimeExpenses.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-muted text-sm ma-empty';
    empty.textContent = 'No one-time expenses this month.';
    expSection.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'ma-list';
    bucket.oneTimeExpenses.forEach((e) => {
      const cat = catMap.get(e.categoryId);
      const dateStr = new Date(e.date).toLocaleDateString(userLocale, { month: 'short', day: 'numeric' });
      list.appendChild(buildMaRow({
        label: e.description, dotColor: cat?.color, dateStr,
        amount: e.amount, colorClass: 'ma-amount-expense', prefix: '−',
        onDelete: async () => {
          if (!confirm(`Delete "${e.description}"?`)) return;
          const paidRecords = await getExpensePaidRecords(e.id);
          await Promise.all(paidRecords.map((r) => deleteExpensePaidRecord(r.id)));
          await deleteExpense(e.id);
          onExpenseDeleted(e.id);
        },
      }));
    });
    expSection.appendChild(list);
    const subtotal = document.createElement('div');
    subtotal.className = 'ma-subtotal';
    subtotal.innerHTML = `<span class="text-sm text-muted">Expense total</span><span class="ma-amount-expense">${fmtCents.format(bucket.oneTimeExpenses.reduce((s, e) => s + e.amount, 0))}</span>`;
    expSection.appendChild(subtotal);
  }
  container.appendChild(expSection);

  // ── One-time net ──
  const otInc = bucket.oneTimeIncome.reduce((s, i) => s + i.amount, 0);
  const otExp = bucket.oneTimeExpenses.reduce((s, e) => s + e.amount, 0);
  const otNet = otInc - otExp;
  if (bucket.oneTimeIncome.length > 0 || bucket.oneTimeExpenses.length > 0) {
    const netRow = document.createElement('div');
    netRow.className = 'ma-net';
    const netClass = otNet >= 0 ? 'ma-amount-income' : 'ma-amount-expense';
    netRow.innerHTML = `
      <span class="text-sm font-bold">One-time net</span>
      <span class="${netClass} font-bold">${otNet >= 0 ? '+' : '−'}${fmtCents.format(Math.abs(otNet))}</span>
    `;
    container.appendChild(netRow);
  }
}

function buildRangeReportContent(
  container: HTMLElement,
  buckets: MonthBucket[],
  categories: ExpenseCategory[],
  rangeStart: Date | null,
  rangeEnd: Date | null,
  onIncomeDeleted: (id: string) => void,
  onExpenseDeleted: (id: string) => void,
): void {
  const catMap = new Map(categories.map((c) => [c.id, c]));

  const header = document.createElement('div');
  header.className = 'ma-header';
  let rangeLabel = '';
  if (rangeStart && rangeEnd) {
    const fd = (d: Date) => d.toLocaleDateString(userLocale, { month: 'short', day: 'numeric', year: 'numeric' });
    rangeLabel = `${fd(rangeStart)} – ${fd(rangeEnd)}`;
  }
  header.innerHTML = `
    <h2 class="font-serif" style="font-size:var(--text-xl);margin:0">Period Report</h2>
    ${rangeLabel ? `<span class="text-sm text-muted">${rangeLabel}</span>` : ''}
  `;
  container.appendChild(header);

  if (buckets.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-muted text-sm';
    empty.textContent = 'No data in selected range.';
    container.appendChild(empty);
    return;
  }

  const colHeader = document.createElement('div');
  colHeader.className = 'report-row report-row-header';
  colHeader.innerHTML = `
    <span>Month</span>
    <span>Income</span>
    <span>Expenses</span>
    <span>Net</span>
    <span></span>
  `;
  container.appendChild(colHeader);

  let grandIncome = 0;
  let grandExpenses = 0;

  buckets.forEach((b) => {
    const bInc = b.recurringIncome + b.oneTimeIncome.reduce((s, i) => s + i.amount, 0);
    const bExp = b.recurringExpenses + b.oneTimeExpenses.reduce((s, e) => s + e.amount, 0);
    const bNet = bInc - bExp;
    grandIncome += bInc;
    grandExpenses += bExp;

    let partialLabel = '';
    if (b.isPartial) {
      const startDay = b.effectiveStart.getDate();
      const endDay = b.effectiveEnd.getDate();
      const monthShort = b.effectiveStart.toLocaleString('default', { month: 'short' });
      partialLabel = `${monthShort} ${startDay}–${endDay}`;
    }

    const hasItems = b.oneTimeIncome.length > 0 || b.oneTimeExpenses.length > 0;

    const row = document.createElement('div');
    row.className = 'report-row';
    row.setAttribute('data-testid', 'report-month-row');

    const netCls = bNet >= 0 ? 'report-net-pos' : 'report-net-neg';
    const monthCell = document.createElement('span');
    monthCell.className = 'report-month';
    monthCell.textContent = b.label;
    if (b.isPartial) {
      const badge = document.createElement('span');
      badge.className = 'partial-badge';
      badge.textContent = partialLabel;
      monthCell.appendChild(badge);
    }

    const incCell = document.createElement('span');
    incCell.className = 'report-income';
    incCell.textContent = fmt.format(bInc);

    const expCell = document.createElement('span');
    expCell.className = 'report-expense';
    expCell.textContent = fmt.format(bExp);

    const netCell = document.createElement('span');
    netCell.className = netCls;
    netCell.textContent = `${bNet >= 0 ? '+' : '−'}${fmt.format(Math.abs(bNet))}`;

    const expandBtn = document.createElement('button');
    expandBtn.className = `report-expand-btn${hasItems ? '' : ' report-expand-btn-empty'}`;
    expandBtn.setAttribute('aria-label', hasItems ? 'Show one-time items' : 'No one-time items');
    expandBtn.setAttribute('data-testid', 'report-expand-btn');
    expandBtn.textContent = hasItems ? '▸' : '·';

    row.appendChild(monthCell);
    row.appendChild(incCell);
    row.appendChild(expCell);
    row.appendChild(netCell);
    row.appendChild(expandBtn);
    container.appendChild(row);

    if (hasItems) {
      const detail = document.createElement('div');
      detail.className = 'report-detail';
      detail.setAttribute('data-testid', 'report-detail');
      detail.style.display = 'none';

      const breakdown = document.createElement('div');
      breakdown.className = 'report-detail-breakdown';
      breakdown.innerHTML = `
        <span class="text-xs text-muted">
          Recurring baseline: ${fmt.format(b.recurringIncome)} income · ${fmt.format(b.recurringExpenses)} expenses
          ${b.isPartial ? ` (${Math.round(b.proratedFactor * 100)}% of month)` : ''}
        </span>
      `;
      detail.appendChild(breakdown);

      if (b.oneTimeIncome.length > 0) {
        const title = document.createElement('div');
        title.className = 'report-detail-sub-title ma-income';
        title.textContent = 'One-time Income';
        detail.appendChild(title);
        const list = document.createElement('div');
        list.className = 'ma-list';
        b.oneTimeIncome.forEach((src) => {
          const dateStr = src.date
            ? new Date(src.date).toLocaleDateString(userLocale, { month: 'short', day: 'numeric' })
            : '';
          list.appendChild(buildMaRow({
            label: src.name, dateStr, amount: src.amount,
            colorClass: 'ma-amount-income', prefix: '+',
            onDelete: async () => {
              if (!confirm(`Delete "${src.name}"?`)) return;
              await deleteIncomeSource(src.id);
              onIncomeDeleted(src.id);
            },
          }));
        });
        detail.appendChild(list);
      }

      if (b.oneTimeExpenses.length > 0) {
        const title = document.createElement('div');
        title.className = 'report-detail-sub-title ma-expense';
        title.textContent = 'One-time Expenses';
        detail.appendChild(title);
        const list = document.createElement('div');
        list.className = 'ma-list';
        b.oneTimeExpenses.forEach((e) => {
          const cat = catMap.get(e.categoryId);
          const dateStr = new Date(e.date).toLocaleDateString(userLocale, { month: 'short', day: 'numeric' });
          list.appendChild(buildMaRow({
            label: e.description, dotColor: cat?.color, dateStr,
            amount: e.amount, colorClass: 'ma-amount-expense', prefix: '−',
            onDelete: async () => {
              if (!confirm(`Delete "${e.description}"?`)) return;
              await deleteExpense(e.id);
              onExpenseDeleted(e.id);
            },
          }));
        });
        detail.appendChild(list);
      }

      container.appendChild(detail);

      expandBtn.addEventListener('click', () => {
        const isOpen = detail.style.display !== 'none';
        detail.style.display = isOpen ? 'none' : '';
        expandBtn.textContent = isOpen ? '▸' : '▾';
      });
    }
  });

  const grandNet = grandIncome - grandExpenses;
  const totalRow = document.createElement('div');
  totalRow.className = 'report-row report-total-row';
  totalRow.setAttribute('data-testid', 'report-total-row');
  const grandNetCls = grandNet >= 0 ? 'report-net-pos' : 'report-net-neg';
  totalRow.innerHTML = `
    <span class="font-bold">Total</span>
    <span class="font-bold">${fmt.format(grandIncome)}</span>
    <span class="font-bold">${fmt.format(grandExpenses)}</span>
    <span class="font-bold ${grandNetCls}">${grandNet >= 0 ? '+' : '−'}${fmt.format(Math.abs(grandNet))}</span>
    <span></span>
  `;
  container.appendChild(totalRow);
}

export function buildSummarySection(
  buckets: MonthBucket[],
  recurringIncomeCount: number,
  recurringExpenseCount: number,
  totalDebt: number,
  debtCount: number,
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'dashboard-summary';

  const totalRecIncome  = buckets.reduce((s, b) => s + b.recurringIncome, 0);
  const totalOTIncome   = buckets.reduce((s, b) => s + b.oneTimeIncome.reduce((ss, i) => ss + i.amount, 0), 0);
  const totalIncome     = totalRecIncome + totalOTIncome;
  const totalRecExpenses = buckets.reduce((s, b) => s + b.recurringExpenses, 0);
  const totalOTExpenses  = buckets.reduce((s, b) => s + b.oneTimeExpenses.reduce((ss, e) => ss + e.amount, 0), 0);
  const totalExpenses   = totalRecExpenses + totalOTExpenses;

  const net   = totalIncome - totalExpenses;
  const recNet = totalRecIncome - totalRecExpenses;
  const otNet  = totalOTIncome - totalOTExpenses;
  const hasOT  = totalOTIncome > 0 || totalOTExpenses > 0;

  const incCard = document.createElement('div');
  incCard.className = 'summary-card income';
  incCard.setAttribute('data-testid', 'summary-card-income');
  incCard.innerHTML = `
    <span class="summary-card-label">Income</span>
    <span class="summary-card-value" data-testid="summary-value-income">${totalIncome > 0 ? fmt.format(totalIncome) : '—'}</span>
    ${hasOT && totalOTIncome > 0
      ? `<div class="summary-card-breakdown" data-testid="summary-breakdown-income">
           <span>${fmt.format(totalRecIncome)} recurring baseline</span>
           <span class="bd-sep">·</span>
           <span class="bd-pos">+${fmt.format(totalOTIncome)} one-time</span>
         </div>`
      : `<span class="summary-card-sub">${recurringIncomeCount} recurring source${recurringIncomeCount !== 1 ? 's' : ''}</span>`
    }
  `;
  section.appendChild(incCard);

  const expCard = document.createElement('div');
  expCard.className = 'summary-card expense';
  expCard.setAttribute('data-testid', 'summary-card-expenses');
  expCard.innerHTML = `
    <span class="summary-card-label">Expenses</span>
    <span class="summary-card-value" data-testid="summary-value-expenses">${totalExpenses > 0 ? fmt.format(totalExpenses) : '—'}</span>
    ${hasOT && totalOTExpenses > 0
      ? `<div class="summary-card-breakdown" data-testid="summary-breakdown-expenses">
           <span>${fmt.format(totalRecExpenses)} recurring baseline</span>
           <span class="bd-sep">·</span>
           <span class="bd-neg">+${fmt.format(totalOTExpenses)} one-time</span>
         </div>`
      : `<span class="summary-card-sub">${recurringExpenseCount} recurring item${recurringExpenseCount !== 1 ? 's' : ''}</span>`
    }
  `;
  section.appendChild(expCard);

  const netColor = net >= 0 ? 'var(--ff-green)' : 'var(--color-danger)';
  const netStr = totalIncome > 0 || totalExpenses > 0
    ? `${net >= 0 ? '+' : '−'}${fmt.format(Math.abs(net))}` : '—';
  const netCard = document.createElement('div');
  netCard.className = 'summary-card surplus';
  netCard.setAttribute('data-testid', 'summary-card-surplus');
  netCard.innerHTML = `
    <span class="summary-card-label">Net Cash Flow</span>
    <span class="summary-card-value" data-testid="summary-value-surplus" style="color:${netColor}">${netStr}</span>
    ${hasOT
      ? `<div class="summary-card-breakdown" data-testid="summary-breakdown-net">
           <span class="${recNet >= 0 ? 'bd-pos' : 'bd-neg'}">${recNet >= 0 ? '+' : '−'}${fmt.format(Math.abs(recNet))} recurring</span>
           <span class="bd-sep">·</span>
           <span class="${otNet >= 0 ? 'bd-pos' : 'bd-neg'}">${otNet >= 0 ? '+' : '−'}${fmt.format(Math.abs(otNet))} one-time</span>
         </div>`
      : `<span class="summary-card-sub">After recurring expenses</span>`
    }
  `;
  section.appendChild(netCard);

  const debtCard = document.createElement('div');
  debtCard.className = 'summary-card debt';
  debtCard.setAttribute('data-testid', 'summary-card-debt');
  debtCard.innerHTML = `
    <span class="summary-card-label">Total Debt</span>
    <span class="summary-card-value" data-testid="summary-value-debt">${totalDebt > 0 ? fmtCents.format(totalDebt) : '—'}</span>
    <span class="summary-card-sub">${debtCount} account${debtCount !== 1 ? 's' : ''}</span>
  `;
  section.appendChild(debtCard);

  return section;
}

export function buildActivitySection(
  buckets: MonthBucket[],
  viewMode: 'month' | 'custom',
  categories: ExpenseCategory[],
  members: HouseholdMember[],
  rangeStart: Date | null,
  rangeEnd: Date | null,
  onIncomeDeleted: (id: string) => void,
  onExpenseDeleted: (id: string) => void,
  onAddIncomeSaved: (src: IncomeSource) => void,
  onAddExpenseSaved: (expense: Expense) => void,
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'card monthly-activity-widget';
  section.setAttribute('data-section', 'activity');

  if (viewMode === 'month') {
    buildMonthActivityContent(
      section, buckets[0]!, categories, members,
      onIncomeDeleted, onExpenseDeleted, onAddIncomeSaved, onAddExpenseSaved,
    );
  } else {
    buildRangeReportContent(section, buckets, categories, rangeStart, rangeEnd, onIncomeDeleted, onExpenseDeleted);
  }

  return section;
}
