import './debt.css';
import { makeHelpBtn } from '@/utils/helpNav';
import { showPageError } from '@/utils/errorUI';
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
} from 'chart.js';
import {
  getDebtAccounts,
  getDebtPayments,
  getCardCharges,
  getCategories,
  getBankAccounts,
} from '@/db';
import { fmtCents } from '@/utils/finance';
import { detectMinimumPaymentTrap } from '@/engine/amortize';
import { showMascot, showDebtPayoffCelebration, showAllDebtFreeCelebration } from '@/mascot/Mascot';
import type { BankAccount, CardCharge, DebtAccount, DebtPayment, DebtStrategy, ExpenseCategory } from '@/types';
import { openDebtForm } from './DebtAccountForm';
import { buildStrategyPanel } from './DebtStrategy';
import { buildChart, rebuildChart, type ChartRef } from './DebtChart';
import { buildMerchantSummary } from './DebtSchedule';
import { buildSchedulePanel } from './DebtSchedule';
import { buildMilestoneCard } from './DebtMilestones';
import { buildDebtList } from './DebtList';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

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
  private chartRef: ChartRef = { instance: null };
  private _sortModeRef = { value: 'priority-asc' };

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'debt-page';
    void this.load();
    return this.container;
  }

  private async load(): Promise<void> {
    try {
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
    } catch (err) {
      showPageError(this.container, err instanceof Error ? err.message : 'Failed to load debt data', () => { void this.load(); });
    }
  }

  private paint(): void {
    this.chartRef.instance?.destroy();
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
        <div class="debt-total-value" data-testid="debt-total-value">${totalDebt > 0 ? fmtCents.format(totalDebt) : '—'}</div>
      </div>
    `;
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.setAttribute('data-testid', 'add-debt-btn');
    addBtn.textContent = '+ Add debt';
    addBtn.addEventListener('click', () => openDebtForm(undefined, false, (account, wasPaidOff) => this.onDebtFormSaved(account, wasPaidOff)));
    header.appendChild(addBtn);
    header.querySelector('h1')?.appendChild(makeHelpBtn('debt'));
    this.container.appendChild(header);

    if (this.accounts.length === 0) {
      this.container.appendChild(this.renderEmpty());
      return;
    }

    // ── Minimum payment trap callouts ─────────────────────────────────────
    const trapAccounts = this.accounts.filter((a) => detectMinimumPaymentTrap(a).isTrap);
    if (trapAccounts.length > 0) {
      this.container.appendChild(this.renderTrapCallout(trapAccounts));
    }

    // ── Account list ──────────────────────────────────────────────────────
    this.container.appendChild(buildDebtList(
      this.accounts, this.payments, this.charges, this.expenseCategories, this.bankAccounts,
      this._sortModeRef, this._openChargesPanels, this._chargesPageState,
      {
        onPaint: () => this.paint(),
        onLoad: () => this.load(),
        onDebtFormSaved: (account, wasPaidOff) => this.onDebtFormSaved(account, wasPaidOff),
      },
    ));

    const calFocusAccount = sessionStorage.getItem('cal-focus-account');
    const focusCharge = sessionStorage.getItem('ff-focus-charge');
    if (calFocusAccount) {
      sessionStorage.removeItem('cal-focus-account');
      if (focusCharge) sessionStorage.removeItem('ff-focus-charge');
      requestAnimationFrame(() => {
        const target = this.container.querySelector<HTMLElement>(`[data-account-id="${calFocusAccount}"]`);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });

        if (focusCharge) {
          const chargesPanel = target.querySelector<HTMLElement>('.charges-panel');
          if (chargesPanel && chargesPanel.style.display === 'none') {
            chargesPanel.style.display = '';
            this._openChargesPanels.add(calFocusAccount);
            const chargesBtn = target.querySelector<HTMLButtonElement>('[data-action="charges"]');
            if (chargesBtn) chargesBtn.textContent = '🧾 ↑';
          }
          const chargeItem = target.querySelector<HTMLElement>(`[data-charge-id="${focusCharge}"]`);
          if (chargeItem) {
            setTimeout(() => {
              chargeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
              chargeItem.classList.add('cal-focus-highlight');
            }, 150);
          } else {
            target.classList.add('cal-focus-highlight');
          }
        } else {
          target.classList.add('cal-focus-highlight');
        }
      });
    }

    // ── Merchant spending summary ──────────────────────────────────────────
    if (this.charges.length > 0) {
      this.container.appendChild(buildMerchantSummary(this.charges));
    }

    // ── Strategy + what-if ────────────────────────────────────────────────
    this.container.appendChild(buildStrategyPanel(
      this.accounts, this.strategy, this.extraPayment, this.customOrder, this.horizonYears,
      {
        strategy: (s) => { this.strategy = s; },
        extraPayment: (e) => { this.extraPayment = e; },
        customOrder: (order) => { this.customOrder = order; },
        rebuildChart: () => rebuildChart(this.accounts, this.customOrder, this.strategy, this.extraPayment, this.horizonYears, this.chartRef),
      },
    ));

    // ── Balance chart ─────────────────────────────────────────────────────
    this.container.appendChild(buildChart(
      this.accounts, this.customOrder, this.strategy, this.extraPayment, this.horizonYears,
      this.chartRef,
      (yr) => { this.horizonYears = yr; this.paint(); },
    ));

    // ── Per-account schedule ──────────────────────────────────────────────
    this.container.appendChild(buildSchedulePanel(
      this.accounts, this.selectedAccountId, this.horizonYears,
      (id) => { this.selectedAccountId = id; },
    ));

    // ── Payoff milestone timeline ──────────────────────────────────────────
    const milestones = buildMilestoneCard(this.accounts, this.payments, this.strategy, this.extraPayment);
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

  private async onDebtFormSaved(account: DebtAccount, wasPaidOff: boolean): Promise<void> {
    if (!this.customOrder.includes(account.id)) this.customOrder.push(account.id);
    if (!this.selectedAccountId) this.selectedAccountId = account.id;
    await this.load();
    if (wasPaidOff) {
      const allFree = this.accounts.every((acc) => acc.balance <= 0);
      if (allFree) setTimeout(() => showAllDebtFreeCelebration(), 450);
      else setTimeout(() => showDebtPayoffCelebration(account.name), 450);
    }
  }
}
