import './expenses.css';
import { makeHelpBtn } from '@/utils/helpNav';
import { showPageError } from '@/utils/errorUI';
import {
  getCategories,
  getExpenses,
  getExpensePaidRecords,
  getMembers,
  getDebtAccounts,
  getBankAccounts,
} from '@/db';
import { openExpenseForm } from './ExpenseForm';
import { buildCategoriesCard, openCategoryForm } from './ExpenseCategory';
import { buildExpenseRow, type ExpenseRowContext } from './ExpenseRow';
import { toMonthly, fmt } from '@/utils/finance';
import { computeNextDue } from '@/utils/billStatus';
import type { ExpenseCategory, Expense, ExpensePaidRecord, HouseholdMember, DebtAccount, BankAccount } from '@/types';

type FilterType = 'all' | 'recurring' | 'one-time';
type SortBy = string;

function freqInterval(freq: string | null | undefined): number {
  if (freq === 'quarterly') return 3;
  if (freq === 'annual')    return 12;
  return 1;
}

export class ExpensesPage {
  private categories: ExpenseCategory[] = [];
  private expenses: Expense[] = [];
  private members: HouseholdMember[] = [];
  private cardAccounts: DebtAccount[] = [];
  private bankAccounts: BankAccount[] = [];
  private paidThisMonth = new Map<string, ExpensePaidRecord>();
  private activeCategoryId: string | null = null;
  private filter: FilterType = 'all';
  private sortBy: SortBy = 'due-asc';
  private catSort = 'name-asc';
  private groupSortMap = new Map<string, string>();
  private allPaidRecords: ExpensePaidRecord[] = [];
  private container!: HTMLElement;

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'expenses-page';
    void this.load();
    return this.container;
  }

  private async load(): Promise<void> {
    try {
    const now = new Date();
    const windowLookback = new Date(now.getFullYear(), now.getMonth(), 1);
    windowLookback.setDate(windowLookback.getDate() - 14);
    const monthStart = windowLookback.getTime();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();

    const [categories, expenses, members, allAccounts, allPaidRecords, bankAccounts] = await Promise.all([
      getCategories(),
      getExpenses(),
      getMembers(),
      getDebtAccounts(),
      getExpensePaidRecords(),
      getBankAccounts(),
    ]);
    this.categories = categories;
    this.expenses = expenses;
    this.members = members;
    this.cardAccounts = allAccounts.filter((a) => a.type === 'card').sort((a, b) => a.name.localeCompare(b.name));
    this.bankAccounts = bankAccounts.sort((a, b) => a.name.localeCompare(b.name));

    this.allPaidRecords = allPaidRecords;
    this.paidThisMonth = new Map();
    allPaidRecords
      .filter((r) => r.date >= monthStart && r.date < monthEnd)
      .forEach((r) => {
        const existing = this.paidThisMonth.get(r.expenseId);
        if (!existing || r.date > existing.date) this.paidThisMonth.set(r.expenseId, r);
      });
    const kidTypes = new Set(['child', 'baby-male', 'baby-female', 'child-male', 'child-female', 'teen-male', 'teen-female']);
    this.members.sort((a, b) => {
      const aChild = kidTypes.has(a.avatarType ?? '') ? 1 : 0;
      const bChild = kidTypes.has(b.avatarType ?? '') ? 1 : 0;
      if (aChild !== bChild) return aChild - bChild;
      return a.createdAt - b.createdAt;
    });
    this.paint();
    } catch (err) {
      showPageError(this.container, err instanceof Error ? err.message : 'Failed to load expenses', () => { void this.load(); });
    }
  }

  private paint(): void {
    const visible = this.filteredExpenses();
    const monthlyTotal = visible
      .filter((e) => e.recurring)
      .reduce((sum, e) => sum + toMonthly(e.amount, e.recurringFrequency ?? 'monthly'), 0);

    this.container.innerHTML = '';

    // ── Header ──────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'expenses-header';
    header.innerHTML = `
      <div>
        <h1 class="font-serif">Expenses</h1>
        <p class="text-muted text-sm">Track spending by category.</p>
      </div>
      <div class="expenses-total">
        <div class="expenses-total-label">Recurring / month</div>
        <div class="expenses-total-value" data-testid="expenses-monthly-total">${visible.length ? fmt.format(monthlyTotal) : '—'}</div>
      </div>
    `;
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.setAttribute('data-testid', 'add-expense-btn');
    addBtn.textContent = '+ Add expense';
    addBtn.style.marginLeft = 'var(--space-4)';
    addBtn.addEventListener('click', () => openExpenseForm(undefined, this.categories, this.members, this.cardAccounts, this.bankAccounts, () => this.load()));
    header.querySelector('.expenses-header')?.appendChild(addBtn);
    header.appendChild(addBtn);
    header.querySelector('h1')?.appendChild(makeHelpBtn('expenses'));
    this.container.appendChild(header);

    // ── Category management card ─────────────────────────────────────────
    this.container.appendChild(buildCategoriesCard(
      this.categories, this.expenses, this.activeCategoryId,
      async (categoryId) => {
        if (this.activeCategoryId === categoryId) this.activeCategoryId = null;
        await this.load();
      },
      (existing) => openCategoryForm(existing, this.categories, this.cardAccounts, () => this.load()),
    ));

    // ── Filters + expense list ───────────────────────────────────────────
    if (this.expenses.length > 0 || this.categories.length > 0) {
      this.container.appendChild(this.buildFilterBar());
      this.container.appendChild(this.buildExpenseList(visible));
      const focusId = sessionStorage.getItem('cal-focus-expense');
      if (focusId) {
        sessionStorage.removeItem('cal-focus-expense');
        requestAnimationFrame(() => {
          const target = this.container.querySelector<HTMLElement>(`[data-expense-id="${focusId}"]`);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add('cal-focus-highlight');
          }
        });
      }
    }
  }

  // ── Filters ────────────────────────────────────────────────────────────

  private buildFilterBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--space-3);align-items:center';

    const catSection = document.createElement('div');
    catSection.className = 'category-bar';

    const allChip = document.createElement('button');
    allChip.className = `category-chip-all ${this.activeCategoryId === null ? 'active' : ''}`;
    allChip.setAttribute('data-testid', 'filter-category-all');
    allChip.textContent = 'All';
    allChip.addEventListener('click', () => { this.activeCategoryId = null; this.paint(); });
    catSection.appendChild(allChip);

    this.categories.forEach((cat) => {
      const chip = document.createElement('button');
      chip.className = `category-chip ${this.activeCategoryId === cat.id ? 'active' : ''}`;
      chip.setAttribute('data-testid', 'filter-category');
      chip.setAttribute('data-category-id', cat.id);
      chip.style.color = cat.color;
      const chipDot = document.createElement('span');
      chipDot.className = 'chip-dot';
      chipDot.style.background = cat.color;
      chip.appendChild(chipDot);
      chip.appendChild(document.createTextNode(cat.name));
      chip.addEventListener('click', () => {
        this.activeCategoryId = this.activeCategoryId === cat.id ? null : cat.id;
        this.paint();
      });
      catSection.appendChild(chip);
    });

    bar.appendChild(catSection);

    const sep = document.createElement('div');
    sep.className = 'filter-separator';
    bar.appendChild(sep);

    const filterSection = document.createElement('div');
    filterSection.className = 'filter-bar';

    (['all', 'recurring', 'one-time'] as FilterType[]).forEach((f) => {
      const btn = document.createElement('button');
      btn.className = `filter-btn ${this.filter === f ? 'active' : ''}`;
      btn.setAttribute('data-testid', 'filter-type');
      btn.setAttribute('data-filter', f);
      btn.textContent = f === 'all' ? 'All' : f === 'recurring' ? 'Recurring' : 'One-time';
      btn.addEventListener('click', () => { this.filter = f; this.paint(); });
      filterSection.appendChild(btn);
    });

    const sortBar = document.createElement('div');
    sortBar.className = 'expense-sort-bar';

    const curDash = this.sortBy.lastIndexOf('-');
    const curField = this.sortBy.slice(0, curDash);
    const curDir = this.sortBy.slice(curDash + 1);

    ([
      ['due',      'Due'],
      ['name',     'Name'],
      ['amount',   'Amount'],
      ['pay-type', 'Pay Type'],
    ] as [string, string][]).forEach(([field, label]) => {
      const isActive = curField === field;
      const btn = document.createElement('button');
      btn.className = `expense-sort-btn${isActive ? ' active' : ''}`;
      btn.dataset['sortField'] = field;
      btn.textContent = isActive ? `${label} ${curDir === 'asc' ? '↑' : '↓'}` : label;
      btn.addEventListener('click', () => {
        const di = this.sortBy.lastIndexOf('-');
        const cf = this.sortBy.slice(0, di);
        const cd = this.sortBy.slice(di + 1);
        this.sortBy = cf === field ? `${field}-${cd === 'asc' ? 'desc' : 'asc'}` : `${field}-asc`;
        this.paint();
      });
      sortBar.appendChild(btn);
    });

    filterSection.appendChild(sortBar);
    bar.appendChild(filterSection);
    return bar;
  }

  private filteredExpenses(): Expense[] {
    return this.expenses.filter((e) => {
      if (this.activeCategoryId && e.categoryId !== this.activeCategoryId) return false;
      if (this.filter === 'recurring' && !e.recurring) return false;
      if (this.filter === 'one-time' && e.recurring) return false;
      return true;
    });
  }

  private sortByMode(items: Expense[], mode: string): Expense[] {
    const dashIdx = mode.lastIndexOf('-');
    const field = mode.slice(0, dashIdx);
    const dir = mode.slice(dashIdx + 1) !== 'desc' ? 1 : -1;
    return [...items].sort((a, b) => {
      switch (field) {
        case 'name':
          return dir * a.description.localeCompare(b.description);
        case 'amount':
          return dir * (toMonthly(a.amount, a.recurringFrequency ?? 'monthly') - toMonthly(b.amount, b.recurringFrequency ?? 'monthly'));
        case 'pay-type':
          if (!!a.isAutoPay !== !!b.isAutoPay) return dir * ((a.isAutoPay ? 1 : 0) - (b.isAutoPay ? 1 : 0));
          return this.nextDueMs(a) - this.nextDueMs(b);
        case 'due':
        default:
          return dir * (this.nextDueMs(a) - this.nextDueMs(b));
      }
    });
  }

  private sortExpensesForGroup(catId: string, items: Expense[]): Expense[] {
    return this.sortByMode(items, this.groupSortMap.get(catId) ?? this.sortBy);
  }

  private nextDueMs(expense: Expense): number {
    if (!expense.dueDay) return expense.date;
    const interval = freqInterval(expense.recurringFrequency);
    return computeNextDue(new Date(expense.date), expense.dueDay, interval).getTime();
  }

  // ── Expense list ───────────────────────────────────────────────────────

  private buildExpenseList(expenses: Expense[]): HTMLElement {
    const container = document.createElement('div');
    container.className = 'card';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = 'var(--space-6)';

    if (expenses.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-state-icon">🧾</span>
          <h3>No expenses match this filter</h3>
          <p>Try clearing the filters or add a new expense.</p>
        </div>
      `;
      return container;
    }

    const byCat = new Map<string, Expense[]>();
    const noCatKey = '__none__';
    expenses.forEach((e) => {
      const key = e.categoryId || noCatKey;
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push(e);
    });

    const catMap = new Map(this.categories.map((c) => [c.id, c]));

    const entries = [...byCat.entries()];
    if (entries.length > 1) {
      const catSortRow = document.createElement('div');
      catSortRow.className = 'expense-group-sort-row';

      const catSortLabel = document.createElement('span');
      catSortLabel.className = 'expense-group-sort-label';
      catSortLabel.textContent = 'Groups:';
      catSortRow.appendChild(catSortLabel);

      const catSortBar = document.createElement('div');
      catSortBar.className = 'expense-sort-bar';

      const cgDash = this.catSort.lastIndexOf('-');
      const cgField = this.catSort.slice(0, cgDash);
      const cgDir = this.catSort.slice(cgDash + 1);

      ([['name', 'Name'], ['total', 'Total']] as [string, string][]).forEach(([field, label]) => {
        const isActive = cgField === field;
        const btn = document.createElement('button');
        btn.className = `expense-sort-btn${isActive ? ' active' : ''}`;
        btn.textContent = isActive ? `${label} ${cgDir === 'asc' ? '↑' : '↓'}` : label;
        btn.addEventListener('click', () => {
          const di = this.catSort.lastIndexOf('-');
          const cf = this.catSort.slice(0, di);
          const cd = this.catSort.slice(di + 1);
          this.catSort = cf === field ? `${field}-${cd === 'asc' ? 'desc' : 'asc'}` : `${field}-asc`;
          this.paint();
        });
        catSortBar.appendChild(btn);
      });

      catSortRow.appendChild(catSortBar);
      container.appendChild(catSortRow);
    }

    const cgDash = this.catSort.lastIndexOf('-');
    const cgField = this.catSort.slice(0, cgDash);
    const cgAsc = this.catSort.slice(cgDash + 1) !== 'desc';
    entries.sort(([aId, aItems], [bId, bItems]) => {
      if (cgField === 'total') {
        const aTotal = aItems.filter((e) => e.recurring).reduce((s, e) => s + toMonthly(e.amount, e.recurringFrequency ?? 'monthly'), 0);
        const bTotal = bItems.filter((e) => e.recurring).reduce((s, e) => s + toMonthly(e.amount, e.recurringFrequency ?? 'monthly'), 0);
        return (cgAsc ? 1 : -1) * (aTotal - bTotal);
      }
      const aName = aId === noCatKey ? '￿' : (catMap.get(aId)?.name ?? '￿');
      const bName = bId === noCatKey ? '￿' : (catMap.get(bId)?.name ?? '￿');
      return (cgAsc ? 1 : -1) * aName.localeCompare(bName);
    });

    const rowCtx: ExpenseRowContext = {
      categories: this.categories,
      members: this.members,
      cardAccounts: this.cardAccounts,
      bankAccounts: this.bankAccounts,
      allPaidRecords: this.allPaidRecords,
      paidThisMonth: this.paidThisMonth,
      onLoad: () => this.load(),
    };

    entries.forEach(([catId, items]) => {
      const cat = catId === noCatKey ? null : catMap.get(catId);
      const monthlyTotal = items
        .filter((e) => e.recurring)
        .reduce((sum, e) => sum + toMonthly(e.amount, e.recurringFrequency ?? 'monthly'), 0);

      const group = document.createElement('div');
      group.className = 'expense-group';

      const groupHeader = document.createElement('div');
      groupHeader.className = 'expense-group-header';
      groupHeader.innerHTML = `
        <span class="expense-group-dot" style="background:${cat?.color ?? '#999'}"></span>
        <span class="expense-group-name">${cat?.name ?? 'Uncategorized'}</span>
        ${monthlyTotal > 0 ? `<span class="expense-group-total">${fmt.format(monthlyTotal)}/mo</span>` : ''}
      `;
      group.appendChild(groupHeader);

      const groupSortBar = document.createElement('div');
      groupSortBar.className = 'expense-group-sort-bar';
      const groupMode = this.groupSortMap.get(catId) ?? this.sortBy;
      const gDash = groupMode.lastIndexOf('-');
      const gField = groupMode.slice(0, gDash);
      const gDir = groupMode.slice(gDash + 1);
      ([
        ['due', 'Due'], ['name', 'Name'], ['amount', 'Amount'], ['pay-type', 'Pay Type'],
      ] as [string, string][]).forEach(([field, label]) => {
        const isActive = gField === field;
        const btn = document.createElement('button');
        btn.className = `expense-sort-btn${isActive ? ' active' : ''}`;
        btn.textContent = isActive ? `${label} ${gDir === 'asc' ? '↑' : '↓'}` : label;
        btn.addEventListener('click', () => {
          const cur = this.groupSortMap.get(catId) ?? this.sortBy;
          const di = cur.lastIndexOf('-');
          const cf = cur.slice(0, di), cd = cur.slice(di + 1);
          this.groupSortMap.set(catId, cf === field ? `${field}-${cd === 'asc' ? 'desc' : 'asc'}` : `${field}-asc`);
          this.paint();
        });
        groupSortBar.appendChild(btn);
      });
      group.appendChild(groupSortBar);

      this.sortExpensesForGroup(catId, items)
        .forEach((e) => group.appendChild(buildExpenseRow(e, rowCtx)));

      container.appendChild(group);
    });

    return container;
  }
}
