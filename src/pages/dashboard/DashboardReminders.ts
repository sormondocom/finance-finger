import { computeMinPayment } from '@/utils/paymentStatus';
import type { AccountPaymentStatus } from '@/utils/paymentStatus';
import type { BillPaymentStatus } from '@/utils/billStatus';
import { navigate } from '@/app/router';
import { fmtCents } from '@/utils/finance';
import type { DebtAccount, Expense } from '@/types';
import { userLocale } from '@/utils/locale';

export function buildPaymentRemindersCard(
  pastDue: Array<{ account: DebtAccount; status: AccountPaymentStatus }>,
  dueSoon: Array<{ account: DebtAccount; status: AccountPaymentStatus }>,
  billsPastDue: Array<{ expense: Expense; status: BillPaymentStatus }>,
  billsDueSoon: Array<{ expense: Expense; status: BillPaymentStatus }>,
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card payment-reminders-card';
  card.setAttribute('data-testid', 'payment-reminders-card');

  const anyPastDue = pastDue.length > 0 || billsPastDue.length > 0;
  const titleRow = document.createElement('div');
  titleRow.className = 'payment-reminders-title-row';
  titleRow.innerHTML = `
    <span class="payment-reminders-title">
      ${anyPastDue ? '🔴' : '⏰'} Payment Reminders
    </span>
  `;

  const hasDebtAlerts = pastDue.length > 0 || dueSoon.length > 0;
  const manageLink = document.createElement('a');
  manageLink.href = hasDebtAlerts ? '#/debt' : '#/expenses';
  manageLink.dataset['route'] = hasDebtAlerts ? '/debt' : '/expenses';
  manageLink.className = 'payment-reminders-link';
  manageLink.textContent = hasDebtAlerts ? 'View debt →' : 'View bills →';
  manageLink.addEventListener('click', (e) => {
    e.preventDefault();
    navigate(manageLink.dataset['route'] as Parameters<typeof navigate>[0]);
  });
  titleRow.appendChild(manageLink);
  card.appendChild(titleRow);

  const list = document.createElement('div');
  list.className = 'payment-reminders-list';

  const dayLabel = (dueDate: Date | null): string => {
    if (!dueDate) return 'DUE SOON';
    const days = dueDate.getDate() - new Date().getDate();
    return days <= 0 ? 'DUE TODAY' : days === 1 ? 'DUE TOMORROW' : `DUE IN ${days} DAYS`;
  };

  const renderDebtRow = (
    account: DebtAccount,
    status: AccountPaymentStatus,
    severity: 'past-due' | 'due-soon',
  ): void => {
    const row = document.createElement('div');
    row.className = `payment-reminder-row payment-reminder-row--${severity}`;
    row.setAttribute('data-testid', 'payment-reminder-row');
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => navigate('/debt'));

    const minPay = computeMinPayment(account);
    const dueDateStr = status.dueDayThisMonth
      ? status.dueDayThisMonth.toLocaleDateString(userLocale, { month: 'short', day: 'numeric' })
      : account.dueDay ? `the ${account.dueDay}` : 'unknown';

    const metaLines: string[] = [];
    if (status.dueDayThisMonth) metaLines.push(`Due ${dueDateStr}`);
    if (minPay != null) metaLines.push(`Min $${minPay.toFixed(2)}`);
    if (status.currentMonthTotal > 0)
      metaLines.push(`Paid so far: $${status.currentMonthTotal.toFixed(2)}`);

    const icon = severity === 'past-due' ? '🔴' : '⏰';
    const label = severity === 'past-due' ? 'PAST DUE' : dayLabel(status.dueDayThisMonth);

    row.innerHTML = `
      <span class="payment-reminder-icon">${icon}</span>
      <div class="payment-reminder-info">
        <span class="payment-reminder-name">💳 ${account.name}</span>
        <span class="payment-reminder-meta">${metaLines.join(' · ')}</span>
      </div>
      <span class="payment-reminder-label payment-reminder-label--${severity}">${label}</span>
    `;
    list.appendChild(row);
  };

  const renderBillRow = (
    expense: Expense,
    status: BillPaymentStatus,
    severity: 'past-due' | 'due-soon',
  ): void => {
    const row = document.createElement('div');
    row.className = `payment-reminder-row payment-reminder-row--${severity}`;
    row.setAttribute('data-testid', 'payment-reminder-row');
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => navigate('/expenses'));

    const dueDateStr = status.dueDayThisMonth
      ? status.dueDayThisMonth.toLocaleDateString(userLocale, { month: 'short', day: 'numeric' })
      : '';

    const metaLines: string[] = [];
    if (dueDateStr) metaLines.push(`Due ${dueDateStr}`);
    metaLines.push(fmtCents.format(expense.amount));

    const icon = severity === 'past-due' ? '🔴' : '⏰';
    const label = severity === 'past-due' ? 'PAST DUE' : dayLabel(status.dueDayThisMonth);

    row.innerHTML = `
      <span class="payment-reminder-icon">${icon}</span>
      <div class="payment-reminder-info">
        <span class="payment-reminder-name">🧾 ${expense.description}</span>
        <span class="payment-reminder-meta">${metaLines.join(' · ')}</span>
      </div>
      <span class="payment-reminder-label payment-reminder-label--${severity}">${label}</span>
    `;
    list.appendChild(row);
  };

  type ReminderItem =
    | { kind: 'debt'; account: DebtAccount; status: AccountPaymentStatus; severity: 'past-due' | 'due-soon' }
    | { kind: 'bill'; expense: Expense; status: BillPaymentStatus; severity: 'past-due' | 'due-soon' };

  const allItems: ReminderItem[] = [
    ...pastDue.map(({ account, status }) => ({ kind: 'debt' as const, account, status, severity: 'past-due' as const })),
    ...billsPastDue.map(({ expense, status }) => ({ kind: 'bill' as const, expense, status, severity: 'past-due' as const })),
    ...dueSoon.map(({ account, status }) => ({ kind: 'debt' as const, account, status, severity: 'due-soon' as const })),
    ...billsDueSoon.map(({ expense, status }) => ({ kind: 'bill' as const, expense, status, severity: 'due-soon' as const })),
  ];
  allItems.sort((a, b) => {
    const da = a.status.dueDayThisMonth?.getTime() ?? Infinity;
    const db = b.status.dueDayThisMonth?.getTime() ?? Infinity;
    return da - db;
  });
  allItems.forEach((item) => {
    if (item.kind === 'debt') renderDebtRow(item.account, item.status, item.severity);
    else renderBillRow(item.expense, item.status, item.severity);
  });

  card.appendChild(list);
  return card;
}
