import './debt.css';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
  type ChartDataset,
} from 'chart.js';
import {
  getDebtAccounts, saveDebtAccount, deleteDebtAccount, createDebtAccount,
  getDebtPayments, saveDebtPayment, deleteDebtPayment, createDebtPayment,
  getCardCharges, saveCardCharge, deleteCardCharge, createCardCharge,
  getCategories, saveCategory,
  getBankAccounts,
  getExpenses, saveExpense,
  getExpensePaidRecords, saveExpensePaidRecord,
} from '@/db';
import { openFormModal } from '@/components/Modal';
import { fmt, fmtCents } from '@/utils/finance';
import { navigate } from '@/app/router';
import {
  amortizeSingleCard,
  amortizeMultiCard,
  comparePayoffScenarios,
  detectMinimumPaymentTrap,
} from '@/engine/amortize';
import { showMascot, showDebtPayoffCelebration, showAllDebtFreeCelebration } from '@/mascot/Mascot';
import { computeMinPayment, computePaymentStatus } from '@/utils/paymentStatus';
import { refreshNotifier } from '@/utils/notifier';
import { openAddNotificationModal, buildLinkedRemindersSection } from '@/utils/notificationModal';
import type { BankAccount, CardCharge, DebtAccount, DebtAccountType, DebtPayment, DebtStrategy, ExpenseCategory, PaymentCycle } from '@/types';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

const PAYMENT_CYCLE_LABELS: Record<PaymentCycle, string> = {
  weekly: 'Weekly', biweekly: 'Every 2 weeks', semimonthly: 'Twice monthly', monthly: 'Monthly',
};

const DEBT_TYPE_LABELS: Record<DebtAccountType, string> = {
  card:     '💳 Credit Card',
  mortgage: '🏠 Mortgage',
  medical:  '🏥 Medical Debt',
  loan:     '💼 Personal / Student Loan',
  vehicle:  '🚗 Vehicle Loan',
};

const DEBT_TYPE_ICONS: Record<DebtAccountType, string> = {
  card: '💳', mortgage: '🏠', medical: '🏥', loan: '💼', vehicle: '🚗',
};

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

const STRATEGY_DESCS: Record<DebtStrategy, string> = {
  avalanche: 'Pay off highest-APR account first. Saves the most interest overall.',
  snowball:  'Pay off smallest balance first. Builds momentum with quick wins.',
  custom:    'You decide the payoff order.',
};

const HIGH_APR_THRESHOLD = 20;
const HIGH_BALANCE_THRESHOLD = 5000;

const PERIODS_PER_YEAR_MAP: Record<PaymentCycle, number> = {
  weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12,
};

const HORIZON_OPTIONS = [1, 2, 3, 4, 5, 10, 20, 30] as const;

export class DebtPage {
  private accounts: DebtAccount[] = [];
  private payments: DebtPayment[] = [];
  private charges: CardCharge[] = [];
  private expenseCategories: ExpenseCategory[] = [];
  private bankAccounts: BankAccount[] = [];
  private horizonYears: 1 | 2 | 3 | 4 | 5 | 10 | 20 | 30 = 2;
  private strategy: DebtStrategy = 'avalanche';
  private customOrder: string[] = [];
  private extraPayment = 0;
  private selectedAccountId: string | null = null;
  private _openChargesPanels = new Set<string>();
  private _chargesPageState = new Map<string, { page: number; pageSize: number; sortAsc: boolean }>();
  private container!: HTMLElement;
  private chartInstance: Chart | null = null;

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'debt-page';
    this.load();
    return this.container;
  }

  private async load(): Promise<void> {
    [this.accounts, this.payments, this.charges, this.expenseCategories, this.bankAccounts] = await Promise.all([
      getDebtAccounts(),
      getDebtPayments(),
      getCardCharges(),
      getCategories(),
      getBankAccounts(),
    ]);
    if (this.accounts.length > 0 && !this.selectedAccountId) {
      this.selectedAccountId = this.accounts[0]!.id;
    }
    if (this.customOrder.length === 0) {
      this.customOrder = this.accounts.map((a) => a.id);
    }
    this.paint();
  }

  private paint(): void {
    this.chartInstance?.destroy();
    this.container.innerHTML = '';

    const totalDebt = this.accounts.reduce((s, a) => s + a.balance, 0);

    // ── Header ──────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'debt-header';
    header.innerHTML = `
      <div>
        <h1 class="font-serif">Debt</h1>
        <p class="text-muted text-sm">Track balances, interest, and your path to debt freedom.</p>
      </div>
      <div style="text-align:right">
        <div class="debt-total-label">Total debt</div>
        <div class="debt-total-value" data-testid="debt-total-value">${totalDebt > 0 ? fmt.format(totalDebt) : '—'}</div>
      </div>
    `;
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.setAttribute('data-testid', 'add-debt-btn');
    addBtn.textContent = '+ Add debt';
    addBtn.addEventListener('click', () => this.openDebtForm());
    header.appendChild(addBtn);
    this.container.appendChild(header);

    if (this.accounts.length === 0) {
      this.container.appendChild(this.renderEmpty());
      return;
    }

    // ── Minimum payment trap callouts ────────────────────────────────────
    const trapAccounts = this.accounts.filter((a) => detectMinimumPaymentTrap(a).isTrap);
    if (trapAccounts.length > 0) {
      this.container.appendChild(this.renderTrapCallout(trapAccounts));
    }

    // ── Account list ─────────────────────────────────────────────────────
    this.container.appendChild(this.buildDebtList());

    // ── Merchant spending summary ─────────────────────────────────────────
    if (this.charges.length > 0) {
      this.container.appendChild(this.buildMerchantSummary(this.charges));
    }

    // ── Strategy + what-if ───────────────────────────────────────────────
    this.container.appendChild(this.buildStrategyPanel());

    // ── Balance chart ────────────────────────────────────────────────────
    this.container.appendChild(this.buildChart());

    // ── Per-account schedule ─────────────────────────────────────────────
    this.container.appendChild(this.buildSchedulePanel());

    // ── Payoff milestone timeline ─────────────────────────────────────────
    const milestones = this.buildMilestoneCard();
    if (milestones) this.container.appendChild(milestones);

    if (trapAccounts.length > 0) {
      setTimeout(() => showMascot('minimum-payment-trap'), 1200);
    }
  }

  // ── Empty state ────────────────────────────────────────────────────────

  private renderEmpty(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">🏦</span>
        <h3>No debt accounts added yet</h3>
        <p>Add your credit cards, mortgage, vehicle loans, medical debt, or personal loans to see payoff timelines,<br>interest costs, and your path to debt freedom.</p>
      </div>
    `;
    return div;
  }

  // ── Minimum payment trap callout ───────────────────────────────────────

  private renderTrapCallout(trapAccounts: DebtAccount[]): HTMLElement {
    const div = document.createElement('div');
    div.className = 'trap-callout';

    const worst = trapAccounts.reduce((w, a) => {
      const info = detectMinimumPaymentTrap(a);
      const wInfo = detectMinimumPaymentTrap(w);
      return info.yearsToPayoff > wInfo.yearsToPayoff ? a : w;
    });

    const info = detectMinimumPaymentTrap(worst);
    const years = info.yearsToPayoff.toFixed(1);
    const interestMultiple = info.totalInterestRatio.toFixed(1);

    div.innerHTML = `
      <div class="trap-callout-icon">⚠️</div>
      <div>
        <h4>The Minimum Payment Trap</h4>
        <p>
          At minimum payments only, <strong>${worst.name}</strong> would take
          <strong>${years} years</strong> to pay off and cost you
          <strong>${fmtCents.format(worst.balance * info.totalInterestRatio)}</strong> in interest —
          ${interestMultiple}× the balance you're carrying today.
        </p>
        <p>
          Even a small extra payment each month dramatically cuts the time and interest.
          Use the strategy panel below to see exactly how much.
        </p>
      </div>
    `;
    return div;
  }

  // ── Debt account list ──────────────────────────────────────────────────

  private buildDebtList(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card';

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-5)';
    titleRow.innerHTML = '<h2 class="font-serif" style="font-size:var(--text-xl)">My Debt</h2>';
    card.appendChild(titleRow);

    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-3)';

    // Determine avalanche focus (highest APR with a remaining balance, only shown when 2+ active)
    const activeWithBalance = this.accounts.filter((a) => a.balance > 0);
    const avalancheFocusId = activeWithBalance.length >= 2
      ? [...activeWithBalance].sort((a, b) => b.apr - a.apr)[0]?.id ?? null
      : null;

    const paymentsByAccount = new Map<string, DebtPayment[]>();
    this.payments.forEach((p) => {
      const arr = paymentsByAccount.get(p.accountId) ?? [];
      arr.push(p);
      paymentsByAccount.set(p.accountId, arr);
    });

    const chargesByAccount = new Map<string, CardCharge[]>();
    this.charges.forEach((c) => {
      const arr = chargesByAccount.get(c.accountId) ?? [];
      arr.push(c);
      chargesByAccount.set(c.accountId, arr);
    });

    this.accounts.forEach((a) => {
      const accountPayments = paymentsByAccount.get(a.id) ?? [];
      const accountCharges = chargesByAccount.get(a.id) ?? [];
      list.appendChild(this.buildDebtRow(a, accountPayments, accountCharges, a.id === avalancheFocusId));
    });

    card.appendChild(list);
    return card;
  }

  private buildDebtRow(
    a: DebtAccount,
    payments: DebtPayment[],
    charges: CardCharge[],
    isAvalancheFocus: boolean,
  ): HTMLElement {
    const isCard = a.type === 'card';
    const util = isCard && (a.creditLimit ?? 0) > 0 ? a.balance / a.creditLimit! : 0;
    const utilPct = Math.round(util * 100);
    const utilClass = util >= 1 ? 'maxed' : util >= 0.8 ? 'high' : '';
    const needsSetup = a.minimumPaymentValue == null && a.balance > 0;
    const dueDayStr = a.dueDay ? `Due the ${a.dueDay}${ordinal(a.dueDay)}` : '';
    const icon = DEBT_TYPE_ICONS[a.type];

    // Payment status for this month
    const payStatus = computePaymentStatus(a, payments);
    const dueSoonLabel = payStatus.dueDayThisMonth
      ? `Due ${payStatus.dueDayThisMonth.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : 'Due Soon';
    const statusBadge = (() => {
      switch (payStatus.currentMonth) {
        case 'paid':     return '<span class="debt-badge debt-badge--paid">✓ Paid</span>';
        case 'past-due': return '<span class="debt-badge debt-badge--past-due">⚠ Past Due</span>';
        case 'due-soon': return `<span class="debt-badge debt-badge--due-soon">⏰ ${dueSoonLabel}</span>`;
        case 'partial':  return '<span class="debt-badge debt-badge--partial">½ Partial</span>';
        default: return '';
      }
    })();

    // Priority badges
    const now = Date.now();
    const introActive = isCard && !!a.introAprEndDate && a.introAprEndDate > now;
    const highApr = a.apr >= HIGH_APR_THRESHOLD;
    const isPriority = highApr && a.balance >= HIGH_BALANCE_THRESHOLD;
    const badges = [
      isPriority        ? '<span class="debt-badge debt-badge--priority">⚡ Priority</span>' : '',
      !isPriority && highApr && !introActive ? '<span class="debt-badge debt-badge--high-apr">High APR</span>' : '',
      isAvalancheFocus  ? '<span class="debt-badge debt-badge--focus">Pay first</span>' : '',
      introActive       ? '<span class="debt-badge debt-badge--intro">0% Intro</span>' : '',
      statusBadge,
    ].join('');

    const introEndStr = introActive
      ? new Date(a.introAprEndDate!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';
    const aprDisplay = introActive
      ? `0% until ${introEndStr}, then ${a.apr}% APR`
      : `${a.apr}% APR`;
    const cycleDisplay = `${aprDisplay} · ${PAYMENT_CYCLE_LABELS[a.paymentCycle]}${dueDayStr ? ' · ' + dueDayStr : ''}`;

    const hasPayments = payments.length > 0;
    const hasCharges = charges.length > 0;

    const wrapClasses = ['debt-account-wrap'];
    if (needsSetup) wrapClasses.push('debt-account-wrap--needs-setup');
    if (payStatus.currentMonth === 'past-due') wrapClasses.push('debt-account-wrap--past-due');
    else if (payStatus.currentMonth === 'due-soon') wrapClasses.push('debt-account-wrap--due-soon');
    else if (payStatus.currentMonth === 'paid') wrapClasses.push('debt-account-wrap--paid');

    const wrap = document.createElement('div');
    wrap.className = wrapClasses.join(' ');
    wrap.setAttribute('data-account-id', a.id);

    const row = document.createElement('div');
    row.className = 'card-row';
    row.setAttribute('data-testid', 'debt-row');
    row.innerHTML = `
      <div class="card-row-info">
        <div class="card-row-name">
          ${icon} ${a.name}
          ${needsSetup ? '<span class="setup-badge">⚠ Needs payment info</span>' : ''}
          ${badges}
        </div>
        <div class="card-row-meta">
          <span class="card-row-apr">${cycleDisplay}</span>
          ${isCard && (a.creditLimit ?? 0) > 0 ? `
            <div class="util-bar-wrap">
              <div class="util-bar-fill ${utilClass}" style="width:${Math.min(utilPct, 100)}%"></div>
            </div>
            <span class="card-row-util-label">${utilPct}% used</span>
          ` : ''}
        </div>
      </div>
      <div class="card-row-balance${a.balance === 0 ? ' card-row-balance--zero' : ''}" data-testid="debt-row-balance">${fmt.format(a.balance)}</div>
      <div class="card-row-actions">
        ${needsSetup ? '<button class="btn btn-secondary btn-sm" data-action="setup" data-testid="debt-setup">Complete setup →</button>' : ''}
        <button class="btn-pay" data-action="pay" data-testid="debt-pay-btn">💰 Pay</button>
        ${isCard ? `<button class="btn-charges" data-action="charges" data-testid="debt-charges-btn" title="Log charges">🧾 ${hasCharges ? charges.length : '+Charges'}</button>` : ''}
        ${hasPayments ? `<button class="payment-history-btn" data-action="history" data-testid="payment-history-btn" title="Payment history">↓ ${payments.length}</button>` : ''}
        <button class="icon-btn" data-action="notif" title="Add reminder">🔔</button>
        <button class="icon-btn" data-action="edit" data-testid="debt-edit" title="Edit">✏️</button>
        <button class="icon-btn danger" data-action="delete" data-testid="debt-delete" title="Delete">🗑️</button>
      </div>
    `;

    wrap.appendChild(row);

    // Payment history panel (collapsed by default)
    let historyPanel: HTMLElement | null = null;
    if (hasPayments) {
      historyPanel = this.buildPaymentHistoryPanel(a, payments);
      historyPanel.style.display = 'none';
      wrap.appendChild(historyPanel);

      const histBtn = row.querySelector<HTMLButtonElement>('[data-action="history"]')!;
      histBtn.addEventListener('click', () => {
        const open = historyPanel!.style.display !== 'none';
        historyPanel!.style.display = open ? 'none' : '';
        histBtn.textContent = open ? `↓ ${payments.length}` : `↑ ${payments.length}`;
      });
    }

    // Card charges panel — open state persists across re-renders; only the toggle button changes it
    let chargesPanel: HTMLElement | null = null;
    if (isCard) {
      const startOpen = this._openChargesPanels.has(a.id);

      chargesPanel = this.buildChargesPanel(a, charges);
      if (!startOpen) chargesPanel.style.display = 'none';
      wrap.appendChild(chargesPanel);

      const chargesBtn = row.querySelector<HTMLButtonElement>('[data-action="charges"]')!;
      if (startOpen) chargesBtn.textContent = `🧾 ↑`;
      chargesBtn.addEventListener('click', () => {
        const open = chargesPanel!.style.display !== 'none';
        chargesPanel!.style.display = open ? 'none' : '';
        if (open) this._openChargesPanels.delete(a.id);
        else this._openChargesPanels.add(a.id);
        chargesBtn.textContent = open
          ? `🧾 ${charges.length > 0 ? charges.length : '+Charges'}`
          : `🧾 ↑`;
      });
    }

    if (needsSetup) {
      row.querySelector('[data-action="setup"]')!.addEventListener('click', () => this.openDebtForm(a, true));
    }
    row.querySelector('[data-action="pay"]')!.addEventListener('click', () => this.openPaymentModal(a));

    if (a.url) {
      const link = document.createElement('a');
      link.className = 'icon-btn';
      link.setAttribute('data-testid', 'debt-url-link');
      link.href = a.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = 'Open billing portal';
      link.textContent = '↗';
      row.querySelector('[data-action="edit"]')!.before(link);
    }

    row.querySelector('[data-action="notif"]')!.addEventListener('click', () => {
      openAddNotificationModal({ label: a.name, defaultTrigger: 'monthly-day' });
    });
    row.querySelector('[data-action="edit"]')!.addEventListener('click', () => this.openDebtForm(a));
    row.querySelector('[data-action="delete"]')!.addEventListener('click', async () => {
      if (!confirm(`Delete "${a.name}"?`)) return;
      const [allExpenses, allCategories, allPaidRecords] = await Promise.all([
        getExpenses(),
        getCategories(),
        getExpensePaidRecords(),
      ]);
      await Promise.all([
        ...payments.map((p) => deleteDebtPayment(p.id)),
        ...charges.map((c) => deleteCardCharge(c.id)),
        ...allExpenses.filter((e) => e.linkedCardId === a.id).map((e) => saveExpense({ ...e, linkedCardId: undefined })),
        ...allCategories.filter((c) => c.defaultCardId === a.id).map((c) => saveCategory({ ...c, defaultCardId: undefined })),
        ...allPaidRecords.filter((r) => r.cardId === a.id).map((r) => saveExpensePaidRecord({ ...r, cardId: undefined })),
      ]);
      await deleteDebtAccount(a.id);
      if (this.selectedAccountId === a.id) this.selectedAccountId = null;
      this.customOrder = this.customOrder.filter((id) => id !== a.id);
      await this.load();
    });

    return wrap;
  }

  // ── Per-card payment modal ─────────────────────────────────────────────

  private openPaymentModal(a: DebtAccount): void {
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';

    const minPay = computeMinPayment(a);
    const today = new Date().toISOString().split('T')[0]!;

    const bankOptions = this.bankAccounts
      .map((b) => `<option value="${b.id}">${b.name}</option>`)
      .join('');

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
        <div class="form-group">
          <label class="form-label" for="pay-amount">Payment amount <span class="req">*</span></label>
          <input id="pay-amount" type="number" min="0.01" step="0.01"
            value="${minPay != null ? minPay.toFixed(2) : ''}" placeholder="0.00" />
          ${minPay != null ? `<span class="form-hint">Minimum: ${fmtCents.format(minPay)}</span>` : ''}
        </div>
        <div class="form-group">
          <label class="form-label" for="pay-date">Payment date <span class="req">*</span></label>
          <input id="pay-date" type="date" value="${today}" />
        </div>
      </div>
      <div class="form-group" id="pay-bank-group">
        <label class="form-label" for="pay-bank">Pay from account <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
        ${this.bankAccounts.length > 0
          ? `<select id="pay-bank"><option value="">— not specified —</option>${bankOptions}</select>`
          : `<select id="pay-bank" disabled><option value="">No bank accounts set up</option></select>`}
      </div>
      <div class="form-group">
        <label class="form-label">Payment type</label>
        <div style="display:flex;gap:var(--space-5)">
          <label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);cursor:pointer">
            <input type="radio" name="pay-type" value="regular" checked /> Regular payment
          </label>
          <label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);cursor:pointer">
            <input type="radio" name="pay-type" value="extra" /> Extra payment
          </label>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="pay-note">Note <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
        <input id="pay-note" type="text" placeholder="e.g. February statement, bonus payment" maxlength="80" />
      </div>
      <div id="pay-error" class="form-error" style="display:none"></div>
    `;

    // "Add one in Accounts →" hint when no bank accounts exist — close modal, then navigate
    let closeModal: (() => void) | undefined;
    if (this.bankAccounts.length === 0) {
      const hint = document.createElement('span');
      hint.className = 'form-hint';
      hint.textContent = 'No bank accounts set up yet. ';
      const addLink = document.createElement('a');
      addLink.href = '#';
      addLink.textContent = 'Add one in Accounts →';
      addLink.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal?.();
        navigate('/accounts');
      });
      hint.appendChild(addLink);
      body.querySelector('#pay-bank-group')!.appendChild(hint);
    }

    const modal = openFormModal({
      title: `Make a Payment — ${a.name}`,
      body,
      submitLabel: 'Record Payment',
      onSubmit: async (close) => {
        const amountRaw = parseFloat(body.querySelector<HTMLInputElement>('#pay-amount')!.value);
        const dateStr = body.querySelector<HTMLInputElement>('#pay-date')!.value;
        const typeVal = (body.querySelector<HTMLInputElement>('[name="pay-type"]:checked')?.value ?? 'regular') as 'regular' | 'extra';
        const note = body.querySelector<HTMLInputElement>('#pay-note')!.value.trim();
        const bankAccountId = body.querySelector<HTMLSelectElement>('#pay-bank')!.value || undefined;
        const errEl = body.querySelector<HTMLElement>('#pay-error')!;

        errEl.style.display = 'none';
        const missing: string[] = [];
        if (isNaN(amountRaw) || amountRaw <= 0) missing.push('Payment amount');
        if (!dateStr)                           missing.push('Payment date');
        if (missing.length > 0) {
          errEl.textContent = missing.length === 1
            ? `${missing[0]} is required.`
            : `Fill in all required fields: ${missing.join(', ')}.`;
          errEl.style.display = 'block';
          return;
        }

        const payment = createDebtPayment(a.id, amountRaw, typeVal, note || undefined);
        payment.date = new Date(dateStr + 'T12:00:00').getTime();
        if (bankAccountId) payment.bankAccountId = bankAccountId;

        const newBalance = Math.max(0, a.balance - amountRaw);
        const updatedAccount: DebtAccount = { ...a, balance: newBalance, updatedAt: Date.now() };

        await Promise.all([saveDebtPayment(payment), saveDebtAccount(updatedAccount)]);

        const wasPaidOff = a.balance > 0 && newBalance === 0;
        close();
        await this.load();
        refreshNotifier();

        if (wasPaidOff) {
          const allFree = this.accounts.every((acc) => acc.balance <= 0);
          if (allFree) {
            setTimeout(() => showAllDebtFreeCelebration(), 450);
          } else {
            setTimeout(() => showDebtPayoffCelebration(a.name), 450);
          }
        }
      },
    });
    closeModal = modal.close;
  }

  // ── Edit an existing payment ───────────────────────────────────────────

  private openEditPaymentModal(a: DebtAccount, p: DebtPayment): void {
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';

    const existingDate = new Date(p.date).toISOString().split('T')[0]!;
    const bankOptions = this.bankAccounts
      .map((b) => `<option value="${b.id}" ${p.bankAccountId === b.id ? 'selected' : ''}>${b.name}</option>`)
      .join('');

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
        <div class="form-group">
          <label class="form-label" for="ep-amount">Payment amount <span class="req">*</span></label>
          <input id="ep-amount" type="number" min="0.01" step="0.01" value="${p.amount.toFixed(2)}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ep-date">Payment date <span class="req">*</span></label>
          <input id="ep-date" type="date" value="${existingDate}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="ep-bank">Pay from account <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
        ${this.bankAccounts.length > 0
          ? `<select id="ep-bank"><option value="">— not specified —</option>${bankOptions}</select>`
          : `<select id="ep-bank" disabled><option value="">No bank accounts set up</option></select>`}
      </div>
      <div class="form-group">
        <label class="form-label">Payment type</label>
        <div style="display:flex;gap:var(--space-5)">
          <label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);cursor:pointer">
            <input type="radio" name="ep-type" value="regular" ${p.type === 'regular' ? 'checked' : ''} /> Regular payment
          </label>
          <label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);cursor:pointer">
            <input type="radio" name="ep-type" value="extra" ${p.type === 'extra' ? 'checked' : ''} /> Extra payment
          </label>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="ep-note">Note <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
        <input id="ep-note" type="text" value="${p.note ?? ''}" maxlength="80" />
      </div>
      <div id="ep-error" class="form-error" style="display:none"></div>
    `;

    openFormModal({
      title: `Edit Payment — ${a.name}`,
      body,
      submitLabel: 'Save Changes',
      onSubmit: async (close) => {
        const newAmount = parseFloat(body.querySelector<HTMLInputElement>('#ep-amount')!.value);
        const dateStr   = body.querySelector<HTMLInputElement>('#ep-date')!.value;
        const typeVal   = (body.querySelector<HTMLInputElement>('[name="ep-type"]:checked')?.value ?? 'regular') as 'regular' | 'extra';
        const note      = body.querySelector<HTMLInputElement>('#ep-note')!.value.trim();
        const bankAccountId = body.querySelector<HTMLSelectElement>('#ep-bank')!.value || undefined;
        const errEl     = body.querySelector<HTMLElement>('#ep-error')!;

        errEl.style.display = 'none';
        const missing: string[] = [];
        if (isNaN(newAmount) || newAmount <= 0) missing.push('Payment amount');
        if (!dateStr)                           missing.push('Payment date');
        if (missing.length > 0) {
          errEl.textContent = missing.length === 1
            ? `${missing[0]} is required.`
            : `Fill in all required fields: ${missing.join(', ')}.`;
          errEl.style.display = 'block';
          return;
        }

        // Adjust the debt account balance: restore old amount, deduct new amount
        const balanceDelta = p.amount - newAmount;
        const updatedAccount: DebtAccount = {
          ...a,
          balance: Math.max(0, a.balance + balanceDelta),
          updatedAt: Date.now(),
        };

        const updatedPayment: DebtPayment = {
          ...p,
          amount: newAmount,
          date: new Date(dateStr + 'T12:00:00').getTime(),
          type: typeVal,
          note: note || undefined,
          bankAccountId: bankAccountId,
        };

        await Promise.all([saveDebtPayment(updatedPayment), saveDebtAccount(updatedAccount)]);
        close();
        await this.load();
        refreshNotifier();
      },
    });
  }

  // ── Payment history panel ──────────────────────────────────────────────

  private buildPaymentHistoryPanel(a: DebtAccount, payments: DebtPayment[]): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'payment-history-panel';
    panel.setAttribute('data-testid', 'payment-history-panel');

    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

    const header = document.createElement('div');
    header.className = 'payment-history-header';
    header.innerHTML = `<span>${payments.length} payment${payments.length !== 1 ? 's' : ''} recorded · ${fmtCents.format(totalPaid)} total</span>`;
    panel.appendChild(header);

    // ── Monthly payment status summary ──────────────────────────────────────
    const payStatus = computePaymentStatus(a, payments);
    const now = new Date();
    const currentMonthLabel = now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const allMonths = [
      {
        label: currentMonthLabel,
        total: payStatus.currentMonthTotal,
        minimumMet: payStatus.minimumPayment != null && payStatus.currentMonthTotal >= payStatus.minimumPayment,
        isCurrent: true,
        status: payStatus.currentMonth,
      },
      ...payStatus.historicalMonths.slice(0, 5).map((h) => ({
        label: h.label,
        total: h.total,
        minimumMet: h.minimumMet,
        isCurrent: false,
        status: h.minimumMet ? 'paid' : 'partial',
      })),
    ];

    if (payStatus.minimumPayment != null || payStatus.currentMonthTotal > 0 || payStatus.historicalMonths.length > 0) {
      const monthGrid = document.createElement('div');
      monthGrid.className = 'payment-month-grid';

      allMonths.forEach(({ label, total, minimumMet, status }) => {
        const chip = document.createElement('div');
        const chipClass = minimumMet ? 'paid'
          : status === 'past-due' ? 'past-due'
          : status === 'due-soon' ? 'due-soon'
          : total > 0 ? 'partial'
          : 'none';
        chip.className = `payment-month-chip payment-month-chip--${chipClass}`;

        const icon = minimumMet ? '✓' : status === 'past-due' ? '⚠' : total > 0 ? '½' : '—';
        chip.innerHTML = `
          <span class="payment-month-chip-label">${label}</span>
          <span class="payment-month-chip-amount">${total > 0 ? fmtCents.format(total) : '—'}</span>
          <span class="payment-month-chip-icon">${icon}</span>
        `;
        monthGrid.appendChild(chip);
      });

      panel.appendChild(monthGrid);
    }

    const list = document.createElement('div');
    list.className = 'payment-history-list';

    payments.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'payment-history-item';
      item.setAttribute('data-testid', 'payment-history-item');
      const dateStr = new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const linkedBank = p.bankAccountId
        ? this.bankAccounts.find((b) => b.id === p.bankAccountId)
        : null;
      item.innerHTML = `
        <span class="payment-history-date">${dateStr}</span>
        <span class="payment-history-amount">${fmtCents.format(p.amount)}</span>
        <span class="payment-history-type payment-history-type--${p.type}">${p.type}</span>
        ${linkedBank ? `<span class="payment-history-bank">🏦 ${linkedBank.name}</span>` : ''}
        <span class="payment-history-note">${p.note ?? ''}</span>
      `;

      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn';
      editBtn.title = 'Edit payment';
      editBtn.setAttribute('data-testid', 'payment-history-edit');
      editBtn.textContent = '✏️';
      editBtn.addEventListener('click', () => this.openEditPaymentModal(a, p));

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn danger';
      delBtn.title = 'Remove payment (balance will be restored)';
      delBtn.setAttribute('data-testid', 'payment-history-delete');
      delBtn.textContent = '🗑️';
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Remove this ${p.type} payment of ${fmtCents.format(p.amount)}?\nThe balance on "${a.name}" will be restored by that amount.`)) return;
        const restoredBalance = a.balance + p.amount;
        await Promise.all([
          deleteDebtPayment(p.id),
          saveDebtAccount({ ...a, balance: restoredBalance, updatedAt: Date.now() }),
        ]);
        await this.load();
      });

      item.appendChild(editBtn);
      item.appendChild(delBtn);
      list.appendChild(item);
    });

    panel.appendChild(list);
    return panel;
  }

  // ── Merchant spending summary ──────────────────────────────────────────

  private buildMerchantSummary(charges: CardCharge[]): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card merchant-summary';

    const heading = document.createElement('div');
    heading.className = 'merchant-summary-heading';
    heading.innerHTML = `<h2 class="font-serif">Spending by Merchant</h2><span class="merchant-summary-subtitle">All card charges · ranked by total</span>`;
    card.appendChild(heading);

    const merchantTotals = new Map<string, { total: number; count: number }>();
    charges.forEach((c) => {
      const entry = merchantTotals.get(c.merchant) ?? { total: 0, count: 0 };
      entry.total += c.amount;
      entry.count += 1;
      merchantTotals.set(c.merchant, entry);
    });

    const sorted = [...merchantTotals.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 15);

    const maxTotal = sorted[0]?.[1].total ?? 1;

    const list = document.createElement('div');
    list.className = 'merchant-summary-list';

    sorted.forEach(([merchant, { total, count }], idx) => {
      const row = document.createElement('div');
      row.className = 'merchant-summary-row';
      row.innerHTML = `
        <div class="merchant-summary-bar-bg" style="transform:scaleX(${(total / maxTotal).toFixed(3)})"></div>
        <span class="merchant-summary-rank">${idx + 1}</span>
        <span class="merchant-summary-name">${merchant}</span>
        <span class="merchant-summary-count">${count} charge${count !== 1 ? 's' : ''}</span>
        <span class="merchant-summary-amount">${fmtCents.format(total)}</span>
      `;
      list.appendChild(row);
    });

    card.appendChild(list);
    return card;
  }

  // ── Card charges panel ────────────────────────────────────────────────

  private getChargesState(id: string): { page: number; pageSize: number; sortAsc: boolean } {
    if (!this._chargesPageState.has(id)) {
      this._chargesPageState.set(id, { page: 0, pageSize: 10, sortAsc: false });
    }
    return this._chargesPageState.get(id)!;
  }

  private buildChargesPanel(a: DebtAccount, charges: CardCharge[]): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'charges-panel';

    // ── Header ──────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'charges-panel-header';
    const totalCharged = charges.reduce((s, c) => s + c.amount, 0);
    const summarySpan = document.createElement('span');
    summarySpan.textContent = charges.length > 0
      ? `${charges.length} charge${charges.length !== 1 ? 's' : ''} · ${fmtCents.format(totalCharged)} total`
      : 'No charges logged yet';
    header.appendChild(summarySpan);
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-secondary btn-sm';
    addBtn.textContent = '+ Add charge';
    addBtn.addEventListener('click', () => this.openAddChargeModal(a));
    header.appendChild(addBtn);
    panel.appendChild(header);

    if (charges.length === 0) return panel;

    const state = this.getChargesState(a.id);

    // ── Controls: sort + page size ───────────────────────────────────────
    const controls = document.createElement('div');
    controls.className = 'charges-controls';

    const sortBtn = document.createElement('button');
    sortBtn.className = 'charges-sort-btn';
    sortBtn.textContent = state.sortAsc ? '↑ Oldest first' : '↓ Newest first';
    sortBtn.addEventListener('click', () => {
      const s = this.getChargesState(a.id);
      s.sortAsc = !s.sortAsc;
      s.page = 0;
      this.paint();
    });

    const pageSizeWrap = document.createElement('div');
    pageSizeWrap.className = 'charges-page-size-wrap';
    const sizeLabel = document.createElement('span');
    sizeLabel.className = 'charges-page-size-label';
    sizeLabel.textContent = 'Show:';
    const sizeSelect = document.createElement('select');
    sizeSelect.className = 'charges-page-size-select';
    [['10','10'],['25','25'],['50','50'],['100','100'],['0','All']].forEach(([v, l]) => {
      const opt = document.createElement('option');
      opt.value = v!;
      opt.textContent = l!;
      opt.selected = state.pageSize === parseInt(v!);
      sizeSelect.appendChild(opt);
    });
    sizeSelect.addEventListener('change', () => {
      const s = this.getChargesState(a.id);
      s.pageSize = parseInt(sizeSelect.value);
      s.page = 0;
      this.paint();
    });
    pageSizeWrap.appendChild(sizeLabel);
    pageSizeWrap.appendChild(sizeSelect);
    controls.appendChild(sortBtn);
    controls.appendChild(pageSizeWrap);
    panel.appendChild(controls);

    // ── Merchant breakdown ────────────────────────────────────────────────
    const merchantTotals = new Map<string, number>();
    charges.forEach((c) => merchantTotals.set(c.merchant, (merchantTotals.get(c.merchant) ?? 0) + c.amount));
    const breakdown = document.createElement('div');
    breakdown.className = 'charges-breakdown';
    [...merchantTotals.entries()].sort((a, b) => b[1] - a[1]).forEach(([merchant, total]) => {
      const row = document.createElement('div');
      row.className = 'charges-breakdown-row';
      row.innerHTML = `<span class="charges-merchant">${merchant}</span><span class="charges-total">${fmtCents.format(total)}</span>`;
      breakdown.appendChild(row);
    });
    panel.appendChild(breakdown);

    // ── Sorted + paginated list ───────────────────────────────────────────
    const sorted = [...charges].sort((x, y) => state.sortAsc ? x.date - y.date : y.date - x.date);
    const pageSize = state.pageSize === 0 ? sorted.length : state.pageSize;
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const page = Math.min(state.page, totalPages - 1);
    state.page = page;

    const catMap = new Map(this.expenseCategories.map((c) => [c.id, c]));
    const list = document.createElement('div');
    list.className = 'charges-list';

    sorted.slice(page * pageSize, page * pageSize + pageSize).forEach((ch) => {
      const item = document.createElement('div');
      item.className = 'charges-item';
      const dateStr = new Date(ch.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const cat = ch.categoryId ? catMap.get(ch.categoryId) : null;

      const dateSpan = document.createElement('span');
      dateSpan.className = 'charges-item-date';
      dateSpan.textContent = dateStr;

      const mainCol = document.createElement('div');
      mainCol.className = 'charges-item-main';

      const merchantSpan = document.createElement('span');
      merchantSpan.className = 'charges-item-merchant';
      merchantSpan.textContent = ch.merchant;
      mainCol.appendChild(merchantSpan);

      if (ch.note) {
        const noteSpan = document.createElement('span');
        noteSpan.className = 'charges-item-note';
        noteSpan.textContent = ch.note;
        noteSpan.title = 'Click to expand / collapse';
        noteSpan.addEventListener('click', () => noteSpan.classList.toggle('expanded'));
        mainCol.appendChild(noteSpan);
      }

      const amountSpan = document.createElement('span');
      amountSpan.className = 'charges-item-amount';
      amountSpan.textContent = fmtCents.format(ch.amount);

      item.appendChild(dateSpan);
      item.appendChild(mainCol);
      item.appendChild(amountSpan);

      if (cat) {
        const catSpan = document.createElement('span');
        catSpan.className = 'charges-item-cat';
        catSpan.style.cssText = `background:${cat.color}20;color:${cat.color};border:1px solid ${cat.color}40`;
        catSpan.textContent = cat.name;
        item.appendChild(catSpan);
      }

      if (ch.sourceExpenseId) {
        const autoBadge = document.createElement('span');
        autoBadge.className = 'charges-item-auto';
        autoBadge.setAttribute('data-testid', 'charge-auto-badge');
        autoBadge.title = 'Auto-created from a linked expense';
        autoBadge.textContent = 'Auto';
        item.appendChild(autoBadge);
      }

      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn';
      editBtn.title = 'Edit charge';
      editBtn.textContent = '✏️';
      editBtn.addEventListener('click', () => this.openEditChargeModal(a, ch));

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn danger';
      delBtn.title = 'Remove charge';
      delBtn.textContent = '🗑️';
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Remove ${fmtCents.format(ch.amount)} charge from ${ch.merchant}?`)) return;
        await deleteCardCharge(ch.id);
        this._openChargesPanels.add(a.id);
        await this.load();
      });
      item.appendChild(editBtn);
      item.appendChild(delBtn);
      list.appendChild(item);
    });
    panel.appendChild(list);

    // ── Pagination footer ─────────────────────────────────────────────────
    if (totalPages > 1) {
      const pgRow = document.createElement('div');
      pgRow.className = 'charges-pagination';

      const prevBtn = document.createElement('button');
      prevBtn.className = 'charges-page-btn';
      prevBtn.textContent = '← Prev';
      prevBtn.disabled = page === 0;
      prevBtn.addEventListener('click', () => { this.getChargesState(a.id).page--; this.paint(); });

      const info = document.createElement('span');
      info.className = 'charges-page-info';
      info.textContent = `Page ${page + 1} of ${totalPages}`;

      const nextBtn = document.createElement('button');
      nextBtn.className = 'charges-page-btn';
      nextBtn.textContent = 'Next →';
      nextBtn.disabled = page >= totalPages - 1;
      nextBtn.addEventListener('click', () => { this.getChargesState(a.id).page++; this.paint(); });

      pgRow.appendChild(prevBtn);
      pgRow.appendChild(info);
      pgRow.appendChild(nextBtn);
      panel.appendChild(pgRow);
    }

    return panel;
  }

  private openEditChargeModal(a: DebtAccount, ch: CardCharge): void {
    const d = new Date(ch.date);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const catOptions = this.expenseCategories
      .filter((c) => c.parentId === null)
      .map((c) => `<option value="${c.id}"${c.id === ch.categoryId ? ' selected' : ''}>${c.name}</option>`)
      .join('');

    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label" for="ch-merchant">Merchant / Vendor <span class="req">*</span></label>
          <input id="ch-merchant" type="text" value="${ch.merchant}" placeholder="e.g. Amazon, Whole Foods, Netflix" maxlength="60" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ch-amount">Amount <span class="req">*</span></label>
          <input id="ch-amount" type="number" min="0.01" step="0.01" value="${ch.amount}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ch-date">Date <span class="req">*</span></label>
          <input id="ch-date" type="date" value="${dateStr}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="ch-cat">Category <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
        <select id="ch-cat">
          <option value="">— None —</option>
          ${catOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="ch-note">Note <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
        <input id="ch-note" type="text" value="${ch.note ?? ''}" placeholder="e.g. Annual Prime membership" maxlength="80" />
      </div>
      <div id="ch-error" class="form-error" style="display:none"></div>
    `;

    openFormModal({
      title: `Edit Charge — ${a.name}`,
      body,
      submitLabel: 'Save Changes',
      onSubmit: async (close) => {
        const merchant  = body.querySelector<HTMLInputElement>('#ch-merchant')!.value.trim();
        const amount    = parseFloat(body.querySelector<HTMLInputElement>('#ch-amount')!.value);
        const dateVal   = body.querySelector<HTMLInputElement>('#ch-date')!.value;
        const categoryId = body.querySelector<HTMLSelectElement>('#ch-cat')!.value || undefined;
        const note      = body.querySelector<HTMLInputElement>('#ch-note')!.value.trim() || undefined;
        const errEl     = body.querySelector<HTMLElement>('#ch-error')!;

        errEl.style.display = 'none';
        const missing: string[] = [];
        if (!merchant)                    missing.push('Merchant / Vendor');
        if (isNaN(amount) || amount <= 0) missing.push('Amount');
        if (!dateVal)                     missing.push('Date');
        if (missing.length > 0) {
          errEl.textContent = missing.length === 1
            ? `${missing[0]} is required.`
            : `Fill in all required fields: ${missing.join(', ')}.`;
          errEl.style.display = 'block';
          return;
        }

        const date = new Date(dateVal + 'T12:00:00').getTime();
        const updated: CardCharge = { ...ch, merchant, amount, date };
        if (categoryId) updated.categoryId = categoryId; else delete updated.categoryId;
        if (note)       updated.note = note;              else delete updated.note;

        await saveCardCharge(updated);
        this._openChargesPanels.add(a.id);
        close();
        await this.load();
      },
    });
  }

  private openAddChargeModal(a: DebtAccount): void {
    const today = new Date().toISOString().split('T')[0]!;
    const catOptions = this.expenseCategories
      .filter((c) => c.parentId === null)
      .map((c) => `<option value="${c.id}">${c.name}</option>`)
      .join('');

    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label" for="ch-merchant">Merchant / Vendor <span class="req">*</span></label>
          <input id="ch-merchant" type="text" placeholder="e.g. Amazon, Whole Foods, Netflix" maxlength="60" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ch-amount">Amount <span class="req">*</span></label>
          <input id="ch-amount" type="number" min="0.01" step="0.01" placeholder="0.00" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ch-date">Date <span class="req">*</span></label>
          <input id="ch-date" type="date" value="${today}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="ch-cat">Category <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
        <select id="ch-cat">
          <option value="">— None —</option>
          ${catOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="ch-note">Note <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
        <input id="ch-note" type="text" placeholder="e.g. Annual Prime membership" maxlength="80" />
      </div>
      <div id="ch-error" class="form-error" style="display:none"></div>
    `;

    openFormModal({
      title: `Add Charge — ${a.name}`,
      body,
      submitLabel: 'Log Charge',
      onSubmit: async (close) => {
        const merchant = body.querySelector<HTMLInputElement>('#ch-merchant')!.value.trim();
        const amount = parseFloat(body.querySelector<HTMLInputElement>('#ch-amount')!.value);
        const dateStr = body.querySelector<HTMLInputElement>('#ch-date')!.value;
        const categoryId = body.querySelector<HTMLSelectElement>('#ch-cat')!.value || undefined;
        const note = body.querySelector<HTMLInputElement>('#ch-note')!.value.trim() || undefined;
        const errEl = body.querySelector<HTMLElement>('#ch-error')!;

        errEl.style.display = 'none';
        const missing: string[] = [];
        if (!merchant)                    missing.push('Merchant / Vendor');
        if (isNaN(amount) || amount <= 0) missing.push('Amount');
        if (!dateStr)                     missing.push('Date');
        if (missing.length > 0) {
          errEl.textContent = missing.length === 1
            ? `${missing[0]} is required.`
            : `Fill in all required fields: ${missing.join(', ')}.`;
          errEl.style.display = 'block';
          return;
        }

        const date = new Date(dateStr + 'T12:00:00').getTime();
        const charge = createCardCharge(a.id, merchant, amount, date, categoryId, note);
        await saveCardCharge(charge);
        this._openChargesPanels.add(a.id);
        close();
        await this.load();
      },
    });
  }

  // ── Strategy panel ─────────────────────────────────────────────────────

  private buildStrategyPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'card';
    panel.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-5)';

    const h2 = document.createElement('h2');
    h2.className = 'font-serif';
    h2.style.fontSize = 'var(--text-xl)';
    h2.textContent = 'Payoff Strategy';
    panel.appendChild(h2);

    const tabs = document.createElement('div');
    tabs.className = 'strategy-tabs';
    const desc = document.createElement('p');
    desc.className = 'strategy-desc';
    desc.textContent = STRATEGY_DESCS[this.strategy];

    (['avalanche', 'snowball', 'custom'] as DebtStrategy[]).forEach((s) => {
      const btn = document.createElement('button');
      btn.className = `strategy-tab ${this.strategy === s ? 'active' : ''}`;
      btn.setAttribute('data-testid', 'strategy-tab');
      btn.setAttribute('data-strategy', s);
      btn.textContent = s.charAt(0).toUpperCase() + s.slice(1);
      btn.addEventListener('click', () => {
        this.strategy = s;
        desc.textContent = STRATEGY_DESCS[s];
        tabs.querySelectorAll('.strategy-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.refreshStrategyResults(panel);
      });
      tabs.appendChild(btn);
    });

    panel.appendChild(tabs);
    panel.appendChild(desc);

    const customOrderWrap = document.createElement('div');
    customOrderWrap.id = 'custom-order-wrap';
    customOrderWrap.style.display = this.strategy === 'custom' ? '' : 'none';
    this.renderCustomOrder(customOrderWrap);
    panel.appendChild(customOrderWrap);

    const extraRow = document.createElement('div');
    extraRow.className = 'extra-payment-row';
    extraRow.innerHTML = `
      <label for="extra-payment">Extra monthly payment</label>
      <input id="extra-payment" type="number" min="0" step="10"
        value="${this.extraPayment || ''}" placeholder="0" />
      <span class="extra-payment-desc">Added on top of all minimums, directed at your focus account.</span>
    `;
    extraRow.querySelector<HTMLInputElement>('#extra-payment')!.addEventListener('input', (e) => {
      this.extraPayment = parseFloat((e.target as HTMLInputElement).value) || 0;
      this.refreshStrategyResults(panel);
    });
    panel.appendChild(extraRow);

    const resultsEl = document.createElement('div');
    resultsEl.id = 'strategy-results';
    panel.appendChild(resultsEl);

    this.renderStrategyResults(resultsEl);
    return panel;
  }

  private renderCustomOrder(wrap: HTMLElement): void {
    wrap.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'custom-order-list';

    const orderedAccounts = this.customOrder
      .map((id) => this.accounts.find((a) => a.id === id))
      .filter(Boolean) as DebtAccount[];

    orderedAccounts.forEach((a, idx) => {
      const item = document.createElement('div');
      item.className = 'custom-order-item';
      item.setAttribute('data-testid', 'custom-order-item');
      item.setAttribute('data-account-id', a.id);
      item.innerHTML = `
        <span>${idx + 1}. ${DEBT_TYPE_ICONS[a.type]} ${a.name}</span>
        <span class="text-xs text-muted">${a.apr}% APR · ${fmt.format(a.balance)}</span>
        <button class="order-btn" data-dir="up" ${idx === 0 ? 'disabled' : ''}>▲</button>
        <button class="order-btn" data-dir="down" ${idx === orderedAccounts.length - 1 ? 'disabled' : ''}>▼</button>
      `;
      item.querySelector('[data-dir="up"]')!.addEventListener('click', () => {
        [this.customOrder[idx - 1], this.customOrder[idx]] =
          [this.customOrder[idx]!, this.customOrder[idx - 1]!];
        this.renderCustomOrder(wrap);
        this.refreshStrategyResults(wrap.closest('.card') as HTMLElement);
      });
      item.querySelector('[data-dir="down"]')!.addEventListener('click', () => {
        [this.customOrder[idx], this.customOrder[idx + 1]] =
          [this.customOrder[idx + 1]!, this.customOrder[idx]!];
        this.renderCustomOrder(wrap);
        this.refreshStrategyResults(wrap.closest('.card') as HTMLElement);
      });
      list.appendChild(item);
    });

    wrap.appendChild(list);
  }

  private refreshStrategyResults(panel: HTMLElement): void {
    const wrap = panel.querySelector<HTMLElement>('#custom-order-wrap');
    if (wrap) wrap.style.display = this.strategy === 'custom' ? '' : 'none';
    const resultsEl = panel.querySelector<HTMLElement>('#strategy-results');
    if (resultsEl) this.renderStrategyResults(resultsEl);
    this.rebuildChart();
  }

  private renderStrategyResults(container: HTMLElement): void {
    container.innerHTML = '';

    const orderedAccounts = this.strategy === 'custom'
      ? this.customOrder.map((id) => this.accounts.find((a) => a.id === id)!).filter(Boolean)
      : this.accounts;

    const maxMonths = this.horizonYears * 12;
    const comparison = comparePayoffScenarios(orderedAccounts, this.strategy, this.extraPayment, new Date(), maxMonths);
    const { minOnly, withExtra, interestSaved, monthsSaved } = comparison;

    const fmtDate = (d: Date | null): string =>
      d
        ? d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : `Not paid off within ${this.horizonYears}-year horizon`;

    const grid = document.createElement('div');
    grid.className = 'whatif-grid';
    grid.innerHTML = `
      <div class="whatif-panel baseline">
        <div class="whatif-label">Minimum payments only</div>
        <div class="whatif-stat">
          <span class="whatif-stat-label">Debt-free</span>
          <span class="whatif-stat-value">${fmtDate(minOnly.debtFreeDate)}</span>
        </div>
        <div class="whatif-stat">
          <span class="whatif-stat-label">Total interest</span>
          <span class="whatif-stat-value" style="color:var(--ff-rust)">${fmt.format(minOnly.totalInterest)}</span>
        </div>
        <div class="whatif-stat">
          <span class="whatif-stat-label">Total paid</span>
          <span class="whatif-stat-value">${fmt.format(minOnly.totalPaid)}</span>
        </div>
      </div>
      <div class="whatif-panel improved">
        <div class="whatif-label">
          ${this.extraPayment > 0 ? `With +${fmt.format(this.extraPayment)}/mo extra` : 'With extra payment'}
        </div>
        <div class="whatif-stat">
          <span class="whatif-stat-label">Debt-free</span>
          <span class="whatif-stat-value" style="color:var(--ff-green)">${fmtDate(withExtra.debtFreeDate)}</span>
        </div>
        <div class="whatif-stat">
          <span class="whatif-stat-label">Total interest</span>
          <span class="whatif-stat-value" style="color:var(--ff-rust)">${fmt.format(withExtra.totalInterest)}</span>
        </div>
        <div class="whatif-stat">
          <span class="whatif-stat-label">Total paid</span>
          <span class="whatif-stat-value">${fmt.format(withExtra.totalPaid)}</span>
        </div>
      </div>
    `;
    container.appendChild(grid);

    if (this.extraPayment > 0 && interestSaved > 0) {
      const yrs = Math.floor(monthsSaved / 12);
      const mos = monthsSaved % 12;
      const timeStr = [yrs > 0 ? `${yrs} yr` : '', mos > 0 ? `${mos} mo` : ''].filter(Boolean).join(' ');

      const banner = document.createElement('div');
      banner.className = 'savings-banner';
      banner.innerHTML = `
        <span class="savings-banner-icon">🎉</span>
        <div>
          <strong>You'd save ${fmt.format(interestSaved)} in interest</strong> and be debt-free
          ${timeStr ? `<strong>${timeStr} sooner</strong>` : 'sooner'}.
          That money stays in your pocket instead of going to the bank.
        </div>
      `;
      container.appendChild(banner);

      setTimeout(() =>
        showMascot('debt-free-improvement', {
          amount: fmt.format(this.extraPayment),
          date: fmtDate(withExtra.debtFreeDate),
          interest: fmt.format(interestSaved),
          months: String(monthsSaved),
        }),
        800,
      );
    }

    if (minOnly.paidOffOrder.length > 1) {
      const orderEl = document.createElement('div');
      orderEl.innerHTML = `<h3 class="font-serif" style="font-size:var(--text-base);margin-bottom:var(--space-3)">Payoff order</h3>`;
      const list = document.createElement('div');
      list.className = 'payoff-order';
      const accountMap = new Map(this.accounts.map((a) => [a.id, a]));

      minOnly.paidOffOrder.forEach((id, i) => {
        const a = accountMap.get(id);
        if (!a) return;
        const step = document.createElement('div');
        step.className = 'payoff-order-step';
        step.innerHTML = `
          <span class="payoff-order-num">${i + 1}</span>
          <span>${DEBT_TYPE_ICONS[a.type]} ${a.name}</span>
          <span class="text-xs text-muted">${a.apr}% APR · ${fmt.format(a.balance)}</span>
        `;
        list.appendChild(step);
        if (i < minOnly.paidOffOrder.length - 1) {
          const arrow = document.createElement('div');
          arrow.className = 'payoff-order-arrow';
          arrow.innerHTML = '↓ then';
          list.appendChild(arrow);
        }
      });

      orderEl.appendChild(list);
      container.appendChild(orderEl);
    }
  }

  // ── Balance-over-time chart ────────────────────────────────────────────

  private buildChart(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card';

    const chartHeader = document.createElement('div');
    chartHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4)';

    const h2 = document.createElement('h3');
    h2.className = 'font-serif';
    h2.style.cssText = 'font-size:var(--text-xl);margin:0';
    h2.textContent = 'Balance over time';
    chartHeader.appendChild(h2);
    chartHeader.appendChild(this.buildHorizonControl());
    card.appendChild(chartHeader);

    const wrap = document.createElement('div');
    wrap.className = 'debt-chart-wrap';
    wrap.id = 'debt-chart-wrap';
    const canvas = document.createElement('canvas');
    canvas.id = 'debt-chart-canvas';
    wrap.appendChild(canvas);
    card.appendChild(wrap);

    requestAnimationFrame(() => this.buildChartInstance(canvas));

    return card;
  }

  private buildHorizonControl(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'horizon-toggle';

    HORIZON_OPTIONS.forEach((yr) => {
      const btn = document.createElement('button');
      btn.className = `horizon-btn${this.horizonYears === yr ? ' active' : ''}`;
      btn.textContent = `${yr}Y`;
      btn.title = `Show ${yr}-year projection`;
      btn.addEventListener('click', () => {
        this.horizonYears = yr;
        this.paint();
      });
      wrap.appendChild(btn);
    });

    return wrap;
  }

  private buildChartInstance(canvas: HTMLCanvasElement): void {
    const orderedAccounts = this.strategy === 'custom'
      ? this.customOrder.map((id) => this.accounts.find((a) => a.id === id)!).filter(Boolean)
      : this.accounts;

    const maxMonths = this.horizonYears * 12;
    const minOnly  = comparePayoffScenarios(orderedAccounts, this.strategy, 0, new Date(), maxMonths).minOnly;
    const withExtra = this.extraPayment > 0
      ? comparePayoffScenarios(orderedAccounts, this.strategy, this.extraPayment, new Date(), maxMonths).withExtra
      : null;

    const labels = minOnly.monthly.map((m) =>
      m.date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    );

    const baseData = minOnly.monthly.map((m) => m.totalBalance);
    const extraData = withExtra
      ? (() => {
          const mapped = new Array(labels.length).fill(0);
          withExtra.monthly.forEach((m) => { if (m.month - 1 < mapped.length) mapped[m.month - 1] = m.totalBalance; });
          return mapped;
        })()
      : null;

    const datasets: ChartDataset<'line'>[] = [
      {
        label: 'Minimum payments only',
        data: baseData,
        borderColor: 'var(--ff-rust)',
        backgroundColor: 'rgba(180,83,9,0.07)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
      },
    ];

    if (extraData) {
      datasets.push({
        label: `With +${fmt.format(this.extraPayment)}/mo`,
        data: extraData,
        borderColor: 'var(--ff-green)',
        backgroundColor: 'rgba(45,90,39,0.07)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
        borderDash: [6, 3],
      });
    }

    this.chartInstance = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${fmt.format(ctx.parsed.y as number)}`,
            },
          },
        },
        scales: {
          x: { ticks: { maxTicksLimit: 12, font: { size: 11 } }, grid: { display: false } },
          y: {
            ticks: { callback: (v) => fmt.format(v as number), font: { size: 11 } },
            grid: { color: 'rgba(0,0,0,0.05)' },
          },
        },
      },
    });
  }

  private rebuildChart(): void {
    const canvas = document.getElementById('debt-chart-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    this.chartInstance?.destroy();
    this.buildChartInstance(canvas);
  }

  // ── Per-account schedule table ─────────────────────────────────────────

  private buildSchedulePanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'card';

    const h2 = document.createElement('h3');
    h2.className = 'font-serif';
    h2.style.cssText = 'font-size:var(--text-xl);margin-bottom:var(--space-4)';
    h2.textContent = 'Amortization Schedule';
    panel.appendChild(h2);

    const controls = document.createElement('div');
    controls.className = 'schedule-controls';

    const select = document.createElement('select');
    select.id = 'schedule-select';
    select.style.cssText = 'width:auto;max-width:220px';
    this.accounts.forEach((a) => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = `${DEBT_TYPE_ICONS[a.type]} ${a.name}`;
      opt.selected = a.id === this.selectedAccountId;
      select.appendChild(opt);
    });

    const extraLabel = document.createElement('span');
    extraLabel.className = 'text-xs text-muted';
    extraLabel.textContent = 'Showing minimum payments only. Extra payment applies in the multi-account strategy above.';

    controls.appendChild(select);
    controls.appendChild(extraLabel);
    panel.appendChild(controls);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'schedule-table-wrap';
    panel.appendChild(tableWrap);

    const renderTable = (accountId: string) => {
      const a = this.accounts.find((x) => x.id === accountId);
      if (!a) return;
      const maxPeriods = this.horizonYears * PERIODS_PER_YEAR_MAP[a.paymentCycle];
      const result = amortizeSingleCard(a, 0, new Date(), maxPeriods);
      const truncated = result.schedule.length >= maxPeriods && (result.schedule[result.schedule.length - 1]?.remainingBalance ?? 0) > 0;
      tableWrap.innerHTML = '';
      if (truncated) {
        const note = document.createElement('p');
        note.className = 'schedule-truncated-note';
        note.textContent = `Showing first ${this.horizonYears} years. Balance not paid off within this horizon — adjust the horizon above or add a higher payment.`;
        tableWrap.appendChild(note);
      }
      tableWrap.appendChild(this.buildScheduleTable(result.schedule, a));
    };

    select.addEventListener('change', () => {
      this.selectedAccountId = select.value;
      renderTable(select.value);
    });

    if (this.selectedAccountId) renderTable(this.selectedAccountId);

    return panel;
  }

  private buildScheduleTable(
    schedule: ReturnType<typeof amortizeSingleCard>['schedule'],
    account: DebtAccount,
  ): HTMLElement {
    const table = document.createElement('table');
    table.className = 'schedule-table';

    table.innerHTML = `
      <thead>
        <tr>
          <th>#</th>
          <th>Date</th>
          <th>Payment</th>
          <th>Interest</th>
          <th>Principal</th>
          <th>Balance</th>
        </tr>
      </thead>
    `;

    const tbody = document.createElement('tbody');
    schedule.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.period}</td>
        <td>${row.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
        <td>${fmtCents.format(row.payment)}</td>
        <td class="interest-cell">${fmtCents.format(row.interest)}</td>
        <td>${fmtCents.format(row.principal)}</td>
        <td class="balance-cell">${fmtCents.format(row.remainingBalance)}</td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);

    const totalInterest = schedule.reduce((s, r) => s + r.interest, 0);
    const totalPayment  = schedule.reduce((s, r) => s + r.payment,  0);
    const tfoot = document.createElement('tfoot');
    tfoot.style.cssText = 'background:var(--color-bg-sunken);font-weight:600;position:sticky;bottom:0';
    tfoot.innerHTML = `
      <tr>
        <td colspan="2">${schedule.length} payments · ${account.name}</td>
        <td>${fmtCents.format(totalPayment)}</td>
        <td class="interest-cell">${fmtCents.format(totalInterest)}</td>
        <td>${fmtCents.format(totalPayment - totalInterest)}</td>
        <td>$0.00</td>
      </tr>
    `;
    table.appendChild(tfoot);

    return table;
  }

  // ── Debt account form modal ────────────────────────────────────────────

  private openDebtForm(existing?: DebtAccount, showPaymentDetails = false): void {
    const isEdit = !!existing;
    const initialType: DebtAccountType = existing?.type ?? 'card';
    const showMinPayment = isEdit || showPaymentDetails;
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';

    const cycleOptions = (Object.keys(PAYMENT_CYCLE_LABELS) as PaymentCycle[])
      .map((c) => `<option value="${c}" ${(existing?.paymentCycle ?? 'monthly') === c ? 'selected' : ''}>${PAYMENT_CYCLE_LABELS[c]}</option>`)
      .join('');

    const typeOptions = (Object.keys(DEBT_TYPE_LABELS) as DebtAccountType[])
      .map((t) => `<option value="${t}" ${initialType === t ? 'selected' : ''}>${DEBT_TYPE_LABELS[t]}</option>`)
      .join('');

    const minTypeChecked = existing?.minimumPaymentType ?? 'percentage';

    // Compute the default value for the "Next payment due date" date picker.
    // For new accounts: empty. For edits, prefer nextDueDateMs; fall back to
    // projecting dueDay into the current or next month so it's never in the past.
    const dueDateDefaultStr = (() => {
      if (existing?.nextDueDateMs) {
        return new Date(existing.nextDueDateMs).toISOString().split('T')[0];
      }
      if (existing?.dueDay) {
        const n = new Date();
        const day = existing.dueDay;
        const curMaxDay = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
        const clamped = Math.min(day, curMaxDay);
        if (n.getDate() < clamped) {
          return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
        }
        // dueDay already passed this month — project to next month
        const next = new Date(n.getFullYear(), n.getMonth() + 1, 1);
        const nextMaxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(Math.min(day, nextMaxDay)).padStart(2, '0')}`;
      }
      return '';
    })();

    body.innerHTML = `
      <div class="form-group" id="da-type-row">
        <label class="form-label" for="da-type">Debt type</label>
        <select id="da-type" ${isEdit ? 'disabled' : ''}>${typeOptions}</select>
        ${isEdit ? '<span class="form-hint">Type cannot be changed after creation.</span>' : ''}
      </div>
      <div class="form-group">
        <label class="form-label" for="da-name">Name / Lender <span class="req">*</span></label>
        <input id="da-name" type="text" value="${existing?.name ?? ''}"
          placeholder="e.g. Chase Sapphire, Wells Fargo Mortgage" maxlength="48" />
      </div>
      <div class="form-group">
        <label class="form-label" for="da-url">Billing portal URL <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
        <input id="da-url" type="url" placeholder="https://billing.example.com" maxlength="512" />
        <span class="form-hint">Opens as a quick link on your debt list and calendar.</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
        <div class="form-group">
          <label class="form-label" for="da-balance">Current balance <span class="req">*</span></label>
          <input id="da-balance" type="number" min="0" step="0.01"
            value="${existing?.balance ?? ''}" placeholder="0.00" />
        </div>
        <div class="form-group">
          <label class="form-label" for="da-apr">APR (%) <span class="req" id="da-apr-req">*</span></label>
          <input id="da-apr" type="number" min="0" max="100" step="0.01"
            value="${existing?.apr ?? ''}" placeholder="e.g. 22.99" />
          <span class="form-hint" id="da-apr-hint">Annual percentage rate</span>
        </div>
      </div>
      <div class="form-group" id="da-row-limit">
        <label class="form-label" for="da-limit">Credit limit</label>
        <input id="da-limit" type="number" min="0" step="1"
          value="${existing?.creditLimit ?? ''}" placeholder="0" />
      </div>
      <div id="da-row-loan-details" style="display:none;grid-template-columns:1fr 1fr;gap:var(--space-4)">
        <div class="form-group">
          <label class="form-label" for="da-original">Original amount</label>
          <input id="da-original" type="number" min="0" step="1"
            value="${existing?.originalAmount ?? ''}" placeholder="0" />
        </div>
        <div class="form-group">
          <label class="form-label" for="da-term">Term (years)</label>
          <input id="da-term" type="number" min="1" max="50" step="1"
            value="${existing?.termMonths ? Math.round(existing.termMonths / 12) : ''}" placeholder="e.g. 30" />
        </div>
      </div>
      <div id="da-row-cycle" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
        <div class="form-group">
          <label class="form-label" for="da-cycle">Payment cycle</label>
          <select id="da-cycle">${cycleOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label" for="da-duedate">Next payment due date</label>
          <input id="da-duedate" type="date"
            value="${dueDateDefaultStr}" />
          <span class="form-hint">Pick your next payment due date</span>
        </div>
      </div>
      <div id="da-section-intro-apr" style="display:none">
        <fieldset style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:var(--space-4)">
          <legend class="form-label" style="padding:0 var(--space-2)">0% Intro APR</legend>
          <label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);cursor:pointer;margin-bottom:var(--space-3)">
            <input type="checkbox" id="da-intro-checked" ${existing?.introAprEndDate ? 'checked' : ''} />
            This card has a 0% intro APR period
          </label>
          <div id="da-intro-date-wrap" style="${existing?.introAprEndDate ? '' : 'display:none'}">
            <div class="form-group">
              <label class="form-label" for="da-intro-end">Intro APR ends on</label>
              <input id="da-intro-end" type="date"
                value="${existing?.introAprEndDate ? new Date(existing.introAprEndDate).toISOString().split('T')[0] : ''}" />
              <span class="form-hint">After this date, the APR above applies. Balance isn't interest-free — it still must be paid down.</span>
            </div>
          </div>
        </fieldset>
      </div>
      <div id="da-section-card-payment">
        ${showMinPayment ? `
        <fieldset style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:var(--space-4)">
          <legend class="form-label" style="padding:0 var(--space-2)">Minimum payment</legend>
          <div style="display:flex;gap:var(--space-4);margin-bottom:var(--space-3)">
            <label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);cursor:pointer">
              <input type="radio" name="da-min-type" value="percentage"
                ${minTypeChecked === 'percentage' ? 'checked' : ''} />
              % of balance
            </label>
            <label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);cursor:pointer">
              <input type="radio" name="da-min-type" value="fixed"
                ${minTypeChecked === 'fixed' ? 'checked' : ''} />
              Fixed amount
            </label>
          </div>
          <div class="form-group">
            <input id="da-min-value" type="number" min="0" step="0.01"
              value="${existing?.minimumPaymentValue ?? ''}" placeholder="e.g. 2 or 25.00" />
            <span class="form-hint" id="da-min-hint">
              ${minTypeChecked === 'fixed' ? 'Fixed amount paid each cycle' : 'Percentage of balance, floored at $25'}
            </span>
          </div>
        </fieldset>
        ` : `<p class="form-hint" style="margin:0">You can add minimum payment details later via "Complete setup →" on the account.</p>`}
      </div>
      <div id="da-section-fixed-payment" style="display:none" class="form-group">
        <label class="form-label" for="da-payment-fixed">Monthly payment</label>
        <input id="da-payment-fixed" type="number" min="0" step="0.01"
          value="${existing?.minimumPaymentValue ?? ''}" placeholder="0.00" />
        <span class="form-hint">Your regular monthly payment amount</span>
      </div>
      <div id="da-error" class="form-error" style="display:none"></div>
    `;

    if (showMinPayment) {
      body.querySelectorAll<HTMLInputElement>('[name="da-min-type"]').forEach((radio) => {
        radio.addEventListener('change', () => {
          const hint = body.querySelector<HTMLElement>('#da-min-hint')!;
          hint.textContent = radio.value === 'fixed'
            ? 'Fixed amount paid each cycle'
            : 'Percentage of balance, floored at $25';
        });
      });
    }

    const syncTypeUI = (type: DebtAccountType) => {
      const set = (id: string, display: string) => {
        const el = body.querySelector<HTMLElement>(id);
        if (el) el.style.display = display;
      };
      const isCard = type === 'card';
      const isMedical = type === 'medical';
      const isLoanOrMortgage = type === 'mortgage' || type === 'loan' || type === 'vehicle';

      set('#da-row-limit', isCard ? 'block' : 'none');
      set('#da-row-loan-details', isLoanOrMortgage ? 'grid' : 'none');
      set('#da-row-cycle', isMedical ? 'none' : 'grid');
      set('#da-section-intro-apr', isCard ? 'block' : 'none');
      set('#da-section-card-payment', isCard ? 'block' : 'none');
      set('#da-section-fixed-payment', isCard ? 'none' : 'block');

      const aprHint = body.querySelector<HTMLElement>('#da-apr-hint');
      if (aprHint) {
        aprHint.textContent = isMedical ? 'Often 0% for interest-free medical plans' : 'Annual percentage rate';
      }
      const aprReq = body.querySelector<HTMLElement>('#da-apr-req');
      if (aprReq) aprReq.style.display = isMedical ? 'none' : '';
    };

    if (existing?.url) body.querySelector<HTMLInputElement>('#da-url')!.value = existing.url;

    syncTypeUI(initialType);

    body.querySelector<HTMLInputElement>('#da-intro-checked')?.addEventListener('change', (e) => {
      const wrap = body.querySelector<HTMLElement>('#da-intro-date-wrap');
      if (wrap) wrap.style.display = (e.target as HTMLInputElement).checked ? '' : 'none';
    });

    if (!isEdit) {
      body.querySelector<HTMLSelectElement>('#da-type')!.addEventListener('change', (e) => {
        syncTypeUI((e.target as HTMLSelectElement).value as DebtAccountType);
      });
    }

    const getDebtTypeLabel = (): string => {
      const t = (body.querySelector<HTMLSelectElement>('#da-type')!.value as DebtAccountType);
      return DEBT_TYPE_LABELS[t].replace(/^[^ ]+ /, '');
    };

    let flushReminders: (finalItemId: string) => Promise<void> = async () => {};
    if (!showPaymentDetails) {
      if (isEdit && existing) {
        const { element, flush } = buildLinkedRemindersSection(existing.id, 'debt', existing.name);
        body.appendChild(element);
        flushReminders = flush;
      } else if (!isEdit) {
        const nameInput = body.querySelector<HTMLInputElement>('#da-name')!;
        const { element, flush } = buildLinkedRemindersSection('', 'debt', 'Debt', {
          deferred: true,
          getLabel: () => nameInput.value.trim() || 'Debt',
        });
        body.appendChild(element);
        flushReminders = flush;
      }
    }

    openFormModal({
      title: showPaymentDetails ? 'Complete Account Setup' : isEdit ? `Edit ${DEBT_TYPE_LABELS[initialType].replace(/^[^ ]+ /, '')}` : 'Add Debt',
      body,
      submitLabel: showPaymentDetails ? 'Save payment details' : isEdit ? 'Save changes' : `Add ${getDebtTypeLabel()}`,
      onSubmit: async (close) => {
        const type = body.querySelector<HTMLSelectElement>('#da-type')!.value as DebtAccountType;
        const isCard = type === 'card';
        const isMedical = type === 'medical';
        const name = body.querySelector<HTMLInputElement>('#da-name')!.value.trim();
        const balance = parseFloat(body.querySelector<HTMLInputElement>('#da-balance')!.value);
        const apr = parseFloat(body.querySelector<HTMLInputElement>('#da-apr')!.value);
        const creditLimitRaw = parseFloat(body.querySelector<HTMLInputElement>('#da-limit')!.value || '');
        const creditLimit = isNaN(creditLimitRaw) ? 0 : creditLimitRaw;
        const originalAmountRaw = parseFloat(body.querySelector<HTMLInputElement>('#da-original')!.value || '');
        const originalAmount = isNaN(originalAmountRaw) || originalAmountRaw <= 0 ? undefined : originalAmountRaw;
        const termYearsRaw = parseInt(body.querySelector<HTMLInputElement>('#da-term')!.value || '');
        const termMonths = isNaN(termYearsRaw) || termYearsRaw <= 0 ? undefined : termYearsRaw * 12;
        const cycleEl = body.querySelector<HTMLSelectElement>('#da-cycle');
        const paymentCycle = ((cycleEl?.value ?? 'monthly') as PaymentCycle);
        const dueDateVal = body.querySelector<HTMLInputElement>('#da-duedate')?.value ?? '';
        const dueDateMs = dueDateVal ? new Date(dueDateVal).getTime() : undefined;
        // Extract day-of-month from the picked date for cycle display (clamped 1–28)
        const dueDay = dueDateVal ? Math.min(parseInt(dueDateVal.split('-')[2]!), 28) : undefined;
        const nextDueDateMs = dueDateMs && !isNaN(dueDateMs) ? dueDateMs : undefined;

        const minTypeEl = body.querySelector<HTMLInputElement>('[name="da-min-type"]:checked');
        const minType = (minTypeEl?.value ?? 'percentage') as 'fixed' | 'percentage';
        let minValue: number | undefined;
        if (isCard) {
          const raw = parseFloat(body.querySelector<HTMLInputElement>('#da-min-value')?.value ?? '');
          minValue = isNaN(raw) || raw <= 0 ? undefined : raw;
        } else {
          const raw = parseFloat(body.querySelector<HTMLInputElement>('#da-payment-fixed')!.value ?? '');
          minValue = isNaN(raw) || raw <= 0 ? undefined : raw;
        }

        const introChecked = isCard && !!(body.querySelector<HTMLInputElement>('#da-intro-checked')?.checked);
        const introEndStr = body.querySelector<HTMLInputElement>('#da-intro-end')?.value ?? '';
        let introAprEndDate: number | undefined;
        if (introChecked && introEndStr) {
          introAprEndDate = new Date(introEndStr + 'T23:59:59Z').getTime();
        }
        const url = body.querySelector<HTMLInputElement>('#da-url')!.value.trim() || undefined;

        const errEl = body.querySelector<HTMLElement>('#da-error')!;
        const missing: string[] = [];
        if (!name)                                   missing.push('Name / Lender');
        if (isNaN(balance) || balance < 0)           missing.push('Current balance');
        if (isNaN(apr) || (!isMedical && apr <= 0))  missing.push('APR');
        if (showMinPayment && isCard && minValue == null) missing.push('Minimum payment');
        if (introChecked && !introEndStr)             missing.push('Intro APR end date');
        if (missing.length > 0) {
          errEl.textContent = missing.length === 1
            ? `${missing[0]} is required.`
            : `Fill in all required fields: ${missing.join(', ')}.`;
          errEl.style.display = 'block';
          return;
        }

        const now = Date.now();
        // For edits, strip introAprEndDate from existing so we can cleanly control it
        const { introAprEndDate: _prevIntro, ...existingBase } = existing ?? {} as DebtAccount;
        const account: DebtAccount = existing
          ? {
              ...existingBase, id: existing.id, createdAt: existing.createdAt,
              type, name, balance, apr, paymentCycle, updatedAt: now,
              ...(isCard && creditLimit > 0 ? { creditLimit } : {}),
              ...(originalAmount != null ? { originalAmount } : {}),
              ...(termMonths != null ? { termMonths } : {}),
              ...(dueDay != null ? { dueDay } : {}),
              ...(nextDueDateMs != null ? { nextDueDateMs } : {}),
              ...(minValue != null ? { minimumPaymentType: isCard ? minType : 'fixed', minimumPaymentValue: minValue } : {}),
              ...(introAprEndDate != null ? { introAprEndDate } : {}),
              ...(url != null ? { url } : {}),
            }
          : {
              ...createDebtAccount(type, name, balance, apr),
              paymentCycle,
              ...(isCard && creditLimit > 0 ? { creditLimit } : {}),
              ...(originalAmount != null ? { originalAmount } : {}),
              ...(termMonths != null ? { termMonths } : {}),
              ...(dueDay != null ? { dueDay } : {}),
              ...(nextDueDateMs != null ? { nextDueDateMs } : {}),
              ...(minValue != null ? { minimumPaymentType: isCard ? minType : 'fixed', minimumPaymentValue: minValue } : {}),
              ...(introAprEndDate != null ? { introAprEndDate } : {}),
              ...(url != null ? { url } : {}),
            };

        const wasPaidOff = !!(existing && existing.balance > 0 && balance === 0);

        await saveDebtAccount(account);
        await flushReminders(account.id);

        if (!this.customOrder.includes(account.id)) this.customOrder.push(account.id);
        if (!this.selectedAccountId) this.selectedAccountId = account.id;

        close();
        await this.load();

        if (wasPaidOff) {
          const allFree = this.accounts.every((acc) => acc.balance <= 0);
          if (allFree) {
            setTimeout(() => showAllDebtFreeCelebration(), 450);
          } else {
            setTimeout(() => showDebtPayoffCelebration(account.name), 450);
          }
        }
      },
    });
  }

  // ── Payoff milestone timeline ────────────────────────────────────────────

  private buildMilestoneCard(): HTMLElement | null {
    const active = this.accounts.filter((a) => a.balance > 0);
    if (active.length === 0) return null;

    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-testid', 'milestone-card');

    const h3 = document.createElement('h3');
    h3.className = 'font-serif';
    h3.style.cssText = 'font-size:var(--text-xl);margin-bottom:var(--space-2)';
    h3.textContent = '🏆 Payoff Milestones';
    card.appendChild(h3);

    const strategyNote = document.createElement('p');
    strategyNote.className = 'text-xs text-muted';
    strategyNote.style.marginBottom = 'var(--space-5)';
    const extraNote = this.extraPayment > 0
      ? ` · +${fmt.format(this.extraPayment)}/mo extra`
      : ' · minimum payments only';
    strategyNote.textContent =
      `${this.strategy.charAt(0).toUpperCase() + this.strategy.slice(1)} strategy${extraNote}`;
    card.appendChild(strategyNote);

    // Per-account payoff via single-card amortization (split extra evenly)
    const perAccountResults = active
      .map((a) => ({ account: a, result: amortizeSingleCard(a, this.extraPayment / active.length) }))
      .sort((a, b) => a.result.debtFreeDate.getTime() - b.result.debtFreeDate.getTime());

    const totalPaidPerAccount = new Map<string, number>();
    this.payments.forEach((p) => {
      totalPaidPerAccount.set(p.accountId, (totalPaidPerAccount.get(p.accountId) ?? 0) + p.amount);
    });

    const timeline = document.createElement('div');
    timeline.className = 'milestone-timeline';
    timeline.setAttribute('data-testid', 'milestone-timeline');

    perAccountResults.forEach(({ account, result }, idx) => {
      const paidSoFar = totalPaidPerAccount.get(account.id) ?? 0;
      const estimatedOriginal = account.balance + paidSoFar;
      const pctPaid = estimatedOriginal > 0 ? paidSoFar / estimatedOriginal : 0;
      const barColor = idx === 0 ? 'var(--ff-gold)' : 'var(--ff-green)';
      const icon = DEBT_TYPE_ICONS[account.type];
      const dateStr = result.debtFreeDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      const row = document.createElement('div');
      row.className = 'milestone-row';
      row.setAttribute('data-testid', 'milestone-row');
      row.setAttribute('data-account-id', account.id);
      row.innerHTML = `
        <div class="milestone-rank">${idx + 1}</div>
        <div class="milestone-info">
          <div class="milestone-name">${icon} ${account.name}</div>
          <div class="milestone-progress-wrap">
            <div class="milestone-progress-bar" style="width:${Math.round(pctPaid * 100)}%;background:${barColor}"></div>
          </div>
          <div class="milestone-meta">
            ${fmtCents.format(account.balance)} remaining
            · ${Math.round(pctPaid * 100)}% paid
            · <strong>${fmtCents.format(result.totalInterest)}</strong> est. interest
          </div>
        </div>
        <div class="milestone-date" data-testid="milestone-date">
          <span class="milestone-date-label">Paid off</span>
          <span class="milestone-date-value">${dateStr}</span>
        </div>
      `;
      timeline.appendChild(row);
    });

    card.appendChild(timeline);

    // Overall freedom date via multi-card amortization
    const multiResult = amortizeMultiCard(active, this.strategy, this.extraPayment);
    const freedomDate = multiResult.debtFreeDate
      ? multiResult.debtFreeDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : '—';

    const freedomBanner = document.createElement('div');
    freedomBanner.className = 'milestone-freedom-banner';
    freedomBanner.setAttribute('data-testid', 'milestone-freedom-banner');
    freedomBanner.innerHTML = `
      <span class="milestone-freedom-icon">🎯</span>
      <div>
        <div class="milestone-freedom-label">Complete debt freedom</div>
        <div class="milestone-freedom-date" data-testid="milestone-freedom-date">${freedomDate}</div>
      </div>
      <div class="milestone-freedom-stats">
        <div class="milestone-freedom-stat">
          <span class="text-muted text-xs">Total interest at current pace</span>
          <span class="milestone-freedom-stat-val">${fmtCents.format(multiResult.totalInterest)}</span>
        </div>
      </div>
    `;
    card.appendChild(freedomBanner);

    // What-if nudge when no extra payment is set
    if (this.extraPayment === 0) {
      const nudge = amortizeMultiCard(active, this.strategy, 50);
      const monthsSaved = multiResult.monthly.length - nudge.monthly.length;
      const interestSaved = multiResult.totalInterest - nudge.totalInterest;
      if (monthsSaved > 0) {
        const tip = document.createElement('p');
        tip.className = 'milestone-whatif-tip';
        tip.setAttribute('data-testid', 'milestone-whatif-tip');
        tip.innerHTML = `
          💡 Add just <strong>$50/month</strong> and you'd be debt-free
          <strong>${monthsSaved} month${monthsSaved !== 1 ? 's' : ''} sooner</strong>,
          saving <strong>${fmtCents.format(interestSaved)}</strong> in interest.
        `;
        card.appendChild(tip);
      }
    }

    return card;
  }
}
