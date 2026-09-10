import { createIncomeSource, saveIncomeSource } from '@/db';
import { createExpense, saveExpense } from '@/db';
import { openFormModal } from '@/components/Modal';
import { escapeHtml } from '@/utils/escapeHtml';
import type { ExpenseCategory, HouseholdMember, IncomeSource, Expense } from '@/types';

type MonthBucket = { year: number; month: number };

function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function openOneTimeIncomeForm(
  bucket: MonthBucket,
  members: HouseholdMember[],
  onSaved: (src: IncomeSource) => void,
): void {
  const body = document.createElement('div');
  body.className = 'expense-form';

  const now = new Date();
  const isCurrentMonth = bucket.year === now.getFullYear() && bucket.month === now.getMonth();
  const defaultDate = isCurrentMonth
    ? toLocalDate(now)
    : toLocalDate(new Date(bucket.year, bucket.month, 1));

  const memberOptions = [
    `<option value="">— No specific member —</option>`,
    ...members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`),
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
      const src = createIncomeSource(memberId || (members[0]?.id ?? ''), name, amount, 'once');
      src.date = date;
      await saveIncomeSource(src);
      close();
      onSaved(src);
    },
  });
}

export function openOneTimeExpenseForm(
  bucket: MonthBucket,
  categories: ExpenseCategory[],
  onSaved: (expense: Expense) => void,
): void {
  const body = document.createElement('div');
  body.className = 'expense-form';

  const now = new Date();
  const isCurrentMonth = bucket.year === now.getFullYear() && bucket.month === now.getMonth();
  const defaultDate = isCurrentMonth
    ? toLocalDate(now)
    : toLocalDate(new Date(bucket.year, bucket.month, 1));

  const catOptions = [
    `<option value="">— No category —</option>`,
    ...categories.map((c) => `<option value="${c.id}">${c.name}</option>`),
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
      close();
      onSaved(expense);
    },
  });
}
