import {
  saveExpense, createExpense,
  findChargeByExpenseId,
} from '@/db';
import { accounting } from '@/accounting';
import { openFormModal, showMissingFieldsError } from '@/components/Modal';
import { navigate } from '@/app/router';
import { FREQUENCY_OPTIONS, freqThresholdLabel, freqInterval } from '@/utils/finance';
import { escapeHtml } from '@/utils/escapeHtml';
import { computeNextDue } from '@/utils/billStatus';
import { todayDateInput, timestampToDateInput } from '@/utils/dateInput';
import { refreshNotifier } from '@/utils/notifier';
import { buildLinkedRemindersSection } from '@/utils/notificationModal';
import type { ExpenseCategory, Expense, IncomeFrequency, HouseholdMember, DebtAccount, BankAccount } from '@/types';


export async function syncLinkedCharge(expense: Expense, _prevLinkedCardId?: string): Promise<void> {
  const newCardId = expense.linkedCardId ?? null;
  const existing = await findChargeByExpenseId(expense.id);

  if (!newCardId) {
    if (existing) await accounting.deleteCharge(existing.id);
    return;
  }

  // Billing hasn't started yet — don't post a charge for a bill that isn't
  // actually due. Without this, linking a card to a recurring expense whose
  // first due date is still in the future posted a real charge immediately on
  // save, dated at expense.date — this was the actual source of "the ledger
  // shows billed on the start date," independent of (and not caught by) the
  // autoRecordAutoPay/enumerateLapsedExpenseCycles guards, since this runs
  // unconditionally on every save, not just on catch-up/auto-pay passes.
  if (expense.notYetBilled && !existing) return;

  if (existing && existing.accountId === newCardId) {
    await accounting.updateCharge({
      chargeId: existing.id,
      amount: expense.amount,
      date: existing.date,  // preserve the original charge date; only amount/description sync here
      description: expense.description,
      categoryId: expense.categoryId ?? null,
    });
  } else {
    if (existing) await accounting.deleteCharge(existing.id);
    await accounting.recordCharge({
      accountId: newCardId,
      description: expense.description,
      amount: expense.amount,
      date: expense.date,
      ...(expense.categoryId ? { categoryId: expense.categoryId } : {}),
      sourceExpenseId: expense.id,
    });
  }
}

export function openExpenseForm(
  existing: Expense | undefined,
  categories: ExpenseCategory[],
  members: HouseholdMember[],
  cardAccounts: DebtAccount[],
  bankAccounts: BankAccount[],
  onSaved: () => Promise<void>,
): void {
  const isEdit = !!existing;
  const body = document.createElement('div');
  body.className = 'expense-form';

  const today = todayDateInput();
  // One date field, always required, for recurring and one-time expenses alike.
  // If billing hasn't started yet, show the stored due date directly; for an
  // ongoing recurring bill, show the next upcoming due date computed forward
  // from the anchor; for a one-time expense, just show its date.
  const existingDueDate = (() => {
    if (!existing) return today;
    if (existing.notYetBilled || !existing.recurring || !existing.dueDay) {
      return timestampToDateInput(existing.date);
    }
    const next = computeNextDue(new Date(existing.date), existing.dueDay, freqInterval(existing.recurringFrequency));
    return timestampToDateInput(next.getTime());
  })();

  const catOptions = [
    `<option value="" ${!existing?.categoryId ? 'selected' : ''}>— No category —</option>`,
    ...categories.map(
      (c) => `<option value="${c.id}" ${existing?.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`,
    ),
  ].join('');

  const memberOptions = [
    `<option value="" ${!existing?.memberId ? 'selected' : ''}>— All / household —</option>`,
    ...members.map(
      (m) => `<option value="${m.id}" ${existing?.memberId === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`,
    ),
  ].join('');

  const freqOptions = FREQUENCY_OPTIONS.map(
    (f) => `<option value="${f.value}" ${(existing?.recurringFrequency ?? 'monthly') === f.value ? 'selected' : ''}>${f.label}</option>`,
  ).join('');

  body.innerHTML = `
    <div class="form-group">
      <label class="form-label" for="ef-desc">Description <span class="req">*</span></label>
      <input id="ef-desc" type="text" value="${escapeHtml(existing?.description ?? '')}"
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
          value="${existing?.amount != null ? existing.amount.toFixed(2) : ''}" placeholder="0.00" />
      </div>
      <div class="form-group">
        <label class="form-label" for="ef-date">First Due Date <span class="req">*</span></label>
        <input id="ef-date" type="date" value="${existingDueDate}" />
        <span class="form-hint">When this is (or will be) due. Anchors the billing cycle for recurring expenses — can be in any future month.</span>
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
      <div class="form-group">
        <label class="form-label" for="ef-freq">Repeats</label>
        <select id="ef-freq">${freqOptions}</select>
      </div>
      <div class="form-group" style="flex-direction:row;align-items:center;gap:var(--space-3)">
        <input id="ef-fixed-amount" type="checkbox" style="width:auto" ${existing?.isFixedAmount ? 'checked' : ''} />
        <label for="ef-fixed-amount" style="text-transform:none;letter-spacing:0;font-size:var(--text-sm)">
          Fixed rate — amount never varies (e.g. insurance, subscriptions)
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
    const labelText = recurChk.checked ? `${freqThresholdLabel(freq)} Amount` : 'Estimated Amount';
    amountLabel.childNodes[0]!.nodeValue = labelText + ' ';
  };
  recurChk.addEventListener('change', () => {
    recurDetails.style.display = recurChk.checked ? '' : 'none';
    updateAmountLabel();
  });
  body.querySelector<HTMLSelectElement>('#ef-freq')?.addEventListener('change', updateAmountLabel);
  updateAmountLabel();

  const catSel = body.querySelector<HTMLSelectElement>('#ef-cat')!;
  let efCardSel: HTMLSelectElement | null = null;
  let autoCardId: string;

  if (cardAccounts.length > 0) {
    const initialCat = categories.find((c) => c.id === (existing?.categoryId ?? ''));
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
    cardAccounts.forEach((a) => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      opt.selected = a.id === autoCardId;
      efCardSel!.appendChild(opt);
    });
    cardGroup.appendChild(cardLabel);
    cardGroup.appendChild(efCardSel);

    catSel.addEventListener('change', () => {
      if (efCardSel!.value !== autoCardId) return;
      const newCat = categories.find((c) => c.id === catSel.value);
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
  if (bankAccounts.length > 0) {
    efBankAccountSel = document.createElement('select');
    efBankAccountSel.id = 'ef-bank-account';
    efBankAccountSel.setAttribute('data-testid', 'ef-bank-account-select');
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '— No account —';
    efBankAccountSel.appendChild(noneOpt);
    bankAccounts.forEach((a) => {
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
  const recurGroup2 = recurChk.closest('.form-group') ?? recurChk.parentElement!;
  body.insertBefore(bankAccountGroup, recurGroup2);

  // ── Mutual exclusion: card ↔ bank account ────────────────────────────────
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
      const isFixedAmount = recurring ? (body.querySelector<HTMLInputElement>('#ef-fixed-amount')?.checked ?? false) : false;
      const isAutoPay = recurring ? (body.querySelector<HTMLInputElement>('#ef-autopay')?.checked ?? false) : false;
      const url = body.querySelector<HTMLInputElement>('#ef-url')!.value.trim() || undefined;
      const errEl = body.querySelector<HTMLElement>('#ef-error')!;

      const missing: string[] = [];
      if (!description)                missing.push('Description');
      if (isNaN(amount) || amount < 0) missing.push('Amount');
      if (!dateStr)                    missing.push('First Due Date');
      if (showMissingFieldsError(errEl, missing)) return;

      const dueDate = new Date(dateStr + 'T00:00:00');
      const dueDay = recurring ? dueDate.getDate() : undefined;

      // Editing an already-tracked recurring bill without changing its due
      // day: the date field shows a *computed preview* (the next upcoming due
      // date, or the still-pending first due date), not something meant to be
      // written back as a new anchor on every save — doing so would silently
      // advance/reset the real billing anchor just from editing an unrelated
      // field like the description. Preserve the real anchor and billed-state
      // in that case; everything else (a genuine new bill, a one-time expense,
      // recurring just turned on, or the due day actually changed) computes a
      // fresh date/notYetBilled directly from what was entered — no
      // anchor-shifting needed, computeNextDue/computeBillStatus/
      // autoRecordAutoPay all treat it correctly whether it's in the past,
      // today, or the future, as long as notYetBilled is set (see billStatus.ts).
      const preserveAnchor = !!existing && existing.recurring && recurring && dueDay === existing.dueDay;
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      let date: number;
      let notYetBilled: boolean;
      if (preserveAnchor) {
        date = existing!.date;
        notYetBilled = !!existing!.notYetBilled;
      } else {
        date = dueDate.getTime();
        // Recurring: nothing has ever been billed for this tracked cycle yet,
        // regardless of whether the chosen due date is in the past or future —
        // only an actual payment/auto-pay event should ever create the first
        // real ledger entry or linked-card charge (see syncLinkedCharge below),
        // not merely saving this form. One-time: there's no recurring-cycle
        // machinery to guard (computeBillStatus/autoRecordAutoPay/
        // enumerateLapsedExpenseCycles all skip non-recurring expenses
        // outright) — this only matters for syncLinkedCharge, where it should
        // mean exactly "is this dated in the future," so logging a one-time
        // expense for something that already happened still posts its
        // linked-card charge immediately, as before.
        notYetBilled = recurring || dueDate.getTime() > todayMidnight.getTime();
      }

      const linkedCardId = efCardSel?.value || undefined;

      const expense: Expense = existing
        ? { ...existing, description, amount, date, categoryId, memberId, recurring, recurringFrequency }
        : { ...createExpense(categoryId, description, amount, date, memberId), recurring, recurringFrequency };

      if (dueDay != null) expense.dueDay = dueDay;
      else delete expense.dueDay;

      if (notYetBilled) expense.notYetBilled = true;
      else delete expense.notYetBilled;

      if (linkedCardId) expense.linkedCardId = linkedCardId;
      else delete expense.linkedCardId;

      if (isFixedAmount) expense.isFixedAmount = true;
      else delete expense.isFixedAmount;

      if (isAutoPay) expense.isAutoPay = true;
      else delete expense.isAutoPay;

      if (url) expense.url = url;
      else delete expense.url;

      const bankAccountId = efBankAccountSel?.value || undefined;
      if (bankAccountId) expense.bankAccountId = bankAccountId;
      else delete expense.bankAccountId;

      await saveExpense(expense);
      await syncLinkedCharge(expense, existing?.linkedCardId);
      await flushReminders(expense.id);
      close();
      await onSaved();
      void refreshNotifier();
    },
  });
  expenseModalRef.close = closeExpenseModal;
}
