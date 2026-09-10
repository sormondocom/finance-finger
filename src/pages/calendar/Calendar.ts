import './calendar.css';
import { navigate } from '@/app/router';
import { makeHelpBtn } from '@/utils/helpNav';
import { showPageError } from '@/utils/errorUI';
import { getExpenses, getDebtAccounts, getDebtPayments,
         getCategories, getIncomeSources, getMembers, getExpensePaidRecords, getBankAccounts,
         saveCalendarMark, getCalendarMarksForMonth, deleteCalendarMark, deleteCalendarMarksForMonth,
         getCalendarMemosForMonth } from '@/db';
import { openDebtPaymentModal } from '@/components/DebtPaymentModal';
import { openExpensePaymentModal } from '@/components/ExpensePaymentModal';
import { computeBillStatus } from '@/utils/billStatus';
import { computePaymentStatus } from '@/utils/paymentStatus';
import type { AccountPaymentStatus } from '@/utils/paymentStatus';
import { getPaydaysInMonth } from '@/utils/paydays';
import {
  buildPaydayChip, buildOneTimeIncomeChip, buildBillChip,
  buildOneTimeExpenseChip, buildDebtChip, buildDebtPaymentChip,
  debtChipStatus, type CalendarChipContext,
} from './CalendarChips';
import { buildMemoWidget, type CalendarMemoContext } from './CalendarMemo';
import type { Expense, DebtAccount, DebtPayment, ExpenseCategory, ExpensePaidRecord, BankAccount, IncomeSource, HouseholdMember, CalendarMark, CalendarMemo } from '@/types';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type DebtEntry = { account: DebtAccount; status: AccountPaymentStatus };

export class CalendarPage {
  private year: number;
  private month: number; // 0-indexed
  private expenses: Expense[] = [];
  private debtEntries: DebtEntry[] = [];
  private categories: ExpenseCategory[] = [];
  private incomeSources: IncomeSource[] = [];
  private oneTimeIncomeSources: IncomeSource[] = [];
  private members: HouseholdMember[] = [];
  private cardAccounts: DebtAccount[] = [];
  private allDebtPayments: DebtPayment[] = [];
  private debtAccounts: DebtAccount[] = [];
  private expensePaidRecords: ExpensePaidRecord[] = [];
  private bankAccounts: BankAccount[] = [];
  private memos: Map<string, CalendarMemo[]> = new Map();
  private container!: HTMLElement;
  private marks: Map<string, string> = new Map();
  private paintMode = false;
  private activeColor = '#22c55e';
  private isPainting = false;
  private paintAction: 'paint' | 'erase' = 'paint';
  private muHandler: (() => void) | null = null;
  private activeFilter: 'past-due' | 'due-soon' | 'paid' | 'ok' | null = null;

  constructor() {
    const now = new Date();
    this.year = now.getFullYear();
    this.month = now.getMonth();
  }

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'calendar-page';
    void this.load();
    return this.container;
  }

  private async load(): Promise<void> {
    try {
    const [expenses, accounts, allPayments, categories, sources, members, paidRecords, bankAccounts, memoList] = await Promise.all([
      getExpenses(),
      getDebtAccounts(),
      getDebtPayments(),
      getCategories(),
      getIncomeSources(),
      getMembers(),
      getExpensePaidRecords(),
      getBankAccounts(),
      getCalendarMemosForMonth(this.year, this.month),
    ]);
    this.categories = categories;
    this.expenses = expenses;
    this.members = members;
    this.debtAccounts = accounts;
    this.allDebtPayments = allPayments;
    this.expensePaidRecords = paidRecords;
    this.bankAccounts = bankAccounts;
    this.cardAccounts = accounts.filter((a) => a.type === 'card');
    // Include all active recurring sources. For sources without an explicit
    // paydayRef (created before the income form started defaulting it), use
    // today as the reference so paydays still land on a sensible day.
    const fallbackRef = Date.now();
    this.incomeSources = sources
      .filter((s) => s.active && s.frequency !== 'once')
      .map((s) => s.paydayRef ? s : { ...s, paydayRef: fallbackRef });
    this.oneTimeIncomeSources = sources.filter((s) => s.active && s.frequency === 'once' && s.date != null);
    this.debtEntries = accounts
      .filter((a) => a.dueDay != null && a.balance > 0)
      .map((a) => ({
        account: a,
        status: computePaymentStatus(a, allPayments.filter((p) => p.accountId === a.id)),
      }));
    this.memos = new Map();
    for (const m of memoList) {
      const arr = this.memos.get(m.date) ?? [];
      arr.push(m);
      this.memos.set(m.date, arr);
    }
    await this.loadMarks();
    this.paint();
    } catch (err) {
      showPageError(this.container, err instanceof Error ? err.message : 'Failed to load calendar', () => { void this.load(); });
    }
  }

  private async loadMemos(): Promise<void> {
    const list = await getCalendarMemosForMonth(this.year, this.month);
    this.memos = new Map();
    for (const m of list) {
      const arr = this.memos.get(m.date) ?? [];
      arr.push(m);
      this.memos.set(m.date, arr);
    }
  }

  private async loadMarks(): Promise<void> {
    const markList = await getCalendarMarksForMonth(this.year, this.month);
    this.marks = new Map(markList.map((m: CalendarMark) => [m.date, m.color]));
  }

  private paint(): void {
    if (this.muHandler) {
      document.removeEventListener('mouseup', this.muHandler);
      this.muHandler = null;
    }
    this.container.innerHTML = '';

    // For quarterly bills, only include them in the month they're actually due.
    const calRef = new Date(this.year, this.month, 15);
    const bills = this.expenses.filter((e) => {
      if (!e.recurring || !e.dueDay) return false;
      if (e.recurringFrequency === 'quarterly' || e.recurringFrequency === 'annual') {
        return computeBillStatus(e, calRef).dueDayThisMonth !== null;
      }
      return true;
    });

    // One-time expenses and income for this month
    const monthStart = new Date(this.year, this.month, 1).getTime();
    const monthEnd = new Date(this.year, this.month + 1, 1).getTime();
    const oneTimeExpenses = this.expenses.filter(
      (e) => !e.recurring && e.date >= monthStart && e.date < monthEnd,
    );
    const oneTimeIncomeThisMonth = this.oneTimeIncomeSources.filter(
      (s) => s.date! >= monthStart && s.date! < monthEnd,
    );

    // Group one-time expenses by day
    const oneTimeByDay = new Map<number, Expense[]>();
    oneTimeExpenses.forEach((e) => {
      const day = new Date(e.date).getDate();
      const arr = oneTimeByDay.get(day) ?? [];
      arr.push(e);
      oneTimeByDay.set(day, arr);
    });

    // Group one-time income by day
    const oneTimeIncomeByDay = new Map<number, IncomeSource[]>();
    oneTimeIncomeThisMonth.forEach((s) => {
      const day = new Date(s.date!).getDate();
      const arr = oneTimeIncomeByDay.get(day) ?? [];
      arr.push(s);
      oneTimeIncomeByDay.set(day, arr);
    });

    // Build payday map: day → list of { source, paydayIndex }.
    // paydayIndex tracks which paycheck this is (0 = first, 1 = second) so
    // semimonthly sources with unequal paychecks can show the right amount.
    const paydaysByDay = new Map<number, { source: IncomeSource; paydayIndex: number }[]>();
    this.incomeSources.forEach((s) => {
      getPaydaysInMonth(s, this.year, this.month).forEach((d, i) => {
        const arr = paydaysByDay.get(d) ?? [];
        arr.push({ source: s, paydayIndex: i });
        paydaysByDay.set(d, arr);
      });
    });

    // Group recorded debt payments for this month by day
    const paymentsThisMonth = this.allDebtPayments.filter(
      (p) => p.date >= monthStart && p.date < monthEnd,
    );
    const paymentsByDay = new Map<number, { payment: DebtPayment; account: DebtAccount }[]>();
    paymentsThisMonth.forEach((p) => {
      const account = this.debtAccounts.find((a) => a.id === p.accountId);
      if (!account) return;
      const day = new Date(p.date).getDate();
      const arr = paymentsByDay.get(day) ?? [];
      arr.push({ payment: p, account });
      paymentsByDay.set(day, arr);
    });

    // Most recent payment date per account in a 45-day window (captures pre-due-date payments from prior month)
    const debtBillingWindowStart = monthStart - 14 * 24 * 60 * 60 * 1000;
    const debtPaymentDateMap = new Map<string, number>();
    this.allDebtPayments
      .filter((p) => p.date >= debtBillingWindowStart && p.date < monthEnd)
      .forEach((p) => {
        const ex = debtPaymentDateMap.get(p.accountId);
        if (ex == null || p.date > ex) debtPaymentDateMap.set(p.accountId, p.date);
      });

    const hasAny = bills.length > 0 || this.debtEntries.length > 0 ||
                   paydaysByDay.size > 0 || oneTimeExpenses.length > 0 ||
                   oneTimeIncomeThisMonth.length > 0 || paymentsByDay.size > 0;

    // ── Page header ──────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'calendar-header';

    const titleWrap = document.createElement('div');
    titleWrap.innerHTML = `
      <h1 class="font-serif">Payment Calendar</h1>
      <p class="text-muted text-sm">See when your recurring bills and debt payments land each month.</p>
    `;
    titleWrap.querySelector('h1')?.appendChild(makeHelpBtn('calendar'));
    header.appendChild(titleWrap);

    // Month navigation
    const monthNav = document.createElement('div');
    monthNav.className = 'calendar-month-nav';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'calendar-nav-btn';
    prevBtn.setAttribute('aria-label', 'Previous month');
    prevBtn.setAttribute('data-testid', 'cal-prev');
    prevBtn.innerHTML = '&#8249;';
    prevBtn.addEventListener('click', async () => {
      if (this.month === 0) { this.month = 11; this.year--; }
      else { this.month--; }
      await Promise.all([this.loadMarks(), this.loadMemos()]);
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
    nextBtn.addEventListener('click', async () => {
      if (this.month === 11) { this.month = 0; this.year++; }
      else { this.month++; }
      await Promise.all([this.loadMarks(), this.loadMemos()]);
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
      <div class="legend-item"><span class="legend-dot" style="background:var(--ff-gold)"></span>Payday</div>
      <div class="legend-item"><span class="legend-dot" style="background:#0d9488"></span>Payment Made</div>
      <div class="legend-item"><span class="legend-dot" style="background:var(--color-border)"></span>One-time</div>
    `;
    header.appendChild(legend);

    this.container.appendChild(header);

    if (!hasAny) {
      const empty = document.createElement('div');
      empty.className = 'card calendar-empty';
      empty.setAttribute('data-testid', 'calendar-empty');
      empty.innerHTML = `
        <span class="calendar-empty-icon">📅</span>
        <h3>No bills, expenses, debt payments, or paydays</h3>
        <p>Add expenses to see them here. Set a due day on a recurring expense or debt account to enable payment tracking.</p>
      `;
      this.container.appendChild(empty);
    } else {
      // ── Status summary bar ─────────────────────────────────────────────
      this.container.appendChild(this.buildSummaryBar(bills));

      // ── Paint toolbar ──────────────────────────────────────────────────
      this.container.appendChild(this.buildPaintToolbar());
    }

    // ── Calendar grid ────────────────────────────────────────────────────
    const gridWrap = document.createElement('div');
    gridWrap.className = 'calendar-grid-wrap';

    const grid = document.createElement('div');
    grid.className = `calendar-grid${this.paintMode ? ' calendar-grid--paint-mode' : ''}`;
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

    // Group bills by clamped due day
    const billsByDay = new Map<number, Expense[]>();
    bills.forEach((e) => {
      const dueDay = Math.min(e.dueDay!, daysInMonth);
      const arr = billsByDay.get(dueDay) ?? [];
      arr.push(e);
      billsByDay.set(dueDay, arr);
    });

    // Group debt accounts by effective due day — skip debts not due this calendar month
    // (e.g. nextDueDateMs already advanced to a future month means no payment owed now)
    const debtByDay = new Map<number, DebtEntry[]>();
    this.debtEntries.forEach((entry) => {
      if (!entry.status.dueDayThisMonth) return;
      const dueDay = entry.status.dueDayThisMonth.getDate();
      const arr = debtByDay.get(dueDay) ?? [];
      arr.push(entry);
      debtByDay.set(dueDay, arr);
    });

    const chipCtx: CalendarChipContext = {
      members: this.members,
      categories: this.categories,
      onChipNav: (e, sessionKey, id, route) => this.chipNav(e, sessionKey, id, route),
      onMarkPaid: (expense) => this.openMarkPaidForm(expense),
      onRecordPayment: (account, minPay) => this.openRecordPaymentForm(account, minPay),
    };
    const memoCtx: CalendarMemoContext = {
      members: this.members,
      memos: this.memos,
      container: this.container,
    };

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

      // Paint mark
      const dateKey = `${this.year}-${String(this.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const markColor = this.marks.get(dateKey);
      if (markColor) {
        cell.classList.add('calendar-cell--marked');
        cell.style.setProperty('--cell-mark-color', markColor);
      }
      if (this.paintMode) {
        cell.classList.add('calendar-cell--paintable');
        cell.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.isPainting = true;
          this.paintAction = this.marks.get(dateKey) === this.activeColor ? 'erase' : 'paint';
          void this.applyMarkToggle(day, dateKey);
        });
        cell.addEventListener('mouseenter', () => {
          if (this.isPainting) void this.applyMarkToggle(day, dateKey);
        });
      }

      const dayBills       = billsByDay.get(day) ?? [];
      const dayDebts       = debtByDay.get(day) ?? [];
      const dayPaydays     = paydaysByDay.get(day) ?? [];
      const dayOneTimeIncome = oneTimeIncomeByDay.get(day) ?? [];
      const dayOneTime     = oneTimeByDay.get(day) ?? [];
      const dayPayments    = paymentsByDay.get(day) ?? [];

      if (dayBills.length > 0 || dayDebts.length > 0 || dayPaydays.length > 0 ||
          dayOneTime.length > 0 || dayOneTimeIncome.length > 0 || dayPayments.length > 0) {
        const chipsWrap = document.createElement('div');
        chipsWrap.className = 'calendar-bills';

        // Days before today in the current month cannot be "Upcoming"
        const isPastDay = isCurrentYearMonth && day < today.getDate();

        dayPaydays.forEach(({ source, paydayIndex }) => chipsWrap.appendChild(buildPaydayChip(source, paydayIndex, chipCtx)));
        dayOneTimeIncome.forEach((s) => chipsWrap.appendChild(buildOneTimeIncomeChip(s, chipCtx)));

        dayBills.forEach((e) => {
          const paidRec = this.expensePaidRecords.find((r) => r.expenseId === e.id);
          const chipEl = buildBillChip(e, paidRec, chipCtx);
          if (this.activeFilter) {
            const { status } = computeBillStatus(e);
            const chipStatus = e.isAutoPay ? 'ok' : status;
            if (chipStatus === this.activeFilter && !(chipStatus === 'ok' && isPastDay)) {
              chipEl.querySelector<HTMLElement>('.calendar-bill-chip')?.classList.add('cal-chip-filter-match');
            }
          }
          chipsWrap.appendChild(chipEl);
        });

        dayDebts.forEach(({ account, status }) => {
          const chipEl = buildDebtChip(account, status, debtPaymentDateMap.get(account.id), chipCtx);
          if (this.activeFilter && debtChipStatus(status.currentMonth) === this.activeFilter) {
            chipEl.querySelector<HTMLElement>('.calendar-bill-chip')?.classList.add('cal-chip-filter-match');
          }
          chipsWrap.appendChild(chipEl);
        });

        dayPayments.forEach(({ payment, account }) => chipsWrap.appendChild(buildDebtPaymentChip(payment, account, chipCtx)));
        dayOneTime.forEach((e) => chipsWrap.appendChild(buildOneTimeExpenseChip(e, chipCtx)));
        cell.appendChild(chipsWrap);
      }

      const dayMemos = this.memos.get(dateKey) ?? [];
      cell.appendChild(buildMemoWidget(dateKey, dayMemos, memoCtx));

      grid.appendChild(cell);
    }

    gridWrap.appendChild(grid);
    this.container.appendChild(gridWrap);

    if (this.paintMode) {
      this.muHandler = () => { this.isPainting = false; };
      document.addEventListener('mouseup', this.muHandler);
    }
  }

  private chipNav(e: MouseEvent, sessionKey: string, id: string, route: '/expenses' | '/income' | '/debt'): void {
    if ((e.target as HTMLElement).closest('a, button')) return;
    sessionStorage.setItem(sessionKey, id);
    navigate(route);
  }

  private buildPaintToolbar(): HTMLElement {
    const COLORS = [
      { color: '#22c55e', label: 'Green' },
      { color: '#3b82f6', label: 'Blue' },
      { color: '#eab308', label: 'Amber' },
      { color: '#ef4444', label: 'Red' },
      { color: '#a855f7', label: 'Purple' },
    ];

    const toolbar = document.createElement('div');
    toolbar.className = 'paint-toolbar';
    toolbar.setAttribute('data-testid', 'paint-toolbar');

    const toggleBtn = document.createElement('button');
    toggleBtn.className = `paint-mode-btn${this.paintMode ? ' paint-mode-btn--active' : ''}`;
    toggleBtn.setAttribute('data-testid', 'paint-mode-btn');
    toggleBtn.textContent = this.paintMode ? '✦ Marking' : '✦ Mark Days';
    toggleBtn.addEventListener('click', () => {
      this.paintMode = !this.paintMode;
      this.isPainting = false;
      this.paint();
    });
    toolbar.appendChild(toggleBtn);

    if (this.paintMode) {
      const palette = document.createElement('div');
      palette.className = 'paint-palette';
      palette.setAttribute('data-testid', 'paint-palette');

      COLORS.forEach(({ color, label }) => {
        const swatch = document.createElement('button');
        swatch.className = `paint-color-btn${color === this.activeColor ? ' paint-color-btn--active' : ''}`;
        swatch.style.setProperty('--swatch-color', color);
        swatch.setAttribute('aria-label', label);
        swatch.setAttribute('title', label);
        swatch.addEventListener('click', () => {
          this.activeColor = color;
          this.paint();
        });
        palette.appendChild(swatch);
      });

      toolbar.appendChild(palette);

      const clearBtn = document.createElement('button');
      clearBtn.className = 'paint-clear-btn';
      clearBtn.setAttribute('data-testid', 'paint-clear-month');
      clearBtn.textContent = 'Clear Month';
      clearBtn.addEventListener('click', async () => {
        const label = new Date(this.year, this.month, 1)
          .toLocaleString('default', { month: 'long', year: 'numeric' });
        if (!confirm(`Clear all marks for ${label}?`)) return;
        await deleteCalendarMarksForMonth(this.year, this.month);
        this.marks.clear();
        this.paint();
      });
      toolbar.appendChild(clearBtn);
    }

    return toolbar;
  }

  private async applyMarkToggle(day: number, dateKey: string): Promise<void> {
    if (this.paintAction === 'erase') {
      if (!this.marks.has(dateKey)) return;
      this.marks.delete(dateKey);
      await deleteCalendarMark(dateKey);
      this.updateCellMarkDOM(day, null);
    } else {
      if (this.marks.get(dateKey) === this.activeColor) return;
      this.marks.set(dateKey, this.activeColor);
      await saveCalendarMark({ date: dateKey, color: this.activeColor });
      this.updateCellMarkDOM(day, this.activeColor);
    }
  }

  private updateCellMarkDOM(day: number, color: string | null): void {
    const cell = this.container.querySelector<HTMLElement>(`[data-day="${day}"]`);
    if (!cell) return;
    if (color) {
      cell.classList.add('calendar-cell--marked');
      cell.style.setProperty('--cell-mark-color', color);
    } else {
      cell.classList.remove('calendar-cell--marked');
      cell.style.removeProperty('--cell-mark-color');
    }
  }

  private buildSummaryBar(bills: Expense[]): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'calendar-summary';
    bar.setAttribute('data-testid', 'calendar-summary-bar');

    const counts = { 'past-due': 0, 'due-soon': 0, paid: 0, ok: 0 };

    const now = new Date();
    const todayDate = now.getDate();
    const isCurrentYearMonth = now.getFullYear() === this.year && now.getMonth() === this.month;
    const daysInMonthForCount = new Date(this.year, this.month + 1, 0).getDate();

    bills.forEach((e) => {
      const { status } = computeBillStatus(e);
      const chipStatus = e.isAutoPay ? 'ok' : status;
      const dueDay = Math.min(e.dueDay!, daysInMonthForCount);
      // Don't count 'ok' (Upcoming) for bills whose due day has already passed this month
      if (chipStatus === 'ok' && isCurrentYearMonth && dueDay < todayDate) return;
      counts[chipStatus]++;
    });

    this.debtEntries.forEach(({ status }) => {
      if (!status.dueDayThisMonth) return;
      counts[debtChipStatus(status.currentMonth)]++;
    });

    const chips: { key: keyof typeof counts; label: string; cssClass: string; testid: string }[] = [
      { key: 'past-due', label: 'Past Due',  cssClass: 'calendar-summary-chip--past-due', testid: 'cal-summary-past-due' },
      { key: 'due-soon', label: 'Due Soon',  cssClass: 'calendar-summary-chip--due-soon', testid: 'cal-summary-due-soon' },
      { key: 'paid',     label: 'Paid',      cssClass: 'calendar-summary-chip--paid',     testid: 'cal-summary-paid' },
      { key: 'ok',       label: 'Upcoming',  cssClass: 'calendar-summary-chip--ok',       testid: 'cal-summary-ok' },
    ];

    chips.forEach(({ key, label, cssClass, testid }) => {
      if (counts[key] === 0) return;
      const isActive = this.activeFilter === key;
      const chip = document.createElement('div');
      chip.className = `calendar-summary-chip ${cssClass}${isActive ? ' calendar-summary-chip--active' : ''}`;
      chip.setAttribute('data-testid', testid);
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      chip.setAttribute('title', isActive ? `Remove ${label} filter` : `Highlight ${label} days`);
      chip.textContent = `${counts[key]} ${label}`;
      chip.addEventListener('click', () => {
        this.activeFilter = isActive ? null : key;
        this.paint();
      });
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.activeFilter = isActive ? null : key;
          this.paint();
        }
      });
      bar.appendChild(chip);
    });

    if (this.activeFilter !== null) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'calendar-filter-clear-btn';
      clearBtn.setAttribute('data-testid', 'cal-filter-clear');
      clearBtn.textContent = '✕ Clear Filter';
      clearBtn.addEventListener('click', () => {
        this.activeFilter = null;
        this.paint();
      });
      bar.appendChild(clearBtn);
    }

    return bar;
  }

  private openMarkPaidForm(expense: Expense): void {
    openExpensePaymentModal({
      expense,
      bankAccounts: this.bankAccounts,
      cardAccounts: this.cardAccounts,
      allPaidRecords: this.expensePaidRecords,
      onSave: () => this.load(),
    });
  }

  private openRecordPaymentForm(account: DebtAccount, _minPay?: number): void {
    openDebtPaymentModal({
      account,
      bankAccounts: this.bankAccounts,
      onSave: () => this.load(),
    });
  }
}
