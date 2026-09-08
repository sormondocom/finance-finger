import './accounts.css';
import { makeHelpBtn } from '@/utils/helpNav';
import {
  Chart,
  BarController, BarElement,
  LinearScale, CategoryScale,
  Tooltip, Legend,
} from 'chart.js';
import {
  getBankAccounts, saveBankAccount, deleteBankAccount, createBankAccount,
  getMembers, getIncomeSources, saveIncomeSource, getExpenses, saveExpense,
  getExpensePaidRecords, saveExpensePaidRecord, getDebtPayments, saveDebtPayment,
  getDebtAccounts, getAccountTransfers, saveAccountTransfer, createAccountTransfer,
  getBankTransactions, deleteBankTransactionsByAccount, getCategories,
} from '@/db';
import { openFormModal } from '@/components/Modal';
import { openImportWizard } from '@/components/ImportWizard';
import { fmt, fmtCents, sourceMonthly, toMonthly } from '@/utils/finance';
import { getPaydaysInMonth } from '@/utils/paydays';
import { openAddNotificationModal, buildLinkedRemindersSection } from '@/utils/notificationModal';
import { navigate } from '@/app/router';
import type { BankAccount, BankAccountType, BankAccountOwnership, AccountTransfer, DebtAccount, DebtPayment, HouseholdMember, IncomeSource, Expense, ExpensePaidRecord, BankTransaction, ExpenseCategory } from '@/types';

Chart.register(BarController, BarElement, LinearScale, CategoryScale, Tooltip, Legend);

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

// Distinct palette for account series in the chart
const SERIES_COLORS = [
  '#2D5A27', '#1B2A4A', '#C9A84C', '#B45309', '#7C3AED',
  '#0891B2', '#BE185D', '#374151', '#065F46', '#6B21A8',
];

function mLabel(y: number, m: number): string {
  return new Date(y, m, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export class AccountsPage {
  private accounts: BankAccount[] = [];
  private members: HouseholdMember[] = [];
  private incomeSources: IncomeSource[] = [];
  private expenses: Expense[] = [];
  private paidRecords: ExpensePaidRecord[] = [];
  private debtPayments: DebtPayment[] = [];
  private debtAccounts: DebtAccount[] = [];
  private transfers: AccountTransfer[] = [];
  private bankTransactions: BankTransaction[] = [];
  private categories: ExpenseCategory[] = [];
  private container!: HTMLElement;
  private activeChart: Chart | null = null;
  private viewYear: number = new Date().getFullYear();
  private viewMonth: number = new Date().getMonth();

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'accounts-page';
    this.load();
    return this.container;
  }

  private async load(): Promise<void> {
    [this.accounts, this.members, this.incomeSources, this.expenses, this.paidRecords, this.debtPayments, this.debtAccounts, this.transfers, this.bankTransactions, this.categories] = await Promise.all([
      getBankAccounts(), getMembers(), getIncomeSources(), getExpenses(), getExpensePaidRecords(), getDebtPayments(), getDebtAccounts(), getAccountTransfers(), getBankTransactions(), getCategories(),
    ]);
    this.paint();
  }

  private paint(): void {
    this.activeChart?.destroy();
    this.activeChart = null;
    this.container.innerHTML = '';

    // ── Header ──────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'accounts-header';
    header.innerHTML = `
      <div>
        <h1 class="font-serif">Accounts</h1>
        <p class="text-muted text-sm">Track where income is deposited and where expenses are paid from.</p>
      </div>
    `;

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.setAttribute('data-testid', 'add-account-btn');
    addBtn.textContent = '+ Add account';
    addBtn.addEventListener('click', () => this.openAccountForm());
    header.appendChild(addBtn);
    header.querySelector('h1')?.appendChild(makeHelpBtn('accounts'));
    this.container.appendChild(header);

    // ── Deposits chart (only when accounts have income assigned) ─────────
    const chartEl = this.buildDepositsChart();
    if (chartEl) this.container.appendChild(chartEl);

    // ── Month navigation ─────────────────────────────────────────────────
    const now = new Date();
    const isCurrentMonth = this.viewYear === now.getFullYear() && this.viewMonth === now.getMonth();
    const monthName = new Date(this.viewYear, this.viewMonth, 1)
      .toLocaleString('default', { month: 'long', year: 'numeric' });

    const monthNav = document.createElement('div');
    monthNav.className = 'month-nav';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'month-nav-btn';
    prevBtn.setAttribute('aria-label', 'Previous month');
    prevBtn.innerHTML = '&#8249;';
    prevBtn.addEventListener('click', () => {
      if (this.viewMonth === 0) { this.viewMonth = 11; this.viewYear--; }
      else { this.viewMonth--; }
      this.paint();
    });

    const monthLabel = document.createElement('span');
    monthLabel.className = 'month-nav-label';
    monthLabel.textContent = monthName;

    const nextBtn = document.createElement('button');
    nextBtn.className = 'month-nav-btn';
    nextBtn.setAttribute('aria-label', 'Next month');
    nextBtn.innerHTML = '&#8250;';
    nextBtn.disabled = isCurrentMonth;
    nextBtn.addEventListener('click', () => {
      if (isCurrentMonth) return;
      if (this.viewMonth === 11) { this.viewMonth = 0; this.viewYear++; }
      else { this.viewMonth++; }
      this.paint();
    });

    monthNav.appendChild(prevBtn);
    monthNav.appendChild(monthLabel);
    monthNav.appendChild(nextBtn);
    this.container.appendChild(monthNav);

    // ── Account list card ────────────────────────────────────────────────
    const card = document.createElement('div');
    card.className = 'card';

    if (this.accounts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <span class="empty-state-icon">🏦</span>
        <h3>No bank accounts yet</h3>
        <p>Add checking, savings, money-market, or cash accounts to track where your money lives.</p>
      `;
      card.appendChild(empty);
    } else {
      this.accounts.forEach((a) => card.appendChild(this.buildAccountRow(a)));
    }

    this.container.appendChild(card);

    const focusId = sessionStorage.getItem('cal-focus-bank');
    const focusExpenseId = sessionStorage.getItem('ff-focus-ledger-bank');
    if (focusId) {
      sessionStorage.removeItem('cal-focus-bank');
      if (focusExpenseId) sessionStorage.removeItem('ff-focus-ledger-bank');
      requestAnimationFrame(() => {
        const target = this.container.querySelector<HTMLElement>(`[data-account-id="${focusId}"]`);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });

        if (focusExpenseId) {
          // Open the ledger panel if it's closed
          const ledgerPanel = target.querySelector<HTMLElement>('.account-ledger-panel');
          if (ledgerPanel && ledgerPanel.style.display === 'none') {
            ledgerPanel.style.display = '';
          }
          // Highlight the specific expense entry; fall back to highlighting the row
          const entryRow = target.querySelector<HTMLElement>(`[data-expense-id="${focusExpenseId}"]`);
          if (entryRow) {
            setTimeout(() => {
              entryRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
              entryRow.classList.add('cal-focus-highlight');
            }, 150);
          } else {
            target.classList.add('cal-focus-highlight');
          }
        } else {
          target.classList.add('cal-focus-highlight');
        }
      });
    }
  }

  // ── Deposits chart ─────────────────────────────────────────────────────

  private buildDepositsChart(): HTMLElement | null {
    // Only show the chart when at least one account has income linked to it
    const assignedSources = this.incomeSources.filter((s) => s.active && s.bankAccountId);
    if (assignedSources.length === 0 || this.accounts.length === 0) return null;

    // Build 7-month window: 6 months back + current month
    const now = new Date();
    const months: { y: number; m: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ y: d.getFullYear(), m: d.getMonth() });
    }

    const labels = months.map(({ y, m }) => mLabel(y, m));

    // For each account, compute monthly deposits only from when each source existed.
    // We do NOT retroactively project — if a source was added this month, it only
    // contributes to this month and forward, not to historical bars.
    const datasets = this.accounts
      .filter((a) => assignedSources.some((s) => s.bankAccountId === a.id))
      .map((account, idx) => {
        const sources = this.incomeSources.filter(
          (s) => s.active && s.bankAccountId === account.id,
        );

        const data = months.map(({ y, m }) => {
          const mStart = new Date(y, m, 1).getTime();
          const mEnd = new Date(y, m + 1, 1).getTime();
          let total = 0;
          sources.forEach((s) => {
            // Only count this source if it existed before the end of this month
            if (s.createdAt >= mEnd) return;
            if (s.frequency === 'once') {
              if (s.date !== undefined && s.date >= mStart && s.date < mEnd) {
                total += s.amount;
              }
            } else {
              total += sourceMonthly(s);
            }
          });
          return Math.round(total * 100) / 100;
        });

        const color = account.color ?? SERIES_COLORS[idx % SERIES_COLORS.length]!;
        return {
          label: account.name,
          data,
          backgroundColor: color + 'CC',
          borderColor: color,
          borderWidth: 1,
          borderRadius: 3,
        };
      });

    const card = document.createElement('div');
    card.className = 'card';

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4)';
    const title = document.createElement('h2');
    title.className = 'font-serif';
    title.style.fontSize = 'var(--text-xl)';
    title.textContent = 'Monthly Deposits';
    const sub = document.createElement('span');
    sub.className = 'text-xs text-muted';
    sub.textContent = 'Last 7 months — from income sources as of when they were added';
    titleRow.appendChild(title);
    titleRow.appendChild(sub);
    card.appendChild(titleRow);

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;height:220px';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    card.appendChild(wrap);

    // Defer chart creation until canvas is in the DOM
    requestAnimationFrame(() => {
      this.activeChart = new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } },
            tooltip: {
              callbacks: {
                label: (c) => `${c.dataset.label}: ${fmtCents.format(c.parsed.y ?? 0)}`,
              },
            },
          },
          scales: {
            x: { grid: { display: false } },
            y: {
              beginAtZero: true,
              ticks: { callback: (v) => `$${Number(v).toLocaleString()}` },
            },
          },
        },
      });
    });

    return card;
  }

  // ── Account row ────────────────────────────────────────────────────────

  private buildAccountRow(account: BankAccount): HTMLElement {
    const activeSources = this.incomeSources.filter(
      (s) => s.active && s.frequency !== 'once' && s.bankAccountId === account.id,
    );
    const monthlyIncome = activeSources.reduce((sum, s) => sum + sourceMonthly(s), 0);

    // One-time deposits falling in the selected month
    const monthStart = new Date(this.viewYear, this.viewMonth, 1).getTime();
    const monthEnd = new Date(this.viewYear, this.viewMonth + 1, 1).getTime();
    const oneTimeSources = this.incomeSources.filter(
      (s) => s.active && s.frequency === 'once' && s.bankAccountId === account.id
        && s.date != null && s.date >= monthStart && s.date < monthEnd,
    );
    const oneTimeIncome = oneTimeSources.reduce((sum, s) => sum + s.amount, 0);


    // Recurring expenses linked to this account with no payment this month → use estimate
    const unpaidEstimates = this.expenses
      .filter((e) => e.bankAccountId === account.id && e.recurring)
      .reduce((sum, e) => {
        const hasPaid = this.paidRecords.some(
          (r) => r.expenseId === e.id && r.date >= monthStart && r.date < monthEnd,
        );
        return sum + (hasPaid ? 0 : toMonthly(e.amount, e.recurringFrequency ?? 'monthly'));
      }, 0);

    // Expense paid records drawn from this bank account this month
    const expensePaidFromAccount = this.paidRecords
      .filter((r) => r.bankAccountId === account.id && r.date >= monthStart && r.date < monthEnd)
      .reduce((sum, r) => sum + r.amount, 0);

    // Legacy: paid records with no bankAccountId for expenses linked to this account (backward compat)
    const legacyExpensePaid = this.paidRecords
      .filter((r) => !r.bankAccountId && r.date >= monthStart && r.date < monthEnd)
      .reduce((sum, r) => {
        const exp = this.expenses.find((e) => e.id === r.expenseId && e.bankAccountId === account.id);
        return sum + (exp ? r.amount : 0);
      }, 0);

    const monthlyExpenses = unpaidEstimates + expensePaidFromAccount + legacyExpensePaid;

    const debtPaymentsTotal = this.debtPayments
      .filter((p) => p.bankAccountId === account.id && p.date >= monthStart && p.date < monthEnd)
      .reduce((sum, p) => sum + p.amount, 0);

    const transfersIn = this.transfers
      .filter((t) => t.toAccountId === account.id && t.date >= monthStart && t.date < monthEnd)
      .reduce((sum, t) => sum + t.amount, 0);
    const transfersOut = this.transfers
      .filter((t) => t.fromAccountId === account.id && t.date >= monthStart && t.date < monthEnd)
      .reduce((sum, t) => sum + t.amount, 0);

    const row = document.createElement('div');
    row.className = 'account-row';
    row.setAttribute('data-testid', 'account-row');
    row.setAttribute('data-account-id', account.id);

    const nameCell = document.createElement('div');
    nameCell.className = 'account-row-name';

    // Top line: color swatch + account name + type + ownership badges
    const nameTop = document.createElement('div');
    nameTop.className = 'account-row-name-top';

    const accountIdx = this.accounts.indexOf(account);
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
      const member = this.members.find((m) => m.id === account.memberId);
      ownerBadge.textContent = member ? member.name : 'Individual';
    } else {
      ownerBadge.textContent = OWNERSHIP_LABELS[account.ownership];
    }
    nameTop.appendChild(ownerBadge);
    nameCell.appendChild(nameTop);

    // Pre-compute filtered data needed for actual balance + ledger panel
    const accountPaidRecords = this.paidRecords.filter((r) => r.bankAccountId === account.id);
    const accountDebtPayments = this.debtPayments.filter((p) => p.bankAccountId === account.id);
    const accountSources = this.incomeSources.filter((s) => s.bankAccountId === account.id && s.active);
    const accountTransfers = this.transfers.filter((t) => t.fromAccountId === account.id || t.toAccountId === account.id);

    // Bottom line: actual + projected balance blocks below the account name
    const nameBottom = document.createElement('div');
    nameBottom.className = 'account-row-name-bottom';
    nameBottom.setAttribute('data-testid', 'account-balance-cell');

    const monthlyNet = monthlyIncome + oneTimeIncome - monthlyExpenses - debtPaymentsTotal + transfersIn - transfersOut;
    const hasLinkedData = monthlyIncome > 0 || oneTimeIncome > 0 || monthlyExpenses > 0 || debtPaymentsTotal > 0 || expensePaidFromAccount > 0 || transfersIn > 0 || transfersOut > 0;
    const displayBalance = (account.balance != null || hasLinkedData)
      ? (account.balance ?? 0) + monthlyNet
      : null;

    const actualBalance = this.computeActualBalance(account, accountPaidRecords, accountDebtPayments, accountSources, accountTransfers);
    const hasActualData = account.balance != null
      || accountPaidRecords.length > 0
      || accountDebtPayments.length > 0
      || accountSources.length > 0
      || accountTransfers.length > 0;

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

    if (displayBalance != null) {
      const block = document.createElement('div');
      block.className = 'account-balance-block';
      const lbl = document.createElement('span');
      lbl.className = 'account-balance-label';
      lbl.textContent = 'Projected';
      block.appendChild(lbl);
      const isNeg = displayBalance < 0;
      const val = document.createElement('span');
      val.className = `account-row-balance account-row-balance--projected${isNeg ? ' account-row-balance--negative' : ''}`;
      val.setAttribute('data-testid', 'account-balance');
      val.textContent = fmtCents.format(displayBalance);
      block.appendChild(val);
      nameBottom.appendChild(block);
    }

    if (!hasActualData && displayBalance == null) {
      const hint = document.createElement('span');
      hint.className = 'account-row-balance-hint';
      hint.setAttribute('data-testid', 'account-balance-hint');
      hint.textContent = 'Link income or expenses to see balance';
      nameBottom.appendChild(hint);
    }
    nameCell.appendChild(nameBottom);

    // Income items list — clickable entries below the balance
    if (activeSources.length > 0 || oneTimeSources.length > 0) {
      const incomeList = document.createElement('div');
      incomeList.className = 'account-income-list';

      activeSources.forEach((s) => {
        incomeList.appendChild(this.buildIncomeItem(s, fmtCents.format(sourceMonthly(s)) + '/mo'));
      });
      oneTimeSources.forEach((s) => {
        incomeList.appendChild(this.buildIncomeItem(s, fmtCents.format(s.amount)));
      });

      nameCell.appendChild(incomeList);
    }

    row.appendChild(nameCell);

    // Right-side totals only
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
        categories: this.categories,
        onComplete: () => this.load(),
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

    if (this.accounts.length > 1) {
      const transferBtn = document.createElement('button');
      transferBtn.className = 'icon-btn';
      transferBtn.setAttribute('data-action', 'transfer');
      transferBtn.setAttribute('data-testid', 'account-transfer');
      transferBtn.title = 'Transfer funds';
      transferBtn.textContent = '⇄';
      transferBtn.addEventListener('click', () => this.openTransferModal(account));
      actionsCell.appendChild(transferBtn);
    }

    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.setAttribute('data-action', 'edit');
    editBtn.setAttribute('data-testid', 'account-edit');
    editBtn.title = 'Edit';
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', () => this.openAccountForm(account));
    actionsCell.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn danger';
    deleteBtn.setAttribute('data-action', 'delete');
    deleteBtn.setAttribute('data-testid', 'account-delete');
    deleteBtn.title = 'Delete';
    deleteBtn.textContent = '🗑️';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete "${account.name}"?`)) return;
      const [sources, expenses, paidRecords, debtPayments] = await Promise.all([
        getIncomeSources(),
        getExpenses(),
        getExpensePaidRecords(),
        getDebtPayments(),
      ]);
      await Promise.all([
        ...sources.filter((s) => s.bankAccountId === account.id).map(({ bankAccountId: _, ...s }) => saveIncomeSource(s)),
        ...expenses.filter((e) => e.bankAccountId === account.id).map(({ bankAccountId: _, ...e }) => saveExpense(e)),
        ...paidRecords.filter((r) => r.bankAccountId === account.id).map(({ bankAccountId: _, ...r }) => saveExpensePaidRecord(r)),
        ...debtPayments.filter((p) => p.bankAccountId === account.id).map(({ bankAccountId: _, ...p }) => saveDebtPayment(p)),
        deleteBankTransactionsByAccount(account.id),
      ]);
      await deleteBankAccount(account.id);
      await this.load();
    });
    actionsCell.appendChild(deleteBtn);

    // Ledger button + panel
    const accountBankTxns = this.bankTransactions.filter((t) => t.bankAccountId === account.id);
    const ledgerPanel = this.buildAccountLedgerPanel(account, accountPaidRecords, accountDebtPayments, accountSources, accountTransfers, accountBankTxns);
    const ledgerCount = accountPaidRecords.length + accountDebtPayments.length + accountSources.length + accountTransfers.length + accountBankTxns.length;

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

  // ── Actual balance computation ─────────────────────────────────────────

  private computeActualBalance(
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

  // ── Account ledger panel ───────────────────────────────────────────────

  private buildAccountLedgerPanel(
    account: BankAccount,
    paidRecords: ExpensePaidRecord[],
    debtPayments: DebtPayment[],
    incomeSources: IncomeSource[],
    transfers: AccountTransfer[],
    bankTransactions: BankTransaction[] = [],
  ): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'account-ledger-panel';
    panel.style.display = 'none';

    type LedgerEntry = { date: number; label: string; amount: number; isDebit: boolean; expenseId?: string };
    const entries: LedgerEntry[] = [];

    for (const r of paidRecords) {
      const exp = this.expenses.find((e) => e.id === r.expenseId);
      entries.push({
        date: r.date,
        label: exp ? exp.description : 'Expense payment',
        amount: r.amount,
        isDebit: true,
        expenseId: r.expenseId,
      });
    }

    for (const p of debtPayments) {
      const debt = this.debtAccounts.find((d) => d.id === p.accountId);
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
      const otherAccount = this.accounts.find((a) => a.id === otherAccountId);
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

    // Generate historical paycheck dates for each income source linked to this account.
    // Look back up to 12 months (or from createdAt, whichever is more recent) through today.
    const now = new Date();
    const horizonMs = Math.max(
      new Date(now.getFullYear(), now.getMonth() - 12, 1).getTime(),
      0,
    );
    for (const s of incomeSources) {
      if (s.frequency === 'once') {
        if (s.date != null && s.date <= now.getTime()) {
          entries.push({ date: s.date, label: s.name, amount: s.amount, isDebit: false });
        }
        continue;
      }
      // Determine start: the later of 12-month horizon and source createdAt,
      // floored to midnight so a source added at 10 AM still shows today's payday.
      const rawStart = new Date(Math.max(horizonMs, s.createdAt));
      rawStart.setHours(0, 0, 0, 0);
      const startMs = rawStart.getTime();
      const start = rawStart;
      // Walk month by month from start through now
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

    // Imported bank transactions
    for (const t of bankTransactions) {
      const isDebit = t.amount < 0;
      entries.push({
        date: t.date,
        label: t.description || 'Imported transaction',
        amount: Math.abs(t.amount),
        isDebit,
      });
    }

    // Sort ascending to compute the running balance from the opening balance forward.
    entries.sort((a, b) => a.date - b.date);

    const openingBalance = account.balance ?? 0;
    let running = openingBalance;
    const entriesWithBalance = entries.map((e) => {
      running += e.isDebit ? -e.amount : e.amount;
      return { ...e, balance: running };
    });
    const actualBalance = running;

    // Display newest-first.
    entriesWithBalance.reverse();

    if (entriesWithBalance.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'text-muted text-sm';
      empty.style.padding = 'var(--space-3) var(--space-4)';
      empty.textContent = 'No transactions linked to this account yet.';
      panel.appendChild(empty);
      return panel;
    }

    // ── Actual balance summary bar ─────────────────────────────────────────
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

    // ── Column headers ─────────────────────────────────────────────────────
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

    // ── Transaction rows ───────────────────────────────────────────────────
    for (const entry of entriesWithBalance) {
      const ledgerRow = document.createElement('div');
      ledgerRow.className = 'account-ledger-row';
      if (entry.expenseId) ledgerRow.setAttribute('data-expense-id', entry.expenseId);

      const dateEl = document.createElement('span');
      dateEl.className = 'account-ledger-date';
      dateEl.textContent = new Date(entry.date).toLocaleDateString('en-US', {
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

    // ── Opening balance anchor row ─────────────────────────────────────────
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

  // ── Transfer modal ─────────────────────────────────────────────────────

  private openTransferModal(fromAccount: BankAccount): void {
    const body = document.createElement('div');
    body.className = 'account-form';

    const _now = new Date();
    const todayStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;

    const otherAccounts = this.accounts.filter((a) => a.id !== fromAccount.id);
    const toOptions = otherAccounts
      .map((a) => `<option value="${a.id}">${a.name}</option>`)
      .join('');

    body.innerHTML = `
      <p class="text-muted text-sm" style="margin-bottom:var(--space-4)">
        Withdrawing from <strong>${fromAccount.name}</strong> and depositing into another account.
      </p>
      <div class="form-group">
        <label class="form-label" for="tr-to-account">Destination account <span class="req">*</span></label>
        <select id="tr-to-account">${toOptions}</select>
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label class="form-label" for="tr-amount">Amount <span class="req">*</span></label>
          <input id="tr-amount" type="number" min="0.01" step="0.01" placeholder="0.00" />
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label" for="tr-date">Date <span class="req">*</span></label>
          <input id="tr-date" type="date" value="${todayStr}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="tr-note">Note <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
        <input id="tr-note" type="text" maxlength="128" placeholder="e.g. ATM cash withdrawal" />
      </div>
      <div id="tr-error" class="form-error" style="display:none"></div>
    `;

    openFormModal({
      title: 'Transfer Funds',
      body,
      submitLabel: 'Record transfer',
      onSubmit: async (close) => {
        const toAccountId = body.querySelector<HTMLSelectElement>('#tr-to-account')!.value;
        const amountStr = body.querySelector<HTMLInputElement>('#tr-amount')!.value;
        const dateStr = body.querySelector<HTMLInputElement>('#tr-date')!.value;
        const note = body.querySelector<HTMLInputElement>('#tr-note')!.value.trim() || undefined;
        const errEl = body.querySelector<HTMLElement>('#tr-error')!;

        errEl.style.display = 'none';
        const amount = parseFloat(amountStr);
        if (!amountStr || isNaN(amount) || amount <= 0) {
          errEl.textContent = 'Enter a valid amount greater than zero.';
          errEl.style.display = 'block';
          return;
        }
        if (!dateStr) {
          errEl.textContent = 'Date is required.';
          errEl.style.display = 'block';
          return;
        }
        const dateParts = dateStr.split('-').map(Number);
        const date = new Date(dateParts[0]!, dateParts[1]! - 1, dateParts[2]!).getTime();

        const transfer = createAccountTransfer(fromAccount.id, toAccountId, amount, date, note);
        await saveAccountTransfer(transfer);
        close();
        await this.load();
      },
    });
  }

  // ── Income item (clickable, navigates to Income page with focus) ──────

  private buildIncomeItem(source: IncomeSource, amountLabel: string): HTMLElement {
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

  // ── Account form modal ─────────────────────────────────────────────────

  private openAccountForm(existing?: BankAccount): void {
    const isEdit = !!existing;
    const body = document.createElement('div');
    body.className = 'account-form';

    const memberOptions = [
      `<option value="">— Select member —</option>`,
      ...this.members.map(
        (m) => `<option value="${m.id}" ${existing?.memberId === m.id ? 'selected' : ''}>${m.name}</option>`,
      ),
    ].join('');

    const initOwnership = existing?.ownership ?? 'household';

    const defaultColor = existing?.color ?? SERIES_COLORS[this.accounts.length % SERIES_COLORS.length]!;

    body.innerHTML = `
      <div class="form-group">
        <label class="form-label" for="ba-name">Account name <span class="req">*</span></label>
        <input id="ba-name" type="text" value="${existing?.name ?? ''}"
          placeholder="e.g. Chase Checking, Emergency Fund" maxlength="64" />
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label class="form-label" for="ba-url">Online banking URL <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
          <input id="ba-url" type="url" placeholder="https://chase.com" maxlength="512" />
          <span class="form-hint">Opens as a quick link on the account list.</span>
        </div>
        <div class="form-group" style="flex:0 0 auto">
          <label class="form-label" for="ba-color">Chart color</label>
          <input id="ba-color" type="color" value="${defaultColor}" style="width:48px;height:38px;padding:2px;cursor:pointer;border-radius:var(--radius-sm)" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="ba-type">Account type <span class="req">*</span></label>
          <select id="ba-type">
            <option value="checking"     ${(existing?.accountType ?? 'checking') === 'checking'     ? 'selected' : ''}>Checking</option>
            <option value="savings"      ${existing?.accountType === 'savings'      ? 'selected' : ''}>Savings</option>
            <option value="money-market" ${existing?.accountType === 'money-market' ? 'selected' : ''}>Money Market</option>
            <option value="cash"         ${existing?.accountType === 'cash'         ? 'selected' : ''}>Cash</option>
            <option value="other"        ${existing?.accountType === 'other'        ? 'selected' : ''}>Other</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="ba-balance">Starting balance <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
          <input id="ba-balance" type="number" step="0.01"
            value="${existing?.balance ?? ''}" placeholder="0.00" />
          <span class="form-hint">Your balance today. If blank, it will be derived from linked income and expenses.</span>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="ba-ownership">Ownership <span class="req">*</span></label>
        <select id="ba-ownership">
          <option value="household"  ${initOwnership === 'household'  ? 'selected' : ''}>Household (shared)</option>
          <option value="joint"      ${initOwnership === 'joint'      ? 'selected' : ''}>Joint (two members)</option>
          <option value="individual" ${initOwnership === 'individual' ? 'selected' : ''}>Individual (one member)</option>
        </select>
      </div>
      <div class="form-group" id="ba-member-row" style="${initOwnership === 'individual' ? '' : 'display:none'}">
        <label class="form-label" for="ba-member">Account owner <span class="req">*</span></label>
        <select id="ba-member">${memberOptions}</select>
      </div>
      <div id="ba-error" class="form-error" style="display:none"></div>
    `;

    if (existing?.url) body.querySelector<HTMLInputElement>('#ba-url')!.value = existing.url;

    const ownershipSel = body.querySelector<HTMLSelectElement>('#ba-ownership')!;
    const memberRow = body.querySelector<HTMLElement>('#ba-member-row')!;
    ownershipSel.addEventListener('change', () => {
      memberRow.style.display = ownershipSel.value === 'individual' ? '' : 'none';
    });

    let flushReminders: (finalItemId: string) => Promise<void> = async () => {};
    if (isEdit && existing) {
      const { element, flush } = buildLinkedRemindersSection(existing.id, 'account', existing.name);
      body.appendChild(element);
      flushReminders = flush;
    } else {
      const nameInput = body.querySelector<HTMLInputElement>('#ba-name')!;
      const { element, flush } = buildLinkedRemindersSection('', 'account', 'Account', {
        deferred: true,
        getLabel: () => nameInput.value.trim() || 'Account',
      });
      body.appendChild(element);
      flushReminders = flush;
    }

    openFormModal({
      title: isEdit ? 'Edit Account' : 'Add Bank Account',
      body,
      submitLabel: isEdit ? 'Save changes' : 'Add account',
      onSubmit: async (close) => {
        const name = body.querySelector<HTMLInputElement>('#ba-name')!.value.trim();
        const accountType = body.querySelector<HTMLSelectElement>('#ba-type')!.value as BankAccountType;
        const ownership = ownershipSel.value as BankAccountOwnership;
        const memberId = body.querySelector<HTMLSelectElement>('#ba-member')!.value || undefined;
        const balanceStr = body.querySelector<HTMLInputElement>('#ba-balance')!.value;
        const balance = balanceStr ? parseFloat(balanceStr) : undefined;
        const url = body.querySelector<HTMLInputElement>('#ba-url')!.value.trim() || undefined;
        const color = body.querySelector<HTMLInputElement>('#ba-color')!.value || undefined;
        const errEl = body.querySelector<HTMLElement>('#ba-error')!;

        errEl.style.display = 'none';
        const missing: string[] = [];
        if (!name) missing.push('Account name');
        if (ownership === 'individual' && !memberId) missing.push('Account owner');
        if (missing.length > 0) {
          errEl.textContent = missing.length === 1
            ? `${missing[0]} is required.`
            : `Fill in all required fields: ${missing.join(', ')}.`;
          errEl.style.display = 'block';
          return;
        }

        const account: BankAccount = existing
          ? { ...existing, name, accountType, ownership, updatedAt: Date.now() }
          : createBankAccount(name, accountType, ownership);

        if (ownership === 'individual' && memberId) account.memberId = memberId;
        else delete account.memberId;

        if (balance != null && !isNaN(balance)) account.balance = balance;
        else delete account.balance;

        if (url) account.url = url;
        else delete account.url;

        if (color) account.color = color;
        else delete account.color;

        await saveBankAccount(account);
        await flushReminders(account.id);
        close();
        await this.load();
      },
    });
  }
}
