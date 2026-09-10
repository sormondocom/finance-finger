import './dashboard.css';
import { makeHelpBtn } from '@/utils/helpNav';
import { showPageError } from '@/utils/errorUI';
import browser from 'webextension-polyfill';
import {
  getMembers, getIncomeSources, getExpenses, getDebtAccounts,
  getCategories,
  getDebtPayments, getBankAccounts,
} from '@/db';
import { computePaymentStatus, computeMinPayment } from '@/utils/paymentStatus';
import { computeBillStatus } from '@/utils/billStatus';
import { refreshNotifier, subscribeToAlerts, getCurrentAlerts } from '@/utils/notifier';
import { greet, showMascot, showTip, updateMascotItems } from '@/mascot/Mascot';
import { getDailyTip } from '@/mascot/messages';
import { navigate } from '@/app/router';
import { toMonthly, sourceMonthly } from '@/utils/finance';
import { buildSummarySection, buildActivitySection, type MonthBucket } from './DashboardActivity';
import { buildPaymentRemindersCard } from './DashboardReminders';
import { buildFinancialHealthRow, buildIncomeByAccountCard, renderIncomePanel, renderDebtPanel } from './DashboardPanels';
import type { VaultConfig, Expense, ExpenseCategory, IncomeSource, HouseholdMember, BankAccount } from '@/types';



export class Dashboard {
  private el!: HTMLElement;
  private allExpenses: Expense[] = [];
  private allIncomeSources: IncomeSource[] = [];
  private categories: ExpenseCategory[] = [];
  private members: HouseholdMember[] = [];
  private bankAccounts: BankAccount[] = [];
  private totalDebt = 0;
  private debtCount = 0;

  // View state
  private viewMode: 'month' | 'custom' = 'month';
  private viewYear = new Date().getFullYear();
  private viewMonth = new Date().getMonth();
  private rangeStart: Date | null = null;
  private rangeEnd: Date | null = null;

  render(): HTMLElement {
    this.el = document.createElement('div');
    this.el.className = 'dashboard';
    this.el.innerHTML = '<p class="text-muted">Loading...</p>';
    void this.populate();
    return this.el;
  }

  private async populate(): Promise<void> {
    try {
    const [members, sources, expenses, cards, categories, configResult, payments, bankAccounts] = await Promise.all([
      getMembers(),
      getIncomeSources(),
      getExpenses(),
      getDebtAccounts(),
      getCategories(),
      browser.storage.local.get('vaultConfig'),
      getDebtPayments(),
      getBankAccounts(),
    ]);

    this.members = members;
    this.allIncomeSources = sources;
    this.allExpenses = expenses;
    this.categories = categories;
    this.bankAccounts = bankAccounts;
    this.totalDebt = cards.reduce((s, c) => s + c.balance, 0);
    this.debtCount = cards.length;

    const config = configResult['vaultConfig'] as VaultConfig | undefined;
    const profileName = config?.profileName ?? 'Household';

    this.el.innerHTML = '';

    // ── Page header: title + date controls ──────────────────────────────────
    const headerRow = document.createElement('div');
    headerRow.className = 'dashboard-header-row';

    const titleWrap = document.createElement('div');
    titleWrap.innerHTML = `
      <h1 class="dashboard-title font-serif">${profileName}</h1>
      <p class="dashboard-subtitle">${members.length} member${members.length !== 1 ? 's' : ''}</p>
    `;
    titleWrap.querySelector('h1')?.appendChild(makeHelpBtn('dashboard'));
    headerRow.appendChild(titleWrap);
    headerRow.appendChild(this.buildHeaderControls());
    this.el.appendChild(headerRow);

    // ── Payment reminders (past-due / due-soon debt cards + bills) ──────────
    const paymentStatuses = cards
      .filter((c) => c.balance > 0 && computeMinPayment(c) != null)
      .map((c) => ({
        account: c,
        status: computePaymentStatus(c, payments.filter((p) => p.accountId === c.id)),
      }));
    const pastDue  = paymentStatuses.filter(({ status }) => status.currentMonth === 'past-due');
    const dueSoon  = paymentStatuses.filter(({ status }) => status.currentMonth === 'due-soon');

    const billStatuses = expenses
      .filter((e) => e.recurring && !!e.dueDay && !e.isAutoPay)
      .map((e) => ({ expense: e, status: computeBillStatus(e) }));
    const billsPastDue = billStatuses.filter(({ status }) => status.status === 'past-due');
    const billsDueSoon = billStatuses.filter(({ status }) => status.status === 'due-soon');

    const hasAnyAlerts = pastDue.length > 0 || dueSoon.length > 0 || billsPastDue.length > 0 || billsDueSoon.length > 0;
    if (hasAnyAlerts) {
      this.el.appendChild(buildPaymentRemindersCard(pastDue, dueSoon, billsPastDue, billsDueSoon));
    }

    // ── Notifier: badge + live mascot updates ────────────────────────────────
    await refreshNotifier();
    subscribeToAlerts((items) => updateMascotItems(items));

    // ── Summary cards (date-sensitive) ──────────────────────────────────────
    this.el.appendChild(buildSummarySection(
      this.currentBuckets(),
      this.allIncomeSources.filter((s) => s.active && s.frequency !== 'once').length,
      this.allExpenses.filter((e) => e.recurring).length,
      this.totalDebt, this.debtCount,
    ));

    // ── Financial health metrics (DTI + credit utilization) ──────────────────
    const healthRow = buildFinancialHealthRow(cards, sources);
    if (healthRow) this.el.appendChild(healthRow);

    // ── Income + Debt panels (static) ───────────────────────────────────────
    const panels = document.createElement('div');
    panels.className = 'dashboard-panels';
    panels.innerHTML = `
      <div class="dashboard-panel card">
        <h2 class="font-serif">
          Income Sources
          <a href="#/income" data-route="/income">Manage →</a>
        </h2>
        <div data-section="income-content">${renderIncomePanel(sources, this.viewYear, this.viewMonth)}</div>
      </div>
      <div class="dashboard-panel card">
        <h2 class="font-serif">
          Debt
          <a href="#/debt" data-route="/debt">Manage →</a>
        </h2>
        ${renderDebtPanel(cards)}
      </div>
    `;
    panels.querySelectorAll<HTMLAnchorElement>('[data-route]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(a.dataset['route'] as Parameters<typeof navigate>[0]);
      });
    });
    this.el.appendChild(panels);

    // ── Income by Account (only when accounts are linked) ───────────────────────
    const incomeByAccountCard = buildIncomeByAccountCard(sources, this.bankAccounts, this.viewYear, this.viewMonth);
    if (incomeByAccountCard) this.el.appendChild(incomeByAccountCard);

    // ── Activity / Report section (date-sensitive) ───────────────────────────
    this.el.appendChild(buildActivitySection(
      this.currentBuckets(), this.viewMode, this.categories, this.members,
      this.rangeStart, this.rangeEnd,
      (id) => { this.allIncomeSources = this.allIncomeSources.filter((x) => x.id !== id); this.refreshDateSections(); },
      (id) => { this.allExpenses = this.allExpenses.filter((x) => x.id !== id); this.refreshDateSections(); },
      (src) => { this.allIncomeSources.push(src); this.refreshDateSections(); },
      (expense) => { this.allExpenses.push(expense); this.refreshDateSections(); },
    ));

    // ── Tip widget ───────────────────────────────────────────────────────────
    const gender = config?.mascotGender ?? 'buck';
    const mascotName = config?.mascotName ?? (gender === 'buck' ? 'Buck' : 'Penny');
    const [tipLabel, tipBody] = getDailyTip(gender);
    const tipWidget = document.createElement('div');
    tipWidget.style.cssText = `
      display:flex;gap:var(--space-4);align-items:flex-start;
      padding:var(--space-5);background:rgba(201,168,76,0.07);
      border:1px solid rgba(201,168,76,0.25);border-radius:var(--radius-lg);
      cursor:pointer;transition:box-shadow var(--ease-default);
    `;
    tipWidget.setAttribute('role', 'button');
    tipWidget.setAttribute('title', "Click for today's tip");
    tipWidget.setAttribute('data-testid', 'tip-widget');
    tipWidget.innerHTML = `
      <span style="font-size:1.75rem;line-height:1;flex-shrink:0">${gender === 'buck' ? '🤠' : '🌻'}</span>
      <div>
        <div style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ff-gold-dark);margin-bottom:var(--space-1)">
          ${mascotName}'s tip of the day
        </div>
        <div style="font-size:var(--text-sm);color:var(--color-text-muted)">
          <strong style="color:var(--color-text)">${tipLabel ?? ''}</strong>
          ${tipBody ? ' ' + tipBody.slice(0, 100) + (tipBody.length > 100 ? '...' : '') : ''}
        </div>
      </div>
    `;
    tipWidget.addEventListener('click', () => showTip());
    tipWidget.addEventListener('mouseenter', () => { tipWidget.style.boxShadow = 'var(--shadow-md)'; });
    tipWidget.addEventListener('mouseleave', () => { tipWidget.style.boxShadow = ''; });
    this.el.appendChild(tipWidget);

    // ── Mascot notifications (payment alerts take priority over greeting) ──────
    const greeted = sessionStorage.getItem('ff-greeted');
    const paymentAlerted = sessionStorage.getItem('ff-payment-alerted');

    const alertItems = getCurrentAlerts();
    if (alertItems.length > 0 && !paymentAlerted) {
      sessionStorage.setItem('ff-payment-alerted', '1');
      sessionStorage.setItem('ff-greeted', '1');
      setTimeout(() => showMascot('briefing', {}, 0, alertItems), 700);
    } else if (!greeted) {
      sessionStorage.setItem('ff-greeted', '1');
      setTimeout(() => greet(), 600);
    }

    const buckets = this.currentBuckets();
    const periodNet = buckets.reduce((s, b) => {
      const inc = b.recurringIncome + b.oneTimeIncome.reduce((ss, i) => ss + i.amount, 0);
      const exp = b.recurringExpenses + b.oneTimeExpenses.reduce((ss, e) => ss + e.amount, 0);
      return s + inc - exp;
    }, 0);
    if (sources.some((s) => s.active && s.frequency !== 'once') && periodNet < 0) {
      setTimeout(() => showMascot('negative-cashflow'), 2000);
    }
    } catch (err) {
      showPageError(this.el, err instanceof Error ? err.message : 'Failed to load dashboard', () => { void this.populate(); });
    }
  }

  // ── Date range helpers ────────────────────────────────────────────────────────

  private currentBuckets(): MonthBucket[] {
    if (this.viewMode === 'month') {
      const start = new Date(this.viewYear, this.viewMonth, 1);
      const end = new Date(this.viewYear, this.viewMonth + 1, 0); // last day of month
      return this.buildMonthBuckets(start, end);
    }
    if (!this.rangeStart || !this.rangeEnd) return [];
    return this.buildMonthBuckets(this.rangeStart, this.rangeEnd);
  }

  private buildMonthBuckets(start: Date, end: Date): MonthBucket[] {
    if (start > end) return [];

    const buckets: MonthBucket[] = [];
    let y = start.getFullYear();
    let m = start.getMonth();

    while (true) {
      const monthStart = new Date(y, m, 1);
      if (monthStart > end) break;

      const monthLastDay = new Date(y, m + 1, 0); // e.g. May 31
      const daysInMonth = monthLastDay.getDate();

      // Clamp each end to [start, end]
      const effStart = start > monthStart ? start : monthStart;
      const effEnd = end < monthLastDay ? end : monthLastDay;

      // Day counts using midnight boundaries (inclusive on both ends)
      const effStartMid = new Date(effStart.getFullYear(), effStart.getMonth(), effStart.getDate());
      const effEndMid = new Date(effEnd.getFullYear(), effEnd.getMonth(), effEnd.getDate());
      const daysInBucket = Math.round((effEndMid.getTime() - effStartMid.getTime()) / 86_400_000) + 1;
      const proratedFactor = daysInBucket / daysInMonth;
      const isPartial = proratedFactor < 0.9999;

      // Recurring totals scaled to the prorated window
      const recurringIncome = this.allIncomeSources
        .filter((s) => s.active && s.frequency !== 'once')
        .reduce((sum, s) => sum + sourceMonthly(s) * proratedFactor, 0);

      const recurringExpenses = this.allExpenses
        .filter((e) => e.recurring)
        .reduce((sum, e) => sum + toMonthly(e.amount, e.recurringFrequency ?? 'monthly') * proratedFactor, 0);

      // One-time items whose date falls within [effStartMid, effEndMid] (inclusive)
      const windowStart = effStartMid.getTime();
      const windowEnd = effEndMid.getTime() + 86_400_000; // exclusive upper bound

      const oneTimeIncome = this.allIncomeSources.filter(
        (s) => s.frequency === 'once' && s.date !== undefined && s.date >= windowStart && s.date < windowEnd,
      );
      const oneTimeExpenses = this.allExpenses.filter(
        (e) => !e.recurring && e.date >= windowStart && e.date < windowEnd,
      );

      buckets.push({
        year: y, month: m, isPartial, proratedFactor,
        label: monthStart.toLocaleString('default', { month: 'long', year: 'numeric' }),
        effectiveStart: effStart, effectiveEnd: effEnd,
        recurringIncome, oneTimeIncome, recurringExpenses, oneTimeExpenses,
      });

      if (m === 11) { m = 0; y++; } else { m++; }
    }

    return buckets;
  }

  private refreshDateSections(): void {
    const oldControls = this.el.querySelector('[data-section="header-controls"]');
    if (oldControls) oldControls.replaceWith(this.buildHeaderControls());

    const buckets = this.currentBuckets();

    const oldSummary = this.el.querySelector('.dashboard-summary');
    if (oldSummary) oldSummary.replaceWith(buildSummarySection(
      buckets,
      this.allIncomeSources.filter((s) => s.active && s.frequency !== 'once').length,
      this.allExpenses.filter((e) => e.recurring).length,
      this.totalDebt, this.debtCount,
    ));

    const oldActivity = this.el.querySelector('[data-section="activity"]');
    if (oldActivity) oldActivity.replaceWith(buildActivitySection(
      buckets, this.viewMode, this.categories, this.members,
      this.rangeStart, this.rangeEnd,
      (id) => { this.allIncomeSources = this.allIncomeSources.filter((x) => x.id !== id); this.refreshDateSections(); },
      (id) => { this.allExpenses = this.allExpenses.filter((x) => x.id !== id); this.refreshDateSections(); },
      (src) => { this.allIncomeSources.push(src); this.refreshDateSections(); },
      (expense) => { this.allExpenses.push(expense); this.refreshDateSections(); },
    ));

    const oldIncContent = this.el.querySelector('[data-section="income-content"]');
    if (oldIncContent) oldIncContent.innerHTML = renderIncomePanel(this.allIncomeSources, this.viewYear, this.viewMonth);
  }

  // ── Header controls ───────────────────────────────────────────────────────────

  private buildHeaderControls(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'dashboard-header-controls';
    wrap.setAttribute('data-section', 'header-controls');

    if (this.viewMode === 'month') {
      const now = new Date();
      const isCurrentMonth = this.viewYear === now.getFullYear() && this.viewMonth === now.getMonth();
      const monthName = new Date(this.viewYear, this.viewMonth, 1)
        .toLocaleString('default', { month: 'long', year: 'numeric' });

      const nav = document.createElement('div');
      nav.className = 'month-nav';

      const prevBtn = document.createElement('button');
      prevBtn.className = 'month-nav-btn';
      prevBtn.setAttribute('aria-label', 'Previous month');
      prevBtn.setAttribute('data-testid', 'dash-prev');
      prevBtn.innerHTML = '&#8249;';

      const label = document.createElement('span');
      label.className = 'month-nav-label';
      label.setAttribute('data-testid', 'dash-month-label');
      label.textContent = monthName;

      const nextBtn = document.createElement('button');
      nextBtn.className = 'month-nav-btn';
      nextBtn.setAttribute('aria-label', 'Next month');
      nextBtn.setAttribute('data-testid', 'dash-next');
      nextBtn.innerHTML = '&#8250;';
      if (isCurrentMonth) nextBtn.disabled = true;

      prevBtn.addEventListener('click', () => {
        if (this.viewMonth === 0) { this.viewMonth = 11; this.viewYear--; }
        else { this.viewMonth--; }
        this.refreshDateSections();
      });
      nextBtn.addEventListener('click', () => {
        if (isCurrentMonth) return;
        if (this.viewMonth === 11) { this.viewMonth = 0; this.viewYear++; }
        else { this.viewMonth++; }
        this.refreshDateSections();
      });

      nav.appendChild(prevBtn);
      nav.appendChild(label);
      nav.appendChild(nextBtn);
      wrap.appendChild(nav);

      const customBtn = document.createElement('button');
      customBtn.className = 'btn btn-secondary btn-sm';
      customBtn.setAttribute('data-testid', 'custom-range-btn');
      customBtn.textContent = 'Custom Range';
      customBtn.addEventListener('click', () => {
        this.viewMode = 'custom';
        const n = new Date();
        this.rangeStart = new Date(n.getFullYear(), n.getMonth(), 1);
        this.rangeEnd = n;
        this.refreshDateSections();
      });
      wrap.appendChild(customBtn);

    } else {
      const toISO = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const rangeWrap = document.createElement('div');
      rangeWrap.className = 'range-inputs';

      const startInput = document.createElement('input');
      startInput.type = 'date';
      startInput.id = 'range-start';
      startInput.setAttribute('data-testid', 'range-start');
      startInput.value = this.rangeStart ? toISO(this.rangeStart) : '';

      const sep = document.createElement('span');
      sep.className = 'range-sep';
      sep.textContent = 'to';

      const endInput = document.createElement('input');
      endInput.type = 'date';
      endInput.id = 'range-end';
      endInput.setAttribute('data-testid', 'range-end');
      endInput.value = this.rangeEnd ? toISO(this.rangeEnd) : '';

      const applyBtn = document.createElement('button');
      applyBtn.className = 'btn btn-primary btn-sm';
      applyBtn.setAttribute('data-testid', 'range-apply');
      applyBtn.textContent = 'Apply';
      applyBtn.addEventListener('click', () => {
        if (!startInput.value || !endInput.value) return;
        const s = new Date(startInput.value + 'T00:00:00');
        const e = new Date(endInput.value + 'T00:00:00');
        if (s > e) return;
        this.rangeStart = s;
        this.rangeEnd = e;
        this.refreshDateSections();
      });

      const clearBtn = document.createElement('button');
      clearBtn.className = 'btn btn-secondary btn-sm';
      clearBtn.setAttribute('data-testid', 'range-clear');
      clearBtn.textContent = 'Clear';
      clearBtn.addEventListener('click', () => {
        this.viewMode = 'month';
        this.viewYear = new Date().getFullYear();
        this.viewMonth = new Date().getMonth();
        this.rangeStart = null;
        this.rangeEnd = null;
        this.refreshDateSections();
      });

      rangeWrap.appendChild(startInput);
      rangeWrap.appendChild(sep);
      rangeWrap.appendChild(endInput);
      rangeWrap.appendChild(applyBtn);
      rangeWrap.appendChild(clearBtn);
      wrap.appendChild(rangeWrap);
    }

    return wrap;
  }

}
