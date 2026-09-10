import { saveDebtPayment, deleteDebtPayment, saveDebtAccount } from '@/db';
import { openFormModal } from '@/components/Modal';
import { openDebtPaymentModal } from '@/components/DebtPaymentModal';
import { computePaymentStatus } from '@/utils/paymentStatus';
import { fmtCents } from '@/utils/finance';
import { refreshNotifier } from '@/utils/notifier';
import { showAllDebtFreeCelebration, showDebtPayoffCelebration } from '@/mascot/Mascot';
import type { DebtAccount, DebtPayment, BankAccount } from '@/types';
import { userLocale } from '@/utils/locale';

function openEditPaymentModal(
  a: DebtAccount,
  p: DebtPayment,
  bankAccounts: BankAccount[],
  onSave: () => Promise<void>,
): void {
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';

  const existingDate = new Date(p.date).toISOString().split('T')[0]!;
  const bankOptions = bankAccounts
    .map((b) => `<option value="${b.id}" ${p.bankAccountId === b.id ? 'selected' : ''}>${b.name}</option>`)
    .join('');

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
      <div class="form-group">
        <label class="form-label" for="ep-amount">Payment amount <span class="req">*</span></label>
        <input id="ep-amount" type="number" min="0.01" step="0.01" value="${p.amount.toFixed(2)}" />
      </div>
      <div class="form-group">
        <label class="form-label" for="ep-date">Payment date <span class="req">*</span></label>
        <input id="ep-date" type="date" value="${existingDate}" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="ep-bank">Pay from account <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
      ${bankAccounts.length > 0
        ? `<select id="ep-bank"><option value="">— not specified —</option>${bankOptions}</select>`
        : `<select id="ep-bank" disabled><option value="">No bank accounts set up</option></select>`}
    </div>
    <div class="form-group">
      <label class="form-label">Payment type</label>
      <div style="display:flex;gap:var(--space-5)">
        <label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);cursor:pointer">
          <input type="radio" name="ep-type" value="regular" ${p.type === 'regular' ? 'checked' : ''} /> Regular payment
        </label>
        <label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);cursor:pointer">
          <input type="radio" name="ep-type" value="extra" ${p.type === 'extra' ? 'checked' : ''} /> Extra payment
        </label>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="ep-note">Note <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
      <input id="ep-note" type="text" value="${p.note ?? ''}" maxlength="80" />
    </div>
    <div id="ep-error" class="form-error" style="display:none"></div>
  `;

  openFormModal({
    title: `Edit Payment — ${a.name}`,
    body,
    submitLabel: 'Save Changes',
    onSubmit: async (close) => {
      const newAmount     = parseFloat(body.querySelector<HTMLInputElement>('#ep-amount')!.value);
      const dateStr       = body.querySelector<HTMLInputElement>('#ep-date')!.value;
      const typeVal       = (body.querySelector<HTMLInputElement>('[name="ep-type"]:checked')?.value ?? 'regular') as 'regular' | 'extra';
      const note          = body.querySelector<HTMLInputElement>('#ep-note')!.value.trim();
      const bankAccountId = body.querySelector<HTMLSelectElement>('#ep-bank')!.value || undefined;
      const errEl         = body.querySelector<HTMLElement>('#ep-error')!;

      errEl.style.display = 'none';
      const missing: string[] = [];
      if (isNaN(newAmount) || newAmount <= 0) missing.push('Payment amount');
      if (!dateStr)                           missing.push('Payment date');
      if (missing.length > 0) {
        errEl.textContent = missing.length === 1
          ? `${missing[0]} is required.`
          : `Fill in all required fields: ${missing.join(', ')}.`;
        errEl.style.display = 'block';
        return;
      }

      const balanceDelta = p.amount - newAmount;
      const updatedAccount: DebtAccount = {
        ...a,
        balance: Math.max(0, a.balance + balanceDelta),
        updatedAt: Date.now(),
      };

      const { note: _n, bankAccountId: _b, ...pBase } = p;
      const updatedPayment: DebtPayment = {
        ...pBase,
        amount: newAmount,
        date: new Date(dateStr + 'T12:00:00').getTime(),
        type: typeVal,
        ...(note ? { note } : {}),
        ...(bankAccountId ? { bankAccountId } : {}),
      };

      await Promise.all([saveDebtPayment(updatedPayment), saveDebtAccount(updatedAccount)]);
      close();
      await onSave();
      void refreshNotifier();
    },
  });
}

export function openPaymentModal(
  a: DebtAccount,
  bankAccounts: BankAccount[],
  accounts: DebtAccount[],
  onSave: () => Promise<void>,
): void {
  openDebtPaymentModal({
    account: a,
    bankAccounts,
    onSave,
    onPayoff: (updatedAccount) => {
      const allFree = accounts.every((acc) =>
        acc.id === updatedAccount.id ? updatedAccount.balance <= 0 : acc.balance <= 0,
      );
      if (allFree) setTimeout(() => showAllDebtFreeCelebration(), 450);
      else setTimeout(() => showDebtPayoffCelebration(a.name), 450);
    },
  });
}

export function buildPaymentHistoryPanel(
  a: DebtAccount,
  payments: DebtPayment[],
  bankAccounts: BankAccount[],
  onSave: () => Promise<void>,
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'payment-history-panel';
  panel.setAttribute('data-testid', 'payment-history-panel');

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  const header = document.createElement('div');
  header.className = 'payment-history-header';
  header.innerHTML = `<span>${payments.length} payment${payments.length !== 1 ? 's' : ''} recorded · ${fmtCents.format(totalPaid)} total</span>`;
  panel.appendChild(header);

  const payStatus = computePaymentStatus(a, payments);
  const now = new Date();
  const currentMonthLabel = now.toLocaleDateString(userLocale, { month: 'short', year: 'numeric' });
  const allMonths = [
    {
      label: currentMonthLabel,
      total: payStatus.currentMonthTotal,
      extra: payStatus.currentMonthExtra,
      minimumMet: payStatus.minimumPayment != null && payStatus.currentMonthTotal >= payStatus.minimumPayment,
      status: payStatus.currentMonth,
    },
    ...payStatus.historicalMonths.slice(0, 5).map((h) => ({
      label: h.label,
      total: h.total,
      extra: h.extra,
      minimumMet: h.minimumMet,
      status: h.minimumMet ? 'paid' : 'partial',
    })),
  ];

  if (payStatus.minimumPayment != null || payStatus.currentMonthTotal > 0 || payStatus.historicalMonths.length > 0) {
    const monthGrid = document.createElement('div');
    monthGrid.className = 'payment-month-grid';

    allMonths.forEach(({ label, total, extra, minimumMet, status }) => {
      const chip = document.createElement('div');
      const chipClass = minimumMet ? 'paid'
        : status === 'past-due' ? 'past-due'
        : status === 'due-soon' ? 'due-soon'
        : total > 0 ? 'partial'
        : 'none';
      chip.className = `payment-month-chip payment-month-chip--${chipClass}`;

      const icon = minimumMet ? '✓' : status === 'past-due' ? '⚠' : total > 0 ? '½' : '—';
      const extraStr = extra > 0 && minimumMet
        ? `<span class="payment-month-chip-extra">+${fmtCents.format(extra)} extra</span>`
        : '';
      chip.innerHTML = `
        <span class="payment-month-chip-label">${label}</span>
        <span class="payment-month-chip-amount">${total > 0 ? fmtCents.format(total) : '—'}</span>
        ${extraStr}
        <span class="payment-month-chip-icon">${icon}</span>
      `;
      monthGrid.appendChild(chip);
    });

    panel.appendChild(monthGrid);
  }

  const list = document.createElement('div');
  list.className = 'payment-history-list';

  payments.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'payment-history-item';
    item.setAttribute('data-testid', 'payment-history-item');
    const dateStr = new Date(p.date).toLocaleDateString(userLocale, { month: 'short', day: 'numeric', year: 'numeric' });
    const linkedBank = p.bankAccountId ? bankAccounts.find((b) => b.id === p.bankAccountId) : null;
    item.innerHTML = `
      <span class="payment-history-date">${dateStr}</span>
      <span class="payment-history-amount">${fmtCents.format(p.amount)}</span>
      <span class="payment-history-type payment-history-type--${p.type}">${p.type}</span>
      ${linkedBank ? `<span class="payment-history-bank">🏦 ${linkedBank.name}</span>` : ''}
      <span class="payment-history-note">${p.note ?? ''}</span>
    `;

    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.title = 'Edit payment';
    editBtn.setAttribute('data-testid', 'payment-history-edit');
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', () => openEditPaymentModal(a, p, bankAccounts, onSave));

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger';
    delBtn.title = 'Remove payment (balance will be restored)';
    delBtn.setAttribute('data-testid', 'payment-history-delete');
    delBtn.textContent = '🗑️';
    delBtn.addEventListener('click', async () => {
      if (!confirm(`Remove this ${p.type} payment of ${fmtCents.format(p.amount)}?\nThe balance on "${a.name}" will be restored by that amount.`)) return;
      const restoredBalance = a.balance + p.amount;
      await Promise.all([
        deleteDebtPayment(p.id),
        saveDebtAccount({ ...a, balance: restoredBalance, updatedAt: Date.now() }),
      ]);
      await onSave();
    });

    item.appendChild(editBtn);
    item.appendChild(delBtn);
    list.appendChild(item);
  });

  panel.appendChild(list);
  return panel;
}
