import './dashboard.css';
import browser from 'webextension-polyfill';
import {
  getMembers, getIncomeSources, getExpenses, getDebtAccounts,
  getCategories, saveExpense, createExpense, deleteExpense,
  saveIncomeSource, createIncomeSource, deleteIncomeSource,
  getDebtPayments,
} from '@/db';
import { computePaymentStatus, computeMinPayment } from '@/utils/paymentStatus';
import type { AccountPaymentStatus } from '@/utils/paymentStatus';
import { computeBillStatus } from '@/utils/billStatus';
import type { BillPaymentStatus } from '@/utils/billStatus';
import { refreshNotifier, subscribeToAlerts, getCurrentAlerts } from '@/utils/notifier';
import { greet, showMascot, showTip, updateMascotItems } from '@/mascot/Mascot';
import { getDailyTip } from '@/mascot/messages';
import { navigate } from '@/app/router';
import { toMonthly, sourceMonthly, fmt, fmtCents } from '@/utils/finance';
import { openFormModal } from '@/components/Modal';
import type { VaultConfig, Expense, ExpenseCategory, IncomeSource, HouseholdMember } from '@/types';

// Per-calendar-month bucket used for all date-range calculations.
// "recurringIncome / recurringExpenses" are the current-config recurring
// rates prorated to the fraction of the month that falls within the window.
interface MonthBucket {
  readonly year: number;
  readonly month: number;   // 0-indexed
  readonly label: string;   // "August 2026"
  readonly isPartial: boolean;
  readonly proratedFactor: number; // 0..1
  readonly effectiveStart: Date;   // first day included (clamped to range)
  readonly effectiveEnd: Date;     // last day included (clamped to range)
  readonly recurringIncome: number;
  readonly oneTimeIncome: IncomeSource[];
  readonly recurringExpenses: number;
  readonly oneTimeExpenses: Expense[];
}

export class Dashboard {
  private el!: HTMLElement;
  private allExpenses: Expense[] = [];
  private allIncomeSources: IncomeSource[] = [];
  private categories: ExpenseCategory[] = [];
  private members: HouseholdMember[] = [];
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
    this.populate();
    return this.el;
  }

  private async populate(): Promise<void> {
    const [members, sources, expenses, cards, categories, configResult, payments] = await Promise.all([
      getMembers(),
      getIncomeSources(),
      getExpenses(),
      getDebtAccounts(),
      getCategories(),
      browser.storage.local.get('vaultConfig'),
      getDebtPayments(),
    ]);

    this.members = members;
    this.allIncomeSources = sources;
    this.allExpenses = expenses;
    this.categories = categories;
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
      .filter((e) => e.recurring && !!e.dueDay)
      .map((e) => ({ expense: e, status: computeBillStatus(e) }));
    const billsPastDue = billStatuses.filter(({ status }) => status.status === 'past-due');
    const billsDueSoon = billStatuses.filter(({ status }) => status.status === 'due-soon');

    const hasAnyAlerts = pastDue.length > 0 || dueSoon.length > 0 || billsPastDue.length > 0 || billsDueSoon.length > 0;
    if (hasAnyAlerts) {
      this.el.appendChild(this.buildPaymentRemindersCard(pastDue, dueSoon, billsPastDue, billsDueSoon));
    }

    // ── Notifier: badge + live mascot updates ────────────────────────────────
    await refreshNotifier();
    subscribeToAlerts((items) => updateMascotItems(items));

    // ── Summary cards (date-sensitive) ──────────────────────────────────────
    this.el.appendChild(this.buildSummarySection(this.currentBuckets()));

    // ── Income + Debt panels (static) ───────────────────────────────────────
    const panels = document.createElement('div');
    panels.className = 'dashboard-panels';
    panels.innerHTML = `
      <div class="dashboard-panel card">
        <h2 class="font-serif">
          Income Sources
          <a href="#/income" data-route="/income">Manage →</a>
        </h2>
        ${this.renderIncomePanel(sources)}
      </div>
      <div class="dashboard-panel card">
        <h2 class="font-serif">
          Debt
          <a href="#/debt" data-route="/debt">Manage →</a>
        </h2>
        ${this.renderDebtPanel(cards)}
      </div>
    `;
    panels.querySelectorAll<HTMLAnchorElement>('[data-route]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(a.dataset['route'] as Parameters<typeof navigate>[0]);
      });
    });
    this.el.appendChild(panels);

    // ── Activity / Report section (date-sensitive) ───────────────────────────
    this.el.appendChild(this.buildActivitySection(this.currentBuckets()));

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
    if (oldSummary) oldSummary.replaceWith(this.buildSummarySection(buckets));

    const oldActivity = this.el.querySelector('[data-section="activity"]');
    if (oldActivity) oldActivity.replaceWith(this.buildActivitySection(buckets));
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

  // ── Summary section ───────────────────────────────────────────────────────────

  private buildSummarySection(buckets: MonthBucket[]): HTMLElement {
    const section = document.createElement('div');
    section.className = 'dashboard-summary';

    const totalRecIncome = buckets.reduce((s, b) => s + b.recurringIncome, 0);
    const totalOTIncome = buckets.reduce((s, b) => s + b.oneTimeIncome.reduce((ss, i) => ss + i.amount, 0), 0);
    const totalIncome = totalRecIncome + totalOTIncome;

    const totalRecExpenses = buckets.reduce((s, b) => s + b.recurringExpenses, 0);
    const totalOTExpenses = buckets.reduce((s, b) => s + b.oneTimeExpenses.reduce((ss, e) => ss + e.amount, 0), 0);
    const totalExpenses = totalRecExpenses + totalOTExpenses;

    const net = totalIncome - totalExpenses;
    const recNet = totalRecIncome - totalRecExpenses;
    const otNet = totalOTIncome - totalOTExpenses;
    const hasOT = totalOTIncome > 0 || totalOTExpenses > 0;

    const recIncCount = this.allIncomeSources.filter((s) => s.active && s.frequency !== 'once').length;
    const recExpCount = this.allExpenses.filter((e) => e.recurring).length;

    // ── Income card ──
    const incCard = document.createElement('div');
    incCard.className = 'summary-card income';
    incCard.setAttribute('data-testid', 'summary-card-income');
    incCard.innerHTML = `
      <span class="summary-card-label">Income</span>
      <span class="summary-card-value" data-testid="summary-value-income">${totalIncome > 0 ? fmt.format(totalIncome) : '—'}</span>
      ${hasOT && totalOTIncome > 0
        ? `<div class="summary-card-breakdown" data-testid="summary-breakdown-income">
             <span>${fmt.format(totalRecIncome)} recurring baseline</span>
             <span class="bd-sep">·</span>
             <span class="bd-pos">+${fmt.format(totalOTIncome)} one-time</span>
           </div>`
        : `<span class="summary-card-sub">${recIncCount} recurring source${recIncCount !== 1 ? 's' : ''}</span>`
      }
    `;
    section.appendChild(incCard);

    // ── Expenses card ──
    const expCard = document.createElement('div');
    expCard.className = 'summary-card expense';
    expCard.setAttribute('data-testid', 'summary-card-expenses');
    expCard.innerHTML = `
      <span class="summary-card-label">Expenses</span>
      <span class="summary-card-value" data-testid="summary-value-expenses">${totalExpenses > 0 ? fmt.format(totalExpenses) : '—'}</span>
      ${hasOT && totalOTExpenses > 0
        ? `<div class="summary-card-breakdown" data-testid="summary-breakdown-expenses">
             <span>${fmt.format(totalRecExpenses)} recurring baseline</span>
             <span class="bd-sep">·</span>
             <span class="bd-neg">+${fmt.format(totalOTExpenses)} one-time</span>
           </div>`
        : `<span class="summary-card-sub">${recExpCount} recurring item${recExpCount !== 1 ? 's' : ''}</span>`
      }
    `;
    section.appendChild(expCard);

    // ── Net Cash Flow card ──
    const netColor = net >= 0 ? 'var(--ff-green)' : 'var(--color-danger)';
    const netStr = totalIncome > 0 || totalExpenses > 0
      ? `${net >= 0 ? '+' : '−'}${fmt.format(Math.abs(net))}` : '—';
    const netCard = document.createElement('div');
    netCard.className = 'summary-card surplus';
    netCard.setAttribute('data-testid', 'summary-card-surplus');
    netCard.innerHTML = `
      <span class="summary-card-label">Net Cash Flow</span>
      <span class="summary-card-value" data-testid="summary-value-surplus" style="color:${netColor}">${netStr}</span>
      ${hasOT
        ? `<div class="summary-card-breakdown" data-testid="summary-breakdown-net">
             <span class="${recNet >= 0 ? 'bd-pos' : 'bd-neg'}">${recNet >= 0 ? '+' : '−'}${fmt.format(Math.abs(recNet))} recurring</span>
             <span class="bd-sep">·</span>
             <span class="${otNet >= 0 ? 'bd-pos' : 'bd-neg'}">${otNet >= 0 ? '+' : '−'}${fmt.format(Math.abs(otNet))} one-time</span>
           </div>`
        : `<span class="summary-card-sub">After recurring expenses</span>`
      }
    `;
    section.appendChild(netCard);

    // ── Debt card (always point-in-time) ──
    const debtCard = document.createElement('div');
    debtCard.className = 'summary-card debt';
    debtCard.setAttribute('data-testid', 'summary-card-debt');
    debtCard.innerHTML = `
      <span class="summary-card-label">Total Debt</span>
      <span class="summary-card-value" data-testid="summary-value-debt">${this.totalDebt > 0 ? fmt.format(this.totalDebt) : '—'}</span>
      <span class="summary-card-sub">${this.debtCount} account${this.debtCount !== 1 ? 's' : ''}</span>
    `;
    section.appendChild(debtCard);

    return section;
  }

  // ── Activity / Report section ─────────────────────────────────────────────────

  private buildActivitySection(buckets: MonthBucket[]): HTMLElement {
    const section = document.createElement('div');
    section.className = 'card monthly-activity-widget';
    section.setAttribute('data-section', 'activity');

    if (this.viewMode === 'month') {
      this.buildMonthActivityContent(section, buckets[0]);
    } else {
      this.buildRangeReportContent(section, buckets);
    }

    return section;
  }

  private buildMonthActivityContent(container: HTMLElement, bucket: MonthBucket | undefined): void {
    if (!bucket) return;

    const catMap = new Map(this.categories.map((c) => [c.id, c]));
    const memberMap = new Map(this.members.map((m) => [m.id, m]));

    const header = document.createElement('div');
    header.className = 'ma-header';
    header.innerHTML = `<h2 class="font-serif" style="font-size:var(--text-xl);margin:0">Monthly Activity</h2>`;
    container.appendChild(header);

    // ── One-time income ──
    const incSection = document.createElement('div');
    incSection.className = 'ma-section';
    const incHeader = document.createElement('div');
    incHeader.className = 'ma-section-header';
    incHeader.innerHTML = `<span class="ma-section-title ma-income">One-time Income</span>`;
    const addIncBtn = document.createElement('button');
    addIncBtn.className = 'btn btn-secondary btn-sm';
    addIncBtn.setAttribute('data-testid', 'add-unexpected-income-btn');
    addIncBtn.textContent = '+ Log';
    addIncBtn.addEventListener('click', () => this.openOneTimeIncomeForm(bucket));
    incHeader.appendChild(addIncBtn);
    incSection.appendChild(incHeader);

    if (bucket.oneTimeIncome.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'text-muted text-sm ma-empty';
      empty.textContent = 'No one-time income this month.';
      incSection.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'ma-list';
      const incTotal = bucket.oneTimeIncome.reduce((s, i) => s + i.amount, 0);
      bucket.oneTimeIncome.forEach((src) => {
        const member = memberMap.get(src.memberId);
        const dateStr = src.date
          ? new Date(src.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : '';
        list.appendChild(this.buildMaRow({
          label: src.name, sub: member?.name, dateStr,
          amount: src.amount, colorClass: 'ma-amount-income', prefix: '+',
          onDelete: async () => {
            if (!confirm(`Delete "${src.name}"?`)) return;
            await deleteIncomeSource(src.id);
            this.allIncomeSources = this.allIncomeSources.filter((x) => x.id !== src.id);
            this.refreshDateSections();
          },
        }));
      });
      incSection.appendChild(list);
      const subtotal = document.createElement('div');
      subtotal.className = 'ma-subtotal';
      subtotal.innerHTML = `<span class="text-sm text-muted">Income total</span><span class="ma-amount-income">${fmtCents.format(incTotal)}</span>`;
      incSection.appendChild(subtotal);
    }
    container.appendChild(incSection);

    const divider = document.createElement('div');
    divider.className = 'ma-divider';
    container.appendChild(divider);

    // ── One-time expenses ──
    const expSection = document.createElement('div');
    expSection.className = 'ma-section';
    const expHeader = document.createElement('div');
    expHeader.className = 'ma-section-header';
    expHeader.innerHTML = `<span class="ma-section-title ma-expense">One-time Expenses</span>`;
    const addExpBtn = document.createElement('button');
    addExpBtn.className = 'btn btn-secondary btn-sm';
    addExpBtn.setAttribute('data-testid', 'add-surprise-expense-btn');
    addExpBtn.textContent = '+ Log';
    addExpBtn.addEventListener('click', () => this.openOneTimeExpenseForm(bucket));
    expHeader.appendChild(addExpBtn);
    expSection.appendChild(expHeader);

    if (bucket.oneTimeExpenses.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'text-muted text-sm ma-empty';
      empty.textContent = 'No one-time expenses this month.';
      expSection.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'ma-list';
      const expTotal = bucket.oneTimeExpenses.reduce((s, e) => s + e.amount, 0);
      bucket.oneTimeExpenses.forEach((e) => {
        const cat = catMap.get(e.categoryId);
        const dateStr = new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        list.appendChild(this.buildMaRow({
          label: e.description, dotColor: cat?.color, dateStr,
          amount: e.amount, colorClass: 'ma-amount-expense', prefix: '−',
          onDelete: async () => {
            if (!confirm(`Delete "${e.description}"?`)) return;
            await deleteExpense(e.id);
            this.allExpenses = this.allExpenses.filter((x) => x.id !== e.id);
            this.refreshDateSections();
          },
        }));
      });
      expSection.appendChild(list);
      const subtotal = document.createElement('div');
      subtotal.className = 'ma-subtotal';
      subtotal.innerHTML = `<span class="text-sm text-muted">Expense total</span><span class="ma-amount-expense">${fmtCents.format(bucket.oneTimeExpenses.reduce((s, e) => s + e.amount, 0))}</span>`;
      expSection.appendChild(subtotal);
    }
    container.appendChild(expSection);

    // ── One-time net ──
    const otInc = bucket.oneTimeIncome.reduce((s, i) => s + i.amount, 0);
    const otExp = bucket.oneTimeExpenses.reduce((s, e) => s + e.amount, 0);
    const otNet = otInc - otExp;
    if (bucket.oneTimeIncome.length > 0 || bucket.oneTimeExpenses.length > 0) {
      const netRow = document.createElement('div');
      netRow.className = 'ma-net';
      const netClass = otNet >= 0 ? 'ma-amount-income' : 'ma-amount-expense';
      netRow.innerHTML = `
        <span class="text-sm font-bold">One-time net</span>
        <span class="${netClass} font-bold">${otNet >= 0 ? '+' : '−'}${fmtCents.format(Math.abs(otNet))}</span>
      `;
      container.appendChild(netRow);
    }
  }

  private buildRangeReportContent(container: HTMLElement, buckets: MonthBucket[]): void {
    const catMap = new Map(this.categories.map((c) => [c.id, c]));

    const header = document.createElement('div');
    header.className = 'ma-header';
    let rangeLabel = '';
    if (this.rangeStart && this.rangeEnd) {
      const fd = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      rangeLabel = `${fd(this.rangeStart)} – ${fd(this.rangeEnd)}`;
    }
    header.innerHTML = `
      <h2 class="font-serif" style="font-size:var(--text-xl);margin:0">Period Report</h2>
      ${rangeLabel ? `<span class="text-sm text-muted">${rangeLabel}</span>` : ''}
    `;
    container.appendChild(header);

    if (buckets.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'text-muted text-sm';
      empty.textContent = 'No data in selected range.';
      container.appendChild(empty);
      return;
    }

    // Column headers
    const colHeader = document.createElement('div');
    colHeader.className = 'report-row report-row-header';
    colHeader.innerHTML = `
      <span>Month</span>
      <span>Income</span>
      <span>Expenses</span>
      <span>Net</span>
      <span></span>
    `;
    container.appendChild(colHeader);

    let grandIncome = 0;
    let grandExpenses = 0;

    buckets.forEach((b) => {
      const bInc = b.recurringIncome + b.oneTimeIncome.reduce((s, i) => s + i.amount, 0);
      const bExp = b.recurringExpenses + b.oneTimeExpenses.reduce((s, e) => s + e.amount, 0);
      const bNet = bInc - bExp;
      grandIncome += bInc;
      grandExpenses += bExp;

      // Build partial-month date range label (e.g. "May 15–31")
      let partialLabel = '';
      if (b.isPartial) {
        const startDay = b.effectiveStart.getDate();
        const endDay = b.effectiveEnd.getDate();
        const monthShort = b.effectiveStart.toLocaleString('default', { month: 'short' });
        partialLabel = `${monthShort} ${startDay}–${endDay}`;
      }

      const hasItems = b.oneTimeIncome.length > 0 || b.oneTimeExpenses.length > 0;

      const row = document.createElement('div');
      row.className = 'report-row';
      row.setAttribute('data-testid', 'report-month-row');

      const netCls = bNet >= 0 ? 'report-net-pos' : 'report-net-neg';
      const monthCell = document.createElement('span');
      monthCell.className = 'report-month';
      monthCell.textContent = b.label;
      if (b.isPartial) {
        const badge = document.createElement('span');
        badge.className = 'partial-badge';
        badge.textContent = partialLabel;
        monthCell.appendChild(badge);
      }

      const incCell = document.createElement('span');
      incCell.className = 'report-income';
      incCell.textContent = fmt.format(bInc);

      const expCell = document.createElement('span');
      expCell.className = 'report-expense';
      expCell.textContent = fmt.format(bExp);

      const netCell = document.createElement('span');
      netCell.className = netCls;
      netCell.textContent = `${bNet >= 0 ? '+' : '−'}${fmt.format(Math.abs(bNet))}`;

      const expandBtn = document.createElement('button');
      expandBtn.className = `report-expand-btn${hasItems ? '' : ' report-expand-btn-empty'}`;
      expandBtn.setAttribute('aria-label', hasItems ? 'Show one-time items' : 'No one-time items');
      expandBtn.setAttribute('data-testid', 'report-expand-btn');
      expandBtn.textContent = hasItems ? '▸' : '·';

      row.appendChild(monthCell);
      row.appendChild(incCell);
      row.appendChild(expCell);
      row.appendChild(netCell);
      row.appendChild(expandBtn);
      container.appendChild(row);

      if (hasItems) {
        const detail = document.createElement('div');
        detail.className = 'report-detail';
        detail.setAttribute('data-testid', 'report-detail');
        detail.style.display = 'none';

        const breakdown = document.createElement('div');
        breakdown.className = 'report-detail-breakdown';
        breakdown.innerHTML = `
          <span class="text-xs text-muted">
            Recurring baseline: ${fmt.format(b.recurringIncome)} income · ${fmt.format(b.recurringExpenses)} expenses
            ${b.isPartial ? ` (${Math.round(b.proratedFactor * 100)}% of month)` : ''}
          </span>
        `;
        detail.appendChild(breakdown);

        if (b.oneTimeIncome.length > 0) {
          const title = document.createElement('div');
          title.className = 'report-detail-sub-title ma-income';
          title.textContent = 'One-time Income';
          detail.appendChild(title);
          const list = document.createElement('div');
          list.className = 'ma-list';
          b.oneTimeIncome.forEach((src) => {
            const dateStr = src.date
              ? new Date(src.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : '';
            list.appendChild(this.buildMaRow({
              label: src.name, dateStr, amount: src.amount,
              colorClass: 'ma-amount-income', prefix: '+',
              onDelete: async () => {
                if (!confirm(`Delete "${src.name}"?`)) return;
                await deleteIncomeSource(src.id);
                this.allIncomeSources = this.allIncomeSources.filter((x) => x.id !== src.id);
                this.refreshDateSections();
              },
            }));
          });
          detail.appendChild(list);
        }

        if (b.oneTimeExpenses.length > 0) {
          const title = document.createElement('div');
          title.className = 'report-detail-sub-title ma-expense';
          title.textContent = 'One-time Expenses';
          detail.appendChild(title);
          const list = document.createElement('div');
          list.className = 'ma-list';
          b.oneTimeExpenses.forEach((e) => {
            const cat = catMap.get(e.categoryId);
            const dateStr = new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            list.appendChild(this.buildMaRow({
              label: e.description, dotColor: cat?.color, dateStr,
              amount: e.amount, colorClass: 'ma-amount-expense', prefix: '−',
              onDelete: async () => {
                if (!confirm(`Delete "${e.description}"?`)) return;
                await deleteExpense(e.id);
                this.allExpenses = this.allExpenses.filter((x) => x.id !== e.id);
                this.refreshDateSections();
              },
            }));
          });
          detail.appendChild(list);
        }

        container.appendChild(detail);

        expandBtn.addEventListener('click', () => {
          const isOpen = detail.style.display !== 'none';
          detail.style.display = isOpen ? 'none' : '';
          expandBtn.textContent = isOpen ? '▸' : '▾';
        });
      }
    });

    // Totals row
    const grandNet = grandIncome - grandExpenses;
    const totalRow = document.createElement('div');
    totalRow.className = 'report-row report-total-row';
    totalRow.setAttribute('data-testid', 'report-total-row');
    const grandNetCls = grandNet >= 0 ? 'report-net-pos' : 'report-net-neg';
    totalRow.innerHTML = `
      <span class="font-bold">Total</span>
      <span class="font-bold">${fmt.format(grandIncome)}</span>
      <span class="font-bold">${fmt.format(grandExpenses)}</span>
      <span class="font-bold ${grandNetCls}">${grandNet >= 0 ? '+' : '−'}${fmt.format(Math.abs(grandNet))}</span>
      <span></span>
    `;
    container.appendChild(totalRow);
  }

  // ── Shared row builder ─────────────────────────────────────────────────────────

  private buildMaRow(opts: {
    label: string;
    sub?: string | undefined;
    dotColor?: string | undefined;
    dateStr: string;
    amount: number;
    colorClass: string;
    prefix: string;
    onDelete: () => void | Promise<void>;
  }): HTMLElement {
    const row = document.createElement('div');
    row.className = 'ma-row';
    row.setAttribute('data-testid', 'ma-row');

    if (opts.dotColor !== undefined) {
      const dot = document.createElement('span');
      dot.className = 'ma-dot';
      dot.style.background = opts.dotColor ?? 'var(--color-border)';
      row.appendChild(dot);
    }

    const labelWrap = document.createElement('span');
    labelWrap.className = 'ma-label';
    labelWrap.textContent = opts.label;
    if (opts.sub) {
      const sub = document.createElement('span');
      sub.className = 'ma-sub text-xs text-muted';
      sub.textContent = opts.sub;
      labelWrap.appendChild(sub);
    }
    row.appendChild(labelWrap);

    const dateEl = document.createElement('span');
    dateEl.className = 'ma-date text-muted text-xs';
    dateEl.textContent = opts.dateStr;
    row.appendChild(dateEl);

    const amt = document.createElement('span');
    amt.className = `ma-amount ${opts.colorClass}`;
    amt.textContent = `${opts.prefix}${fmtCents.format(opts.amount)}`;
    row.appendChild(amt);

    const del = document.createElement('button');
    del.className = 'icon-btn danger';
    del.setAttribute('data-testid', 'ma-delete');
    del.title = 'Delete';
    del.textContent = '🗑️';
    del.addEventListener('click', opts.onDelete);
    row.appendChild(del);

    return row;
  }

  // ── Log forms ──────────────────────────────────────────────────────────────────

  private openOneTimeIncomeForm(bucket: MonthBucket): void {
    const body = document.createElement('div');
    body.className = 'expense-form';

    const toLocalDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const now = new Date();
    const isCurrentMonth = bucket.year === now.getFullYear() && bucket.month === now.getMonth();
    const defaultDate = isCurrentMonth
      ? toLocalDate(now)
      : toLocalDate(new Date(bucket.year, bucket.month, 1));

    const memberOptions = [
      `<option value="">— No specific member —</option>`,
      ...this.members.map((m) => `<option value="${m.id}">${m.name}</option>`),
    ].join('');

    body.innerHTML = `
      <div class="form-group">
        <label class="form-label" for="ui-name">Description</label>
        <input id="ui-name" type="text" placeholder="e.g. Insurance payout, Tax refund, Bonus" maxlength="64" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="ui-amount">Amount</label>
          <input id="ui-amount" type="number" min="0" step="0.01" placeholder="0.00" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ui-date">Date</label>
          <input id="ui-date" type="date" value="${defaultDate}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="ui-member">Member (optional)</label>
        <select id="ui-member">${memberOptions}</select>
      </div>
      <div id="ui-error" class="form-error" style="display:none"></div>
    `;

    openFormModal({
      title: 'Log One-time Income',
      body,
      submitLabel: 'Log income',
      onSubmit: async (close) => {
        const name = body.querySelector<HTMLInputElement>('#ui-name')!.value.trim();
        const amount = parseFloat(body.querySelector<HTMLInputElement>('#ui-amount')!.value);
        const dateStr = body.querySelector<HTMLInputElement>('#ui-date')!.value;
        const memberId = body.querySelector<HTMLSelectElement>('#ui-member')!.value;
        const errEl = body.querySelector<HTMLElement>('#ui-error')!;

        if (!name) { errEl.textContent = 'Description is required.'; errEl.style.display = 'block'; return; }
        if (isNaN(amount) || amount < 0) { errEl.textContent = 'Enter a valid amount.'; errEl.style.display = 'block'; return; }
        if (!dateStr) { errEl.textContent = 'Date is required.'; errEl.style.display = 'block'; return; }

        const date = new Date(dateStr + 'T00:00:00').getTime();
        const src = createIncomeSource(memberId || (this.members[0]?.id ?? ''), name, amount, 'once');
        src.date = date;
        await saveIncomeSource(src);

        this.allIncomeSources.push(src);
        close();
        this.refreshDateSections();
      },
    });
  }

  private openOneTimeExpenseForm(bucket: MonthBucket): void {
    const body = document.createElement('div');
    body.className = 'expense-form';

    const toLocalDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const now = new Date();
    const isCurrentMonth = bucket.year === now.getFullYear() && bucket.month === now.getMonth();
    const defaultDate = isCurrentMonth
      ? toLocalDate(now)
      : toLocalDate(new Date(bucket.year, bucket.month, 1));

    const catOptions = [
      `<option value="">— No category —</option>`,
      ...this.categories.map((c) => `<option value="${c.id}">${c.name}</option>`),
    ].join('');

    body.innerHTML = `
      <div class="form-group">
        <label class="form-label" for="se-desc">Description</label>
        <input id="se-desc" type="text" placeholder="e.g. ER visit, Car repair" maxlength="64" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="se-amount">Amount</label>
          <input id="se-amount" type="number" min="0" step="0.01" placeholder="0.00" />
        </div>
        <div class="form-group">
          <label class="form-label" for="se-date">Date</label>
          <input id="se-date" type="date" value="${defaultDate}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="se-cat">Category</label>
        <select id="se-cat">${catOptions}</select>
      </div>
      <div id="se-error" class="form-error" style="display:none"></div>
    `;

    openFormModal({
      title: 'Log One-time Expense',
      body,
      submitLabel: 'Log expense',
      onSubmit: async (close) => {
        const description = body.querySelector<HTMLInputElement>('#se-desc')!.value.trim();
        const amount = parseFloat(body.querySelector<HTMLInputElement>('#se-amount')!.value);
        const dateStr = body.querySelector<HTMLInputElement>('#se-date')!.value;
        const categoryId = body.querySelector<HTMLSelectElement>('#se-cat')!.value;
        const errEl = body.querySelector<HTMLElement>('#se-error')!;

        if (!description) { errEl.textContent = 'Description is required.'; errEl.style.display = 'block'; return; }
        if (isNaN(amount) || amount < 0) { errEl.textContent = 'Enter a valid amount.'; errEl.style.display = 'block'; return; }
        if (!dateStr) { errEl.textContent = 'Date is required.'; errEl.style.display = 'block'; return; }

        const date = new Date(dateStr + 'T00:00:00').getTime();
        const expense = createExpense(categoryId, description, amount, date, null);
        await saveExpense(expense);

        this.allExpenses.push(expense);
        close();
        this.refreshDateSections();
      },
    });
  }

  // ── Payment reminders card ─────────────────────────────────────────────────────

  private buildPaymentRemindersCard(
    pastDue: Array<{ account: import('@/types').DebtAccount; status: AccountPaymentStatus }>,
    dueSoon: Array<{ account: import('@/types').DebtAccount; status: AccountPaymentStatus }>,
    billsPastDue: Array<{ expense: import('@/types').Expense; status: BillPaymentStatus }>,
    billsDueSoon: Array<{ expense: import('@/types').Expense; status: BillPaymentStatus }>,
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

    // "Manage" link: debt link if debt alerts exist, expenses link if only bills
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
      account: import('@/types').DebtAccount,
      status: AccountPaymentStatus,
      severity: 'past-due' | 'due-soon',
    ): void => {
      const row = document.createElement('div');
      row.className = `payment-reminder-row payment-reminder-row--${severity}`;

      const minPay = computeMinPayment(account);
      const dueDateStr = status.dueDayThisMonth
        ? status.dueDayThisMonth.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
      expense: import('@/types').Expense,
      status: BillPaymentStatus,
      severity: 'past-due' | 'due-soon',
    ): void => {
      const row = document.createElement('div');
      row.className = `payment-reminder-row payment-reminder-row--${severity}`;

      const dueDateStr = status.dueDayThisMonth
        ? status.dueDayThisMonth.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

    pastDue.forEach(({ account, status }) => renderDebtRow(account, status, 'past-due'));
    billsPastDue.forEach(({ expense, status }) => renderBillRow(expense, status, 'past-due'));
    dueSoon.forEach(({ account, status }) => renderDebtRow(account, status, 'due-soon'));
    billsDueSoon.forEach(({ expense, status }) => renderBillRow(expense, status, 'due-soon'));

    card.appendChild(list);
    return card;
  }

  // ── Panel renderers (static) ───────────────────────────────────────────────────

  private renderIncomePanel(sources: IncomeSource[]): string {
    const recurring = sources.filter((s) => s.active && s.frequency !== 'once');
    if (recurring.length === 0) {
      return `
        <div class="empty-state">
          <span class="empty-state-icon">💰</span>
          <h3>No income sources yet</h3>
          <p>Add your income sources to start building your budget picture.</p>
          <a href="#/income" class="btn btn-primary" data-route="/income" style="text-decoration:none">Add income →</a>
        </div>
      `;
    }
    return recurring
      .slice(0, 5)
      .map(
        (s) => `
        <div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px solid var(--color-border)">
          <span class="text-sm">${s.name}</span>
          <span class="text-sm font-bold">${fmt.format(s.amount)} / ${s.frequency}</span>
        </div>
      `,
      )
      .join('');
  }

  private renderDebtPanel(cards: Awaited<ReturnType<typeof getDebtAccounts>>): string {
    if (cards.length === 0) {
      return `
        <div class="empty-state">
          <span class="empty-state-icon">💳</span>
          <h3>No accounts added yet</h3>
          <p>Add your debt accounts to see payoff scenarios and interest calculations.</p>
          <a href="#/debt" class="btn btn-primary" data-route="/debt" style="text-decoration:none">Add account →</a>
        </div>
      `;
    }
    return cards
      .slice(0, 5)
      .map(
        (c) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) 0;border-bottom:1px solid var(--color-border)">
          <div>
            <span class="text-sm font-bold">${c.name}</span>
            <span class="text-xs text-muted" style="display:block">${c.apr}% APR</span>
          </div>
          <span class="text-sm" style="color:var(--color-danger)">${fmt.format(c.balance)}</span>
        </div>
      `,
      )
      .join('');
  }
}
