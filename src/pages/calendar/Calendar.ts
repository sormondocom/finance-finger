import './calendar.css';
import { navigate } from '@/app/router';
import { getExpenses, saveExpense, saveExpensePaidRecord, createExpensePaidRecord,
         getDebtAccounts, getDebtPayments, saveDebtPayment, createDebtPayment,
         getCategories, getIncomeSources, getMembers,
         saveCardCharge, deleteCardCharge, createCardCharge, findChargeByExpenseId } from '@/db';
import { openFormModal } from '@/components/Modal';
import { computeBillStatus } from '@/utils/billStatus';
import { computePaymentStatus, computeMinPayment } from '@/utils/paymentStatus';
import type { AccountPaymentStatus } from '@/utils/paymentStatus';
import { getPaydaysInMonth } from '@/utils/paydays';
import { refreshNotifier } from '@/utils/notifier';
import { fmtCents } from '@/utils/finance';
import type { Expense, DebtAccount, DebtPayment, ExpenseCategory, DebtAccountType, IncomeSource, HouseholdMember } from '@/types';

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
    const [expenses, accounts, allPayments, categories, sources, members] = await Promise.all([
      getExpenses(),
      getDebtAccounts(),
      getDebtPayments(),
      getCategories(),
      getIncomeSources(),
      getMembers(),
    ]);
    this.categories = categories;
    this.expenses = expenses;
    this.members = members;
    this.debtAccounts = accounts;
    this.allDebtPayments = allPayments;
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
    this.paint();
  }

  private paint(): void {
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
      return;
    }

    // ── Status summary bar ───────────────────────────────────────────────
    this.container.appendChild(this.buildSummaryBar(bills));

    // ── Calendar grid ────────────────────────────────────────────────────
    const gridWrap = document.createElement('div');
    gridWrap.className = 'calendar-grid-wrap';

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

    // Group bills by clamped due day
    const billsByDay = new Map<number, Expense[]>();
    bills.forEach((e) => {
      const dueDay = Math.min(e.dueDay!, daysInMonth);
      const arr = billsByDay.get(dueDay) ?? [];
      arr.push(e);
      billsByDay.set(dueDay, arr);
    });

    // Group debt accounts by clamped due day
    const debtByDay = new Map<number, DebtEntry[]>();
    this.debtEntries.forEach((entry) => {
      const dueDay = Math.min(entry.account.dueDay!, daysInMonth);
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
        dayPaydays.forEach(({ source, paydayIndex }) => chipsWrap.appendChild(this.buildPaydayChip(source, paydayIndex)));
        dayOneTimeIncome.forEach((s) => chipsWrap.appendChild(this.buildOneTimeIncomeChip(s)));
        dayBills.forEach((e) => chipsWrap.appendChild(this.buildBillChip(e)));
        dayDebts.forEach(({ account, status }) => chipsWrap.appendChild(this.buildDebtChip(account, status)));
        dayPayments.forEach(({ payment, account }) => chipsWrap.appendChild(this.buildDebtPaymentChip(payment, account)));
        dayOneTime.forEach((e) => chipsWrap.appendChild(this.buildOneTimeExpenseChip(e)));
        cell.appendChild(chipsWrap);
      }

      grid.appendChild(cell);
    }

    gridWrap.appendChild(grid);
    this.container.appendChild(gridWrap);
  }

  private chipNav(e: MouseEvent, sessionKey: string, id: string, route: '/expenses' | '/income' | '/debt'): void {
    if ((e.target as HTMLElement).closest('a, button')) return;
    sessionStorage.setItem(sessionKey, id);
    navigate(route);
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

    this.debtEntries.forEach(({ status }) => {
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
      const chip = document.createElement('div');
      chip.className = `calendar-summary-chip ${cssClass}`;
      chip.setAttribute('data-testid', testid);
      chip.textContent = `${counts[key]} ${label}`;
      bar.appendChild(chip);
    });

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

  private buildBillChip(expense: Expense): HTMLElement {
    const { status } = computeBillStatus(expense);
    const isAutoPay = !!expense.isAutoPay;
    const category = this.categories.find((c) => c.id === expense.categoryId);
    const categoryName = category?.name ?? 'Expense';
    const chipStatus = isAutoPay ? 'ok' : status;
    const statusIcon = isAutoPay ? '🔄' : (status === 'paid' ? '✓' : status === 'past-due' ? '⚠' : status === 'due-soon' ? '⏰' : '');

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

  private buildDebtChip(account: DebtAccount, status: AccountPaymentStatus): HTMLElement {
    const chipStatus = debtChipStatus(status.currentMonth);
    const minPay = computeMinPayment(account);
    const amountLabel = minPay != null
      ? `${fmtCents.format(minPay)} min`
      : `${fmtCents.format(account.balance)} balance`;
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

  private openMarkPaidForm(expense: Expense): void {
    const isFixed = !!expense.isFixedAmount;
    const currFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
    const today = new Date().toISOString().split('T')[0];

    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';
    body.innerHTML = `
      <p class="text-sm text-muted">
        How much was the actual bill for <strong>${expense.description}</strong>?
      </p>
      <div class="form-group">
        <label class="form-label" for="cal-mp-amount">Actual amount</label>
        <input id="cal-mp-amount" type="number" min="0" step="0.01"
          value="${expense.amount.toFixed(2)}" ${isFixed ? 'readonly style="opacity:0.7"' : ''} />
        ${isFixed
          ? '<span class="form-hint">Fixed amount — same as estimated</span>'
          : `<span class="form-hint">Estimated: ${currFmt.format(expense.amount)}</span>`}
      </div>
      <div class="form-group">
        <label class="form-label" for="cal-mp-date">Date paid</label>
        <input id="cal-mp-date" type="date" value="${today}" />
      </div>
    `;

    // Card dropdown
    if (this.cardAccounts.length > 0) {
      const cardGroup = document.createElement('div');
      cardGroup.className = 'form-group';
      const cardLabel = document.createElement('label');
      cardLabel.className = 'form-label';
      cardLabel.htmlFor = 'cal-mp-card';
      cardLabel.innerHTML = 'Charge to card <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span>';
      const cardSel = document.createElement('select');
      cardSel.id = 'cal-mp-card';
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '— No card —';
      cardSel.appendChild(noneOpt);
      this.cardAccounts.forEach((a) => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.name;
        opt.selected = a.id === (expense.linkedCardId ?? '');
        cardSel.appendChild(opt);
      });
      cardGroup.appendChild(cardLabel);
      cardGroup.appendChild(cardSel);
      body.appendChild(cardGroup);
    }

    openFormModal({
      title: `Record Payment — ${expense.description}`,
      body,
      submitLabel: 'Record Payment',
      onSubmit: async (close) => {
        const rawAmount = parseFloat(body.querySelector<HTMLInputElement>('#cal-mp-amount')!.value);
        if (isNaN(rawAmount) || rawAmount < 0) return;
        const paidAmount = Math.round(rawAmount * 100) / 100;
        const dateStr = body.querySelector<HTMLInputElement>('#cal-mp-date')!.value;
        const paidDate = dateStr ? new Date(dateStr + 'T00:00:00').getTime() : Date.now();
        const selectedCardId = body.querySelector<HTMLSelectElement>('#cal-mp-card')?.value || null;

        const record = createExpensePaidRecord(expense.id, paidAmount, paidDate);
        const ops: Promise<unknown>[] = [
          saveExpense({ ...expense, date: paidDate }),
          saveExpensePaidRecord(record),
        ];

        if (selectedCardId) {
          const existingCharge = await findChargeByExpenseId(expense.id);
          if (existingCharge && existingCharge.accountId === selectedCardId) {
            ops.push(saveCardCharge({ ...existingCharge, amount: paidAmount, date: paidDate }));
          } else {
            if (existingCharge) ops.push(deleteCardCharge(existingCharge.id));
            const charge = createCardCharge(selectedCardId, expense.description, paidAmount, paidDate, expense.categoryId || undefined);
            charge.sourceExpenseId = expense.id;
            ops.push(saveCardCharge(charge));
          }
        }

        await Promise.all(ops);
        close();
        refreshNotifier();
        await this.load();
      },
    });
  }

  private openRecordPaymentForm(account: DebtAccount, minPay: number | undefined): void {
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';
    body.innerHTML = `
      <p class="text-sm text-muted">
        Record a payment for <strong>${account.name}</strong>.
        ${minPay != null ? `Minimum due: <strong>${fmtCents.format(minPay)}</strong>` : ''}
      </p>
      <div class="form-group">
        <label class="form-label" for="cal-dp-amount">Payment amount</label>
        <input id="cal-dp-amount" type="number" min="0.01" step="0.01"
          value="${minPay != null ? minPay.toFixed(2) : ''}" placeholder="0.00" />
      </div>
    `;

    openFormModal({
      title: `Record Payment — ${account.name}`,
      body,
      submitLabel: 'Record Payment',
      onSubmit: async (close) => {
        const rawAmount = parseFloat(body.querySelector<HTMLInputElement>('#cal-dp-amount')!.value);
        if (isNaN(rawAmount) || rawAmount <= 0) return;
        const payment = createDebtPayment(account.id, rawAmount, 'regular');
        await saveDebtPayment(payment);
        close();
        refreshNotifier();
        await this.load();
      },
    });
  }
}
