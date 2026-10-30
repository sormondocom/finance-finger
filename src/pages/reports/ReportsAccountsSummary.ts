import { fmtCents } from '@/utils/finance';
import { escapeHtml } from '@/utils/escapeHtml';
import { downloadCsv } from '@/utils/csvExport';
import { todayDateInput } from '@/utils/dateInput';
import { makeReportCard, makeReportEmpty } from './ReportsUtils';
import type { BankAccount, BankAccountType, DebtAccount, DebtAccountType } from '@/types';

const BANK_TYPE_LABELS: Record<BankAccountType, string> = {
  checking: 'Checking',
  savings: 'Savings',
  'money-market': 'Money Market',
  cash: 'Cash',
  other: 'Other',
};

const DEBT_TYPE_LABELS: Record<DebtAccountType, string> = {
  card: 'Credit Card',
  mortgage: 'Mortgage',
  medical: 'Medical',
  loan: 'Loan',
  vehicle: 'Vehicle',
};

function fmtMinPayment(account: DebtAccount): string {
  if (account.minimumPaymentValue == null) return '—';
  return account.minimumPaymentType === 'percentage'
    ? `${account.minimumPaymentValue}%`
    : fmtCents.format(account.minimumPaymentValue);
}

// A deliberately plain listing — every bank and debt account in one place,
// for printing or handing to someone else, with each kind's own total shown
// separately. There is intentionally no combined "net worth" figure here:
// a bank balance and a debt balance are not the same kind of thing, and
// collapsing them into one number isn't something this report does.
export function buildAccountsSummary(
  bankAccounts: BankAccount[],
  debtAccounts: DebtAccount[],
): HTMLElement {
  const card = makeReportCard('Accounts Summary', 'Every bank and debt account in one place — for printing or handing off');
  card.setAttribute('data-testid', 'reports-accounts-summary');

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn-secondary btn-sm no-print';
  exportBtn.textContent = '⬇ Export CSV';
  exportBtn.setAttribute('data-testid', 'reports-accounts-export-csv');
  exportBtn.style.cssText = 'margin-top:var(--space-2)';
  exportBtn.addEventListener('click', () => exportAccountsCsv(bankAccounts, debtAccounts));
  card.querySelector('.reports-card-header')?.appendChild(exportBtn);

  if (bankAccounts.length === 0 && debtAccounts.length === 0) {
    card.appendChild(makeReportEmpty('No accounts yet. Add a bank or debt account to see them listed here.'));
    return card;
  }

  if (bankAccounts.length > 0) {
    const bankTotal = bankAccounts.reduce((s, a) => s + (a.balance ?? 0), 0);
    card.appendChild(buildAccountsGroup(
      'Bank Accounts',
      `Total: ${fmtCents.format(bankTotal)}`,
      bankAccounts.map((a) => [
        escapeHtml(a.name),
        BANK_TYPE_LABELS[a.accountType],
        a.ownership === 'individual' ? 'Individual' : a.ownership === 'joint' ? 'Joint' : 'Household',
        fmtCents.format(a.balance ?? 0),
      ]),
      ['Name', 'Type', 'Ownership', 'Balance'],
    ));
  }

  if (debtAccounts.length > 0) {
    const debtTotal = debtAccounts.reduce((s, a) => s + a.balance, 0);
    card.appendChild(buildAccountsGroup(
      'Debt Accounts',
      `Total: ${fmtCents.format(debtTotal)}`,
      debtAccounts.map((a) => [
        escapeHtml(a.name),
        DEBT_TYPE_LABELS[a.type],
        fmtCents.format(a.balance),
        `${a.apr}%`,
        fmtMinPayment(a),
      ]),
      ['Name', 'Type', 'Balance', 'APR', 'Min. Payment'],
    ));
  }

  return card;
}

function buildAccountsGroup(
  title: string,
  totalLabel: string,
  rows: string[][],
  columns: string[],
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'accounts-summary-group';

  const header = document.createElement('div');
  header.className = 'accounts-summary-group-header';
  header.innerHTML = `
    <span class="accounts-summary-group-title">${title}</span>
    <span class="accounts-summary-group-total">${totalLabel}</span>
  `;
  group.appendChild(header);

  const table = document.createElement('div');
  table.className = 'accounts-summary-table';
  table.style.setProperty('--accounts-summary-cols', String(columns.length));

  const head = document.createElement('div');
  head.className = 'accounts-summary-row accounts-summary-row--head';
  head.innerHTML = columns.map((c) => `<span>${c}</span>`).join('');
  table.appendChild(head);

  rows.forEach((row) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'accounts-summary-row';
    rowEl.innerHTML = row.map((cell) => `<span>${cell}</span>`).join('');
    table.appendChild(rowEl);
  });

  group.appendChild(table);
  return group;
}

function exportAccountsCsv(bankAccounts: BankAccount[], debtAccounts: DebtAccount[]): void {
  const headers = ['Kind', 'Name', 'Type', 'Balance', 'Ownership', 'APR', 'Minimum Payment'];
  const rows: Array<Array<string | number>> = [
    ...bankAccounts.map((a): Array<string | number> => [
      'Bank', a.name, BANK_TYPE_LABELS[a.accountType], (a.balance ?? 0).toFixed(2), a.ownership, '', '',
    ]),
    ...debtAccounts.map((a): Array<string | number> => [
      'Debt', a.name, DEBT_TYPE_LABELS[a.type], a.balance.toFixed(2), '', `${a.apr}%`, fmtMinPayment(a),
    ]),
  ];
  downloadCsv(`financial-finger-accounts-${todayDateInput()}.csv`, headers, rows);
}
