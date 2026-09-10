import './income.css';
import { makeHelpBtn } from '@/utils/helpNav';
import { showPageError } from '@/utils/errorUI';
import { getMembers, getIncomeSources, getBankAccounts } from '@/db';
import { sourceMonthly, fmt } from '@/utils/finance';
import { openSourceForm } from './IncomeSourceForm';
import { buildYtdPanel, buildMembersCard, buildSourcesCard } from './IncomePanels';
import type { HouseholdMember, IncomeSource, BankAccount } from '@/types';
import { userLocale } from '@/utils/locale';

export class IncomePage {
  private members: HouseholdMember[] = [];
  private sources: IncomeSource[] = [];
  private bankAccounts: BankAccount[] = [];
  private container!: HTMLElement;
  private viewYear: number = new Date().getFullYear();
  private viewMonth: number = new Date().getMonth();

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'income-page';
    void this.load();
    return this.container;
  }

  private async load(): Promise<void> {
    try {
    [this.members, this.sources, this.bankAccounts] = await Promise.all([getMembers(), getIncomeSources(), getBankAccounts()]);
    this.members.sort((a, b) => {
      const kidTypes = new Set(['child', 'baby-male', 'baby-female', 'child-male', 'child-female', 'teen-male', 'teen-female']);
      const aChild = kidTypes.has(a.avatarType ?? '') ? 1 : 0;
      const bChild = kidTypes.has(b.avatarType ?? '') ? 1 : 0;
      if (aChild !== bChild) return aChild - bChild;
      return a.createdAt - b.createdAt;
    });
    this.paint();
    } catch (err) {
      showPageError(this.container, err instanceof Error ? err.message : 'Failed to load income data', () => { void this.load(); });
    }
  }

  private paint(): void {
    const now = new Date();
    const isCurrentMonth = this.viewYear === now.getFullYear() && this.viewMonth === now.getMonth();

    const monthlyRecurring = this.sources
      .filter((s) => s.active && s.frequency !== 'once')
      .reduce((sum, s) => sum + sourceMonthly(s), 0);

    const monthStart = new Date(this.viewYear, this.viewMonth, 1).getTime();
    const monthEnd   = new Date(this.viewYear, this.viewMonth + 1, 0, 23, 59, 59, 999).getTime();
    const oneTimeSources = this.sources.filter(
      (s) => s.frequency === 'once' && s.date != null && s.date >= monthStart && s.date <= monthEnd,
    );
    const oneTimeTotal  = oneTimeSources.reduce((sum, s) => sum + s.amount, 0);
    const hasOneTime    = oneTimeSources.length > 0;
    const combinedTotal = monthlyRecurring + oneTimeTotal;
    const hasRecurring  = this.sources.some((s) => s.active && s.frequency !== 'once');

    const monthLabel = new Date(this.viewYear, this.viewMonth, 1)
      .toLocaleDateString(userLocale, { month: 'long', year: 'numeric' });

    this.container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'income-header';
    header.innerHTML = `
      <div>
        <h1 class="font-serif">Income</h1>
        <p class="text-muted text-sm">Manage household members and income sources.</p>
      </div>
      <div class="income-header-right">
        <div class="income-month-nav">
          <button class="income-nav-btn" data-action="prev">‹</button>
          <span class="income-month-label">${monthLabel}</span>
          <button class="income-nav-btn" data-action="next"${isCurrentMonth ? ' disabled' : ''}>›</button>
        </div>
        ${hasOneTime ? `
        <div class="income-totals">
          <div class="income-totals-row">
            <span class="income-totals-label">Recurring</span>
            <span class="income-totals-val">${fmt.format(monthlyRecurring)}<span class="income-totals-unit"> /mo</span></span>
          </div>
          <div class="income-totals-row">
            <span class="income-totals-label">+ One-time</span>
            <span class="income-totals-val income-totals-val--extra">${fmt.format(oneTimeTotal)}</span>
          </div>
          <div class="income-totals-row income-totals-row--total">
            <span class="income-totals-label">Total</span>
            <span class="income-totals-val income-totals-val--total" data-testid="income-monthly-total">${fmt.format(combinedTotal)}</span>
          </div>
        </div>
        ` : `
        <div class="income-total">
          <div class="income-total-label">Monthly total</div>
          <div class="income-total-value" data-testid="income-monthly-total">${hasRecurring ? fmt.format(monthlyRecurring) : '—'}</div>
        </div>
        `}
      </div>
    `;
    header.querySelector('h1')?.appendChild(makeHelpBtn('income'));

    header.querySelector('[data-action="prev"]')!.addEventListener('click', () => {
      if (this.viewMonth === 0) { this.viewMonth = 11; this.viewYear--; }
      else { this.viewMonth--; }
      this.paint();
    });
    header.querySelector('[data-action="next"]')!.addEventListener('click', () => {
      if (isCurrentMonth) return;
      if (this.viewMonth === 11) { this.viewMonth = 0; this.viewYear++; }
      else { this.viewMonth++; }
      this.paint();
    });

    this.container.appendChild(header);

    if (isCurrentMonth) {
      const ytdPanel = buildYtdPanel(this.sources);
      if (ytdPanel) this.container.appendChild(ytdPanel);
    }

    const formCtx = {
      members: this.members,
      bankAccounts: this.bankAccounts,
      onLoad: () => this.load(),
    };
    const panelCtx = {
      members: this.members,
      sources: this.sources,
      bankAccounts: this.bankAccounts,
      viewYear: this.viewYear,
      viewMonth: this.viewMonth,
      onLoad: () => this.load(),
      onEditSource: (source?: IncomeSource) => openSourceForm(source, formCtx),
    };

    this.container.appendChild(buildMembersCard(panelCtx));

    if (this.members.length > 0) {
      this.container.appendChild(buildSourcesCard(panelCtx));
      const focusId = sessionStorage.getItem('cal-focus-source');
      if (focusId) {
        sessionStorage.removeItem('cal-focus-source');
        requestAnimationFrame(() => {
          const target = this.container.querySelector<HTMLElement>(`[data-source-id="${focusId}"]`);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add('cal-focus-highlight');
          }
        });
      }
    }
  }
}
