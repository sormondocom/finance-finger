import './budget.css';
import { makeHelpBtn } from '@/utils/helpNav';
import { showPageError } from '@/utils/errorUI';
import { getIncomeSources, getExpenses, getCategories, getCardCharges, getBankAccounts, getDebtAccounts } from '@/db';
import { toMonthly, sourceMonthly } from '@/utils/finance';
import { showMascot } from '@/mascot/Mascot';
import { renderBuckets } from './BudgetBuckets';
import { renderSummary, renderDonut, renderBreakdown, renderCashFlow, renderEmpty, type CategoryTotals } from './BudgetPanels';
import type { ExpenseCategory, Expense, IncomeSource, CardCharge, BankAccount, DebtAccount } from '@/types';

export class BudgetPage {
  private container!: HTMLElement;
  private accounts: BankAccount[] = [];
  private debtAccounts: DebtAccount[] = [];

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'budget-page';
    this.container.innerHTML = '<p class="text-muted">Loading...</p>';
    void this.populate();
    return this.container;
  }

  private async populate(): Promise<void> {
    try {
    const el = this.container;
    const [sources, expenses, categories, allCharges, accounts, debtAccounts] = await Promise.all([
      getIncomeSources(),
      getExpenses(),
      getCategories(),
      getCardCharges(),
      getBankAccounts(),
      getDebtAccounts(),
    ]);
    this.accounts = accounts;
    this.debtAccounts = debtAccounts;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    const monthCharges: CardCharge[] = allCharges.filter(
      (c) => c.date >= monthStart && c.date < monthEnd,
    );

    const monthlyIncome = sources
      .filter((s: IncomeSource) => s.active)
      .reduce((sum, s) => sum + sourceMonthly(s), 0);

    const recurringExpenses = expenses.filter((e: Expense) => e.recurring);
    const monthlyExpenses = recurringExpenses.reduce(
      (sum, e) => sum + toMonthly(e.amount, e.recurringFrequency ?? 'monthly'),
      0,
    );

    const surplus = monthlyIncome - monthlyExpenses;

    el.innerHTML = '';

    if (monthlyIncome === 0 && monthlyExpenses === 0) {
      el.appendChild(renderEmpty());
      return;
    }

    const title = document.createElement('div');
    title.innerHTML = `
      <h1 class="font-serif">Budget Overview</h1>
      <p class="text-muted text-sm">${now.toLocaleString('default', { month: 'long', year: 'numeric' })} · Recurring expenses + card charges</p>
    `;
    title.querySelector('h1')?.appendChild(makeHelpBtn('budget'));
    el.appendChild(title);

    const bucketsCtx = {
      accounts: this.accounts,
      debtAccounts: this.debtAccounts,
      onReload: () => { void this.populate(); },
    };
    const bucketsSection = renderBuckets(categories, recurringExpenses, monthlyIncome, monthCharges, bucketsCtx);
    if (bucketsSection) el.appendChild(bucketsSection);

    el.appendChild(renderSummary(monthlyIncome, monthlyExpenses, surplus));

    const catMap = new Map(categories.map((c: ExpenseCategory) => [c.id, c]));
    const byCat = new Map<string, number>();

    recurringExpenses.forEach((e) => {
      const key = e.categoryId || '__none__';
      byCat.set(key, (byCat.get(key) ?? 0) + toMonthly(e.amount, e.recurringFrequency ?? 'monthly'));
    });
    monthCharges.forEach((c) => {
      const key = c.categoryId || '__none__';
      byCat.set(key, (byCat.get(key) ?? 0) + c.amount);
    });

    const totals: CategoryTotals[] = Array.from(byCat.entries())
      .map(([id, monthlyTotal]) => ({
        cat: id === '__none__' ? null : (catMap.get(id) ?? null),
        monthlyTotal,
      }))
      .sort((a, b) => b.monthlyTotal - a.monthlyTotal);

    const main = document.createElement('div');
    main.className = 'budget-main';

    if (totals.length > 0) {
      main.appendChild(renderDonut(totals, monthlyExpenses));
      main.appendChild(renderBreakdown(totals, monthlyIncome));
    } else {
      main.style.gridTemplateColumns = '1fr';
    }

    el.appendChild(main);

    if (monthlyIncome > 0) {
      el.appendChild(renderCashFlow(monthlyIncome, monthlyExpenses, surplus));
    }

    if (surplus < 0) {
      setTimeout(() => showMascot('negative-cashflow'), 1000);
    }
    } catch (err) {
      showPageError(this.container, err instanceof Error ? err.message : 'Failed to load budget', () => { void this.populate(); });
    }
  }
}
