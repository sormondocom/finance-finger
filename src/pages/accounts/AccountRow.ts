import { fmtCents, sourceMonthly } from '@/utils/finance';
import { openConfirmDialog } from '@/components/ConfirmDialog';
import { getPaydaysInMonth } from '@/utils/paydays';
import { openImportWizard } from '@/components/ImportWizard';
import { openAddNotificationModal } from '@/utils/notificationModal';
import { navigate } from '@/app/router';
import {
  getIncomeSources, getExpenses, getExpensePaidRecords, getDebtPayments,
  saveIncomeSource, saveExpense, saveExpensePaidRecord, saveDebtPayment,
  deleteBankAccount, deleteBankTransactionsByAccount,
} from '@/db';
import { buildAccountLedgerPanel } from './AccountLedger';
import { openAccountForm, openTransferModal } from './AccountForm';
import type {
  BankAccount, BankAccountType, BankAccountOwnership,
  HouseholdMember, IncomeSource, Expense, ExpensePaidRecord,
  DebtPayment, AccountTransfer, ExpenseCategory, LedgerEntry,
} from '@/types';

const ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  'checking':     'Checking',
  'savings':      'Savings',
  'money-market': 'Money Market',
  'cash':         'Cash',
  'other':        'Other',
};

const OWNERSHIP_LABELS: Record<BankAccountOwnership, string> = {
  'individual': 'Individual',
  'joint':      'Joint',
  'household':  'Household',
};

const SERIES_COLORS = [
  '#2D5A27', '#1B2A4A', '#C9A84C', '#B45309', '#7C3AED',
  '#0891B2', '#BE185D', '#374151', '#065F46', '#6B21A8',
];

export type AccountRowContext = {
  accounts: BankAccount[];
  members: HouseholdMember[];
  incomeSources: IncomeSource[];
  expenses: Expense[];
  paidRecords: ExpensePaidRecord[];
  debtPayments: DebtPayment[];
  transfers: AccountTransfer[];
  categories: ExpenseCategory[];
  ledgerBalances: Map<string, number>;
  accountLedgerEntries: Map<string, LedgerEntry[]>;
  viewYear: number;
  viewMonth: number;
  onLoad: () => Promise<void>;
};

function buildIncomeItem(source: IncomeSource, amountLabel: string): HTMLElement {
  const item = document.createElement('button');
  item.className = 'account-income-item';
  item.title = `View "${source.name}" in Income`;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'account-income-item-name';
  nameSpan.textContent = source.name;

  const amtSpan = document.createElement('span');
  amtSpan.className = 'account-income-item-amount';
  amtSpan.textContent = amountLabel;

  item.appendChild(nameSpan);
  item.appendChild(amtSpan);
  item.addEventListener('click', () => {
    sessionStorage.setItem('cal-focus-source', source.id);
    navigate('/income');
  });

  return item;
}

export function buildAccountRow(account: BankAccount, ctx: AccountRowContext): HTMLElement {
  const {
    accounts, members, incomeSources, paidRecords,
    debtPayments, transfers, categories,
    ledgerBalances, accountLedgerEntries, viewYear, viewMonth, onLoad,
  } = ctx;

  const activeSources = incomeSources.filter(
    (s) => s.active && s.frequency !== 'once' && s.bankAccountId === account.id,
  );
  const monthlyIncome = activeSources.reduce((sum, s) => sum + sourceMonthly(s), 0);

  const monthStart = new Date(viewYear, viewMonth, 1).getTime();
  const monthEnd = new Date(viewYear, viewMonth + 1, 1).getTime();
  const oneTimeSources = incomeSources.filter(
    (s) => s.active && s.frequency === 'once' && s.bankAccountId === account.id
      && s.date != null && s.date >= monthStart && s.date < monthEnd,
  );
  const oneTimeIncome = oneTimeSources.reduce((sum, s) => sum + s.amount, 0);

  const debtPaymentsTotal = debtPayments
    .filter((p) => p.bankAccountId === account.id && p.date >= monthStart && p.date < monthEnd)
    .reduce((sum, p) => sum + p.amount, 0);

  const transfersIn = transfers
    .filter((t) => t.toAccountId === account.id && t.date >= monthStart && t.date < monthEnd)
    .reduce((sum, t) => sum + t.amount, 0);
  const transfersOut = transfers
    .filter((t) => t.fromAccountId === account.id && t.date >= monthStart && t.date < monthEnd)
    .reduce((sum, t) => sum + t.amount, 0);

  const row = document.createElement('div');
  row.className = 'account-row';
  row.setAttribute('data-testid', 'account-row');
  row.setAttribute('data-account-id', account.id);

  const nameCell = document.createElement('div');
  nameCell.className = 'account-row-name';

  const nameTop = document.createElement('div');
  nameTop.className = 'account-row-name-top';

  const accountIdx = accounts.indexOf(account);
  const swatchColor = account.color ?? SERIES_COLORS[accountIdx % SERIES_COLORS.length]!;
  const swatch = document.createElement('span');
  swatch.className = 'account-color-swatch';
  swatch.style.background = swatchColor;
  nameTop.appendChild(swatch);

  nameTop.appendChild(document.createTextNode(account.name));

  const typeBadge = document.createElement('span');
  typeBadge.className = 'account-type-badge';
  typeBadge.textContent = ACCOUNT_TYPE_LABELS[account.accountType];
  nameTop.appendChild(typeBadge);

  const ownerBadge = document.createElement('span');
  ownerBadge.className = 'account-ownership-badge';
  if (account.ownership === 'individual' && account.memberId) {
    const member = members.find((m) => m.id === account.memberId);
    ownerBadge.textContent = member ? member.name : 'Individual';
  } else {
    ownerBadge.textContent = OWNERSHIP_LABELS[account.ownership];
  }
  nameTop.appendChild(ownerBadge);
  nameCell.appendChild(nameTop);

  const accountPaidRecords = paidRecords.filter((r) => r.bankAccountId === account.id);
  const accountDebtPayments = debtPayments.filter((p) => p.bankAccountId === account.id);
  const accountTransfers = transfers.filter((t) => t.fromAccountId === account.id || t.toAccountId === account.id);

  const nameBottom = document.createElement('div');
  nameBottom.className = 'account-row-name-bottom';
  nameBottom.setAttribute('data-testid', 'account-balance-cell');

  // Use the ledger-derived balance as the authoritative "Actual" figure.
  // Fall back to account.balance only when the ledger has no entries yet
  // (pre-ledger accounts that have had no transactions recorded through the
  // accounting service).
  const ledgerBalance = ledgerBalances.get(account.id) ?? 0;
  const actualBalance = ledgerBalance !== 0 ? ledgerBalance : (account.balance ?? 0);
  const hasActualData = account.balance != null
    || ledgerBalance !== 0
    || accountPaidRecords.length > 0
    || accountDebtPayments.length > 0
    || accountTransfers.length > 0;

  // Projected = declared starting balance + all expected income for the viewed month.
  // Uses account.balance (not ledgerBalance) so the projection is independent of
  // recorded transactions and consistent across all months in the nav.
  let allPaychecks = 0;
  for (const source of activeSources) {
    const days = getPaydaysInMonth(source, viewYear, viewMonth);
    for (let i = 0; i < days.length; i++) {
      allPaychecks +=
        source.frequency === 'semimonthly' && source.amount2 != null && i === 1
          ? source.amount2
          : source.amount;
    }
  }

  const startingBalance = account.balance ?? 0;
  const projectedBalance = allPaychecks > 0 || oneTimeIncome > 0
    ? startingBalance + allPaychecks + oneTimeIncome
    : null;

  if (hasActualData) {
    const block = document.createElement('div');
    block.className = 'account-balance-block';
    const lbl = document.createElement('span');
    lbl.className = 'account-balance-label';
    lbl.textContent = 'Actual';
    block.appendChild(lbl);
    const isNeg = actualBalance < 0;
    const val = document.createElement('span');
    val.className = `account-row-balance${isNeg ? ' account-row-balance--negative' : ''}`;
    val.setAttribute('data-testid', 'account-actual-balance');
    val.textContent = fmtCents.format(actualBalance);
    block.appendChild(val);
    nameBottom.appendChild(block);
  }

  if (projectedBalance != null) {
    const block = document.createElement('div');
    block.className = 'account-balance-block';
    const lbl = document.createElement('span');
    lbl.className = 'account-balance-label';
    lbl.textContent = 'Projected';
    block.appendChild(lbl);
    const isNeg = projectedBalance < 0;
    const val = document.createElement('span');
    val.className = `account-row-balance account-row-balance--projected${isNeg ? ' account-row-balance--negative' : ''}`;
    val.setAttribute('data-testid', 'account-balance');
    val.textContent = fmtCents.format(projectedBalance);
    block.appendChild(val);
    nameBottom.appendChild(block);
  }

  if (!hasActualData && projectedBalance == null) {
    const hint = document.createElement('span');
    hint.className = 'account-row-balance-hint';
    hint.setAttribute('data-testid', 'account-balance-hint');
    hint.textContent = 'Set an opening balance or record a transaction to see your actual balance';
    nameBottom.appendChild(hint);
  }
  nameCell.appendChild(nameBottom);

  if (activeSources.length > 0 || oneTimeSources.length > 0) {
    const incomeList = document.createElement('div');
    incomeList.className = 'account-income-list';
    activeSources.forEach((s) => {
      incomeList.appendChild(buildIncomeItem(s, fmtCents.format(sourceMonthly(s)) + '/mo'));
    });
    oneTimeSources.forEach((s) => {
      incomeList.appendChild(buildIncomeItem(s, fmtCents.format(s.amount)));
    });
    nameCell.appendChild(incomeList);
  }

  row.appendChild(nameCell);

  const depositsCell = document.createElement('div');
  depositsCell.className = 'account-deposits-cell';
  const totalDeposits = monthlyIncome + oneTimeIncome;
  if (totalDeposits > 0) {
    const inc = document.createElement('div');
    inc.className = 'text-xs text-muted';
    inc.setAttribute('data-testid', 'account-monthly-income');
    inc.textContent = `${fmtCents.format(totalDeposits)}/mo deposits`;
    depositsCell.appendChild(inc);
  }
  if (debtPaymentsTotal > 0) {
    const dpLine = document.createElement('div');
    dpLine.className = 'text-xs text-muted';
    dpLine.setAttribute('data-testid', 'account-debt-payments');
    dpLine.textContent = `−${fmtCents.format(debtPaymentsTotal)} debt payments`;
    depositsCell.appendChild(dpLine);
  }
  if (transfersOut > 0) {
    const trLine = document.createElement('div');
    trLine.className = 'text-xs text-muted';
    trLine.setAttribute('data-testid', 'account-transfers-out');
    trLine.textContent = `−${fmtCents.format(transfersOut)} transferred out`;
    depositsCell.appendChild(trLine);
  }
  if (transfersIn > 0) {
    const trInLine = document.createElement('div');
    trInLine.className = 'text-xs text-muted';
    trInLine.setAttribute('data-testid', 'account-transfers-in');
    trInLine.textContent = `+${fmtCents.format(transfersIn)} transferred in`;
    depositsCell.appendChild(trInLine);
  }
  row.appendChild(depositsCell);

  const actionsCell = document.createElement('div');
  actionsCell.className = 'account-row-actions';

  const importBtn = document.createElement('button');
  importBtn.className = 'btn-import';
  importBtn.setAttribute('data-action', 'import');
  importBtn.setAttribute('data-testid', 'account-import');
  importBtn.title = 'Import transactions from CSV';
  importBtn.textContent = '⬆ Import';
  importBtn.addEventListener('click', () => {
    openImportWizard({
      targetId: account.id,
      targetType: 'bank-account',
      targetName: account.name,
      categories,
      onComplete: () => onLoad(),
    });
  });
  actionsCell.appendChild(importBtn);

  if (account.url) {
    const link = document.createElement('a');
    link.className = 'icon-btn';
    link.href = account.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = 'Open banking portal';
    link.textContent = '↗';
    actionsCell.appendChild(link);
  }

  const notifBtn = document.createElement('button');
  notifBtn.className = 'icon-btn';
  notifBtn.setAttribute('data-action', 'notif');
  notifBtn.setAttribute('data-testid', 'account-notif');
  notifBtn.title = 'Add reminder';
  notifBtn.textContent = '🔔';
  notifBtn.addEventListener('click', () => {
    openAddNotificationModal({ label: account.name, defaultTrigger: 'monthly-day' });
  });
  actionsCell.appendChild(notifBtn);

  if (accounts.length > 1) {
    const transferBtn = document.createElement('button');
    transferBtn.className = 'icon-btn';
    transferBtn.setAttribute('data-action', 'transfer');
    transferBtn.setAttribute('data-testid', 'account-transfer');
    transferBtn.title = 'Transfer funds';
    transferBtn.textContent = '⇄';
    transferBtn.addEventListener('click', () => openTransferModal(account, accounts, onLoad));
    actionsCell.appendChild(transferBtn);
  }

  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn';
  editBtn.setAttribute('data-action', 'edit');
  editBtn.setAttribute('data-testid', 'account-edit');
  editBtn.title = 'Edit';
  editBtn.textContent = '✏️';
  editBtn.addEventListener('click', () => openAccountForm(account, accounts, members, onLoad));
  actionsCell.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-btn danger';
  deleteBtn.setAttribute('data-action', 'delete');
  deleteBtn.setAttribute('data-testid', 'account-delete');
  deleteBtn.title = 'Delete';
  deleteBtn.textContent = '🗑️';
  deleteBtn.addEventListener('click', async () => {
    if (!await openConfirmDialog({ message: `Delete "${account.name}"?` })) return;
    const [sources, exps, paid, debtPmts] = await Promise.all([
      getIncomeSources(), getExpenses(), getExpensePaidRecords(), getDebtPayments(),
    ]);
    await Promise.all([
      ...sources.filter((s) => s.bankAccountId === account.id).map(({ bankAccountId: _, ...s }) => saveIncomeSource(s)),
      ...exps.filter((e) => e.bankAccountId === account.id).map(({ bankAccountId: _, ...e }) => saveExpense(e)),
      ...paid.filter((r) => r.bankAccountId === account.id).map(({ bankAccountId: _, ...r }) => saveExpensePaidRecord(r)),
      ...debtPmts.filter((p) => p.bankAccountId === account.id).map(({ bankAccountId: _, ...p }) => saveDebtPayment(p)),
      deleteBankTransactionsByAccount(account.id),
    ]);
    await deleteBankAccount(account.id);
    await onLoad();
  });
  actionsCell.appendChild(deleteBtn);

  const accountEntries = accountLedgerEntries.get(account.id) ?? [];
  const ledgerPanel = buildAccountLedgerPanel(accountEntries, accountPaidRecords);
  const ledgerCount = accountEntries.filter((e) => e.type !== 'reconciliation').length;

  const ledgerBtn = document.createElement('button');
  ledgerBtn.className = 'icon-btn';
  ledgerBtn.setAttribute('data-action', 'ledger');
  ledgerBtn.setAttribute('data-testid', 'account-ledger');
  ledgerBtn.title = 'Transaction history';
  ledgerBtn.textContent = ledgerCount > 0 ? `📋 ${ledgerCount}` : '📋';
  if (ledgerCount > 0) ledgerBtn.style.color = 'var(--ff-gold-dark)';
  ledgerBtn.addEventListener('click', () => {
    const open = ledgerPanel.style.display !== 'none';
    ledgerPanel.style.display = open ? 'none' : '';
  });
  actionsCell.insertBefore(ledgerBtn, notifBtn);

  row.appendChild(actionsCell);

  const outer = document.createElement('div');
  outer.className = 'account-item-outer';
  outer.setAttribute('data-account-id', account.id);
  outer.appendChild(row);
  outer.appendChild(ledgerPanel);
  return outer;
}
