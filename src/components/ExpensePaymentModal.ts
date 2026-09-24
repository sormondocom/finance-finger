import { openFormModal } from '@/components/Modal';
import { createPaymentSourceSelect } from '@/components/PaymentSourceSelect';
import { escapeHtml } from '@/utils/escapeHtml';
import { fmt, fmtCents, freqThresholdLabel } from '@/utils/finance';
import { todayDateInput, timestampToDateInput, dateInputToTimestamp } from '@/utils/dateInput';
import {
  saveExpense, findChargeByExpenseId,
} from '@/db';
import { accounting } from '@/accounting';
import { showMascot } from '@/mascot/Mascot';
import { refreshNotifier, getOverageTrend } from '@/utils/notifier';
import type { Expense, ExpensePaidRecord, DebtAccount, BankAccount } from '@/types';

export interface ExpensePaymentModalOptions {
  expense: Expense;
  bankAccounts: BankAccount[];
  cardAccounts: DebtAccount[];
  allPaidRecords: ExpensePaidRecord[];
  existingRecord?: ExpensePaidRecord;
  onSave: () => Promise<void> | void;
}

export function openExpensePaymentModal({
  expense,
  bankAccounts,
  cardAccounts,
  existingRecord,
  onSave,
}: ExpensePaymentModalOptions): void {
  const isBill = expense.recurring && !!expense.dueDay;
  // Once a bill is paid, firstDueDate is no longer needed — billing has started.
  const { firstDueDate: _fd, ...baseExpense } = expense;
  const isFixed = !!expense.isFixedAmount;
  const isUpdate = !!existingRecord;
  const today = todayDateInput();
  const prefillDate = existingRecord ? timestampToDateInput(existingRecord.date) : today;
  const prefillAmount = existingRecord ? existingRecord.amount : expense.amount;
  const overageLimit = expense.threshold ?? expense.amount;

  const body = document.createElement('div');
  body.className = 'expense-form';

  body.innerHTML = `
    <p class="text-sm text-muted">
      ${isUpdate
        ? `Update the recorded payment for <strong>${escapeHtml(expense.description)}</strong>.`
        : `How much was the actual ${isBill ? 'bill' : 'expense'} for <strong>${escapeHtml(expense.description)}</strong>?`}
    </p>
    <div class="form-group">
      <label class="form-label" for="mp-amount">Actual amount</label>
      <input id="mp-amount" type="number" min="0" step="0.01" data-testid="expense-pay-amount"
        value="${prefillAmount.toFixed(2)}" ${isFixed ? 'readonly style="opacity:0.7"' : ''} />
      ${isFixed
        ? '<span class="form-hint">Fixed amount — same as estimated amount</span>'
        : expense.threshold
          ? `<span class="form-hint">Estimated: ${fmtCents.format(expense.amount)} · Target: ${fmtCents.format(expense.threshold)}</span>`
          : `<span class="form-hint">${freqThresholdLabel(expense.recurringFrequency)} Threshold: ${fmtCents.format(expense.amount)}</span>`}
    </div>
    <div class="form-group">
      <label class="form-label" for="mp-date">Date paid</label>
      <input id="mp-date" type="date" value="${prefillDate}" data-testid="expense-pay-date" />
    </div>
    <div id="mp-overage-msg" style="display:none" data-testid="expense-pay-overage-msg"></div>
  `;

  const modalRef: { close?: () => void } = {};

  const defaultSourceValue = (() => {
    if (existingRecord?.bankAccountId) return `bank:${existingRecord.bankAccountId}`;
    if (existingRecord?.cardId)        return `card:${existingRecord.cardId}`;
    if (expense.bankAccountId)         return `bank:${expense.bankAccountId}`;
    if (expense.linkedCardId)          return `card:${expense.linkedCardId}`;
    return '';
  })();

  const paySource = createPaymentSourceSelect({
    bankAccounts,
    cardAccounts,
    defaultValue: defaultSourceValue,
    testId: 'expense-pay-source-select',
    closeRef: modalRef,
  });

  const overageMsg = body.querySelector<HTMLElement>('#mp-overage-msg')!;
  body.insertBefore(paySource.element, overageMsg);

  const amountInput = body.querySelector<HTMLInputElement>('#mp-amount')!;

  if (!isFixed) {
    amountInput.addEventListener('input', () => {
      const val = parseFloat(amountInput.value);
      if (!isNaN(val) && val > overageLimit) {
        const over = val - overageLimit;
        const label = expense.threshold ? 'Over target by' : `Over ${freqThresholdLabel(expense.recurringFrequency).toLowerCase()} threshold by`;
        overageMsg.textContent = `⚠ ${label} ${fmtCents.format(over)}`;
        overageMsg.style.cssText = 'display:block;color:var(--color-danger);font-size:var(--text-xs);margin-top:var(--space-1)';
      } else {
        overageMsg.style.display = 'none';
      }
    });
  }

  const { close: closeModal } = openFormModal({
    title: isUpdate ? `Edit Payment — ${expense.description}` : `Record Payment — ${expense.description}`,
    body,
    submitLabel: isUpdate ? 'Save Changes' : 'Record Payment',
    onSubmit: async (close) => {
      const rawAmount = parseFloat(amountInput.value);
      if (isNaN(rawAmount) || rawAmount < 0) return;
      const paidAmount = Math.round(rawAmount * 100) / 100;
      const dateStr = body.querySelector<HTMLInputElement>('#mp-date')!.value;
      const paidDate = dateInputToTimestamp(dateStr);
      const selectedCardId = paySource.getCardId();
      const selectedBankId = paySource.getBankId();

      const ops: Promise<unknown>[] = [];

      if (isUpdate && existingRecord) {
        ops.push(accounting.updateExpensePayment({
          record: existingRecord,
          amount: paidAmount,
          date: paidDate,
          description: expense.description,
          ...(selectedBankId ? { bankAccountId: selectedBankId } : {}),
          ...(selectedCardId ? { cardId: selectedCardId } : {}),
        }));
        if (isBill) ops.push(saveExpense({ ...baseExpense, date: paidDate }));
      } else {
        ops.push(accounting.recordExpensePayment({
          expenseId: expense.id,
          description: expense.description,
          amount: paidAmount,
          date: paidDate,
          ...(selectedBankId ? { bankAccountId: selectedBankId } : {}),
          ...(selectedCardId ? { cardId: selectedCardId } : {}),
        }));
        if (isBill) ops.push(saveExpense({ ...baseExpense, date: paidDate }));
      }

      await Promise.all(ops);

      // Charge management via accounting service (writes ledger entries + syncs balance)
      const existingCharge = await findChargeByExpenseId(expense.id);
      if (selectedCardId) {
        if (existingCharge && existingCharge.accountId === selectedCardId) {
          await accounting.updateCharge({ chargeId: existingCharge.id, amount: paidAmount, date: paidDate });
        } else {
          if (existingCharge) await accounting.deleteCharge(existingCharge.id);
          await accounting.recordCharge({
            accountId: selectedCardId,
            description: expense.description,
            amount: paidAmount,
            date: paidDate,
            ...(expense.categoryId ? { categoryId: expense.categoryId } : {}),
            sourceExpenseId: expense.id,
          });
        }
      } else if (existingCharge) {
        await accounting.deleteCharge(existingCharge.id);
      }
      close();
      await onSave();
      void refreshNotifier();

      if (paidAmount > overageLimit) {
        const overCount = await getOverageTrend(expense.id, overageLimit);
        if (overCount >= 2) {
          const fmtLimit = fmt.format(overageLimit);
          setTimeout(() => showMascot('expense-trend', {
            bill: expense.description,
            threshold: fmtLimit,
            count: String(overCount),
          }), 600);
        }
      }
    },
  });
  modalRef.close = closeModal;
}
