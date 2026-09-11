import {
  saveCardCharge, deleteCardCharge, createCardCharge, saveDebtAccount,
  getExpensePaidRecords, deleteExpensePaidRecord,
} from '@/db';
import { openFormModal } from '@/components/Modal';
import { fmtCents } from '@/utils/finance';
import type { DebtAccount, CardCharge, ExpenseCategory } from '@/types';
import { userLocale } from '@/utils/locale';

type ChargesState = { page: number; pageSize: number; sortAsc: boolean };

function getChargesState(
  chargesPageState: Map<string, ChargesState>,
  id: string,
): ChargesState {
  if (!chargesPageState.has(id)) {
    chargesPageState.set(id, { page: 0, pageSize: 10, sortAsc: false });
  }
  return chargesPageState.get(id)!;
}

function openEditChargeModal(
  a: DebtAccount,
  ch: CardCharge,
  expenseCategories: ExpenseCategory[],
  onSaved: (accountId: string) => Promise<void>,
): void {
  const d = new Date(ch.date);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const catOptions = expenseCategories
    .filter((c) => c.parentId === null)
    .map((c) => `<option value="${c.id}"${c.id === ch.categoryId ? ' selected' : ''}>${c.name}</option>`)
    .join('');

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
      <div class="form-group" style="grid-column:1/-1">
        <label class="form-label" for="ch-merchant">Merchant / Vendor <span class="req">*</span></label>
        <input id="ch-merchant" type="text" value="${ch.merchant}" placeholder="e.g. Amazon, Whole Foods, Netflix" maxlength="60" data-testid="debt-charge-merchant" />
      </div>
      <div class="form-group">
        <label class="form-label" for="ch-amount">Amount <span class="req">*</span></label>
        <input id="ch-amount" type="number" min="0.01" step="0.01" value="${ch.amount}" data-testid="debt-charge-amount" />
      </div>
      <div class="form-group">
        <label class="form-label" for="ch-date">Date <span class="req">*</span></label>
        <input id="ch-date" type="date" value="${dateStr}" data-testid="debt-charge-date" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="ch-cat">Category <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
      <select id="ch-cat" data-testid="debt-charge-cat">
        <option value="">— None —</option>
        ${catOptions}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label" for="ch-note">Note <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
      <input id="ch-note" type="text" value="${ch.note ?? ''}" placeholder="e.g. Annual Prime membership" maxlength="80" data-testid="debt-charge-note" />
    </div>
    <div id="ch-error" class="form-error" style="display:none" data-testid="debt-charge-error"></div>
  `;

  openFormModal({
    title: `Edit Charge — ${a.name}`,
    body,
    submitLabel: 'Save Changes',
    onSubmit: async (close) => {
      const merchant   = body.querySelector<HTMLInputElement>('#ch-merchant')!.value.trim();
      const amount     = parseFloat(body.querySelector<HTMLInputElement>('#ch-amount')!.value);
      const dateVal    = body.querySelector<HTMLInputElement>('#ch-date')!.value;
      const categoryId = body.querySelector<HTMLSelectElement>('#ch-cat')!.value || undefined;
      const note       = body.querySelector<HTMLInputElement>('#ch-note')!.value.trim() || undefined;
      const errEl      = body.querySelector<HTMLElement>('#ch-error')!;

      errEl.style.display = 'none';
      const missing: string[] = [];
      if (!merchant)                    missing.push('Merchant / Vendor');
      if (isNaN(amount) || amount <= 0) missing.push('Amount');
      if (!dateVal)                     missing.push('Date');
      if (missing.length > 0) {
        errEl.textContent = missing.length === 1
          ? `${missing[0]} is required.`
          : `Fill in all required fields: ${missing.join(', ')}.`;
        errEl.style.display = 'block';
        return;
      }

      const date = new Date(dateVal + 'T12:00:00').getTime();
      const amountDelta = amount - ch.amount;
      const updated: CardCharge = { ...ch, merchant, amount, date };
      if (categoryId) updated.categoryId = categoryId; else delete updated.categoryId;
      if (note)       updated.note = note;              else delete updated.note;

      await Promise.all([
        saveCardCharge(updated),
        ...(amountDelta !== 0
          ? [saveDebtAccount({ ...a, balance: a.balance + amountDelta, updatedAt: Date.now() })]
          : []),
      ]);
      close();
      await onSaved(a.id);
    },
  });
}

function openAddChargeModal(
  a: DebtAccount,
  expenseCategories: ExpenseCategory[],
  onSaved: (accountId: string) => Promise<void>,
): void {
  const today = new Date().toISOString().split('T')[0]!;
  const catOptions = expenseCategories
    .filter((c) => c.parentId === null)
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join('');

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
      <div class="form-group" style="grid-column:1/-1">
        <label class="form-label" for="ch-merchant">Merchant / Vendor <span class="req">*</span></label>
        <input id="ch-merchant" type="text" placeholder="e.g. Amazon, Whole Foods, Netflix" maxlength="60" data-testid="debt-charge-merchant" />
      </div>
      <div class="form-group">
        <label class="form-label" for="ch-amount">Amount <span class="req">*</span></label>
        <input id="ch-amount" type="number" min="0.01" step="0.01" placeholder="0.00" data-testid="debt-charge-amount" />
      </div>
      <div class="form-group">
        <label class="form-label" for="ch-date">Date <span class="req">*</span></label>
        <input id="ch-date" type="date" value="${today}" data-testid="debt-charge-date" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="ch-cat">Category <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
      <select id="ch-cat" data-testid="debt-charge-cat">
        <option value="">— None —</option>
        ${catOptions}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label" for="ch-note">Note <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
      <input id="ch-note" type="text" placeholder="e.g. Annual Prime membership" maxlength="80" data-testid="debt-charge-note" />
    </div>
    <div id="ch-error" class="form-error" style="display:none" data-testid="debt-charge-error"></div>
  `;

  openFormModal({
    title: `Add Charge — ${a.name}`,
    body,
    submitLabel: 'Log Charge',
    onSubmit: async (close) => {
      const merchant   = body.querySelector<HTMLInputElement>('#ch-merchant')!.value.trim();
      const amount     = parseFloat(body.querySelector<HTMLInputElement>('#ch-amount')!.value);
      const dateStr    = body.querySelector<HTMLInputElement>('#ch-date')!.value;
      const categoryId = body.querySelector<HTMLSelectElement>('#ch-cat')!.value || undefined;
      const note       = body.querySelector<HTMLInputElement>('#ch-note')!.value.trim() || undefined;
      const errEl      = body.querySelector<HTMLElement>('#ch-error')!;

      errEl.style.display = 'none';
      const missing: string[] = [];
      if (!merchant)                    missing.push('Merchant / Vendor');
      if (isNaN(amount) || amount <= 0) missing.push('Amount');
      if (!dateStr)                     missing.push('Date');
      if (missing.length > 0) {
        errEl.textContent = missing.length === 1
          ? `${missing[0]} is required.`
          : `Fill in all required fields: ${missing.join(', ')}.`;
        errEl.style.display = 'block';
        return;
      }

      const date = new Date(dateStr + 'T12:00:00').getTime();
      const charge = createCardCharge(a.id, merchant, amount, date, categoryId, note);
      await Promise.all([
        saveCardCharge(charge),
        saveDebtAccount({ ...a, balance: a.balance + amount, updatedAt: Date.now() }),
      ]);
      close();
      await onSaved(a.id);
    },
  });
}

export function buildChargesPanel(
  a: DebtAccount,
  charges: CardCharge[],
  expenseCategories: ExpenseCategory[],
  chargesPageState: Map<string, ChargesState>,
  onRepaint: () => void,
  onSaved: (accountId: string) => Promise<void>,
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'charges-panel';
  panel.setAttribute('data-testid', 'debt-charges-panel');

  const header = document.createElement('div');
  header.className = 'charges-panel-header';
  const totalCharged = charges.reduce((s, c) => s + c.amount, 0);
  const summarySpan = document.createElement('span');
  summarySpan.textContent = charges.length > 0
    ? `${charges.length} charge${charges.length !== 1 ? 's' : ''} · ${fmtCents.format(totalCharged)} total`
    : 'No charges logged yet';
  header.appendChild(summarySpan);
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-secondary btn-sm';
  addBtn.textContent = '+ Add charge';
  addBtn.addEventListener('click', () => openAddChargeModal(a, expenseCategories, onSaved));
  header.appendChild(addBtn);
  panel.appendChild(header);

  if (charges.length === 0) return panel;

  const state = getChargesState(chargesPageState, a.id);

  const controls = document.createElement('div');
  controls.className = 'charges-controls';

  const sortBtn = document.createElement('button');
  sortBtn.className = 'charges-sort-btn';
  sortBtn.textContent = state.sortAsc ? '↑ Oldest first' : '↓ Newest first';
  sortBtn.addEventListener('click', () => {
    const s = getChargesState(chargesPageState, a.id);
    s.sortAsc = !s.sortAsc;
    s.page = 0;
    onRepaint();
  });

  const pageSizeWrap = document.createElement('div');
  pageSizeWrap.className = 'charges-page-size-wrap';
  const sizeLabel = document.createElement('span');
  sizeLabel.className = 'charges-page-size-label';
  sizeLabel.textContent = 'Show:';
  const sizeSelect = document.createElement('select');
  sizeSelect.className = 'charges-page-size-select';
  [['10','10'],['25','25'],['50','50'],['100','100'],['0','All']].forEach(([v, l]) => {
    const opt = document.createElement('option');
    opt.value = v!;
    opt.textContent = l!;
    opt.selected = state.pageSize === parseInt(v!);
    sizeSelect.appendChild(opt);
  });
  sizeSelect.addEventListener('change', () => {
    const s = getChargesState(chargesPageState, a.id);
    s.pageSize = parseInt(sizeSelect.value);
    s.page = 0;
    onRepaint();
  });
  pageSizeWrap.appendChild(sizeLabel);
  pageSizeWrap.appendChild(sizeSelect);
  controls.appendChild(sortBtn);
  controls.appendChild(pageSizeWrap);
  panel.appendChild(controls);

  const merchantTotals = new Map<string, number>();
  charges.forEach((c) => merchantTotals.set(c.merchant, (merchantTotals.get(c.merchant) ?? 0) + c.amount));
  const breakdown = document.createElement('div');
  breakdown.className = 'charges-breakdown';
  [...merchantTotals.entries()].sort((a, b) => b[1] - a[1]).forEach(([merchant, total]) => {
    const row = document.createElement('div');
    row.className = 'charges-breakdown-row';
    row.innerHTML = `<span class="charges-merchant">${merchant}</span><span class="charges-total">${fmtCents.format(total)}</span>`;
    breakdown.appendChild(row);
  });
  panel.appendChild(breakdown);

  const sorted = [...charges].sort((x, y) => state.sortAsc ? x.date - y.date : y.date - x.date);
  const pageSize = state.pageSize === 0 ? sorted.length : state.pageSize;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(state.page, totalPages - 1);
  state.page = page;

  const catMap = new Map(expenseCategories.map((c) => [c.id, c]));
  const list = document.createElement('div');
  list.className = 'charges-list';

  sorted.slice(page * pageSize, page * pageSize + pageSize).forEach((ch) => {
    const item = document.createElement('div');
    item.className = 'charges-item';
    item.setAttribute('data-charge-id', ch.id);
    item.setAttribute('data-testid', 'debt-charge-item');
    const dateStr = new Date(ch.date).toLocaleDateString(userLocale, { month: 'short', day: 'numeric', year: 'numeric' });
    const cat = ch.categoryId ? catMap.get(ch.categoryId) : null;

    const dateSpan = document.createElement('span');
    dateSpan.className = 'charges-item-date';
    dateSpan.textContent = dateStr;

    const mainCol = document.createElement('div');
    mainCol.className = 'charges-item-main';

    const merchantSpan = document.createElement('span');
    merchantSpan.className = 'charges-item-merchant';
    merchantSpan.textContent = ch.merchant;
    mainCol.appendChild(merchantSpan);

    if (ch.note) {
      const noteSpan = document.createElement('span');
      noteSpan.className = 'charges-item-note';
      noteSpan.textContent = ch.note;
      noteSpan.title = 'Click to expand / collapse';
      noteSpan.addEventListener('click', () => noteSpan.classList.toggle('expanded'));
      mainCol.appendChild(noteSpan);
    }

    const amountSpan = document.createElement('span');
    amountSpan.className = 'charges-item-amount';
    amountSpan.textContent = fmtCents.format(ch.amount);

    item.appendChild(dateSpan);
    item.appendChild(mainCol);
    item.appendChild(amountSpan);

    if (cat) {
      const catSpan = document.createElement('span');
      catSpan.className = 'charges-item-cat';
      catSpan.style.cssText = `background:${cat.color}20;color:${cat.color};border:1px solid ${cat.color}40`;
      catSpan.textContent = cat.name;
      item.appendChild(catSpan);
    }

    if (ch.sourceExpenseId) {
      const autoBadge = document.createElement('span');
      autoBadge.className = 'charges-item-auto';
      autoBadge.setAttribute('data-testid', 'charge-auto-badge');
      autoBadge.title = 'Auto-created from a linked expense';
      autoBadge.textContent = 'Auto';
      item.appendChild(autoBadge);
    }

    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.title = 'Edit charge';
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', () => openEditChargeModal(a, ch, expenseCategories, onSaved));

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger';
    delBtn.title = 'Remove charge';
    delBtn.textContent = '🗑️';
    delBtn.addEventListener('click', async () => {
      if (!confirm(`Remove ${fmtCents.format(ch.amount)} charge from ${ch.merchant}?`)) return;
      const ops: Promise<unknown>[] = [
        deleteCardCharge(ch.id),
        saveDebtAccount({ ...a, balance: a.balance - ch.amount, updatedAt: Date.now() }),
      ];
      if (ch.sourceExpenseId) {
        // Remove the expense paid record that auto-created this charge
        const paidRecs = await getExpensePaidRecords(ch.sourceExpenseId);
        const linked = paidRecs.find((r) => r.cardId === ch.accountId);
        if (linked) ops.push(deleteExpensePaidRecord(linked.id));
      }
      await Promise.all(ops);
      await onSaved(a.id);
    });
    item.appendChild(editBtn);
    item.appendChild(delBtn);
    list.appendChild(item);
  });
  panel.appendChild(list);

  if (totalPages > 1) {
    const pgRow = document.createElement('div');
    pgRow.className = 'charges-pagination';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'charges-page-btn';
    prevBtn.textContent = '← Prev';
    prevBtn.disabled = page === 0;
    prevBtn.addEventListener('click', () => { getChargesState(chargesPageState, a.id).page--; onRepaint(); });

    const info = document.createElement('span');
    info.className = 'charges-page-info';
    info.textContent = `Page ${page + 1} of ${totalPages}`;

    const nextBtn = document.createElement('button');
    nextBtn.className = 'charges-page-btn';
    nextBtn.textContent = 'Next →';
    nextBtn.disabled = page >= totalPages - 1;
    nextBtn.addEventListener('click', () => { getChargesState(chargesPageState, a.id).page++; onRepaint(); });

    pgRow.appendChild(prevBtn);
    pgRow.appendChild(info);
    pgRow.appendChild(nextBtn);
    panel.appendChild(pgRow);
  }

  return panel;
}
