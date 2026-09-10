import { openFormModal } from '@/components/Modal';
import { navigate } from '@/app/router';
import { saveDebtPayment, createDebtPayment, saveDebtAccount } from '@/db';
import { fmtCents } from '@/utils/finance';
import { computeMinPayment } from '@/utils/paymentStatus';
import { refreshNotifier } from '@/utils/notifier';
import type { DebtAccount, BankAccount } from '@/types';

export interface DebtPaymentModalOptions {
  account: DebtAccount;
  bankAccounts: BankAccount[];
  onSave: () => Promise<void> | void;
  onPayoff?: (account: DebtAccount, newBalance: number) => void;
}

export function openDebtPaymentModal({ account: a, bankAccounts, onSave, onPayoff }: DebtPaymentModalOptions): void {
  const minPay = computeMinPayment(a);
  const today = new Date().toISOString().split('T')[0]!;

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';

  const bankOptions = bankAccounts
    .map((b) => `<option value="${b.id}">${b.name}</option>`)
    .join('');

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
      <div class="form-group">
        <label class="form-label" for="pay-amount">Payment amount <span class="req">*</span></label>
        <input id="pay-amount" type="number" min="0.01" step="0.01" data-testid="debt-pay-amount"
          value="${minPay != null ? minPay.toFixed(2) : ''}" placeholder="0.00" />
        ${minPay != null ? `<span class="form-hint">Minimum: ${fmtCents.format(minPay)}</span>` : ''}
      </div>
      <div class="form-group">
        <label class="form-label" for="pay-date">Payment date <span class="req">*</span></label>
        <input id="pay-date" type="date" value="${today}" data-testid="debt-pay-date" />
      </div>
    </div>
    <div class="form-group" id="pay-bank-group">
      <label class="form-label" for="pay-bank">Pay from account <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
      ${bankAccounts.length > 0
        ? `<select id="pay-bank" data-testid="debt-pay-bank-select"><option value="">— not specified —</option>${bankOptions}</select>`
        : `<select id="pay-bank" data-testid="debt-pay-bank-select" disabled><option value="">No bank accounts set up</option></select>`}
    </div>
    <div class="form-group">
      <label class="form-label">Payment type</label>
      <div style="display:flex;gap:var(--space-5)">
        <label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);cursor:pointer">
          <input type="radio" name="pay-type" value="regular" checked data-testid="debt-pay-type-regular" /> Regular payment
        </label>
        <label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);cursor:pointer">
          <input type="radio" name="pay-type" value="extra" data-testid="debt-pay-type-extra" /> Extra payment
        </label>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="pay-note">Note <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
      <input id="pay-note" type="text" placeholder="e.g. February statement, bonus payment" maxlength="80" data-testid="debt-pay-note" />
    </div>
    <div id="pay-error" class="form-error" style="display:none" data-testid="debt-pay-error"></div>
  `;

  // eslint-disable-next-line prefer-const -- forward-referenced inside event handler before assignment below
  let closeModal: (() => void) | undefined;
  if (bankAccounts.length === 0) {
    const hint = document.createElement('span');
    hint.className = 'form-hint';
    hint.textContent = 'No bank accounts set up yet. ';
    const addLink = document.createElement('a');
    addLink.href = '#';
    addLink.textContent = 'Add one in Accounts →';
    addLink.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal?.();
      navigate('/accounts');
    });
    hint.appendChild(addLink);
    body.querySelector('#pay-bank-group')!.appendChild(hint);
  }

  const modal = openFormModal({
    title: `Make a Payment — ${a.name}`,
    body,
    submitLabel: 'Record Payment',
    onSubmit: async (close) => {
      const amountRaw = parseFloat(body.querySelector<HTMLInputElement>('#pay-amount')!.value);
      const dateStr = body.querySelector<HTMLInputElement>('#pay-date')!.value;
      const typeVal = (body.querySelector<HTMLInputElement>('[name="pay-type"]:checked')?.value ?? 'regular') as 'regular' | 'extra';
      const note = body.querySelector<HTMLInputElement>('#pay-note')!.value.trim();
      const bankAccountId = body.querySelector<HTMLSelectElement>('#pay-bank')!.value || undefined;
      const errEl = body.querySelector<HTMLElement>('#pay-error')!;

      errEl.style.display = 'none';
      const missing: string[] = [];
      if (isNaN(amountRaw) || amountRaw <= 0) missing.push('Payment amount');
      if (!dateStr)                            missing.push('Payment date');
      if (missing.length > 0) {
        errEl.textContent = missing.length === 1
          ? `${missing[0]} is required.`
          : `Fill in all required fields: ${missing.join(', ')}.`;
        errEl.style.display = 'block';
        return;
      }

      const payment = createDebtPayment(a.id, amountRaw, typeVal, note || undefined);
      payment.date = new Date(dateStr + 'T12:00:00').getTime();
      if (bankAccountId) payment.bankAccountId = bankAccountId;

      const newBalance = Math.max(0, a.balance - amountRaw);
      const updatedAccount: DebtAccount = { ...a, balance: newBalance, updatedAt: Date.now() };

      await Promise.all([saveDebtPayment(payment), saveDebtAccount(updatedAccount)]);

      const wasPaidOff = a.balance > 0 && newBalance === 0;
      close();
      await onSave();
      void refreshNotifier();

      if (wasPaidOff) onPayoff?.(updatedAccount, newBalance);
    },
  });
  closeModal = modal.close;
}
