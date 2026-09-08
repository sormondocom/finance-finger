import './expenses.css';
import { makeHelpBtn } from '@/utils/helpNav';
import {
  getCategories, saveCategory, deleteCategory, createCategory,
  getExpenses, saveExpense, deleteExpense, createExpense,
  saveExpensePaidRecord, createExpensePaidRecord, getExpensePaidRecords, deleteExpensePaidRecord,
  getMembers,
  getDebtAccounts,
  getBankAccounts,
  getCardCharges, saveCardCharge, deleteCardCharge, createCardCharge, findChargeByExpenseId,
} from '@/db';
import { openFormModal } from '@/components/Modal';
import { openExpensePaymentModal } from '@/components/ExpensePaymentModal';
import { navigate } from '@/app/router';
import { toMonthly, fmt, fmtCents, FREQUENCY_LABELS, FREQUENCY_OPTIONS, CATEGORY_COLORS } from '@/utils/finance';
import { showMascot } from '@/mascot/Mascot';
import { computeBillStatus, computeNextDue } from '@/utils/billStatus';
import { refreshNotifier, getOverageTrend } from '@/utils/notifier';
import { openAddNotificationModal, buildLinkedRemindersSection } from '@/utils/notificationModal';
import type { ExpenseCategory, Expense, ExpensePaidRecord, IncomeFrequency, HouseholdMember, DebtAccount, BankAccount } from '@/types';

type FilterType = 'all' | 'recurring' | 'one-time';
type SortBy = string;

function freqInterval(freq: string | null | undefined): number {
  if (freq === 'quarterly') return 3;
  if (freq === 'annual')    return 12;
  return 1;
}

function freqThresholdLabel(freq: string | null | undefined): string {
  switch (freq) {
    case 'weekly':      return 'Weekly';
    case 'biweekly':    return 'Biweekly';
    case 'semimonthly': return 'Semi-monthly';
    case 'quarterly':   return 'Quarterly';
    case 'annual':      return 'Annual';
    default:            return 'Monthly';
  }
}

function overageColor(actual: number, threshold: number): string {
  if (actual <= threshold) return 'var(--ff-green)';
  const pct = (actual - threshold) / threshold;
  if (pct < 0.10) return '#f87171'; // ≤10% over — light red
  if (pct < 0.25) return '#ef4444'; // 10-25% over — medium red
  return 'var(--color-danger)';     // 25%+ over — full danger red
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
    this.load();
    return this.container;
  }

  private async load(): Promise<void> {
    const now = new Date();
    // Expand window 14 days before month start so early payments (e.g., Aug 31 for
    // a Sep 9 due date) are included in the paidThisMonth map.
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
    addBtn.addEventListener('click', () => this.openExpenseForm());
    header.querySelector('.expenses-header')?.appendChild(addBtn);
    header.appendChild(addBtn);
    header.querySelector('h1')?.appendChild(makeHelpBtn('expenses'));
    this.container.appendChild(header);

    // ── Category management card ─────────────────────────────────────────
    this.container.appendChild(this.buildCategoriesCard());

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

  // ── Categories ─────────────────────────────────────────────────────────

  private buildCategoriesCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card';

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4)';
    titleRow.innerHTML = '<h2 class="font-serif" style="font-size:var(--text-xl)">Categories</h2>';

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-secondary';
    addBtn.setAttribute('data-testid', 'add-category-btn');
    addBtn.textContent = '+ New category';
    addBtn.addEventListener('click', () => this.openCategoryForm());
    titleRow.appendChild(addBtn);
    card.appendChild(titleRow);

    if (this.categories.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'text-muted text-sm';
      empty.textContent = 'No categories yet. Create one to start organizing expenses.';
      card.appendChild(empty);
      return card;
    }

    const row = document.createElement('div');
    row.className = 'category-manage-row';

    this.categories.forEach((cat) => {
      const pill = document.createElement('div');
      pill.className = 'category-pill-manage';
      pill.setAttribute('data-testid', 'category-pill');
      pill.setAttribute('data-category-id', cat.id);
      pill.setAttribute('role', 'button');
      pill.setAttribute('tabindex', '0');
      pill.title = cat.description ? `${cat.description}\n\nClick to edit` : `Edit ${cat.name}`;
      pill.addEventListener('click', () => this.openCategoryForm(cat));
      pill.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') this.openCategoryForm(cat); });

      const dot = document.createElement('span');
      dot.className = 'chip-dot';
      dot.style.background = cat.color;
      pill.appendChild(dot);

      const nameEl = document.createElement('span');
      nameEl.textContent = cat.name;
      pill.appendChild(nameEl);

      const editIcon = document.createElement('span');
      editIcon.className = 'category-pill-edit-icon';
      editIcon.setAttribute('aria-hidden', 'true');
      editIcon.textContent = '✎';
      pill.appendChild(editIcon);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'category-pill-remove';
      removeBtn.setAttribute('aria-label', `Remove ${cat.name}`);
      removeBtn.setAttribute('data-testid', 'category-remove');
      removeBtn.setAttribute('data-category-id', cat.id);
      removeBtn.title = 'Remove';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const inUse = this.expenses.some((ex) => ex.categoryId === cat.id);
        if (inUse && !confirm(`"${cat.name}" has expenses. Remove the category anyway? (Expenses won't be deleted)`)) return;
        // Null out categoryId on affected expenses
        await Promise.all(
          this.expenses
            .filter((ex) => ex.categoryId === cat.id)
            .map((ex) => saveExpense({ ...ex, categoryId: '' })),
        );
        // Null out categoryId on affected card charges
        const allCharges = await getCardCharges();
        await Promise.all(
          allCharges
            .filter((ch) => ch.categoryId === cat.id)
            .map((ch) => { const { categoryId: _, ...rest } = ch; return saveCardCharge(rest as typeof ch); }),
        );
        // Detach subcategories that have this category as parent
        await Promise.all(
          this.categories
            .filter((c) => c.parentId === cat.id)
            .map((c) => saveCategory({ ...c, parentId: null })),
        );
        await deleteCategory(cat.id);
        if (this.activeCategoryId === cat.id) this.activeCategoryId = null;
        await this.load();
      });
      pill.appendChild(removeBtn);
      row.appendChild(pill);
    });

    card.appendChild(row);
    return card;
  }

  private openCategoryForm(existing?: ExpenseCategory): void {
    let selectedColor = existing?.color ?? CATEGORY_COLORS[0]!;

    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';

    const swatchesHtml = CATEGORY_COLORS.map(
      (c) => `<button class="color-swatch ${c === selectedColor ? 'selected' : ''}"
        style="background:${c}" data-color="${c}" type="button" aria-label="Color ${c}"></button>`,
    ).join('');

    body.innerHTML = `
      <div class="form-group">
        <label class="form-label" for="cat-name">Category name <span class="req">*</span></label>
        <input id="cat-name" type="text"
          placeholder="e.g. Housing, Food, Transport" maxlength="32" />
      </div>
      <div class="form-group">
        <label class="form-label" for="cat-desc">
          Description
          <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span>
        </label>
        <textarea id="cat-desc" rows="2" maxlength="200"
          placeholder="e.g. All housing-related bills and rent"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="color-swatches">${swatchesHtml}</div>
      </div>
      <div class="form-group">
        <label class="form-label" for="cat-budget">
          Monthly budget
          <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span>
        </label>
        <input id="cat-budget" type="number" min="0" step="0.01"
          value="${existing?.monthlyBudget ?? ''}" placeholder="e.g. 500.00" />
        <span class="form-hint">Sets this category's spending bucket on the Budget page.</span>
      </div>
      <div id="cat-error" class="form-error" style="display:none"></div>
    `;
    // Set existing values via .value to avoid embedding user data in HTML attributes
    if (existing?.name) {
      body.querySelector<HTMLInputElement>('#cat-name')!.value = existing.name;
    }
    if (existing?.description) {
      body.querySelector<HTMLTextAreaElement>('#cat-desc')!.value = existing.description;
    }

    body.querySelectorAll<HTMLButtonElement>('.color-swatch').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedColor = btn.dataset['color']!;
        body.querySelectorAll('.color-swatch').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    // Inject "Default card" dropdown when card accounts exist
    if (this.cardAccounts.length > 0) {
      const cardGroup = document.createElement('div');
      cardGroup.className = 'form-group';
      const cardLabel = document.createElement('label');
      cardLabel.className = 'form-label';
      cardLabel.htmlFor = 'cat-card';
      cardLabel.innerHTML = 'Default card <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span>';
      const cardSel = document.createElement('select');
      cardSel.id = 'cat-card';
      cardSel.setAttribute('data-testid', 'cat-card-select');
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '— No default card —';
      cardSel.appendChild(noneOpt);
      this.cardAccounts.forEach((a) => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.name;
        opt.selected = a.id === existing?.defaultCardId;
        cardSel.appendChild(opt);
      });
      const hint = document.createElement('span');
      hint.className = 'form-hint';
      hint.textContent = 'Expenses in this category auto-create a charge on this card.';
      cardGroup.appendChild(cardLabel);
      cardGroup.appendChild(cardSel);
      cardGroup.appendChild(hint);
      body.insertBefore(cardGroup, body.querySelector('#cat-error'));
    }

    openFormModal({
      title: existing ? 'Edit Category' : 'New Category',
      body,
      submitLabel: existing ? 'Save' : 'Create',
      onSubmit: async (close) => {
        const name = body.querySelector<HTMLInputElement>('#cat-name')!.value.trim();
        const errEl = body.querySelector<HTMLElement>('#cat-error')!;
        errEl.style.display = 'none';
        if (!name) { errEl.textContent = 'Category name is required.'; errEl.style.display = 'block'; return; }

        const nameLower = name.toLowerCase();
        const duplicate = this.categories.find(
          c => c.name.toLowerCase() === nameLower && c.id !== existing?.id,
        );
        if (duplicate) {
          errEl.textContent = `A category named "${duplicate.name}" already exists.`;
          errEl.style.display = 'block';
          return;
        }

        const budgetRaw = parseFloat(body.querySelector<HTMLInputElement>('#cat-budget')!.value);
        const hasBudget = !isNaN(budgetRaw) && budgetRaw > 0;

        const defaultCardId = body.querySelector<HTMLSelectElement>('#cat-card')?.value || undefined;
        const description = body.querySelector<HTMLTextAreaElement>('#cat-desc')!.value.trim();

        const base = existing
          ? { ...existing, name, color: selectedColor }
          : createCategory(name, selectedColor);
        const cat: ExpenseCategory = { ...base };
        if (hasBudget) cat.monthlyBudget = budgetRaw; else delete cat.monthlyBudget;
        if (defaultCardId) cat.defaultCardId = defaultCardId; else delete cat.defaultCardId;
        if (description) cat.description = description; else delete cat.description;
        await saveCategory(cat);
        close();
        await this.load();
      },
    });
  }

  // ── Filters ────────────────────────────────────────────────────────────

  private buildFilterBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--space-3);align-items:center';

    // Category filter chips
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

    // Type filter
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

    // Sort pills
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

  private sortExpenses(items: Expense[]): Expense[] {
    return this.sortByMode(items, this.sortBy);
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

    // Group by category
    const byCat = new Map<string, Expense[]>();
    const noCatKey = '__none__';
    expenses.forEach((e) => {
      const key = e.categoryId || noCatKey;
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push(e);
    });

    const catMap = new Map(this.categories.map((c) => [c.id, c]));

    // Category group sort controls (only relevant when multiple groups are visible)
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

    // Sort category groups
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

      // Per-group sort pills
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
        .forEach((e) => group.appendChild(this.buildExpenseRow(e)));

      container.appendChild(group);
    });

    return container;
  }

  private buildExpenseRow(expense: Expense): HTMLElement {
    const isBill = expense.recurring && !!expense.dueDay;
    const billStatus = isBill ? computeBillStatus(expense) : null;
    const isAutoPay = !!expense.isAutoPay;
    // A bill is considered paid for this cycle only when a paid record exists in the
    // current month AND expense.date is also in the current month (meaning the bill
    // was explicitly marked paid in this cycle). Editing expense.date back to a prior
    // month resets the cycle without deleting historical paid records (which are needed
    // for the overage-trend mascot alert).
    const paidRecord = this.paidThisMonth.get(expense.id);
    const _now = new Date();
    const _monthEnd = new Date(_now.getFullYear(), _now.getMonth() + 1, 1).getTime();
    // For bills, check if expense.date (last-paid date) falls within 14 days before the
    // due date — this mirrors the 14-day lookback in billStatus and paymentStatus so an
    // early payment (e.g., Aug 31 for a Sep 9 due date) is correctly marked as paid.
    const billDateThisCycle = (() => {
      if (!isBill || !expense.dueDay) return false;
      const _maxDay = new Date(_now.getFullYear(), _now.getMonth() + 1, 0).getDate();
      const dueDate = new Date(_now.getFullYear(), _now.getMonth(), Math.min(expense.dueDay, _maxDay));
      const cycleWindowStart = dueDate.getTime() - 14 * 24 * 60 * 60 * 1000;
      return expense.date >= cycleWindowStart && expense.date < _monthEnd;
    })();
    const alreadyPaid = !!paidRecord && (!isBill || billDateThisCycle);
    // Stale: expense.date puts the bill in "paid" state but no actual paid record exists.
    // Caused by a ledger delete that didn't roll back expense.date correctly.
    const isStaleStatus = isBill && billStatus?.status === 'paid' && !alreadyPaid;
    const showPayBtn = !isAutoPay && !alreadyPaid;
    // Auto-pay always shows a log button — "Log Actual" when nothing recorded yet,
    // "Update Actual" when a record exists (allows correction or retroactive entry).
    const showLogActualBtn = isAutoPay;
    // Non-auto-pay expenses that have already been paid can still have their payment edited.
    const showEditPaymentBtn = !isAutoPay && alreadyPaid;

    const dateStr = new Date(expense.date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const freqLabel = expense.recurring && expense.recurringFrequency
      ? FREQUENCY_LABELS[expense.recurringFrequency]
      : null;
    const nextDueStr = (() => {
      if (!expense.dueDay) return '';
      const interval = freqInterval(expense.recurringFrequency);
      const nextDue = computeNextDue(new Date(expense.date), expense.dueDay, interval);
      const now = new Date();
      const opts: Intl.DateTimeFormatOptions = {
        month: 'short', day: 'numeric',
        ...(nextDue.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
      };
      return ` · Due ${nextDue.toLocaleDateString('en-US', opts)}`;
    })();

    const statusBadge = (() => {
      if (isStaleStatus) return '<span class="expense-badge expense-badge--stale" data-testid="expense-bill-badge">⚠ Sync issue</span>';
      if (alreadyPaid) return '<span class="expense-badge expense-badge--paid" data-testid="expense-bill-badge">✓ Paid</span>';
      if (!billStatus || isAutoPay) return ''; // auto-pay past-due/due-soon isn't actionable
      switch (billStatus.status) {
        case 'past-due': return '<span class="expense-badge expense-badge--past-due" data-testid="expense-bill-badge">⚠ Past Due</span>';
        case 'due-soon': {
          const dueLabel = billStatus.dueDayThisMonth
            ? `Due ${billStatus.dueDayThisMonth.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            : 'Due Soon';
          return `<span class="expense-badge expense-badge--due-soon" data-testid="expense-bill-badge">⏰ ${dueLabel}</span>`;
        }
        default: return '';
      }
    })();

    const paidDateStr = paidRecord
      ? new Date(paidRecord.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null;
    const dateLabel = alreadyPaid ? `Paid ${paidDateStr ?? dateStr}` : dateStr;


    const row = document.createElement('div');
    row.className = 'expense-row';
    row.setAttribute('data-testid', 'expense-row');
    row.setAttribute('data-expense-id', expense.id);

    // When we have an actual paid record, show it with threshold-relative color.
    const amountDisplay = (() => {
      if (paidRecord) {
        const actualFmt = fmtCents.format(paidRecord.amount);
        const threshFmt = fmtCents.format(expense.amount);
        const color = overageColor(paidRecord.amount, expense.amount);
        return `<span style="color:${color}" data-testid="expense-actual-amount">${actualFmt}</span>`
          + `<span class="expense-row-amount-sub">est. ${threshFmt}</span>`;
      }
      return fmtCents.format(expense.amount);
    })();

    const logActualLabel = paidRecord ? '$ Update Actual' : '$ Log Actual';

    const thresholdBadge = expense.threshold
      ? `<span class="expense-threshold-badge" data-testid="expense-threshold-badge">⚡ ${fmtCents.format(expense.threshold)}</span>`
      : '';

    row.innerHTML = `
      <div class="expense-row-desc">
        <div class="expense-row-desc-main">${statusBadge}${expense.description}${thresholdBadge}</div>
        <div class="expense-row-desc-sub">
          <span class="expense-row-date">${dateLabel}</span>
          ${expense.recurring && freqLabel
            ? `<span class="expense-row-recur">↻ ${freqLabel}${nextDueStr}</span>`
            : ''}
        </div>
      </div>
      <div class="expense-row-amount">${amountDisplay}</div>
      <div class="expense-row-actions">
        ${isAutoPay ? '<span class="expense-autopay-badge" data-testid="expense-autopay-badge">🔄 Auto-pay</span>' : ''}
        ${showPayBtn
          ? `<button class="mark-paid-btn" data-action="record-payment" data-testid="expense-record-payment" title="Record actual payment">$ Record Payment</button>`
          : ''}
        ${showLogActualBtn
          ? `<button class="mark-paid-btn" data-action="log-actual" data-testid="expense-log-actual" title="Log actual amount charged">${logActualLabel}</button>`
          : ''}
        ${showEditPaymentBtn
          ? `<button class="mark-paid-btn mark-paid-btn--edit" data-action="edit-payment" data-testid="expense-edit-payment" title="Edit recorded payment">✎ Edit Payment</button>`
          : ''}
        ${isStaleStatus
          ? `<button class="mark-paid-btn mark-paid-btn--stale" data-action="reset-status" title="Payment status is out of sync — click to reset">↺ Reset Status</button>`
          : ''}
        <button class="icon-btn" data-action="notif" title="Add reminder">🔔</button>
        <button class="icon-btn" data-action="edit" data-testid="expense-edit" title="Edit">✏️</button>
        <button class="icon-btn danger" data-action="delete" data-testid="expense-delete" title="Delete">🗑️</button>
      </div>
    `;

    // Card-link badge
    const linkedCard = expense.linkedCardId
      ? this.cardAccounts.find((a) => a.id === expense.linkedCardId)
      : null;
    if (linkedCard) {
      const badge = document.createElement('span');
      badge.className = 'expense-card-badge';
      badge.setAttribute('data-testid', 'expense-card-badge');
      badge.textContent = `💳 ${linkedCard.name}`;
      row.querySelector('.expense-row-desc-main')!.appendChild(badge);
    }

    // Bank account badge
    const linkedBank = expense.bankAccountId
      ? this.bankAccounts.find((a) => a.id === expense.bankAccountId)
      : null;
    if (linkedBank) {
      const badge = document.createElement('span');
      badge.className = 'expense-bank-badge';
      badge.setAttribute('data-testid', 'expense-bank-badge');
      badge.textContent = `🏦 ${linkedBank.name}`;
      row.querySelector('.expense-row-desc-main')!.appendChild(badge);
    }

    // Billing portal link
    if (expense.url) {
      const link = document.createElement('a');
      link.className = 'icon-btn';
      link.setAttribute('data-testid', 'expense-url-link');
      link.href = expense.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = 'Open billing portal';
      link.textContent = '↗';
      row.querySelector('[data-action="edit"]')!.before(link);
    }

    if (showPayBtn) {
      row.querySelector('[data-action="record-payment"]')!.addEventListener('click', () => {
        this.openRecordPaymentForm(expense);
      });
    }

    if (showLogActualBtn) {
      row.querySelector('[data-action="log-actual"]')!.addEventListener('click', () => {
        this.openLogActualForm(expense, paidRecord);
      });
    }

    if (showEditPaymentBtn) {
      row.querySelector('[data-action="edit-payment"]')!.addEventListener('click', () => {
        this.openRecordPaymentForm(expense, paidRecord);
      });
    }

    if (isStaleStatus) {
      row.querySelector('[data-action="reset-status"]')!.addEventListener('click', async () => {
        // Reset to epoch 0 (never paid) — createdAt could fall inside the current cycle
        // window and would leave the bill stale again.
        await saveExpense({ ...expense, date: 0 });
        await this.load();
        refreshNotifier();
      });
    }

    row.querySelector('[data-action="notif"]')!.addEventListener('click', () => {
      const ctx = expense.dueDay
        ? { label: expense.description, defaultTrigger: 'bill-before' as const, defaultExpenseId: expense.id }
        : { label: expense.description, defaultTrigger: 'monthly-day' as const };
      openAddNotificationModal(ctx);
    });
    row.querySelector('[data-action="edit"]')!.addEventListener('click', () =>
      this.openExpenseForm(expense),
    );
    row.querySelector('[data-action="delete"]')!.addEventListener('click', async () => {
      if (!confirm(`Delete "${expense.description}"?`)) return;
      // Delete ALL card charges linked to this expense regardless of whether a card
      // was configured on the expense itself — ad-hoc card payments also create charges
      // with sourceExpenseId set. Use getCardCharges() + filter to catch every one.
      const allCharges = await getCardCharges();
      const linkedCharges = allCharges.filter((c) => c.sourceExpenseId === expense.id);
      const paidRecs = await getExpensePaidRecords(expense.id);
      await Promise.all([
        ...linkedCharges.map((c) => deleteCardCharge(c.id)),
        ...paidRecs.map((r) => deleteExpensePaidRecord(r.id)),
      ]);
      await deleteExpense(expense.id);
      await this.load();
      refreshNotifier();
    });

    // Ledger button + panel
    const records = this.allPaidRecords.filter((r) => r.expenseId === expense.id);
    const ledgerPanel = this.buildLedgerPanel(expense, records);

    const ledgerBtn = document.createElement('button');
    ledgerBtn.className = 'icon-btn';
    ledgerBtn.setAttribute('data-action', 'ledger');
    ledgerBtn.title = 'Payment history';
    ledgerBtn.textContent = records.length > 0 ? `📋 ${records.length}` : '📋';
    if (records.length > 0) ledgerBtn.style.color = 'var(--ff-gold-dark)';
    ledgerBtn.addEventListener('click', () => {
      const open = ledgerPanel.style.display !== 'none';
      ledgerPanel.style.display = open ? 'none' : '';
    });
    row.querySelector('[data-action="notif"]')!.before(ledgerBtn);

    // Outer wrapper holds the row (possibly status-wrapped) + the ledger panel
    const outer = document.createElement('div');
    outer.className = 'expense-item-outer';

    if (!isBill && alreadyPaid) {
      const wrap = document.createElement('div');
      wrap.className = 'expense-bill-wrap expense-bill-wrap--paid';
      wrap.setAttribute('data-testid', 'expense-bill-wrap');
      wrap.appendChild(row);
      outer.appendChild(wrap);
    } else if (!billStatus || billStatus.status === 'ok') {
      outer.appendChild(row);
    } else {
      const wrapClass = isStaleStatus ? 'expense-bill-wrap--stale'
        : billStatus.status === 'past-due' ? 'expense-bill-wrap--past-due'
        : billStatus.status === 'due-soon' ? 'expense-bill-wrap--due-soon'
        : 'expense-bill-wrap--paid';
      const wrap = document.createElement('div');
      wrap.className = `expense-bill-wrap ${wrapClass}`;
      wrap.setAttribute('data-testid', 'expense-bill-wrap');
      wrap.appendChild(row);
      outer.appendChild(wrap);
    }

    outer.appendChild(ledgerPanel);
    return outer;
  }

  private buildLedgerPanel(expense: Expense, records: ExpensePaidRecord[]): HTMLElement {
    const isBill = expense.recurring && !!expense.dueDay;
    const panel = document.createElement('div');
    panel.className = 'expense-ledger-panel';
    panel.style.display = 'none';

    if (records.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'text-muted text-sm';
      empty.style.padding = 'var(--space-3) var(--space-4)';
      empty.textContent = 'No payment history yet.';
      panel.appendChild(empty);
      return panel;
    }

    const headerRow = document.createElement('div');
    headerRow.className = 'expense-ledger-row expense-ledger-col-header';
    ([
      ['Date',   'expense-ledger-date'],
      ['Via',    'expense-ledger-source'],
      ['Amount', 'expense-ledger-amount'],
      ['',       'expense-ledger-actions'],
    ] as [string, string][]).forEach(([text, cls]) => {
      const cell = document.createElement('span');
      cell.className = cls;
      cell.textContent = text;
      headerRow.appendChild(cell);
    });
    panel.appendChild(headerRow);

    records.forEach((r) => {
      const cardName = r.cardId ? this.cardAccounts.find((a) => a.id === r.cardId)?.name : null;
      const bankName = r.bankAccountId ? this.bankAccounts.find((a) => a.id === r.bankAccountId)?.name : null;
      const source = cardName ? `💳 ${cardName}` : bankName ? `🏦 ${bankName}` : '—';
      const dateStr = new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      const ledgerRow = document.createElement('div');
      ledgerRow.className = 'expense-ledger-row';

      const dateEl = document.createElement('span');
      dateEl.className = 'expense-ledger-date';
      dateEl.textContent = dateStr;

      const amtEl = document.createElement('span');
      amtEl.className = 'expense-ledger-amount';
      amtEl.textContent = fmtCents.format(r.amount);

      const srcEl = document.createElement('span');
      srcEl.className = 'expense-ledger-source';
      if (r.cardId || r.bankAccountId) {
        const link = document.createElement('a');
        link.className = 'expense-ledger-source-link';
        link.textContent = source;
        link.href = '#';
        link.addEventListener('click', (e) => {
          e.preventDefault();
          if (r.cardId) {
            sessionStorage.setItem('cal-focus-account', r.cardId);
            navigate('/debt');
          } else if (r.bankAccountId) {
            sessionStorage.setItem('cal-focus-bank', r.bankAccountId);
            navigate('/accounts');
          }
        });
        srcEl.appendChild(link);
      } else {
        srcEl.textContent = source;
      }

      const actionsEl = document.createElement('span');
      actionsEl.className = 'expense-ledger-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn';
      editBtn.title = 'Edit this payment record';
      editBtn.textContent = '✏️';
      editBtn.addEventListener('click', () => {
        this.openRecordPaymentForm(expense, r);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn danger';
      delBtn.title = 'Remove this payment record';
      delBtn.textContent = '🗑️';
      delBtn.addEventListener('click', async () => {
        if (!confirm('Remove this payment record?')) return;

        const ops: Promise<unknown>[] = [deleteExpensePaidRecord(r.id)];

        // Remove the linked card charge if it matches this record's card
        if (r.cardId) {
          const charge = await findChargeByExpenseId(expense.id);
          if (charge && charge.accountId === r.cardId) ops.push(deleteCardCharge(charge.id));
        }

        // Roll expense.date back to the most recent remaining payment (fresh DB read, not stale cache)
        if (isBill) {
          const freshRecords = await getExpensePaidRecords(expense.id);
          const remaining = freshRecords.filter((rec) => rec.id !== r.id);
          // Use 0 (never paid) when no records remain — createdAt could be inside the
          // current billing window and would leave the bill showing as paid (stale).
          const newDate = remaining.length > 0
            ? Math.max(...remaining.map((rec) => rec.date))
            : 0;
          ops.push(saveExpense({ ...expense, date: newDate }));
        }

        await Promise.all(ops);
        await this.load();
        refreshNotifier();
      });

      actionsEl.appendChild(editBtn);
      actionsEl.appendChild(delBtn);

      ledgerRow.appendChild(dateEl);
      ledgerRow.appendChild(srcEl);
      ledgerRow.appendChild(amtEl);
      ledgerRow.appendChild(actionsEl);
      panel.appendChild(ledgerRow);
    });

    return panel;
  }

  // ── Record Payment form ────────────────────────────────────────────────

  private openRecordPaymentForm(expense: Expense, existingRecord?: ExpensePaidRecord): void {
    openExpensePaymentModal({
      expense,
      bankAccounts: this.bankAccounts,
      cardAccounts: this.cardAccounts,
      allPaidRecords: this.allPaidRecords,
      ...(existingRecord ? { existingRecord } : {}),
      onSave: () => this.load(),
    });
  }

  // ── Log Actual form (auto-pay only) ───────────────────────────────────────

  private openLogActualForm(expense: Expense, existingRecord?: ExpensePaidRecord): void {
    const isBill = expense.recurring && !!expense.dueDay;
    const isUpdate = !!existingRecord;
    const currFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
    const today = new Date().toISOString().split('T')[0]!;
    const prefillDate = existingRecord
      ? new Date(existingRecord.date).toISOString().split('T')[0]!
      : today;
    const prefillAmount = existingRecord ? existingRecord.amount : expense.amount;

    const defaultSourceValue = (() => {
      if (existingRecord?.bankAccountId) return `bank:${existingRecord.bankAccountId}`;
      if (existingRecord?.cardId)        return `card:${existingRecord.cardId}`;
      if (expense.bankAccountId)         return `bank:${expense.bankAccountId}`;
      if (expense.linkedCardId)          return `card:${expense.linkedCardId}`;
      return '';
    })();

    const body = document.createElement('div');
    body.className = 'expense-form';
    body.innerHTML = `
      <p class="text-sm text-muted">
        ${isUpdate
          ? `Update the actual amount auto-charged for <strong>${expense.description}</strong>.`
          : `Log the actual amount auto-charged for <strong>${expense.description}</strong>.`}
      </p>
      <div class="form-group">
        <label class="form-label" for="la-amount">Actual amount charged <span class="req">*</span></label>
        <input id="la-amount" type="number" min="0" step="0.01"
          value="${prefillAmount.toFixed(2)}" />
        <span class="form-hint">${freqThresholdLabel(expense.recurringFrequency)} Threshold: ${currFmt.format(expense.amount)}</span>
      </div>
      <div class="form-group">
        <label class="form-label" for="la-date">Date charged</label>
        <input id="la-date" type="date" value="${prefillDate}" />
        <span class="form-hint">Use any past date to log retroactively.</span>
      </div>
      <div id="la-overage-msg" style="display:none"></div>
    `;

    // "Charged to" source dropdown — same bank/card options as Record Payment
    const hasAnySources = this.bankAccounts.length > 0 || this.cardAccounts.length > 0;
    const sourceGroup = document.createElement('div');
    sourceGroup.className = 'form-group';
    const srcLabel = document.createElement('label');
    srcLabel.className = 'form-label';
    srcLabel.htmlFor = 'la-source';
    srcLabel.innerHTML = 'Charged to <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span>';
    sourceGroup.appendChild(srcLabel);

    if (hasAnySources) {
      const srcSel = document.createElement('select');
      srcSel.id = 'la-source';
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '— Not specified —';
      srcSel.appendChild(noneOpt);
      if (this.bankAccounts.length > 0) {
        const bankGroup = document.createElement('optgroup');
        bankGroup.label = 'Accounts';
        this.bankAccounts.forEach((b) => {
          const opt = document.createElement('option');
          opt.value = `bank:${b.id}`;
          opt.textContent = b.name;
          opt.selected = defaultSourceValue === `bank:${b.id}`;
          bankGroup.appendChild(opt);
        });
        srcSel.appendChild(bankGroup);
      }
      if (this.cardAccounts.length > 0) {
        const cardGroup = document.createElement('optgroup');
        cardGroup.label = 'Credit Cards';
        this.cardAccounts.forEach((a) => {
          const opt = document.createElement('option');
          opt.value = `card:${a.id}`;
          opt.textContent = a.name;
          opt.selected = defaultSourceValue === `card:${a.id}`;
          cardGroup.appendChild(opt);
        });
        srcSel.appendChild(cardGroup);
      }
      sourceGroup.appendChild(srcSel);
    }
    body.insertBefore(sourceGroup, body.querySelector('#la-overage-msg'));

    const amountInput = body.querySelector<HTMLInputElement>('#la-amount')!;
    const overageMsg = body.querySelector<HTMLElement>('#la-overage-msg')!;

    const checkOverage = () => {
      const val = parseFloat(amountInput.value);
      if (!isNaN(val) && val > expense.amount) {
        const over = val - expense.amount;
        overageMsg.textContent = `⚠ Over ${freqThresholdLabel(expense.recurringFrequency).toLowerCase()} threshold by ${currFmt.format(over)}`;
        overageMsg.style.cssText = 'display:block;color:var(--color-danger);font-size:var(--text-xs);margin-top:var(--space-1)';
      } else {
        overageMsg.style.display = 'none';
      }
    };
    amountInput.addEventListener('input', checkOverage);
    checkOverage();

    openFormModal({
      title: isUpdate ? `Update Actual — ${expense.description}` : `Log Actual — ${expense.description}`,
      body,
      submitLabel: isUpdate ? 'Update' : 'Log Actual',
      onSubmit: async (close) => {
        const rawAmount = parseFloat(amountInput.value);
        if (isNaN(rawAmount) || rawAmount < 0) return;
        const actualAmount = Math.round(rawAmount * 100) / 100;
        const dateStr = body.querySelector<HTMLInputElement>('#la-date')!.value;
        const paidDate = dateStr ? new Date(dateStr + 'T00:00:00').getTime() : Date.now();
        const sourceVal = body.querySelector<HTMLSelectElement>('#la-source')?.value ?? '';
        const selectedCardId = sourceVal.startsWith('card:') ? sourceVal.slice(5) : null;
        const selectedBankId = sourceVal.startsWith('bank:') ? sourceVal.slice(5) : null;

        const ops: Promise<unknown>[] = [];
        if (isUpdate && existingRecord) {
          const { cardId: _cid, bankAccountId: _bid, ...baseFields } = existingRecord;
          ops.push(saveExpensePaidRecord({
            ...baseFields,
            amount: actualAmount,
            date: paidDate,
            ...(selectedCardId ? { cardId: selectedCardId } : {}),
            ...(selectedBankId ? { bankAccountId: selectedBankId } : {}),
          }));
        } else {
          ops.push(saveExpensePaidRecord({
            ...createExpensePaidRecord(expense.id, actualAmount, paidDate),
            ...(selectedCardId ? { cardId: selectedCardId } : {}),
            ...(selectedBankId ? { bankAccountId: selectedBankId } : {}),
          }));
        }
        if (isBill) ops.push(saveExpense({ ...expense, date: paidDate }));

        await Promise.all(ops);
        close();
        await this.load();
        refreshNotifier();

        if (actualAmount > expense.amount) {
          const overCount = await getOverageTrend(expense.id, expense.amount);
          if (overCount >= 2) {
            const fmtThreshold = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(expense.amount);
            setTimeout(() => showMascot('expense-trend', {
              bill: expense.description,
              threshold: fmtThreshold,
              count: String(overCount),
            }), 600);
          }
        }
      },
    });
  }

  // ── Expense form modal ─────────────────────────────────────────────────────

  private openExpenseForm(existing?: Expense): void {
    const isEdit = !!existing;
    const body = document.createElement('div');
    body.className = 'expense-form';

    const today = new Date().toISOString().split('T')[0];
    const existingDate = existing
      ? new Date(existing.date).toISOString().split('T')[0]
      : today;

    // Compute the next due date for the date picker: if editing, advance one period from last paid;
    // if new, leave blank so the user must deliberately choose.
    const defaultDueDate = (() => {
      if (!existing?.dueDay) return '';
      const lastPaid = new Date(existing.date);
      const interval = freqInterval(existing.recurringFrequency);
      const next = computeNextDue(lastPaid, existing.dueDay, interval);
      return next.toISOString().split('T')[0];
    })();

    const catOptions = [
      `<option value="" ${!existing?.categoryId ? 'selected' : ''}>— No category —</option>`,
      ...this.categories.map(
        (c) => `<option value="${c.id}" ${existing?.categoryId === c.id ? 'selected' : ''}>${c.name}</option>`,
      ),
    ].join('');

    const memberOptions = [
      `<option value="" ${!existing?.memberId ? 'selected' : ''}>— All / household —</option>`,
      ...this.members.map(
        (m) => `<option value="${m.id}" ${existing?.memberId === m.id ? 'selected' : ''}>${m.name}</option>`,
      ),
    ].join('');

    const freqOptions = FREQUENCY_OPTIONS.map(
      (f) => `<option value="${f.value}" ${(existing?.recurringFrequency ?? 'monthly') === f.value ? 'selected' : ''}>${f.label}</option>`,
    ).join('');

    body.innerHTML = `
      <div class="form-group">
        <label class="form-label" for="ef-desc">Description <span class="req">*</span></label>
        <input id="ef-desc" type="text" value="${existing?.description ?? ''}"
          placeholder="e.g. Rent, Groceries, Netflix" maxlength="64" />
      </div>
      <div class="form-group">
        <label class="form-label" for="ef-url">Billing portal URL <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
        <input id="ef-url" type="url" placeholder="https://billing.example.com" maxlength="512" />
        <span class="form-hint">Opens as a quick link on your expense list and calendar.</span>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" id="ef-amount-label" for="ef-amount">Estimated Amount <span class="req">*</span></label>
          <input id="ef-amount" type="number" min="0" step="0.01"
            value="${existing?.amount ?? ''}" placeholder="0.00" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ef-date">Date <span class="req">*</span></label>
          <input id="ef-date" type="date" value="${existingDate}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="ef-cat">Category</label>
          <select id="ef-cat">${catOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label" for="ef-member">Member</label>
          <select id="ef-member">${memberOptions}</select>
        </div>
      </div>
      <div class="form-group" style="flex-direction:row;align-items:center;gap:var(--space-3)">
        <input id="ef-recurring" type="checkbox" style="width:auto" ${existing?.recurring ? 'checked' : ''} />
        <label for="ef-recurring" style="text-transform:none;letter-spacing:0;font-size:var(--text-sm)">
          This is a recurring expense
        </label>
      </div>
      <div class="recur-details" id="ef-recur-details" style="${existing?.recurring ? '' : 'display:none'}">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="ef-freq">Repeats</label>
            <select id="ef-freq">${freqOptions}</select>
          </div>
          <div class="form-group">
            <label class="form-label" for="ef-duedate">First due date <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
            <input id="ef-duedate" type="date" value="${defaultDueDate}" />
            <span class="form-hint">Pick the date this bill is first (or next) due — sets the recurring billing day automatically</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="ef-threshold">
            Alert threshold
            <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span>
          </label>
          <input id="ef-threshold" type="number" min="0" step="0.01"
            value="${existing?.threshold ?? ''}" placeholder="e.g. 120.00" />
          <span class="form-hint">Warn when actual payment exceeds this amount. Leave blank to use the estimated amount.</span>
        </div>
        <div class="form-group" style="flex-direction:row;align-items:center;gap:var(--space-3)">
          <input id="ef-fixed-amount" type="checkbox" style="width:auto" ${existing?.isFixedAmount ? 'checked' : ''} />
          <label for="ef-fixed-amount" style="text-transform:none;letter-spacing:0;font-size:var(--text-sm)">
            Fixed amount — actual always equals estimated (e.g. cable, subscriptions)
          </label>
        </div>
        <div class="form-group" style="flex-direction:row;align-items:center;gap:var(--space-3)">
          <input id="ef-autopay" type="checkbox" style="width:auto" ${existing?.isAutoPay ? 'checked' : ''} />
          <label for="ef-autopay" style="text-transform:none;letter-spacing:0;font-size:var(--text-sm)">
            Auto-pay — charged automatically, no manual payment needed
          </label>
        </div>
      </div>
      <div id="ef-error" class="form-error" style="display:none"></div>
    `;

    if (existing?.url) body.querySelector<HTMLInputElement>('#ef-url')!.value = existing.url;

    const recurChk = body.querySelector<HTMLInputElement>('#ef-recurring')!;
    const recurDetails = body.querySelector<HTMLElement>('#ef-recur-details')!;
    const amountLabel = body.querySelector<HTMLElement>('#ef-amount-label')!;
    const updateAmountLabel = () => {
      const freq = body.querySelector<HTMLSelectElement>('#ef-freq')?.value;
      const labelText = recurChk.checked ? `${freqThresholdLabel(freq)} Threshold` : 'Estimated Amount';
      amountLabel.childNodes[0]!.nodeValue = labelText + ' ';
    };
    recurChk.addEventListener('change', () => {
      recurDetails.style.display = recurChk.checked ? '' : 'none';
      updateAmountLabel();
    });
    body.querySelector<HTMLSelectElement>('#ef-freq')?.addEventListener('change', updateAmountLabel);
    updateAmountLabel();

    // When First Due Date changes, auto-sync the Date field to one period prior
    // so the user can see exactly what will be stored (date = firstDue - interval)
    const dueDateInput = body.querySelector<HTMLInputElement>('#ef-duedate')!;
    const mainDateInput = body.querySelector<HTMLInputElement>('#ef-date')!;
    const syncDateFromDue = () => {
      if (!dueDateInput.value || !recurChk.checked) return;
      const firstDue = new Date(dueDateInput.value + 'T00:00:00');
      const interval = freqInterval(body.querySelector<HTMLSelectElement>('#ef-freq')?.value);
      const prev = new Date(firstDue);
      prev.setMonth(prev.getMonth() - interval);
      const maxDay = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
      prev.setDate(Math.min(firstDue.getDate(), maxDay));
      mainDateInput.value = prev.toISOString().split('T')[0]!;
    };
    dueDateInput.addEventListener('change', syncDateFromDue);
    body.querySelector<HTMLSelectElement>('#ef-freq')?.addEventListener('change', syncDateFromDue);

    // Inject "Charge to card" dropdown when card accounts exist
    const catSel = body.querySelector<HTMLSelectElement>('#ef-cat')!;
    let efCardSel: HTMLSelectElement | null = null;
    let autoCardId: string; // tracks the last auto-filled card value

    if (this.cardAccounts.length > 0) {
      const initialCat = this.categories.find((c) => c.id === (existing?.categoryId ?? ''));
      autoCardId = existing?.linkedCardId ?? initialCat?.defaultCardId ?? '';

      const cardGroup = document.createElement('div');
      cardGroup.className = 'form-group';
      const cardLabel = document.createElement('label');
      cardLabel.className = 'form-label';
      cardLabel.htmlFor = 'ef-card';
      cardLabel.innerHTML = 'Charge to card <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span>';
      efCardSel = document.createElement('select');
      efCardSel.id = 'ef-card';
      efCardSel.setAttribute('data-testid', 'ef-card-select');
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '— No card —';
      efCardSel.appendChild(noneOpt);
      this.cardAccounts.forEach((a) => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.name;
        opt.selected = a.id === autoCardId;
        efCardSel!.appendChild(opt);
      });
      cardGroup.appendChild(cardLabel);
      cardGroup.appendChild(efCardSel);

      // When category changes, auto-update card to the new category's default —
      // but only if the card selection hasn't been manually changed.
      catSel.addEventListener('change', () => {
        if (efCardSel!.value !== autoCardId) return; // user overrode — leave it
        const newCat = this.categories.find((c) => c.id === catSel.value);
        const newDefault = newCat?.defaultCardId ?? '';
        efCardSel!.value = newDefault;
        autoCardId = newDefault;
      });

      const recurGroup = recurChk.closest('.form-group') ?? recurChk.parentElement!;
      body.insertBefore(cardGroup, recurGroup);
    } else {
      autoCardId = '';

      const noCardGroup = document.createElement('div');
      noCardGroup.className = 'form-group';
      const noCardLabel = document.createElement('label');
      noCardLabel.className = 'form-label';
      noCardLabel.textContent = 'Charge to card';
      const noCardHint = document.createElement('span');
      noCardHint.className = 'form-hint';
      noCardHint.innerHTML = 'No credit cards set up yet. ';
      const goLink = document.createElement('a');
      goLink.href = '#';
      goLink.textContent = 'Add one in the Debt section →';
      goLink.addEventListener('click', (e) => {
        e.preventDefault();
        expenseModalRef.close?.();
        navigate('/debt');
      });
      noCardHint.appendChild(goLink);
      noCardGroup.appendChild(noCardLabel);
      noCardGroup.appendChild(noCardHint);
      const recurGroup = recurChk.closest('.form-group') ?? recurChk.parentElement!;
      body.insertBefore(noCardGroup, recurGroup);
    }

    // ── Bank account dropdown ("Pay from account") ──────────────────────
    const bankAccountGroup = document.createElement('div');
    bankAccountGroup.className = 'form-group';
    const bankAccountLabel = document.createElement('label');
    bankAccountLabel.className = 'form-label';
    bankAccountLabel.textContent = 'Pay from account';
    bankAccountGroup.appendChild(bankAccountLabel);

    let efBankAccountSel: HTMLSelectElement | null = null;
    if (this.bankAccounts.length > 0) {
      efBankAccountSel = document.createElement('select');
      efBankAccountSel.id = 'ef-bank-account';
      efBankAccountSel.setAttribute('data-testid', 'ef-bank-account-select');
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '— No account —';
      efBankAccountSel.appendChild(noneOpt);
      this.bankAccounts.forEach((a) => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.name;
        opt.selected = a.id === (existing?.bankAccountId ?? '');
        efBankAccountSel!.appendChild(opt);
      });
      bankAccountGroup.appendChild(efBankAccountSel);
    } else {
      const hint = document.createElement('span');
      hint.className = 'form-hint';
      hint.innerHTML = 'No bank accounts set up yet. ';
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = 'Add one in Accounts →';
      link.addEventListener('click', (e) => {
        e.preventDefault();
        expenseModalRef.close?.();
        navigate('/accounts');
      });
      hint.appendChild(link);
      bankAccountGroup.appendChild(hint);
    }

    // Insert bank account group after the card group (before recurring checkbox)
    const recurGroup = recurChk.closest('.form-group') ?? recurChk.parentElement!;
    body.insertBefore(bankAccountGroup, recurGroup);

    // ── Mutual exclusion: card ↔ bank account ────────────────────────────────
    // Selecting a card disables the bank account picker and vice versa.
    // Resetting back to "No..." re-enables the other side.
    if (efCardSel && efBankAccountSel) {
      const syncCardToBank = () => {
        const hasCard = efCardSel!.value !== '';
        efBankAccountSel!.disabled = hasCard;
        if (hasCard) efBankAccountSel!.value = '';
      };
      const syncBankToCard = () => {
        const hasBank = efBankAccountSel!.value !== '';
        efCardSel!.disabled = hasBank;
        if (hasBank) efCardSel!.value = '';
      };
      efCardSel.addEventListener('change', syncCardToBank);
      efBankAccountSel.addEventListener('change', syncBankToCard);
      // Apply initial state based on pre-filled values
      if (efCardSel.value !== '') syncCardToBank();
      else if (efBankAccountSel.value !== '') syncBankToCard();
    }

    let flushReminders: (finalItemId: string) => Promise<void> = async () => {};
    if (isEdit && existing) {
      const remindersOpts = existing.dueDay
        ? { defaultTrigger: 'bill-before' as const, defaultExpenseId: existing.id }
        : { defaultTrigger: 'monthly-day' as const };
      const { element, flush } = buildLinkedRemindersSection(existing.id, 'expense', existing.description, remindersOpts);
      body.appendChild(element);
      flushReminders = flush;
    } else {
      const descInput = body.querySelector<HTMLInputElement>('#ef-desc')!;
      const { element, flush } = buildLinkedRemindersSection('', 'expense', 'Expense', {
        deferred: true,
        getLabel: () => descInput.value.trim() || 'Expense',
      });
      body.appendChild(element);
      flushReminders = flush;
    }

    const expenseModalRef: { close?: () => void } = {};

    const { close: closeExpenseModal } = openFormModal({
      title: isEdit ? 'Edit Expense' : 'Add Expense',
      body,
      submitLabel: isEdit ? 'Save changes' : 'Add expense',
      onSubmit: async (close) => {
        const description = body.querySelector<HTMLInputElement>('#ef-desc')!.value.trim();
        const amount = parseFloat(body.querySelector<HTMLInputElement>('#ef-amount')!.value);
        const dateStr = body.querySelector<HTMLInputElement>('#ef-date')!.value;
        const categoryId = body.querySelector<HTMLSelectElement>('#ef-cat')!.value;
        const memberId = body.querySelector<HTMLSelectElement>('#ef-member')!.value || null;
        const recurring = recurChk.checked;
        const recurringFrequency = recurring
          ? (body.querySelector<HTMLSelectElement>('#ef-freq')!.value as IncomeFrequency)
          : null;
        const dueDateStr = recurring
          ? (body.querySelector<HTMLInputElement>('#ef-duedate')?.value ?? '')
          : '';
        const isFixedAmount = recurring ? (body.querySelector<HTMLInputElement>('#ef-fixed-amount')?.checked ?? false) : false;
        const isAutoPay = recurring ? (body.querySelector<HTMLInputElement>('#ef-autopay')?.checked ?? false) : false;
        const thresholdRaw = recurring ? parseFloat(body.querySelector<HTMLInputElement>('#ef-threshold')?.value ?? '') : NaN;
        const hasThreshold = !isNaN(thresholdRaw) && thresholdRaw > 0;
        const url = body.querySelector<HTMLInputElement>('#ef-url')!.value.trim() || undefined;
        const errEl = body.querySelector<HTMLElement>('#ef-error')!;

        const missing: string[] = [];
        if (!description)                missing.push('Description');
        if (isNaN(amount) || amount < 0) missing.push('Amount');
        if (!dateStr)                    missing.push('Date');
        if (missing.length > 0) {
          errEl.textContent = missing.length === 1
            ? `${missing[0]} is required.`
            : `Fill in all required fields: ${missing.join(', ')}.`;
          errEl.style.display = 'block';
          return;
        }

        // Extract dueDay from the date picker; compute expense.date as one period before
        // the first/next due date so the status system sees the correct upcoming cycle.
        // When editing without changing the due date, preserve #ef-date so callers can
        // reset expense.date directly (e.g., tests that re-open the mark-paid window).
        let dueDay: number | undefined = undefined;
        let date = new Date(dateStr + 'T00:00:00').getTime();
        if (recurring && dueDateStr) {
          const firstDue = new Date(dueDateStr + 'T00:00:00');
          dueDay = firstDue.getDate();
          if (!existing || dueDateStr !== defaultDueDate) {
            const interval = freqInterval(recurringFrequency);
            const prevPeriod = new Date(firstDue);
            prevPeriod.setMonth(prevPeriod.getMonth() - interval);
            const maxDay = new Date(prevPeriod.getFullYear(), prevPeriod.getMonth() + 1, 0).getDate();
            prevPeriod.setDate(Math.min(dueDay, maxDay));
            date = prevPeriod.getTime();
          }
        }

        const linkedCardId = efCardSel?.value || undefined;

        const expense: Expense = existing
          ? { ...existing, description, amount, date, categoryId, memberId, recurring, recurringFrequency }
          : { ...createExpense(categoryId, description, amount, date, memberId), recurring, recurringFrequency };

        if (dueDay != null) expense.dueDay = dueDay;
        else delete expense.dueDay;


        if (linkedCardId) expense.linkedCardId = linkedCardId;
        else delete expense.linkedCardId;

        if (isFixedAmount) expense.isFixedAmount = true;
        else delete expense.isFixedAmount;

        if (isAutoPay) expense.isAutoPay = true;
        else delete expense.isAutoPay;

        if (hasThreshold) expense.threshold = thresholdRaw;
        else delete expense.threshold;

        if (url) expense.url = url;
        else delete expense.url;

        const bankAccountId = efBankAccountSel?.value || undefined;
        if (bankAccountId) expense.bankAccountId = bankAccountId;
        else delete expense.bankAccountId;

        await saveExpense(expense);
        await this.syncLinkedCharge(expense, existing?.linkedCardId);
        await flushReminders(expense.id);
        close();
        await this.load();
        refreshNotifier();

      },
    });
    expenseModalRef.close = closeExpenseModal;
  }

  // ── Card charge sync ───────────────────────────────────────────────────

  private async syncLinkedCharge(expense: Expense, prevLinkedCardId?: string): Promise<void> {
    const newCardId = expense.linkedCardId ?? null;
    const existing = await findChargeByExpenseId(expense.id);

    if (!newCardId) {
      if (existing) await deleteCardCharge(existing.id);
      return;
    }

    if (existing && existing.accountId === newCardId) {
      // Same card — update merchant/amount/date in place
      const { categoryId: _cat, ...existingBase } = existing;
      await saveCardCharge({
        ...existingBase,
        merchant: expense.description,
        amount: expense.amount,
        date: expense.date,
        ...(expense.categoryId ? { categoryId: expense.categoryId } : {}),
      });
    } else {
      // New card (or first time) — remove old charge and create fresh
      if (existing) await deleteCardCharge(existing.id);
      const charge = createCardCharge(
        newCardId,
        expense.description,
        expense.amount,
        expense.date,
        expense.categoryId || undefined,
      );
      charge.sourceExpenseId = expense.id;
      await saveCardCharge(charge);
    }
  }
}
