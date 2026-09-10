import {
  saveCategory, deleteCategory, createCategory,
  getCardCharges, saveCardCharge,
} from '@/db';
import { openFormModal } from '@/components/Modal';
import { CATEGORY_COLORS } from '@/utils/finance';
import { saveExpense } from '@/db';
import type { ExpenseCategory, Expense, DebtAccount } from '@/types';

export function openCategoryForm(
  existing: ExpenseCategory | undefined,
  categories: ExpenseCategory[],
  cardAccounts: DebtAccount[],
  onSaved: () => Promise<void>,
): void {
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

  if (cardAccounts.length > 0) {
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
    cardAccounts.forEach((a) => {
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
      const duplicate = categories.find(
        (c) => c.name.toLowerCase() === nameLower && c.id !== existing?.id,
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
      await onSaved();
    },
  });
}

export function buildCategoriesCard(
  categories: ExpenseCategory[],
  expenses: Expense[],
  activeCategoryId: string | null,
  onRemoved: (categoryId: string) => Promise<void>,
  onOpenForm: (existing?: ExpenseCategory) => void,
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';

  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4)';
  titleRow.innerHTML = '<h2 class="font-serif" style="font-size:var(--text-xl)">Categories</h2>';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-secondary';
  addBtn.setAttribute('data-testid', 'add-category-btn');
  addBtn.textContent = '+ New category';
  addBtn.addEventListener('click', () => onOpenForm());
  titleRow.appendChild(addBtn);
  card.appendChild(titleRow);

  if (categories.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-muted text-sm';
    empty.textContent = 'No categories yet. Create one to start organizing expenses.';
    card.appendChild(empty);
    return card;
  }

  const row = document.createElement('div');
  row.className = 'category-manage-row';

  categories.forEach((cat) => {
    const pill = document.createElement('div');
    pill.className = 'category-pill-manage';
    pill.setAttribute('data-testid', 'category-pill');
    pill.setAttribute('data-category-id', cat.id);
    pill.setAttribute('role', 'button');
    pill.setAttribute('tabindex', '0');
    pill.title = cat.description ? `${cat.description}\n\nClick to edit` : `Edit ${cat.name}`;
    pill.addEventListener('click', () => onOpenForm(cat));
    pill.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') onOpenForm(cat); });

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
      const inUse = expenses.some((ex) => ex.categoryId === cat.id);
      if (inUse && !confirm(`"${cat.name}" has expenses. Remove the category anyway? (Expenses won't be deleted)`)) return;
      await Promise.all(
        expenses
          .filter((ex) => ex.categoryId === cat.id)
          .map((ex) => saveExpense({ ...ex, categoryId: '' })),
      );
      const allCharges = await getCardCharges();
      await Promise.all(
        allCharges
          .filter((ch) => ch.categoryId === cat.id)
          .map((ch) => { const { categoryId: _, ...rest } = ch; return saveCardCharge(rest as typeof ch); }),
      );
      await Promise.all(
        categories
          .filter((c) => c.parentId === cat.id)
          .map((c) => saveCategory({ ...c, parentId: null })),
      );
      await deleteCategory(cat.id);
      await onRemoved(cat.id);
    });
    pill.appendChild(removeBtn);
    row.appendChild(pill);
  });

  card.appendChild(row);
  return card;
}
