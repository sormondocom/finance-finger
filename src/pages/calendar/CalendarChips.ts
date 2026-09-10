import { computeBillStatus } from '@/utils/billStatus';
import { computeMinPayment } from '@/utils/paymentStatus';
import type { AccountPaymentStatus } from '@/utils/paymentStatus';
import { fmtCents } from '@/utils/finance';
import { escapeHtml } from '@/utils/escapeHtml';
import type { Expense, DebtAccount, ExpenseCategory, ExpensePaidRecord, IncomeSource, HouseholdMember, DebtAccountType } from '@/types';
import { userLocale } from '@/utils/locale';

const DEBT_TYPE_LABEL: Record<DebtAccountType, string> = {
  card: 'Credit Card',
  mortgage: 'Mortgage',
  medical: 'Medical Debt',
  loan: 'Personal Loan',
  vehicle: 'Vehicle Loan',
};

type ChipStatus = 'paid' | 'past-due' | 'due-soon' | 'ok';

export function debtChipStatus(ms: AccountPaymentStatus['currentMonth']): ChipStatus {
  if (ms === 'paid' || ms === 'paid-off') return 'paid';
  if (ms === 'past-due') return 'past-due';
  if (ms === 'due-soon' || ms === 'partial') return 'due-soon';
  return 'ok';
}

export type CalendarChipContext = {
  members: HouseholdMember[];
  categories: ExpenseCategory[];
  onChipNav: (e: MouseEvent, sessionKey: string, id: string, route: '/expenses' | '/income' | '/debt') => void;
  onMarkPaid: (expense: Expense) => void;
  onRecordPayment: (account: DebtAccount, minPay?: number) => void;
};

export function buildPaydayChip(source: IncomeSource, paydayIndex: number, ctx: CalendarChipContext): HTMLElement {
  const member = ctx.members.find((m) => m.id === source.memberId);
  const amount = (paydayIndex === 1 && source.amount2 != null) ? source.amount2 : source.amount;
  const chip = document.createElement('div');
  chip.className = 'calendar-payday-chip';
  chip.setAttribute('data-testid', 'calendar-payday-chip');
  chip.setAttribute('data-source-id', source.id);
  chip.style.cursor = 'pointer';
  chip.innerHTML = `
    <div class="cal-chip-title">
      <span class="cal-chip-icon">💰</span>
      <span class="cal-chip-name" title="${escapeHtml(source.name)}">${escapeHtml(source.name)}</span>
    </div>
    ${member ? `<span class="cal-chip-type">${escapeHtml(member.name)}</span>` : ''}
    <span class="cal-chip-amount">${fmtCents.format(amount)}</span>
  `;
  chip.addEventListener('click', (e) => ctx.onChipNav(e, 'cal-focus-source', source.id, '/income'));
  return chip;
}

export function buildOneTimeIncomeChip(source: IncomeSource, ctx: CalendarChipContext): HTMLElement {
  const member = ctx.members.find((m) => m.id === source.memberId);
  const chip = document.createElement('div');
  chip.className = 'calendar-payday-chip';
  chip.setAttribute('data-testid', 'calendar-one-time-income-chip');
  chip.setAttribute('data-source-id', source.id);
  chip.style.cursor = 'pointer';
  chip.innerHTML = `
    <div class="cal-chip-title">
      <span class="cal-chip-icon">💵</span>
      <span class="cal-chip-name" title="${escapeHtml(source.name)}">${escapeHtml(source.name)}</span>
    </div>
    <span class="cal-chip-type">${member ? escapeHtml(member.name) : 'One-time income'}</span>
    <span class="cal-chip-amount">${fmtCents.format(source.amount)}</span>
  `;
  chip.addEventListener('click', (e) => ctx.onChipNav(e, 'cal-focus-source', source.id, '/income'));
  return chip;
}

export function buildBillChip(expense: Expense, paidRecord: ExpensePaidRecord | undefined, ctx: CalendarChipContext): HTMLElement {
  const { status } = computeBillStatus(expense);
  const isAutoPay = !!expense.isAutoPay;
  const category = ctx.categories.find((c) => c.id === expense.categoryId);
  const categoryName = category?.name ?? 'Expense';
  const chipStatus = isAutoPay ? 'ok' : status;
  const statusIcon = isAutoPay ? '🔄' : (status === 'paid' ? '✓' : status === 'past-due' ? '⚠' : status === 'due-soon' ? '⏰' : '');

  const isPaidStatus = chipStatus === 'paid';
  const displayAmount = (isPaidStatus && paidRecord) ? paidRecord.amount : expense.amount;
  const paidOnStr = isPaidStatus
    ? new Date(paidRecord?.date ?? expense.date).toLocaleDateString(userLocale, { month: 'short', day: 'numeric' })
    : null;

  const wrap = document.createElement('div');
  wrap.className = 'cal-chip-wrap';

  const chip = document.createElement('div');
  chip.className = `calendar-bill-chip calendar-bill-chip--${chipStatus}`;
  chip.setAttribute('data-testid', 'calendar-bill-chip');
  chip.setAttribute('data-expense-id', expense.id);
  chip.setAttribute('data-bill-status', chipStatus);
  chip.style.cursor = 'pointer';
  chip.addEventListener('click', (e) => ctx.onChipNav(e, 'cal-focus-expense', expense.id, '/expenses'));
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
    payBtn.addEventListener('click', () => ctx.onMarkPaid(expense));
    wrap.appendChild(payBtn);
  }

  return wrap;
}

export function buildOneTimeExpenseChip(expense: Expense, ctx: CalendarChipContext): HTMLElement {
  const category = ctx.categories.find((c) => c.id === expense.categoryId);
  const categoryColor = category?.color ?? '#999';
  const categoryName = category?.name ?? 'Expense';

  const chip = document.createElement('div');
  chip.className = 'calendar-expense-chip';
  chip.setAttribute('data-testid', 'calendar-expense-chip');
  chip.setAttribute('data-expense-id', expense.id);
  chip.style.cursor = 'pointer';
  chip.addEventListener('click', (e) => ctx.onChipNav(e, 'cal-focus-expense', expense.id, '/expenses'));
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

export function buildDebtChip(account: DebtAccount, status: AccountPaymentStatus, paidDate: number | undefined, ctx: CalendarChipContext): HTMLElement {
  const chipStatus = debtChipStatus(status.currentMonth);
  const minPay = computeMinPayment(account);

  let amountLabel: string;
  let paidOnStr: string | null = null;
  if (chipStatus === 'paid') {
    amountLabel = `${fmtCents.format(status.currentMonthTotal)} paid`;
    if (paidDate != null) {
      paidOnStr = new Date(paidDate).toLocaleDateString(userLocale, { month: 'short', day: 'numeric' });
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
  chip.addEventListener('click', (e) => ctx.onChipNav(e, 'cal-focus-account', account.id, '/debt'));
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
    payBtn.addEventListener('click', () => ctx.onRecordPayment(account, minPay ?? undefined));
    wrap.appendChild(payBtn);
  }

  return wrap;
}

export function buildDebtPaymentChip(payment: { id: string; type: string; amount: number }, account: DebtAccount, ctx: CalendarChipContext): HTMLElement {
  const chip = document.createElement('div');
  chip.className = 'calendar-payment-chip';
  chip.setAttribute('data-testid', 'calendar-payment-chip');
  chip.setAttribute('data-payment-id', payment.id);
  chip.style.cursor = 'pointer';
  chip.addEventListener('click', (e) => ctx.onChipNav(e, 'cal-focus-account', account.id, '/debt'));
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
