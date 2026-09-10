import {
  saveExpense, createExpense,
  findChargeByExpenseId, saveCardCharge, deleteCardCharge, createCardCharge,
} from '@/db';
import { openFormModal } from '@/components/Modal';
import { navigate } from '@/app/router';
import { FREQUENCY_OPTIONS } from '@/utils/finance';
import { escapeHtml } from '@/utils/escapeHtml';

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
import { computeNextDue } from '@/utils/billStatus';
import { refreshNotifier } from '@/utils/notifier';
import { buildLinkedRemindersSection } from '@/utils/notificationModal';
import type { ExpenseCategory, Expense, IncomeFrequency, HouseholdMember, DebtAccount, BankAccount } from '@/types';

function freqInterval(freq: string | null | undefined): number {
  if (freq === 'quarterly') return 3;
  if (freq === 'annual')    return 12;
  return 1;
}

export async function syncLinkedCharge(expense: Expense, _prevLinkedCardId?: string): Promise<void> {
  const newCardId = expense.linkedCardId ?? null;
  const existing = await findChargeByExpenseId(expense.id);

  if (!newCardId) {
    if (existing) await deleteCardCharge(existing.id);
    return;
  }

  if (existing && existing.accountId === newCardId) {
    const { categoryId: _cat, ...existingBase } = existing;
    await saveCardCharge({
      ...existingBase,
      merchant: expense.description,
      amount: expense.amount,
      date: expense.date,
      ...(expense.categoryId ? { categoryId: expense.categoryId } : {}),
    });
  } else {
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

  const today = new Date().toISOString().split('T')[0];
  const existingDate = existing
    ? new Date(existing.date).toISOString().split('T')[0]
    : today;

  const defaultDueDate = (() => {
    if (!existing?.dueDay) return '';
    const lastPaid = new Date(existing.date);
    const interval = freqInterval(existing.recurringFrequency);
    const next = computeNextDue(lastPaid, existing.dueDay, interval);
    return next.toISOString().split('T')[0];
  })();

  const catOptions = [
    `<option value="" ${!existing?.categoryId ? 'selected' : ''}>— No category —</option>`,
    ...categories.map(
      (c) => `<option value="${c.id}" ${existing?.categoryId === c.id ? 'selected' : ''}>${c.name}</option>`,
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
          <input id="ef-duedate" type="date" value="${defaultDueDate}"
            title="Your next billing due date — sets the recurring day and payment reminders on the calendar" />
          <span class="form-hint">Pick the date this bill is first (or next) due — sets the recurring billing day automatically</span>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="ef-threshold">
          Alert threshold
          <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span>
        </label>
        <input id="ef-threshold" type="number" min="0" step="0.01"
          value="${existing?.threshold ?? ''}" placeholder="e.g. 120.00"
          title="Alert threshold — warns you when the actual payment recorded exceeds this amount. Leave blank to alert based on the estimated amount instead." />
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
      await syncLinkedCharge(expense, existing?.linkedCardId);
      await flushReminders(expense.id);
      close();
      await onSaved();
      void refreshNotifier();
    },
  });
  expenseModalRef.close = closeExpenseModal;
}
