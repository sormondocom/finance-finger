import './expenses.css';
import {
  getCategories, saveCategory, deleteCategory, createCategory,
  getExpenses, saveExpense, deleteExpense, createExpense,
  saveExpensePaidRecord, createExpensePaidRecord,
  getMembers,
} from '@/db';
import { openFormModal } from '@/components/Modal';
import { toMonthly, fmt, fmtCents, FREQUENCY_LABELS, FREQUENCY_OPTIONS, CATEGORY_COLORS } from '@/utils/finance';
import { showMascot } from '@/mascot/Mascot';
import { computeBillStatus } from '@/utils/billStatus';
import { refreshNotifier, getOverageTrend } from '@/utils/notifier';
import type { ExpenseCategory, Expense, IncomeFrequency, HouseholdMember } from '@/types';

type FilterType = 'all' | 'recurring' | 'one-time';

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

export class ExpensesPage {
  private categories: ExpenseCategory[] = [];
  private expenses: Expense[] = [];
  private members: HouseholdMember[] = [];
  private activeCategoryId: string | null = null;
  private filter: FilterType = 'all';
  private container!: HTMLElement;

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'expenses-page';
    this.load();
    return this.container;
  }

  private async load(): Promise<void> {
    [this.categories, this.expenses, this.members] = await Promise.all([
      getCategories(),
      getExpenses(),
      getMembers(),
    ]);
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
    this.container.appendChild(header);

    // ── Category management card ─────────────────────────────────────────
    this.container.appendChild(this.buildCategoriesCard());

    // ── Filters + expense list ───────────────────────────────────────────
    if (this.expenses.length > 0 || this.categories.length > 0) {
      this.container.appendChild(this.buildFilterBar());
      this.container.appendChild(this.buildExpenseList(visible));
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

      const dot = document.createElement('span');
      dot.className = 'chip-dot';
      dot.style.background = cat.color;
      pill.appendChild(dot);

      const nameEl = document.createElement('span');
      nameEl.textContent = cat.name;
      pill.appendChild(nameEl);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'category-pill-remove';
      removeBtn.setAttribute('aria-label', `Remove ${cat.name}`);
      removeBtn.setAttribute('data-testid', 'category-remove');
      removeBtn.setAttribute('data-category-id', cat.id);
      removeBtn.title = 'Remove';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', async () => {
        const inUse = this.expenses.some((e) => e.categoryId === cat.id);
        if (inUse && !confirm(`"${cat.name}" has expenses. Remove the category anyway? (Expenses won't be deleted)`)) return;
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
        <label class="form-label" for="cat-name">Category name</label>
        <input id="cat-name" type="text"
          placeholder="e.g. Housing, Food, Transport" maxlength="32" />
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
    // Set existing name via .value to avoid embedding user data in HTML attribute
    if (existing?.name) {
      body.querySelector<HTMLInputElement>('#cat-name')!.value = existing.name;
    }

    body.querySelectorAll<HTMLButtonElement>('.color-swatch').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedColor = btn.dataset['color']!;
        body.querySelectorAll('.color-swatch').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    openFormModal({
      title: existing ? 'Edit Category' : 'New Category',
      body,
      submitLabel: existing ? 'Save' : 'Create',
      onSubmit: async (close) => {
        const name = body.querySelector<HTMLInputElement>('#cat-name')!.value.trim();
        const errEl = body.querySelector<HTMLElement>('#cat-error')!;
        if (!name) { errEl.textContent = 'Name is required.'; errEl.style.display = 'block'; return; }

        const budgetRaw = parseFloat(body.querySelector<HTMLInputElement>('#cat-budget')!.value);
        const hasBudget = !isNaN(budgetRaw) && budgetRaw > 0;

        const base = existing
          ? { ...existing, name, color: selectedColor }
          : createCategory(name, selectedColor);
        const cat: ExpenseCategory = hasBudget
          ? { ...base, monthlyBudget: budgetRaw }
          : { ...base };
        if (!hasBudget) delete cat.monthlyBudget;
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

    byCat.forEach((items, catId) => {
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

      items
        .sort((a, b) => b.date - a.date)
        .forEach((e) => group.appendChild(this.buildExpenseRow(e)));

      container.appendChild(group);
    });

    return container;
  }

  private buildExpenseRow(expense: Expense): HTMLElement {
    const isBill = expense.recurring && !!expense.dueDay;
    const billStatus = isBill ? computeBillStatus(expense) : null;

    const dateStr = new Date(expense.date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const freqLabel = expense.recurring && expense.recurringFrequency
      ? FREQUENCY_LABELS[expense.recurringFrequency]
      : null;
    const dueDayStr = expense.dueDay
      ? `· Due the ${expense.dueDay}${ordinal(expense.dueDay)}`
      : '';

    const statusBadge = (() => {
      if (!billStatus) return '';
      switch (billStatus.status) {
        case 'paid':     return '<span class="expense-badge expense-badge--paid" data-testid="expense-bill-badge">✓ Paid</span>';
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

    const dateLabel = isBill && billStatus?.status === 'paid'
      ? `Paid ${dateStr}`
      : dateStr;

    const thresholdFmt = expense.threshold
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(expense.threshold)
      : null;
    const thresholdBadge = thresholdFmt
      ? `<span class="expense-threshold-badge" data-testid="expense-threshold-badge" title="Monthly target">⚡ ${thresholdFmt}</span>`
      : '';

    const row = document.createElement('div');
    row.className = 'expense-row';
    row.setAttribute('data-testid', 'expense-row');
    row.setAttribute('data-expense-id', expense.id);

    row.innerHTML = `
      <div class="expense-row-desc">${statusBadge}${expense.description}</div>
      <div class="expense-row-date">${dateLabel}</div>
      ${expense.recurring && freqLabel
        ? `<span class="expense-row-recur">↻ ${freqLabel}${dueDayStr}${thresholdBadge ? ' ' + thresholdBadge : ''}</span>`
        : thresholdBadge ? `<span class="expense-row-recur">${thresholdBadge}</span>` : ''}
      <div class="expense-row-amount">${fmtCents.format(expense.amount)}</div>
      <div class="expense-row-actions">
        ${isBill && billStatus?.status !== 'paid'
          ? `<button class="mark-paid-btn" data-action="mark-paid" data-testid="expense-mark-paid" title="Mark as paid for this month">✓ Mark Paid</button>`
          : ''}
        <button class="icon-btn" data-action="edit" data-testid="expense-edit" title="Edit">✏️</button>
        <button class="icon-btn danger" data-action="delete" data-testid="expense-delete" title="Delete">🗑️</button>
      </div>
    `;

    if (isBill && billStatus?.status !== 'paid') {
      row.querySelector('[data-action="mark-paid"]')!.addEventListener('click', () => {
        this.openMarkPaidForm(expense);
      });
    }

    row.querySelector('[data-action="edit"]')!.addEventListener('click', () =>
      this.openExpenseForm(expense),
    );
    row.querySelector('[data-action="delete"]')!.addEventListener('click', async () => {
      if (!confirm(`Delete "${expense.description}"?`)) return;
      await deleteExpense(expense.id);
      await this.load();
    });

    // Wrap in a status container if this is a tracked bill
    if (!billStatus || billStatus.status === 'ok') return row;

    const wrap = document.createElement('div');
    const wrapClass = billStatus.status === 'past-due' ? 'expense-bill-wrap--past-due'
      : billStatus.status === 'due-soon' ? 'expense-bill-wrap--due-soon'
      : 'expense-bill-wrap--paid';
    wrap.className = `expense-bill-wrap ${wrapClass}`;
    wrap.setAttribute('data-testid', 'expense-bill-wrap');
    wrap.appendChild(row);
    return wrap;
  }

  // ── Mark Paid form ─────────────────────────────────────────────────────

  private openMarkPaidForm(expense: Expense): void {
    const body = document.createElement('div');
    body.className = 'expense-form';

    const hasThreshold = expense.threshold != null && expense.threshold > 0;
    const currFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
    const thresholdDisplay = hasThreshold ? currFmt.format(expense.threshold!) : null;

    body.innerHTML = `
      <p class="text-sm text-muted" style="margin-bottom:var(--space-3)">
        How much was the actual bill for <strong>${expense.description}</strong>?
      </p>
      <div class="form-group">
        <label class="form-label" for="mp-amount">Amount paid</label>
        <input id="mp-amount" type="number" min="0" step="0.01"
          value="${expense.amount.toFixed(2)}" />
        ${hasThreshold ? `<span class="form-hint">Monthly target: ${thresholdDisplay}</span>` : ''}
      </div>
      <div id="mp-overage-msg" style="display:none"></div>
    `;

    const amountInput = body.querySelector<HTMLInputElement>('#mp-amount')!;
    const overageMsg = body.querySelector<HTMLElement>('#mp-overage-msg')!;

    if (hasThreshold) {
      amountInput.addEventListener('input', () => {
        const val = parseFloat(amountInput.value);
        if (!isNaN(val) && val > expense.threshold!) {
          const over = val - expense.threshold!;
          overageMsg.textContent = `⚠ Over target by ${currFmt.format(over)}`;
          overageMsg.style.display = 'block';
          overageMsg.style.color = 'var(--color-danger)';
          overageMsg.style.fontSize = 'var(--text-xs)';
          overageMsg.style.marginTop = 'var(--space-1)';
        } else {
          overageMsg.style.display = 'none';
        }
      });
    }

    openFormModal({
      title: `Mark Paid — ${expense.description}`,
      body,
      submitLabel: 'Mark as Paid',
      onSubmit: async (close) => {
        const rawAmount = parseFloat(amountInput.value);
        if (isNaN(rawAmount) || rawAmount < 0) return;
        const paidAmount = Math.round(rawAmount * 100) / 100;
        const record = createExpensePaidRecord(expense.id, paidAmount);
        await Promise.all([
          saveExpense({ ...expense, date: Date.now() }),
          saveExpensePaidRecord(record),
        ]);
        close();
        await this.load();
        refreshNotifier();

        if (expense.threshold != null && paidAmount > expense.threshold) {
          const overCount = await getOverageTrend(expense.id, expense.threshold);
          if (overCount >= 2) {
            const fmtThreshold = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(expense.threshold);
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
        <label class="form-label" for="ef-desc">Description</label>
        <input id="ef-desc" type="text" value="${existing?.description ?? ''}"
          placeholder="e.g. Rent, Groceries, Netflix" maxlength="64" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="ef-amount">Amount</label>
          <input id="ef-amount" type="number" min="0" step="0.01"
            value="${existing?.amount ?? ''}" placeholder="0.00" />
        </div>
        <div class="form-group">
          <label class="form-label" for="ef-date">Date</label>
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
            <label class="form-label" for="ef-dueday">Due day <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
            <input id="ef-dueday" type="number" min="1" max="28" step="1"
              value="${existing?.dueDay ?? ''}" placeholder="e.g. 15" />
            <span class="form-hint">Day of month this bill is due (1–28)</span>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="ef-threshold">Monthly threshold <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
          <input id="ef-threshold" type="number" min="0" step="0.01"
            value="${existing?.threshold ?? ''}" placeholder="e.g. 200.00" />
          <span class="form-hint">Alert when this bill's actual cost exceeds this amount</span>
        </div>
      </div>
      <div id="ef-error" class="form-error" style="display:none"></div>
    `;

    const recurChk = body.querySelector<HTMLInputElement>('#ef-recurring')!;
    const recurDetails = body.querySelector<HTMLElement>('#ef-recur-details')!;
    recurChk.addEventListener('change', () => {
      recurDetails.style.display = recurChk.checked ? '' : 'none';
    });

    openFormModal({
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
        const dueDayRaw = parseInt(body.querySelector<HTMLInputElement>('#ef-dueday')?.value ?? '');
        const dueDay = recurring && !isNaN(dueDayRaw) && dueDayRaw >= 1 && dueDayRaw <= 28
          ? dueDayRaw : undefined;
        const thresholdRaw = parseFloat(body.querySelector<HTMLInputElement>('#ef-threshold')?.value ?? '');
        const threshold = recurring && !isNaN(thresholdRaw) && thresholdRaw > 0 ? thresholdRaw : undefined;
        const errEl = body.querySelector<HTMLElement>('#ef-error')!;

        if (!description) { errEl.textContent = 'Description is required.'; errEl.style.display = 'block'; return; }
        if (isNaN(amount) || amount < 0) { errEl.textContent = 'Enter a valid amount.'; errEl.style.display = 'block'; return; }
        if (!dateStr) { errEl.textContent = 'Date is required.'; errEl.style.display = 'block'; return; }

        const date = new Date(dateStr).getTime();

        const expense: Expense = existing
          ? { ...existing, description, amount, date, categoryId, memberId, recurring, recurringFrequency }
          : { ...createExpense(categoryId, description, amount, date, memberId), recurring, recurringFrequency };

        if (dueDay != null) expense.dueDay = dueDay;
        else delete expense.dueDay;

        if (threshold != null) expense.threshold = threshold;
        else delete expense.threshold;

        await saveExpense(expense);
        close();
        await this.load();

        // Trigger minimum-payment-trap mascot if this is a high recurring expense
        if (recurring && amount >= 500) {
          setTimeout(() => showMascot('budget-milestone', { category: categoryId ? (this.categories.find(c => c.id === categoryId)?.name ?? 'this') : 'this' }), 800);
        }
      },
    });
  }
}
