import './accounts.css';
import { makeHelpBtn } from '@/utils/helpNav';
import { showPageError } from '@/utils/errorUI';
import {
  getBankAccounts, getMembers, getIncomeSources, getExpenses,
  getExpensePaidRecords, getDebtPayments, getDebtAccounts,
  getAccountTransfers, getBankTransactions, getCategories,
} from '@/db';
import { buildDepositsChart, type ChartRef } from './AccountsChart';
import { buildAccountRow, type AccountRowContext } from './AccountRow';
import { openAccountForm } from './AccountForm';
import type { BankAccount, HouseholdMember, IncomeSource, Expense, ExpensePaidRecord, DebtPayment, DebtAccount, AccountTransfer, BankTransaction, ExpenseCategory } from '@/types';

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
  private _chartRef: ChartRef = { instance: null };
  private viewYear: number = new Date().getFullYear();
  private viewMonth: number = new Date().getMonth();

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'accounts-page';
    void this.load();
    return this.container;
  }

  private async load(): Promise<void> {
    try {
      [this.accounts, this.members, this.incomeSources, this.expenses, this.paidRecords, this.debtPayments, this.debtAccounts, this.transfers, this.bankTransactions, this.categories] = await Promise.all([
        getBankAccounts(), getMembers(), getIncomeSources(), getExpenses(), getExpensePaidRecords(), getDebtPayments(), getDebtAccounts(), getAccountTransfers(), getBankTransactions(), getCategories(),
      ]);
      this.paint();
    } catch (err) {
      showPageError(this.container, err instanceof Error ? err.message : 'Failed to load accounts', () => { void this.load(); });
    }
  }

  private paint(): void {
    this._chartRef.instance?.destroy();
    this._chartRef.instance = null;
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
    addBtn.addEventListener('click', () => openAccountForm(undefined, this.accounts, this.members, () => this.load()));
    header.appendChild(addBtn);
    header.querySelector('h1')?.appendChild(makeHelpBtn('accounts'));
    this.container.appendChild(header);

    // ── Deposits chart ───────────────────────────────────────────────────
    const chartEl = buildDepositsChart(this.accounts, this.incomeSources, this._chartRef);
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
      const rowCtx: AccountRowContext = {
        accounts: this.accounts,
        members: this.members,
        incomeSources: this.incomeSources,
        expenses: this.expenses,
        paidRecords: this.paidRecords,
        debtPayments: this.debtPayments,
        debtAccounts: this.debtAccounts,
        transfers: this.transfers,
        bankTransactions: this.bankTransactions,
        categories: this.categories,
        viewYear: this.viewYear,
        viewMonth: this.viewMonth,
        onLoad: () => this.load(),
      };
      this.accounts.forEach((a) => card.appendChild(buildAccountRow(a, rowCtx)));
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
          const ledgerPanel = target.querySelector<HTMLElement>('.account-ledger-panel');
          if (ledgerPanel && ledgerPanel.style.display === 'none') {
            ledgerPanel.style.display = '';
          }
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
}
