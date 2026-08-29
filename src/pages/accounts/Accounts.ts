import './accounts.css';
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
} from '@/db';
import { openFormModal } from '@/components/Modal';
import { fmt, fmtCents, sourceMonthly, toMonthly } from '@/utils/finance';
import { buildLinkedRemindersSection } from '@/utils/notificationModal';
import type { BankAccount, BankAccountType, BankAccountOwnership, DebtPayment, HouseholdMember, IncomeSource, Expense, ExpensePaidRecord } from '@/types';

Chart.register(BarController, BarElement, LinearScale, CategoryScale, Tooltip, Legend);

const ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  'checking':     'Checking',
  'savings':      'Savings',
  'money-market': 'Money Market',
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
    [this.accounts, this.members, this.incomeSources, this.expenses, this.paidRecords, this.debtPayments] = await Promise.all([
      getBankAccounts(), getMembers(), getIncomeSources(), getExpenses(), getExpensePaidRecords(), getDebtPayments(),
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
        <h1 class="font-serif">Bank Accounts</h1>
        <p class="text-muted text-sm">Track where income is deposited and where expenses are paid from.</p>
      </div>
    `;

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.setAttribute('data-testid', 'add-account-btn');
    addBtn.textContent = '+ Add account';
    addBtn.addEventListener('click', () => this.openAccountForm());
    header.appendChild(addBtn);
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
        <p>Add checking, savings, or money-market accounts to track where your money lives.</p>
      `;
      card.appendChild(empty);
    } else {
      this.accounts.forEach((a) => card.appendChild(this.buildAccountRow(a)));
    }

    this.container.appendChild(card);
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
    const oneTimeIncome = this.incomeSources
      .filter((s) => s.active && s.frequency === 'once' && s.bankAccountId === account.id
        && s.date != null && s.date >= monthStart && s.date < monthEnd)
      .reduce((sum, s) => sum + s.amount, 0);

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

    // Bottom line: current balance, prominently below the account name
    const nameBottom = document.createElement('div');
    nameBottom.className = 'account-row-name-bottom';
    nameBottom.setAttribute('data-testid', 'account-balance-cell');

    const monthlyNet = monthlyIncome + oneTimeIncome - monthlyExpenses - debtPaymentsTotal;
    const hasLinkedData = monthlyIncome > 0 || oneTimeIncome > 0 || monthlyExpenses > 0 || debtPaymentsTotal > 0 || expensePaidFromAccount > 0;
    const displayBalance = (account.balance != null || hasLinkedData)
      ? (account.balance ?? 0) + monthlyNet
      : null;

    if (displayBalance != null) {
      const isNeg = displayBalance < 0;
      const bal = document.createElement('span');
      bal.className = `account-row-balance${isNeg ? ' account-row-balance--negative' : ''}`;
      bal.setAttribute('data-testid', 'account-balance');
      bal.textContent = fmtCents.format(displayBalance);
      nameBottom.appendChild(bal);
    } else {
      const hint = document.createElement('span');
      hint.className = 'account-row-balance-hint';
      hint.setAttribute('data-testid', 'account-balance-hint');
      hint.textContent = 'Link income or expenses to see balance';
      nameBottom.appendChild(hint);
    }
    nameCell.appendChild(nameBottom);

    row.appendChild(nameCell);

    // Monthly summary — right-aligned, same line as the action buttons
    const depositsCell = document.createElement('div');
    depositsCell.style.cssText = 'text-align:right';
    const totalDeposits = monthlyIncome + oneTimeIncome;
    if (totalDeposits > 0) {
      const inc = document.createElement('div');
      inc.className = 'text-xs text-muted';
      inc.setAttribute('data-testid', 'account-monthly-income');
      inc.textContent = `${fmt.format(totalDeposits)}/mo deposits`;
      depositsCell.appendChild(inc);
    }
    if (debtPaymentsTotal > 0) {
      const dpLine = document.createElement('div');
      dpLine.className = 'text-xs text-muted';
      dpLine.setAttribute('data-testid', 'account-debt-payments');
      dpLine.textContent = `−${fmt.format(debtPaymentsTotal)} debt payments`;
      depositsCell.appendChild(dpLine);
    }
    row.appendChild(depositsCell);

    const actionsCell = document.createElement('div');
    actionsCell.className = 'account-row-actions';

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
        ...sources.filter((s) => s.bankAccountId === account.id).map((s) => saveIncomeSource({ ...s, bankAccountId: undefined })),
        ...expenses.filter((e) => e.bankAccountId === account.id).map((e) => saveExpense({ ...e, bankAccountId: undefined })),
        ...paidRecords.filter((r) => r.bankAccountId === account.id).map((r) => saveExpensePaidRecord({ ...r, bankAccountId: undefined })),
        ...debtPayments.filter((p) => p.bankAccountId === account.id).map((p) => saveDebtPayment({ ...p, bankAccountId: undefined })),
      ]);
      await deleteBankAccount(account.id);
      await this.load();
    });
    actionsCell.appendChild(deleteBtn);

    row.appendChild(actionsCell);
    return row;
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
