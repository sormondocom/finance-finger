import './calendar.css';
import { getExpenses, saveExpense, saveExpensePaidRecord, createExpensePaidRecord } from '@/db';
import { openFormModal } from '@/components/Modal';
import { computeBillStatus } from '@/utils/billStatus';
import { refreshNotifier } from '@/utils/notifier';
import { fmtCents } from '@/utils/finance';
import type { Expense } from '@/types';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export class CalendarPage {
  private year: number;
  private month: number; // 0-indexed
  private expenses: Expense[] = [];
  private container!: HTMLElement;

  constructor() {
    const now = new Date();
    this.year = now.getFullYear();
    this.month = now.getMonth();
  }

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'calendar-page';
    this.load();
    return this.container;
  }

  private async load(): Promise<void> {
    this.expenses = await getExpenses();
    this.paint();
  }

  private paint(): void {
    this.container.innerHTML = '';

    const bills = this.expenses.filter((e) => e.recurring && !!e.dueDay);

    // ── Page header ──────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'calendar-header';

    const titleWrap = document.createElement('div');
    titleWrap.innerHTML = `
      <h1 class="font-serif">Bill Calendar</h1>
      <p class="text-muted text-sm">See when your recurring bills land each month.</p>
    `;
    header.appendChild(titleWrap);

    // Month navigation
    const monthNav = document.createElement('div');
    monthNav.className = 'calendar-month-nav';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'calendar-nav-btn';
    prevBtn.setAttribute('aria-label', 'Previous month');
    prevBtn.setAttribute('data-testid', 'cal-prev');
    prevBtn.innerHTML = '&#8249;';
    prevBtn.addEventListener('click', () => {
      if (this.month === 0) { this.month = 11; this.year--; }
      else { this.month--; }
      this.paint();
    });

    const monthLabel = document.createElement('span');
    monthLabel.className = 'calendar-month-label';
    monthLabel.setAttribute('data-testid', 'cal-month-label');
    monthLabel.textContent = new Date(this.year, this.month, 1)
      .toLocaleString('default', { month: 'long', year: 'numeric' });

    const nextBtn = document.createElement('button');
    nextBtn.className = 'calendar-nav-btn';
    nextBtn.setAttribute('aria-label', 'Next month');
    nextBtn.setAttribute('data-testid', 'cal-next');
    nextBtn.innerHTML = '&#8250;';
    nextBtn.addEventListener('click', () => {
      if (this.month === 11) { this.month = 0; this.year++; }
      else { this.month++; }
      this.paint();
    });

    monthNav.appendChild(prevBtn);
    monthNav.appendChild(monthLabel);
    monthNav.appendChild(nextBtn);
    header.appendChild(monthNav);

    // Legend
    const legend = document.createElement('div');
    legend.className = 'calendar-legend';
    legend.innerHTML = `
      <div class="legend-item"><span class="legend-dot" style="background:var(--color-danger)"></span>Past Due</div>
      <div class="legend-item"><span class="legend-dot" style="background:var(--ff-rust)"></span>Due Soon</div>
      <div class="legend-item"><span class="legend-dot" style="background:var(--ff-green)"></span>Paid</div>
      <div class="legend-item"><span class="legend-dot" style="background:var(--ff-sage)"></span>Upcoming</div>
    `;
    header.appendChild(legend);

    this.container.appendChild(header);

    if (bills.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'card calendar-empty';
      empty.setAttribute('data-testid', 'calendar-empty');
      empty.innerHTML = `
        <span class="calendar-empty-icon">📅</span>
        <h3>No recurring bills with due dates</h3>
        <p>Add a recurring expense with a due day on the Expenses page to see it here.</p>
      `;
      this.container.appendChild(empty);
      return;
    }

    // ── Status summary bar ───────────────────────────────────────────────
    this.container.appendChild(this.buildSummaryBar(bills));

    // ── Calendar grid ────────────────────────────────────────────────────
    const gridWrap = document.createElement('div');
    gridWrap.className = 'card calendar-grid-wrap';

    const grid = document.createElement('div');
    grid.className = 'calendar-grid';
    grid.setAttribute('data-testid', 'calendar-grid');

    // Weekday headers
    WEEKDAY_LABELS.forEach((day) => {
      const cell = document.createElement('div');
      cell.className = 'calendar-weekday';
      cell.textContent = day;
      grid.appendChild(cell);
    });

    // Build day cells
    const firstDay = new Date(this.year, this.month, 1).getDay();
    const daysInMonth = new Date(this.year, this.month + 1, 0).getDate();
    const today = new Date();
    const isCurrentYearMonth = today.getFullYear() === this.year && today.getMonth() === this.month;

    // Group bills by clamped due day in this month
    const billsByDay = new Map<number, Expense[]>();
    bills.forEach((e) => {
      const dueDay = Math.min(e.dueDay!, daysInMonth);
      const arr = billsByDay.get(dueDay) ?? [];
      arr.push(e);
      billsByDay.set(dueDay, arr);
    });

    // Empty lead cells
    for (let i = 0; i < firstDay; i++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell calendar-cell--empty';
      grid.appendChild(cell);
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell';
      cell.setAttribute('data-testid', 'calendar-cell');
      cell.setAttribute('data-day', String(day));

      if (isCurrentYearMonth && day === today.getDate()) {
        cell.classList.add('calendar-cell--today');
      }

      const dayNum = document.createElement('div');
      dayNum.className = 'calendar-day-number';
      dayNum.textContent = String(day);
      cell.appendChild(dayNum);

      const dayBills = billsByDay.get(day) ?? [];
      if (dayBills.length > 0) {
        const billsWrap = document.createElement('div');
        billsWrap.className = 'calendar-bills';
        dayBills.forEach((e) => {
          billsWrap.appendChild(this.buildBillChip(e));
        });
        cell.appendChild(billsWrap);
      }

      grid.appendChild(cell);
    }

    gridWrap.appendChild(grid);
    this.container.appendChild(gridWrap);
  }

  private buildSummaryBar(bills: Expense[]): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'calendar-summary';
    bar.setAttribute('data-testid', 'calendar-summary-bar');

    const counts = { 'past-due': 0, 'due-soon': 0, paid: 0, ok: 0 };
    bills.forEach((e) => {
      const { status } = computeBillStatus(e);
      counts[status]++;
    });

    const chips: { key: keyof typeof counts; label: string; cssClass: string }[] = [
      { key: 'past-due', label: 'Past Due',  cssClass: 'calendar-summary-chip--past-due' },
      { key: 'due-soon', label: 'Due Soon',  cssClass: 'calendar-summary-chip--due-soon' },
      { key: 'paid',     label: 'Paid',      cssClass: 'calendar-summary-chip--paid' },
      { key: 'ok',       label: 'Upcoming',  cssClass: 'calendar-summary-chip--ok' },
    ];

    chips.forEach(({ key, label, cssClass }) => {
      if (counts[key] === 0) return;
      const chip = document.createElement('div');
      chip.className = `calendar-summary-chip ${cssClass}`;
      chip.setAttribute('data-testid', `cal-summary-${key}`);
      chip.textContent = `${counts[key]} ${label}`;
      bar.appendChild(chip);
    });

    return bar;
  }

  private buildBillChip(expense: Expense): HTMLElement {
    const { status } = computeBillStatus(expense);

    const statusIcon = status === 'paid' ? '✓' : status === 'past-due' ? '⚠' : status === 'due-soon' ? '⏰' : '';
    const cssClass = `calendar-bill-chip--${status}`;

    const wrap = document.createElement('div');

    const chip = document.createElement('div');
    chip.className = `calendar-bill-chip ${cssClass}`;
    chip.setAttribute('data-testid', 'calendar-bill-chip');
    chip.setAttribute('data-expense-id', expense.id);
    chip.setAttribute('data-bill-status', status);
    chip.innerHTML = `
      ${statusIcon ? `<span class="calendar-bill-status">${statusIcon}</span>` : ''}
      <span class="calendar-bill-name" title="${expense.description}">${expense.description}</span>
      <span class="calendar-bill-amount">${fmtCents.format(expense.amount)}</span>
    `;
    wrap.appendChild(chip);

    // Show "Mark Paid" for unpaid bills
    if (status !== 'paid') {
      const markPaidBtn = document.createElement('button');
      markPaidBtn.className = 'calendar-mark-paid-btn';
      markPaidBtn.setAttribute('data-testid', 'cal-mark-paid');
      markPaidBtn.setAttribute('data-expense-id', expense.id);
      markPaidBtn.textContent = '✓ Mark Paid';
      markPaidBtn.addEventListener('click', () => this.openMarkPaidForm(expense));
      wrap.appendChild(markPaidBtn);
    }

    return wrap;
  }

  private openMarkPaidForm(expense: Expense): void {
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';
    body.innerHTML = `
      <p class="text-sm text-muted">
        How much was the actual bill for <strong>${expense.description}</strong>?
      </p>
      <div class="form-group">
        <label class="form-label" for="cal-mp-amount">Amount paid</label>
        <input id="cal-mp-amount" type="number" min="0" step="0.01"
          value="${expense.amount.toFixed(2)}" />
      </div>
    `;

    openFormModal({
      title: `Mark Paid — ${expense.description}`,
      body,
      submitLabel: 'Mark as Paid',
      onSubmit: async (close) => {
        const rawAmount = parseFloat(body.querySelector<HTMLInputElement>('#cal-mp-amount')!.value);
        if (isNaN(rawAmount) || rawAmount < 0) return;
        const paidAmount = Math.round(rawAmount * 100) / 100;
        const record = createExpensePaidRecord(expense.id, paidAmount);
        await Promise.all([
          saveExpense({ ...expense, date: Date.now() }),
          saveExpensePaidRecord(record),
        ]);
        close();
        refreshNotifier();
        await this.load();
      },
    });
  }
}
