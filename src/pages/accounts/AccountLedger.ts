import { fmtCents } from '@/utils/finance';
import { getPaydaysInMonth } from '@/utils/paydays';
import type { BankAccount, ExpensePaidRecord, DebtPayment, IncomeSource, AccountTransfer, BankTransaction, Expense, DebtAccount } from '@/types';
import { userLocale } from '@/utils/locale';

export function computeActualBalance(
  account: BankAccount,
  paidRecords: ExpensePaidRecord[],
  debtPayments: DebtPayment[],
  incomeSources: IncomeSource[],
  transfers: AccountTransfer[],
): number {
  let balance = account.balance ?? 0;

  for (const r of paidRecords) balance -= r.amount;
  for (const p of debtPayments) balance -= p.amount;
  for (const t of transfers) {
    if (t.toAccountId === account.id) balance += t.amount;
    if (t.fromAccountId === account.id) balance -= t.amount;
  }

  const now = new Date();
  const horizonMs = Math.max(new Date(now.getFullYear(), now.getMonth() - 12, 1).getTime(), 0);
  for (const s of incomeSources) {
    if (s.frequency === 'once') {
      if (s.date != null && s.date <= now.getTime()) balance += s.amount;
      continue;
    }
    const rawStart = new Date(Math.max(horizonMs, s.createdAt));
    rawStart.setHours(0, 0, 0, 0);
    const startMs = rawStart.getTime();
    let y = rawStart.getFullYear();
    let m = rawStart.getMonth();
    const endY = now.getFullYear();
    const endM = now.getMonth();
    while (y < endY || (y === endY && m <= endM)) {
      for (const day of getPaydaysInMonth(s, y, m)) {
        const ts = new Date(y, m, day).getTime();
        if (ts >= startMs && ts <= now.getTime()) {
          balance += (s.frequency === 'semimonthly' && s.amount2 != null)
            ? (day <= 15 ? s.amount : s.amount2)
            : s.amount;
        }
      }
      m++;
      if (m > 11) { m = 0; y++; }
    }
  }

  return balance;
}

export function buildAccountLedgerPanel(
  account: BankAccount,
  paidRecords: ExpensePaidRecord[],
  debtPayments: DebtPayment[],
  incomeSources: IncomeSource[],
  transfers: AccountTransfer[],
  bankTransactions: BankTransaction[],
  expenses: Expense[],
  debtAccounts: DebtAccount[],
  accounts: BankAccount[],
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'account-ledger-panel';
  panel.style.display = 'none';

  type LedgerEntry = { date: number; label: string; amount: number; isDebit: boolean; expenseId?: string };
  const entries: LedgerEntry[] = [];

  for (const r of paidRecords) {
    const exp = expenses.find((e) => e.id === r.expenseId);
    entries.push({
      date: r.date,
      label: exp ? exp.description : 'Expense payment',
      amount: r.amount,
      isDebit: true,
      expenseId: r.expenseId,
    });
  }

  for (const p of debtPayments) {
    const debt = debtAccounts.find((d) => d.id === p.accountId);
    entries.push({
      date: p.date,
      label: debt ? `${debt.name} payment` : 'Debt payment',
      amount: p.amount,
      isDebit: true,
    });
  }

  for (const t of transfers) {
    const isOutgoing = t.fromAccountId === account.id;
    const otherAccountId = isOutgoing ? t.toAccountId : t.fromAccountId;
    const otherAccount = accounts.find((a) => a.id === otherAccountId);
    const otherName = otherAccount?.name ?? 'Unknown account';
    const noteStr = t.note ? ` — ${t.note}` : '';
    entries.push({
      date: t.date,
      label: isOutgoing
        ? `Transfer to ${otherName}${noteStr}`
        : `Transfer from ${otherName}${noteStr}`,
      amount: t.amount,
      isDebit: isOutgoing,
    });
  }

  const now = new Date();
  const horizonMs = Math.max(new Date(now.getFullYear(), now.getMonth() - 12, 1).getTime(), 0);
  for (const s of incomeSources) {
    if (s.frequency === 'once') {
      if (s.date != null && s.date <= now.getTime()) {
        entries.push({ date: s.date, label: s.name, amount: s.amount, isDebit: false });
      }
      continue;
    }
    const rawStart = new Date(Math.max(horizonMs, s.createdAt));
    rawStart.setHours(0, 0, 0, 0);
    const startMs = rawStart.getTime();
    const start = rawStart;
    let y = start.getFullYear();
    let m = start.getMonth();
    const endY = now.getFullYear();
    const endM = now.getMonth();
    while (y < endY || (y === endY && m <= endM)) {
      const days = getPaydaysInMonth(s, y, m);
      for (const day of days) {
        const ts = new Date(y, m, day).getTime();
        if (ts >= startMs && ts <= now.getTime()) {
          const amount = s.frequency === 'semimonthly' && s.amount2 != null
            ? (day <= 15 ? s.amount : s.amount2)
            : s.amount;
          entries.push({ date: ts, label: s.name, amount, isDebit: false });
        }
      }
      m++;
      if (m > 11) { m = 0; y++; }
    }
  }

  for (const t of bankTransactions) {
    const isDebit = t.amount < 0;
    entries.push({
      date: t.date,
      label: t.description || 'Imported transaction',
      amount: Math.abs(t.amount),
      isDebit,
    });
  }

  entries.sort((a, b) => a.date - b.date);

  const openingBalance = account.balance ?? 0;
  let running = openingBalance;
  const entriesWithBalance = entries.map((e) => {
    running += e.isDebit ? -e.amount : e.amount;
    return { ...e, balance: running };
  });
  const actualBalance = running;

  entriesWithBalance.reverse();

  if (entriesWithBalance.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-muted text-sm';
    empty.style.padding = 'var(--space-3) var(--space-4)';
    empty.textContent = 'No transactions linked to this account yet.';
    panel.appendChild(empty);
    return panel;
  }

  const summaryBar = document.createElement('div');
  summaryBar.className = 'account-ledger-actual-balance';
  const isNegative = actualBalance < 0;
  const balanceValueClass = isNegative
    ? 'account-ledger-actual-balance-value--negative'
    : 'account-ledger-actual-balance-value--positive';
  summaryBar.innerHTML = `
    <span class="account-ledger-actual-balance-opening">
      Opening: ${fmtCents.format(openingBalance)}
    </span>
    <span class="account-ledger-actual-balance-current">
      <span class="account-ledger-actual-balance-label">Actual balance</span>
      <span class="account-ledger-actual-balance-value ${balanceValueClass}">
        ${isNegative ? '−' : ''}${fmtCents.format(Math.abs(actualBalance))}
      </span>
    </span>
  `;
  panel.appendChild(summaryBar);

  const headerRow = document.createElement('div');
  headerRow.className = 'account-ledger-row account-ledger-col-header';
  ([
    ['Date',        'account-ledger-date'],
    ['Description', 'account-ledger-desc'],
    ['Amount',      'account-ledger-amount'],
    ['Balance',     'account-ledger-balance'],
  ] as [string, string][]).forEach(([text, cls]) => {
    const cell = document.createElement('span');
    cell.className = cls;
    cell.textContent = text;
    headerRow.appendChild(cell);
  });
  panel.appendChild(headerRow);

  for (const entry of entriesWithBalance) {
    const ledgerRow = document.createElement('div');
    ledgerRow.className = 'account-ledger-row';
    if (entry.expenseId) ledgerRow.setAttribute('data-expense-id', entry.expenseId);

    const dateEl = document.createElement('span');
    dateEl.className = 'account-ledger-date';
    dateEl.textContent = new Date(entry.date).toLocaleDateString(userLocale, {
      month: 'short', day: 'numeric', year: 'numeric',
    });

    const descEl = document.createElement('span');
    descEl.className = 'account-ledger-desc';
    descEl.textContent = entry.label;

    const amtEl = document.createElement('span');
    amtEl.className = `account-ledger-amount${entry.isDebit ? ' account-ledger-amount--debit' : ' account-ledger-amount--credit'}`;
    amtEl.textContent = `${entry.isDebit ? '−' : '+'}${fmtCents.format(entry.amount)}`;

    const balEl = document.createElement('span');
    const balNegative = entry.balance < 0;
    balEl.className = `account-ledger-balance${balNegative ? ' account-ledger-balance--negative' : ''}`;
    balEl.textContent = `${balNegative ? '−' : ''}${fmtCents.format(Math.abs(entry.balance))}`;

    ledgerRow.appendChild(dateEl);
    ledgerRow.appendChild(descEl);
    ledgerRow.appendChild(amtEl);
    ledgerRow.appendChild(balEl);
    panel.appendChild(ledgerRow);
  }

  const openingRow = document.createElement('div');
  openingRow.className = 'account-ledger-row account-ledger-opening-row';
  const openingDesc = document.createElement('span');
  openingDesc.className = 'account-ledger-date';
  const openingSpacer = document.createElement('span');
  openingSpacer.className = 'account-ledger-desc';
  openingSpacer.textContent = 'Opening balance';
  const openingAmtSpacer = document.createElement('span');
  openingAmtSpacer.className = 'account-ledger-amount';
  const openingBalEl = document.createElement('span');
  openingBalEl.className = 'account-ledger-balance';
  openingBalEl.textContent = fmtCents.format(openingBalance);
  openingRow.appendChild(openingDesc);
  openingRow.appendChild(openingSpacer);
  openingRow.appendChild(openingAmtSpacer);
  openingRow.appendChild(openingBalEl);
  panel.appendChild(openingRow);

  return panel;
}
