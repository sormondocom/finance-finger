import { openFormModal } from '@/components/Modal';
import { buildLinkedRemindersSection } from '@/utils/notificationModal';
import {
  saveBankAccount, createBankAccount,
  saveAccountTransfer, createAccountTransfer,
} from '@/db';
import { escapeHtml } from '@/utils/escapeHtml';
import type { BankAccount, BankAccountType, BankAccountOwnership, HouseholdMember } from '@/types';

const SERIES_COLORS = [
  '#2D5A27', '#1B2A4A', '#C9A84C', '#B45309', '#7C3AED',
  '#0891B2', '#BE185D', '#374151', '#065F46', '#6B21A8',
];

export function openAccountForm(
  existing: BankAccount | undefined,
  accounts: BankAccount[],
  members: HouseholdMember[],
  onSaved: () => Promise<void>,
): void {
  const isEdit = !!existing;
  const body = document.createElement('div');
  body.className = 'account-form';

  const memberOptions = [
    `<option value="">— Select member —</option>`,
    ...members.map(
      (m) => `<option value="${m.id}" ${existing?.memberId === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`,
    ),
  ].join('');

  const initOwnership = existing?.ownership ?? 'household';
  const defaultColor = existing?.color ?? SERIES_COLORS[accounts.length % SERIES_COLORS.length]!;

  body.innerHTML = `
    <div class="form-group">
      <label class="form-label" for="ba-name">Account name <span class="req">*</span></label>
      <input id="ba-name" type="text" value="${existing?.name ?? ''}"
        placeholder="e.g. Chase Checking, Emergency Fund" maxlength="64" />
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label class="form-label" for="ba-url">Online banking URL <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
        <input id="ba-url" type="url" placeholder="https://chase.com" maxlength="512" />
        <span class="form-hint">Opens as a quick link on the account list.</span>
      </div>
      <div class="form-group" style="flex:0 0 auto">
        <label class="form-label" for="ba-color">Chart color</label>
        <input id="ba-color" type="color" value="${defaultColor}" style="width:48px;height:38px;padding:2px;cursor:pointer;border-radius:var(--radius-sm)"
          title="Chart color — used for this account's line in balance history charts" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="ba-type">Account type <span class="req">*</span></label>
        <select id="ba-type">
          <option value="checking"     ${(existing?.accountType ?? 'checking') === 'checking'     ? 'selected' : ''}>Checking</option>
          <option value="savings"      ${existing?.accountType === 'savings'      ? 'selected' : ''}>Savings</option>
          <option value="money-market" ${existing?.accountType === 'money-market' ? 'selected' : ''}>Money Market</option>
          <option value="cash"         ${existing?.accountType === 'cash'         ? 'selected' : ''}>Cash</option>
          <option value="other"        ${existing?.accountType === 'other'        ? 'selected' : ''}>Other</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="ba-balance">Starting balance <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
        <input id="ba-balance" type="number" step="0.01"
          value="${existing?.balance ?? ''}" placeholder="0.00"
          title="Your current account balance. If left blank, Finance Finger calculates it from linked income and expense transactions." />
        <span class="form-hint">Your balance today. If blank, it will be derived from linked income and expenses.</span>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="ba-ownership">Ownership <span class="req">*</span></label>
      <select id="ba-ownership">
        <option value="household"  ${initOwnership === 'household'  ? 'selected' : ''}>Household (shared)</option>
        <option value="joint"      ${initOwnership === 'joint'      ? 'selected' : ''}>Joint (two members)</option>
        <option value="individual" ${initOwnership === 'individual' ? 'selected' : ''}>Individual (one member)</option>
      </select>
    </div>
    <div class="form-group" id="ba-member-row" style="${initOwnership === 'individual' ? '' : 'display:none'}">
      <label class="form-label" for="ba-member">Account owner <span class="req">*</span></label>
      <select id="ba-member">${memberOptions}</select>
    </div>
    <div id="ba-error" class="form-error" style="display:none"></div>
  `;

  if (existing?.url) body.querySelector<HTMLInputElement>('#ba-url')!.value = existing.url;

  const ownershipSel = body.querySelector<HTMLSelectElement>('#ba-ownership')!;
  const memberRow = body.querySelector<HTMLElement>('#ba-member-row')!;
  ownershipSel.addEventListener('change', () => {
    memberRow.style.display = ownershipSel.value === 'individual' ? '' : 'none';
  });

  let flushReminders: (finalItemId: string) => Promise<void> = async () => {};
  if (isEdit && existing) {
    const { element, flush } = buildLinkedRemindersSection(existing.id, 'account', existing.name);
    body.appendChild(element);
    flushReminders = flush;
  } else {
    const nameInput = body.querySelector<HTMLInputElement>('#ba-name')!;
    const { element, flush } = buildLinkedRemindersSection('', 'account', 'Account', {
      deferred: true,
      getLabel: () => nameInput.value.trim() || 'Account',
    });
    body.appendChild(element);
    flushReminders = flush;
  }

  openFormModal({
    title: isEdit ? 'Edit Account' : 'Add Bank Account',
    body,
    submitLabel: isEdit ? 'Save changes' : 'Add account',
    onSubmit: async (close) => {
      const name = body.querySelector<HTMLInputElement>('#ba-name')!.value.trim();
      const accountType = body.querySelector<HTMLSelectElement>('#ba-type')!.value as BankAccountType;
      const ownership = ownershipSel.value as BankAccountOwnership;
      const memberId = body.querySelector<HTMLSelectElement>('#ba-member')!.value || undefined;
      const balanceStr = body.querySelector<HTMLInputElement>('#ba-balance')!.value;
      const balance = balanceStr ? parseFloat(balanceStr) : undefined;
      const url = body.querySelector<HTMLInputElement>('#ba-url')!.value.trim() || undefined;
      const color = body.querySelector<HTMLInputElement>('#ba-color')!.value || undefined;
      const errEl = body.querySelector<HTMLElement>('#ba-error')!;

      errEl.style.display = 'none';
      const missing: string[] = [];
      if (!name) missing.push('Account name');
      if (ownership === 'individual' && !memberId) missing.push('Account owner');
      if (missing.length > 0) {
        errEl.textContent = missing.length === 1
          ? `${missing[0]} is required.`
          : `Fill in all required fields: ${missing.join(', ')}.`;
        errEl.style.display = 'block';
        return;
      }

      const account: BankAccount = existing
        ? { ...existing, name, accountType, ownership, updatedAt: Date.now() }
        : createBankAccount(name, accountType, ownership);

      if (ownership === 'individual' && memberId) account.memberId = memberId;
      else delete account.memberId;

      if (balance != null && !isNaN(balance)) account.balance = balance;
      else delete account.balance;

      if (url) account.url = url;
      else delete account.url;

      if (color) account.color = color;
      else delete account.color;

      await saveBankAccount(account);
      await flushReminders(account.id);
      close();
      await onSaved();
    },
  });
}

export function openTransferModal(
  fromAccount: BankAccount,
  accounts: BankAccount[],
  onSaved: () => Promise<void>,
): void {
  const body = document.createElement('div');
  body.className = 'account-form';

  const _now = new Date();
  const todayStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;

  const otherAccounts = accounts.filter((a) => a.id !== fromAccount.id);
  const toOptions = otherAccounts.map((a) => `<option value="${a.id}">${a.name}</option>`).join('');

  body.innerHTML = `
    <p class="text-muted text-sm" style="margin-bottom:var(--space-4)">
      Withdrawing from <strong>${fromAccount.name}</strong> and depositing into another account.
    </p>
    <div class="form-group">
      <label class="form-label" for="tr-to-account">Destination account <span class="req">*</span></label>
      <select id="tr-to-account">${toOptions}</select>
    </div>
    <div class="form-row">
      <div class="form-group" style="flex:1">
        <label class="form-label" for="tr-amount">Amount <span class="req">*</span></label>
        <input id="tr-amount" type="number" min="0.01" step="0.01" placeholder="0.00" />
      </div>
      <div class="form-group" style="flex:1">
        <label class="form-label" for="tr-date">Date <span class="req">*</span></label>
        <input id="tr-date" type="date" value="${todayStr}" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="tr-note">Note <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
      <input id="tr-note" type="text" maxlength="128" placeholder="e.g. ATM cash withdrawal" />
    </div>
    <div id="tr-error" class="form-error" style="display:none"></div>
  `;

  openFormModal({
    title: 'Transfer Funds',
    body,
    submitLabel: 'Record transfer',
    onSubmit: async (close) => {
      const toAccountId = body.querySelector<HTMLSelectElement>('#tr-to-account')!.value;
      const amountStr = body.querySelector<HTMLInputElement>('#tr-amount')!.value;
      const dateStr = body.querySelector<HTMLInputElement>('#tr-date')!.value;
      const note = body.querySelector<HTMLInputElement>('#tr-note')!.value.trim() || undefined;
      const errEl = body.querySelector<HTMLElement>('#tr-error')!;

      errEl.style.display = 'none';
      const amount = parseFloat(amountStr);
      if (!amountStr || isNaN(amount) || amount <= 0) {
        errEl.textContent = 'Enter a valid amount greater than zero.';
        errEl.style.display = 'block';
        return;
      }
      if (!dateStr) {
        errEl.textContent = 'Date is required.';
        errEl.style.display = 'block';
        return;
      }
      const dateParts = dateStr.split('-').map(Number);
      const date = new Date(dateParts[0]!, dateParts[1]! - 1, dateParts[2]!).getTime();

      const transfer = createAccountTransfer(fromAccount.id, toAccountId, amount, date, note);
      await saveAccountTransfer(transfer);
      close();
      await onSaved();
    },
  });
}
