import './calendar.css';
import { navigate } from '@/app/router';
import { makeHelpBtn } from '@/utils/helpNav';
import { getExpenses, getDebtAccounts, getDebtPayments,
         getCategories, getIncomeSources, getMembers, getExpensePaidRecords, getBankAccounts,
         saveCalendarMark, getCalendarMarksForMonth, deleteCalendarMark, deleteCalendarMarksForMonth,
         getCalendarMemosForMonth, saveCalendarMemo, createCalendarMemo, deleteCalendarMemo } from '@/db';
import { openDebtPaymentModal } from '@/components/DebtPaymentModal';
import { openExpensePaymentModal } from '@/components/ExpensePaymentModal';
import { openModal } from '@/components/Modal';
import { computeBillStatus } from '@/utils/billStatus';
import { computePaymentStatus, computeMinPayment } from '@/utils/paymentStatus';
import type { AccountPaymentStatus } from '@/utils/paymentStatus';
import { getPaydaysInMonth } from '@/utils/paydays';
import { fmtCents } from '@/utils/finance';
import type { Expense, DebtAccount, DebtPayment, ExpenseCategory, ExpensePaidRecord, BankAccount, DebtAccountType, IncomeSource, HouseholdMember, CalendarMark, CalendarMemo } from '@/types';

const DEBT_TYPE_LABEL: Record<DebtAccountType, string> = {
  card: 'Credit Card',
  mortgage: 'Mortgage',
  medical: 'Medical Debt',
  loan: 'Personal Loan',
  vehicle: 'Vehicle Loan',
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type DebtEntry = { account: DebtAccount; status: AccountPaymentStatus };

// Maps MonthPaymentStatus → 4 visual chip states
type ChipStatus = 'paid' | 'past-due' | 'due-soon' | 'ok';
function debtChipStatus(ms: AccountPaymentStatus['currentMonth']): ChipStatus {
  if (ms === 'paid' || ms === 'paid-off') return 'paid';
  if (ms === 'past-due') return 'past-due';
  if (ms === 'due-soon' || ms === 'partial') return 'due-soon';
  return 'ok';
}

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
    this.load();
    return this.container;
  }

  private async load(): Promise<void> {
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

        dayPaydays.forEach(({ source, paydayIndex }) => chipsWrap.appendChild(this.buildPaydayChip(source, paydayIndex)));
        dayOneTimeIncome.forEach((s) => chipsWrap.appendChild(this.buildOneTimeIncomeChip(s)));

        dayBills.forEach((e) => {
          const paidRec = this.expensePaidRecords.find((r) => r.expenseId === e.id);
          const chipEl = this.buildBillChip(e, paidRec);
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
          const chipEl = this.buildDebtChip(account, status, debtPaymentDateMap.get(account.id));
          if (this.activeFilter && debtChipStatus(status.currentMonth) === this.activeFilter) {
            chipEl.querySelector<HTMLElement>('.calendar-bill-chip')?.classList.add('cal-chip-filter-match');
          }
          chipsWrap.appendChild(chipEl);
        });

        dayPayments.forEach(({ payment, account }) => chipsWrap.appendChild(this.buildDebtPaymentChip(payment, account)));
        dayOneTime.forEach((e) => chipsWrap.appendChild(this.buildOneTimeExpenseChip(e)));
        cell.appendChild(chipsWrap);
      }

      const dayMemos = this.memos.get(dateKey) ?? [];
      cell.appendChild(this.buildMemoWidget(dateKey, dayMemos));

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

  private buildPaydayChip(source: IncomeSource, paydayIndex: number): HTMLElement {
    const member = this.members.find((m) => m.id === source.memberId);
    // For semimonthly sources with unequal paychecks, the second chip uses amount2
    const amount = (paydayIndex === 1 && source.amount2 != null) ? source.amount2 : source.amount;
    const chip = document.createElement('div');
    chip.className = 'calendar-payday-chip';
    chip.setAttribute('data-testid', 'calendar-payday-chip');
    chip.setAttribute('data-source-id', source.id);
    chip.style.cursor = 'pointer';
    chip.innerHTML = `
      <div class="cal-chip-title">
        <span class="cal-chip-icon">💰</span>
        <span class="cal-chip-name" title="${source.name}">${source.name}</span>
      </div>
      ${member ? `<span class="cal-chip-type">${member.name}</span>` : ''}
      <span class="cal-chip-amount">${fmtCents.format(amount)}</span>
    `;
    chip.addEventListener('click', (e) => this.chipNav(e, 'cal-focus-source', source.id, '/income'));
    return chip;
  }

  private buildOneTimeIncomeChip(source: IncomeSource): HTMLElement {
    const member = this.members.find((m) => m.id === source.memberId);
    const chip = document.createElement('div');
    chip.className = 'calendar-payday-chip';
    chip.setAttribute('data-testid', 'calendar-one-time-income-chip');
    chip.setAttribute('data-source-id', source.id);
    chip.style.cursor = 'pointer';
    chip.innerHTML = `
      <div class="cal-chip-title">
        <span class="cal-chip-icon">💵</span>
        <span class="cal-chip-name" title="${source.name}">${source.name}</span>
      </div>
      <span class="cal-chip-type">${member ? member.name : 'One-time income'}</span>
      <span class="cal-chip-amount">${fmtCents.format(source.amount)}</span>
    `;
    chip.addEventListener('click', (e) => this.chipNav(e, 'cal-focus-source', source.id, '/income'));
    return chip;
  }

  private buildBillChip(expense: Expense, paidRecord?: ExpensePaidRecord): HTMLElement {
    const { status } = computeBillStatus(expense);
    const isAutoPay = !!expense.isAutoPay;
    const category = this.categories.find((c) => c.id === expense.categoryId);
    const categoryName = category?.name ?? 'Expense';
    const chipStatus = isAutoPay ? 'ok' : status;
    const statusIcon = isAutoPay ? '🔄' : (status === 'paid' ? '✓' : status === 'past-due' ? '⚠' : status === 'due-soon' ? '⏰' : '');

    const isPaidStatus = chipStatus === 'paid';
    const displayAmount = (isPaidStatus && paidRecord) ? paidRecord.amount : expense.amount;
    const paidOnStr = isPaidStatus
      ? new Date(paidRecord?.date ?? expense.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null;

    const wrap = document.createElement('div');
    wrap.className = 'cal-chip-wrap';

    const chip = document.createElement('div');
    chip.className = `calendar-bill-chip calendar-bill-chip--${chipStatus}`;
    chip.setAttribute('data-testid', 'calendar-bill-chip');
    chip.setAttribute('data-expense-id', expense.id);
    chip.setAttribute('data-bill-status', chipStatus);
    chip.style.cursor = 'pointer';
    chip.addEventListener('click', (e) => this.chipNav(e, 'cal-focus-expense', expense.id, '/expenses'));
    chip.innerHTML = `
      <div class="cal-chip-title">
        ${statusIcon ? `<span class="cal-chip-icon">${statusIcon}</span>` : ''}
        <span class="cal-chip-name" title="${expense.description}">${expense.description}</span>
      </div>
      ${isAutoPay
        ? '<span class="cal-chip-autopay">Auto-pay</span>'
        : `<span class="cal-chip-type">${categoryName}</span>`}
      <span class="cal-chip-amount">${fmtCents.format(displayAmount)}</span>
      ${paidOnStr ? `<span class="cal-chip-paid-on">Paid ${paidOnStr}</span>` : ''}
    `;

    if (expense.url) {
      const link = document.createElement('a');
      link.className = 'cal-chip-portal-link';
      link.setAttribute('data-testid', 'cal-chip-url-link');
      link.href = expense.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = 'Open billing portal';
      link.textContent = '↗ Portal';
      chip.appendChild(link);
    }

    wrap.appendChild(chip);

    if (!isAutoPay && status !== 'paid') {
      const payBtn = document.createElement('button');
      payBtn.className = 'calendar-mark-paid-btn';
      payBtn.setAttribute('data-testid', 'cal-mark-paid');
      payBtn.setAttribute('data-expense-id', expense.id);
      payBtn.textContent = '$ Record Payment';
      payBtn.addEventListener('click', () => this.openMarkPaidForm(expense));
      wrap.appendChild(payBtn);
    }

    return wrap;
  }

  private buildOneTimeExpenseChip(expense: Expense): HTMLElement {
    const category = this.categories.find((c) => c.id === expense.categoryId);
    const categoryColor = category?.color ?? '#999';
    const categoryName = category?.name ?? 'Expense';

    const chip = document.createElement('div');
    chip.className = 'calendar-expense-chip';
    chip.setAttribute('data-testid', 'calendar-expense-chip');
    chip.setAttribute('data-expense-id', expense.id);
    chip.style.cursor = 'pointer';
    chip.addEventListener('click', (e) => this.chipNav(e, 'cal-focus-expense', expense.id, '/expenses'));
    chip.innerHTML = `
      <div class="cal-chip-title">
        <span class="cal-chip-dot-color" style="background:${categoryColor}"></span>
        <span class="cal-chip-name" title="${expense.description}">${expense.description}</span>
      </div>
      <span class="cal-chip-type">${categoryName}</span>
      <span class="cal-chip-amount">${fmtCents.format(expense.amount)}</span>
    `;

    if (expense.url) {
      const link = document.createElement('a');
      link.className = 'cal-chip-portal-link';
      link.setAttribute('data-testid', 'cal-chip-url-link');
      link.href = expense.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = 'Open billing portal';
      link.textContent = '↗ Portal';
      chip.appendChild(link);
    }

    return chip;
  }

  private buildDebtChip(account: DebtAccount, status: AccountPaymentStatus, paidDate?: number): HTMLElement {
    const chipStatus = debtChipStatus(status.currentMonth);
    const minPay = computeMinPayment(account);

    let amountLabel: string;
    let paidOnStr: string | null = null;
    if (chipStatus === 'paid') {
      amountLabel = `${fmtCents.format(status.currentMonthTotal)} paid`;
      if (paidDate != null) {
        paidOnStr = new Date(paidDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    } else {
      amountLabel = minPay != null
        ? `${fmtCents.format(minPay)} min`
        : `${fmtCents.format(account.balance)} balance`;
    }

    const statusIcon = chipStatus === 'paid' ? '✓' : chipStatus === 'past-due' ? '⚠' : chipStatus === 'due-soon' ? '⏰' : '';

    const wrap = document.createElement('div');
    wrap.className = 'cal-chip-wrap';

    const chip = document.createElement('div');
    chip.className = `calendar-bill-chip calendar-bill-chip--${chipStatus}`;
    chip.setAttribute('data-testid', 'calendar-debt-chip');
    chip.setAttribute('data-account-id', account.id);
    chip.setAttribute('data-debt-status', chipStatus);
    chip.style.cursor = 'pointer';
    chip.addEventListener('click', (e) => this.chipNav(e, 'cal-focus-account', account.id, '/debt'));
    chip.innerHTML = `
      <div class="cal-chip-title">
        ${statusIcon ? `<span class="cal-chip-icon">${statusIcon}</span>` : ''}
        <span class="cal-chip-name" title="${account.name}">${account.name}</span>
      </div>
      <span class="cal-chip-type">${DEBT_TYPE_LABEL[account.type]}</span>
      <span class="cal-chip-amount">${amountLabel}</span>
      ${paidOnStr ? `<span class="cal-chip-paid-on">Paid ${paidOnStr}</span>` : ''}
    `;

    if (account.url) {
      const link = document.createElement('a');
      link.className = 'cal-chip-portal-link';
      link.setAttribute('data-testid', 'cal-chip-url-link');
      link.href = account.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = 'Open billing portal';
      link.textContent = '↗ Portal';
      chip.appendChild(link);
    }

    wrap.appendChild(chip);

    if (chipStatus !== 'paid') {
      const payBtn = document.createElement('button');
      payBtn.className = 'calendar-mark-paid-btn';
      payBtn.setAttribute('data-testid', 'cal-record-payment');
      payBtn.setAttribute('data-account-id', account.id);
      payBtn.textContent = '$ Record Payment';
      payBtn.addEventListener('click', () => this.openRecordPaymentForm(account, minPay));
      wrap.appendChild(payBtn);
    }

    return wrap;
  }

  private buildDebtPaymentChip(payment: DebtPayment, account: DebtAccount): HTMLElement {
    const chip = document.createElement('div');
    chip.className = 'calendar-payment-chip';
    chip.setAttribute('data-testid', 'calendar-payment-chip');
    chip.setAttribute('data-payment-id', payment.id);
    chip.style.cursor = 'pointer';
    chip.addEventListener('click', (e) => this.chipNav(e, 'cal-focus-account', account.id, '/debt'));
    chip.innerHTML = `
      <div class="cal-chip-title">
        <span class="cal-chip-icon">💸</span>
        <span class="cal-chip-name" title="${account.name}">${account.name}</span>
      </div>
      <span class="cal-chip-type">${payment.type === 'extra' ? 'Extra payment' : 'Payment made'}</span>
      <span class="cal-chip-amount">${fmtCents.format(payment.amount)}</span>
    `;
    return chip;
  }

  private buildMemoWidget(dateKey: string, dayMemos: CalendarMemo[]): HTMLElement {
    const widget = document.createElement('div');
    widget.className = 'cal-memo-widget';

    const btn = document.createElement('button');
    const count = dayMemos.length;
    btn.className = `cal-memo-btn${count === 0 ? ' cal-memo-btn--empty' : ''}`;
    if (count === 2) btn.dataset['stacked'] = '2';
    if (count >= 3) btn.dataset['stacked'] = '3';
    btn.setAttribute('aria-label', count > 0 ? `${count} note${count > 1 ? 's' : ''}` : 'Add note');
    btn.setAttribute('title', count > 0 ? `${count} note${count > 1 ? 's' : ''}` : 'Add note');
    btn.setAttribute('data-testid', 'cal-memo-btn');
    btn.innerHTML = count === 0
      ? '+'
      : count === 1
        ? '&#9998;'
        : `&#9998;<span class="cal-memo-count-badge">${count}</span>`;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openMemoModal(dateKey, dayMemos);
    });

    widget.appendChild(btn);
    return widget;
  }

  private openMemoModal(dateKey: string, initialMemos: CalendarMemo[]): void {
    let memos = [...initialMemos];
    let currentIndex = 0;

    const [y, mo, d] = dateKey.split('-').map(Number) as [number, number, number];
    const dateLabel = new Date(y, mo - 1, d, 12).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });

    const content = document.createElement('div');
    content.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';

    // ── Pager ──────────────────────────────────────────────────────────────
    const pagerSection = document.createElement('div');
    pagerSection.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-3)';

    const pagerBar = document.createElement('div');
    pagerBar.className = 'cal-memo-pager';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'cal-memo-nav-btn';
    prevBtn.textContent = '←';
    prevBtn.setAttribute('aria-label', 'Previous note');
    prevBtn.setAttribute('data-testid', 'cal-memo-prev');

    const pagerLabel = document.createElement('span');
    pagerLabel.className = 'cal-memo-pager-label';
    pagerLabel.setAttribute('data-testid', 'cal-memo-pager-label');

    const nextBtn = document.createElement('button');
    nextBtn.className = 'cal-memo-nav-btn';
    nextBtn.textContent = '→';
    nextBtn.setAttribute('aria-label', 'Next note');
    nextBtn.setAttribute('data-testid', 'cal-memo-next');

    pagerBar.appendChild(prevBtn);
    pagerBar.appendChild(pagerLabel);
    pagerBar.appendChild(nextBtn);

    const noteCard = document.createElement('div');
    noteCard.className = 'cal-memo-note-card';
    noteCard.setAttribute('data-testid', 'cal-memo-note-card');

    const noteText = document.createElement('p');
    noteText.className = 'cal-memo-note-text';
    noteText.setAttribute('data-testid', 'cal-memo-note-text');
    noteCard.appendChild(noteText);

    const noteMeta = document.createElement('div');
    noteMeta.className = 'cal-memo-note-meta';

    const metaInfo = document.createElement('span');
    metaInfo.className = 'cal-memo-meta-info';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'cal-memo-delete-btn';
    deleteBtn.setAttribute('data-testid', 'cal-memo-delete-btn');
    deleteBtn.textContent = 'Delete';

    noteMeta.appendChild(metaInfo);
    noteMeta.appendChild(deleteBtn);

    pagerSection.appendChild(pagerBar);
    pagerSection.appendChild(noteCard);
    pagerSection.appendChild(noteMeta);

    // ── Divider ────────────────────────────────────────────────────────────
    const divider = document.createElement('hr');
    divider.className = 'cal-memo-divider';

    // ── Add note section ───────────────────────────────────────────────────
    const addSection = document.createElement('div');
    addSection.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-3)';

    const addLabel = document.createElement('label');
    addLabel.className = 'form-label';

    const textarea = document.createElement('textarea');
    textarea.rows = 3;
    textarea.maxLength = 500;
    textarea.placeholder = 'Write a note for yourself or a family member...';
    textarea.style.cssText = 'resize:vertical;min-height:72px';
    textarea.setAttribute('data-testid', 'cal-memo-textarea');

    const addRow = document.createElement('div');
    addRow.style.cssText = 'display:flex;align-items:center;gap:var(--space-3)';

    if (this.members.length > 0) {
      const fromLabel = document.createElement('span');
      fromLabel.style.cssText = 'font-size:var(--text-sm);color:var(--color-text-muted);white-space:nowrap';
      fromLabel.textContent = 'From:';
      const memberSel = document.createElement('select');
      memberSel.id = 'cal-memo-member';
      memberSel.style.flex = '1';
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '— No author —';
      memberSel.appendChild(noneOpt);
      this.members.forEach((m) => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        memberSel.appendChild(opt);
      });
      addRow.appendChild(fromLabel);
      addRow.appendChild(memberSel);
    }

    const addNoteBtn = document.createElement('button');
    addNoteBtn.className = 'btn btn-primary';
    addNoteBtn.style.whiteSpace = 'nowrap';
    addNoteBtn.setAttribute('data-testid', 'cal-memo-add-btn');
    addNoteBtn.textContent = 'Add Note';
    addRow.appendChild(addNoteBtn);

    const errorEl = document.createElement('p');
    errorEl.className = 'form-error';
    errorEl.style.display = 'none';

    addSection.appendChild(addLabel);
    addSection.appendChild(textarea);
    addSection.appendChild(addRow);
    addSection.appendChild(errorEl);

    // ── Pager refresh ──────────────────────────────────────────────────────
    const refreshPager = () => {
      if (memos.length === 0) {
        pagerSection.style.display = 'none';
        divider.style.display = 'none';
        addLabel.textContent = 'Write a note';
        return;
      }
      pagerSection.style.display = '';
      divider.style.display = '';
      addLabel.textContent = 'Add another note';

      const memo = memos[currentIndex]!;
      pagerLabel.textContent = `Note ${currentIndex + 1} of ${memos.length}`;
      noteText.textContent = memo.text;

      const member = this.members.find((m) => m.id === memo.memberId);
      const authorStr = member ? `— ${member.name}` : '';
      const dateStr = new Date(memo.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      metaInfo.textContent = [authorStr, dateStr].filter(Boolean).join(' · ');

      prevBtn.disabled = currentIndex === 0;
      nextBtn.disabled = currentIndex === memos.length - 1;
    };

    prevBtn.addEventListener('click', () => { currentIndex--; refreshPager(); });
    nextBtn.addEventListener('click', () => { currentIndex++; refreshPager(); });

    deleteBtn.addEventListener('click', async () => {
      const memo = memos[currentIndex]!;
      await deleteCalendarMemo(memo.id);
      memos = memos.filter((m) => m.id !== memo.id);
      if (currentIndex >= memos.length) currentIndex = Math.max(0, memos.length - 1);
      if (memos.length === 0) this.memos.delete(dateKey);
      else this.memos.set(dateKey, [...memos]);
      this.updateMemoWidget(dateKey, memos);
      refreshPager();
    });

    addNoteBtn.addEventListener('click', async () => {
      const text = textarea.value.trim();
      if (!text) {
        errorEl.textContent = '⚠ Write something first.';
        errorEl.style.display = '';
        return;
      }
      errorEl.style.display = 'none';
      const memberSel = content.querySelector<HTMLSelectElement>('#cal-memo-member');
      const memberId = memberSel?.value || undefined;
      const memo = memberId
        ? createCalendarMemo(dateKey, text, memberId)
        : createCalendarMemo(dateKey, text);
      await saveCalendarMemo(memo);
      memos = [...memos, memo];
      currentIndex = memos.length - 1;
      this.memos.set(dateKey, [...memos]);
      this.updateMemoWidget(dateKey, memos);
      textarea.value = '';
      refreshPager();
    });

    content.appendChild(pagerSection);
    content.appendChild(divider);
    content.appendChild(addSection);

    refreshPager();

    openModal({ title: `Notes — ${dateLabel}`, content });
  }

  private updateMemoWidget(dateKey: string, memos: CalendarMemo[]): void {
    const day = parseInt(dateKey.split('-')[2]!, 10);
    const cell = this.container.querySelector<HTMLElement>(`[data-day="${day}"]`);
    if (!cell) return;
    const existing = cell.querySelector('.cal-memo-widget');
    const newWidget = this.buildMemoWidget(dateKey, memos);
    if (existing) {
      existing.replaceWith(newWidget);
    } else {
      cell.appendChild(newWidget);
    }
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
