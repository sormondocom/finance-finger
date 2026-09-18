import {
  getExpensePaidRecords, findChargeByExpenseId,
  getCardCharges, deleteExpense,
  saveExpense,
} from '@/db';
import { accounting } from '@/accounting';
import { openFormModal } from '@/components/Modal';
import { openConfirmDialog } from '@/components/ConfirmDialog';
import { createPaymentSourceSelect } from '@/components/PaymentSourceSelect';
import { openExpenseForm } from './ExpenseForm';
import { openExpensePaymentModal } from '@/components/ExpensePaymentModal';
import { fmt, fmtCents, FREQUENCY_LABELS, freqThresholdLabel } from '@/utils/finance';
import { todayDateInput, timestampToDateInput, dateInputToTimestamp } from '@/utils/dateInput';
import { computeBillStatus, computeNextDue } from '@/utils/billStatus';
import { refreshNotifier, getOverageTrend } from '@/utils/notifier';
import { openAddNotificationModal } from '@/utils/notificationModal';
import { showMascot } from '@/mascot/Mascot';
import { navigate } from '@/app/router';
import type { Expense, ExpenseCategory, ExpensePaidRecord, HouseholdMember, DebtAccount, BankAccount } from '@/types';
import { userLocale } from '@/utils/locale';

export type ExpenseRowContext = {
  categories: ExpenseCategory[];
  members: HouseholdMember[];
  cardAccounts: DebtAccount[];
  bankAccounts: BankAccount[];
  allPaidRecords: ExpensePaidRecord[];
  paidThisMonth: Map<string, ExpensePaidRecord>;
  onLoad: () => Promise<void>;
};

function freqInterval(freq: string | null | undefined): number {
  if (freq === 'quarterly') return 3;
  if (freq === 'annual')    return 12;
  return 1;
}

function overageColor(actual: number, threshold: number): string {
  if (actual <= threshold) return 'var(--ff-green)';
  const pct = (actual - threshold) / threshold;
  if (pct < 0.10) return '#f87171';
  if (pct < 0.25) return '#ef4444';
  return 'var(--color-danger)';
}

function openRecordPaymentForm(
  expense: Expense,
  existingRecord: ExpensePaidRecord | undefined,
  ctx: ExpenseRowContext,
): void {
  openExpensePaymentModal({
    expense,
    bankAccounts: ctx.bankAccounts,
    cardAccounts: ctx.cardAccounts,
    allPaidRecords: ctx.allPaidRecords,
    ...(existingRecord ? { existingRecord } : {}),
    onSave: ctx.onLoad,
  });
}

function buildLedgerPanel(
  expense: Expense,
  records: ExpensePaidRecord[],
  ctx: ExpenseRowContext,
): HTMLElement {
  const isBill = expense.recurring && !!expense.dueDay;
  const panel = document.createElement('div');
  panel.className = 'expense-ledger-panel';
  panel.style.display = 'none';

  if (records.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-muted text-sm';
    empty.style.padding = 'var(--space-3) var(--space-4)';
    empty.textContent = 'No payment history yet.';
    panel.appendChild(empty);
    return panel;
  }

  const headerRow = document.createElement('div');
  headerRow.className = 'expense-ledger-row expense-ledger-col-header';
  ([
    ['Date',   'expense-ledger-date'],
    ['Via',    'expense-ledger-source'],
    ['Amount', 'expense-ledger-amount'],
    ['',       'expense-ledger-actions'],
  ] as [string, string][]).forEach(([text, cls]) => {
    const cell = document.createElement('span');
    cell.className = cls;
    cell.textContent = text;
    headerRow.appendChild(cell);
  });
  panel.appendChild(headerRow);

  records.forEach((r) => {
    const cardName = r.cardId ? ctx.cardAccounts.find((a) => a.id === r.cardId)?.name : null;
    const bankName = r.bankAccountId ? ctx.bankAccounts.find((a) => a.id === r.bankAccountId)?.name : null;
    const source = cardName ? `💳 ${cardName}` : bankName ? `🏦 ${bankName}` : '—';
    const dateStr = new Date(r.date).toLocaleDateString(userLocale, { month: 'short', day: 'numeric', year: 'numeric' });

    const ledgerRow = document.createElement('div');
    ledgerRow.className = 'expense-ledger-row';

    const dateEl = document.createElement('span');
    dateEl.className = 'expense-ledger-date';
    dateEl.textContent = dateStr;

    const amtEl = document.createElement('span');
    amtEl.className = 'expense-ledger-amount';
    amtEl.textContent = fmtCents.format(r.amount);

    const srcEl = document.createElement('span');
    srcEl.className = 'expense-ledger-source';
    if (r.cardId || r.bankAccountId) {
      const link = document.createElement('a');
      link.className = 'expense-ledger-source-link';
      link.textContent = source;
      link.href = '#';
      link.addEventListener('click', (e) => {
        e.preventDefault();
        if (r.cardId) {
          sessionStorage.setItem('cal-focus-account', r.cardId);
          navigate('/debt');
        } else if (r.bankAccountId) {
          sessionStorage.setItem('cal-focus-bank', r.bankAccountId);
          navigate('/accounts');
        }
      });
      srcEl.appendChild(link);
    } else {
      srcEl.textContent = source;
    }

    const actionsEl = document.createElement('span');
    actionsEl.className = 'expense-ledger-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.title = 'Edit this payment record';
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', () => openRecordPaymentForm(expense, r, ctx));

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger';
    delBtn.setAttribute('data-testid', 'expense-ledger-del');
    delBtn.title = 'Remove this payment record';
    delBtn.textContent = '🗑️';
    delBtn.addEventListener('click', async () => {
      if (!await openConfirmDialog({ title: 'Remove payment', message: 'Remove this payment record?', confirmLabel: 'Remove' })) return;

      await accounting.deleteExpensePayment(r);

      if (isBill) {
        const freshRecords = await getExpensePaidRecords(expense.id);
        const remaining = freshRecords.filter((rec) => rec.id !== r.id);
        if (remaining.length > 0) {
          await saveExpense({ ...expense, date: Math.max(...remaining.map((rec) => rec.date)) });
        } else {
          // All payments deleted — reset expense.date to 2 months ago so
          // computeBillStatus returns past-due instead of ghost-paid.
          const resetDate = new Date();
          resetDate.setMonth(resetDate.getMonth() - 2);
          resetDate.setDate(15);
          resetDate.setHours(0, 0, 0, 0);
          await saveExpense({ ...expense, date: resetDate.getTime() });
        }
      }
      await ctx.onLoad();
      void refreshNotifier();
    });

    actionsEl.appendChild(editBtn);
    actionsEl.appendChild(delBtn);

    ledgerRow.appendChild(dateEl);
    ledgerRow.appendChild(srcEl);
    ledgerRow.appendChild(amtEl);
    ledgerRow.appendChild(actionsEl);
    panel.appendChild(ledgerRow);
  });

  return panel;
}

function openLogActualForm(
  expense: Expense,
  existingRecord: ExpensePaidRecord | undefined,
  ctx: ExpenseRowContext,
): void {
  const isBill = expense.recurring && !!expense.dueDay;
  const isUpdate = !!existingRecord;
  const prefillDate = existingRecord ? timestampToDateInput(existingRecord.date) : todayDateInput();
  const prefillAmount = existingRecord ? existingRecord.amount : expense.amount;

  const defaultSourceValue = (() => {
    if (existingRecord?.bankAccountId) return `bank:${existingRecord.bankAccountId}`;
    if (existingRecord?.cardId)        return `card:${existingRecord.cardId}`;
    if (expense.bankAccountId)         return `bank:${expense.bankAccountId}`;
    if (expense.linkedCardId)          return `card:${expense.linkedCardId}`;
    return '';
  })();

  const body = document.createElement('div');
  body.className = 'expense-form';
  body.innerHTML = `
    <p class="text-sm text-muted">
      ${isUpdate
        ? `Update the actual amount auto-charged for <strong>${expense.description}</strong>.`
        : `Log the actual amount auto-charged for <strong>${expense.description}</strong>.`}
    </p>
    <div class="form-group">
      <label class="form-label" for="la-amount">Actual amount charged <span class="req">*</span></label>
      <input id="la-amount" type="number" min="0" step="0.01"
        value="${prefillAmount.toFixed(2)}" />
      <span class="form-hint">${freqThresholdLabel(expense.recurringFrequency)} Threshold: ${fmtCents.format(expense.amount)}</span>
    </div>
    <div class="form-group">
      <label class="form-label" for="la-date">Date charged</label>
      <input id="la-date" type="date" value="${prefillDate}" />
      <span class="form-hint">Use any past date to log retroactively.</span>
    </div>
    <div id="la-overage-msg" style="display:none"></div>
  `;

  const logActualModalRef: { close?: () => void } = {};
  const paySource = createPaymentSourceSelect({
    bankAccounts: ctx.bankAccounts,
    cardAccounts: ctx.cardAccounts,
    defaultValue: defaultSourceValue,
    label: 'Charged to',
    closeRef: logActualModalRef,
  });
  body.insertBefore(paySource.element, body.querySelector('#la-overage-msg'));

  const amountInput = body.querySelector<HTMLInputElement>('#la-amount')!;
  const overageMsg = body.querySelector<HTMLElement>('#la-overage-msg')!;

  const checkOverage = () => {
    const val = parseFloat(amountInput.value);
    if (!isNaN(val) && val > expense.amount) {
      const over = val - expense.amount;
      overageMsg.textContent = `⚠ Over ${freqThresholdLabel(expense.recurringFrequency).toLowerCase()} threshold by ${fmtCents.format(over)}`;
      overageMsg.style.cssText = 'display:block;color:var(--color-danger);font-size:var(--text-xs);margin-top:var(--space-1)';
    } else {
      overageMsg.style.display = 'none';
    }
  };
  amountInput.addEventListener('input', checkOverage);
  checkOverage();

  const { close: closeLogActualModal } = openFormModal({
    title: isUpdate ? `Update Actual — ${expense.description}` : `Log Actual — ${expense.description}`,
    body,
    submitLabel: isUpdate ? 'Update' : 'Log Actual',
    onSubmit: async (close) => {
      const rawAmount = parseFloat(amountInput.value);
      if (isNaN(rawAmount) || rawAmount < 0) return;
      const actualAmount = Math.round(rawAmount * 100) / 100;
      const dateStr = body.querySelector<HTMLInputElement>('#la-date')!.value;
      const paidDate = dateInputToTimestamp(dateStr);
      const selectedCardId = paySource.getCardId();
      const selectedBankId = paySource.getBankId();

      const ops: Promise<unknown>[] = [];
      if (isUpdate && existingRecord) {
        ops.push(accounting.updateExpensePayment({
          record: existingRecord,
          amount: actualAmount,
          date: paidDate,
          description: expense.description,
          ...(selectedCardId ? { cardId: selectedCardId } : {}),
          ...(selectedBankId ? { bankAccountId: selectedBankId } : {}),
        }));
      } else {
        ops.push(accounting.recordExpensePayment({
          expenseId: expense.id,
          description: expense.description,
          amount: actualAmount,
          date: paidDate,
          ...(selectedBankId ? { bankAccountId: selectedBankId } : {}),
          ...(selectedCardId ? { cardId: selectedCardId } : {}),
        }));
      }
      if (isBill) ops.push(saveExpense({ ...expense, date: paidDate }));

      await Promise.all(ops);

      // Charge management via accounting service (writes ledger entries + syncs balance)
      const existingCharge = await findChargeByExpenseId(expense.id);
      if (selectedCardId) {
        if (existingCharge && existingCharge.accountId === selectedCardId) {
          await accounting.updateCharge({ chargeId: existingCharge.id, amount: actualAmount, date: paidDate });
        } else {
          if (existingCharge) await accounting.deleteCharge(existingCharge.id);
          await accounting.recordCharge({
            accountId: selectedCardId,
            description: expense.description,
            amount: actualAmount,
            date: paidDate,
            ...(expense.categoryId ? { categoryId: expense.categoryId } : {}),
            sourceExpenseId: expense.id,
          });
        }
      } else if (existingCharge) {
        await accounting.deleteCharge(existingCharge.id);
      }
      close();
      await ctx.onLoad();
      void refreshNotifier();

      if (actualAmount > expense.amount) {
        const overCount = await getOverageTrend(expense.id, expense.amount);
        if (overCount >= 2) {
          const fmtThreshold = fmt.format(expense.amount);
          setTimeout(() => showMascot('expense-trend', {
            bill: expense.description,
            threshold: fmtThreshold,
            count: String(overCount),
          }), 600);
        }
      }
    },
  });
  logActualModalRef.close = closeLogActualModal;
}

export function buildExpenseRow(expense: Expense, ctx: ExpenseRowContext): HTMLElement {
  const isBill = expense.recurring && !!expense.dueDay;
  const billStatus = isBill ? computeBillStatus(expense) : null;
  const isAutoPay = !!expense.isAutoPay;
  const paidRecord = ctx.paidThisMonth.get(expense.id);
  const _now = new Date();
  const _monthEnd = new Date(_now.getFullYear(), _now.getMonth() + 1, 1).getTime();
  const billDateThisCycle = (() => {
    if (!isBill || !expense.dueDay) return false;
    const _maxDay = new Date(_now.getFullYear(), _now.getMonth() + 1, 0).getDate();
    const dueDate = new Date(_now.getFullYear(), _now.getMonth(), Math.min(expense.dueDay, _maxDay));
    const cycleWindowStart = dueDate.getTime() - 14 * 24 * 60 * 60 * 1000;
    return expense.date >= cycleWindowStart && expense.date < _monthEnd;
  })();
  const alreadyPaid = !!paidRecord && (!isBill || billDateThisCycle);
  const showPayBtn = !isAutoPay && !alreadyPaid;
  const showLogActualBtn = isAutoPay;
  const showEditPaymentBtn = !isAutoPay && alreadyPaid;

  const dateStr = new Date(expense.date).toLocaleDateString(userLocale, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const freqLabel = expense.recurring && expense.recurringFrequency
    ? FREQUENCY_LABELS[expense.recurringFrequency]
    : null;
  const nextDueStr = (() => {
    if (!expense.dueDay) return '';
    const interval = freqInterval(expense.recurringFrequency);
    const nextDue = computeNextDue(new Date(expense.date), expense.dueDay, interval);
    const now = new Date();
    const opts: Intl.DateTimeFormatOptions = {
      month: 'short', day: 'numeric',
      ...(nextDue.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
    };
    return ` · Due ${nextDue.toLocaleDateString(userLocale, opts)}`;
  })();

  const statusBadge = (() => {
    if (alreadyPaid) return '<span class="expense-badge expense-badge--paid" data-testid="expense-bill-badge">✓ Paid</span>';
    if (!billStatus || isAutoPay) return '';
    switch (billStatus.status) {
      case 'past-due': return '<span class="expense-badge expense-badge--past-due" data-testid="expense-bill-badge">⚠ Past Due</span>';
      case 'due-soon': {
        const dueLabel = billStatus.dueDayThisMonth
          ? `Due ${billStatus.dueDayThisMonth.toLocaleDateString(userLocale, { month: 'short', day: 'numeric' })}`
          : 'Due Soon';
        return `<span class="expense-badge expense-badge--due-soon" data-testid="expense-bill-badge">⏰ ${dueLabel}</span>`;
      }
      default: return '';
    }
  })();

  const paidDateStr = paidRecord
    ? new Date(paidRecord.date).toLocaleDateString(userLocale, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  const dateLabel = alreadyPaid ? `Paid ${paidDateStr ?? dateStr}` : dateStr;

  const row = document.createElement('div');
  row.className = 'expense-row';
  row.setAttribute('data-testid', 'expense-row');
  row.setAttribute('data-expense-id', expense.id);

  const amountDisplay = (() => {
    if (paidRecord) {
      const actualFmt = fmtCents.format(paidRecord.amount);
      const threshFmt = fmtCents.format(expense.amount);
      const color = overageColor(paidRecord.amount, expense.amount);
      return `<span style="color:${color}" data-testid="expense-actual-amount">${actualFmt}</span>`
        + `<span class="expense-row-amount-sub">est. ${threshFmt}</span>`;
    }
    return fmtCents.format(expense.amount);
  })();

  const logActualLabel = paidRecord ? '$ Update Actual' : '$ Log Actual';

  const thresholdBadge = expense.threshold
    ? `<span class="expense-threshold-badge" data-testid="expense-threshold-badge">⚡ ${fmtCents.format(expense.threshold)}</span>`
    : '';

  row.innerHTML = `
    <div class="expense-row-desc">
      <div class="expense-row-desc-main">${statusBadge}${expense.description}${thresholdBadge}</div>
      <div class="expense-row-desc-sub">
        <span class="expense-row-date">${dateLabel}</span>
        ${expense.recurring && freqLabel
          ? `<span class="expense-row-recur">↻ ${freqLabel}${nextDueStr}</span>`
          : ''}
      </div>
    </div>
    <div class="expense-row-amount">${amountDisplay}</div>
    <div class="expense-row-actions">
      ${isAutoPay ? '<span class="expense-autopay-badge" data-testid="expense-autopay-badge">🔄 Auto-pay</span>' : ''}
      ${showPayBtn
        ? `<button class="mark-paid-btn" data-action="record-payment" data-testid="expense-record-payment" title="Record actual payment">$ Record Payment</button>`
        : ''}
      ${showLogActualBtn
        ? `<button class="mark-paid-btn" data-action="log-actual" data-testid="expense-log-actual" title="Log actual amount charged">${logActualLabel}</button>`
        : ''}
      ${showEditPaymentBtn
        ? `<button class="mark-paid-btn mark-paid-btn--edit" data-action="edit-payment" data-testid="expense-edit-payment" title="Edit recorded payment">✎ Edit Payment</button>`
        : ''}
      <button class="icon-btn" data-action="notif" title="Add reminder">🔔</button>
      <button class="icon-btn" data-action="edit" data-testid="expense-edit" title="Edit">✏️</button>
      <button class="icon-btn danger" data-action="delete" data-testid="expense-delete" title="Delete">🗑️</button>
    </div>
  `;

  const linkedCard = expense.linkedCardId
    ? ctx.cardAccounts.find((a) => a.id === expense.linkedCardId)
    : null;
  if (linkedCard) {
    const badge = document.createElement('span');
    badge.className = 'expense-card-badge';
    badge.setAttribute('data-testid', 'expense-card-badge');
    badge.textContent = `💳 ${linkedCard.name}`;
    row.querySelector('.expense-row-desc-main')!.appendChild(badge);
  }

  const linkedBank = expense.bankAccountId
    ? ctx.bankAccounts.find((a) => a.id === expense.bankAccountId)
    : null;
  if (linkedBank) {
    const badge = document.createElement('span');
    badge.className = 'expense-bank-badge';
    badge.setAttribute('data-testid', 'expense-bank-badge');
    badge.textContent = `🏦 ${linkedBank.name}`;
    row.querySelector('.expense-row-desc-main')!.appendChild(badge);
  }

  if (expense.url) {
    const link = document.createElement('a');
    link.className = 'icon-btn';
    link.setAttribute('data-testid', 'expense-url-link');
    link.href = expense.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = 'Open billing portal';
    link.textContent = '↗';
    row.querySelector('[data-action="edit"]')!.before(link);
  }

  if (showPayBtn) {
    row.querySelector('[data-action="record-payment"]')!.addEventListener('click', () =>
      openRecordPaymentForm(expense, undefined, ctx));
  }
  if (showLogActualBtn) {
    row.querySelector('[data-action="log-actual"]')!.addEventListener('click', () =>
      openLogActualForm(expense, paidRecord, ctx));
  }
  if (showEditPaymentBtn) {
    row.querySelector('[data-action="edit-payment"]')!.addEventListener('click', () =>
      openRecordPaymentForm(expense, paidRecord, ctx));
  }
  row.querySelector('[data-action="notif"]')!.addEventListener('click', () => {
    const notifCtx = expense.dueDay
      ? { label: expense.description, defaultTrigger: 'bill-before' as const, defaultExpenseId: expense.id }
      : { label: expense.description, defaultTrigger: 'monthly-day' as const };
    openAddNotificationModal(notifCtx);
  });
  row.querySelector('[data-action="edit"]')!.addEventListener('click', () =>
    openExpenseForm(expense, ctx.categories, ctx.members, ctx.cardAccounts, ctx.bankAccounts, ctx.onLoad));
  row.querySelector('[data-action="delete"]')!.addEventListener('click', async () => {
    if (!await openConfirmDialog({ message: `Delete "${expense.description}"?` })) return;
    const allCharges = await getCardCharges();
    const linkedCharges = allCharges.filter((c) => c.sourceExpenseId === expense.id);
    const paidRecs = await getExpensePaidRecords(expense.id);
    // Delete linked charges through the accounting service so ledger entries are written
    await Promise.all(linkedCharges.map((c) => accounting.deleteCharge(c.id)));
    // Route through accounting service to clean up bank-debit ledger entries and sync balances
    await Promise.all(paidRecs.map((r) => accounting.deleteExpensePayment(r)));
    await deleteExpense(expense.id);
    await ctx.onLoad();
    void refreshNotifier();
  });

  const records = ctx.allPaidRecords.filter((r) => r.expenseId === expense.id);
  const ledgerPanel = buildLedgerPanel(expense, records, ctx);

  const ledgerBtn = document.createElement('button');
  ledgerBtn.className = 'icon-btn';
  ledgerBtn.setAttribute('data-action', 'ledger');
  ledgerBtn.setAttribute('data-testid', 'expense-ledger-btn');
  ledgerBtn.title = 'Payment history';
  ledgerBtn.textContent = records.length > 0 ? `📋 ${records.length}` : '📋';
  if (records.length > 0) ledgerBtn.style.color = 'var(--ff-gold-dark)';
  ledgerBtn.addEventListener('click', () => {
    const open = ledgerPanel.style.display !== 'none';
    ledgerPanel.style.display = open ? 'none' : '';
  });
  row.querySelector('[data-action="notif"]')!.before(ledgerBtn);

  const outer = document.createElement('div');
  outer.className = 'expense-item-outer';

  if (!isBill && alreadyPaid) {
    const wrap = document.createElement('div');
    wrap.className = 'expense-bill-wrap expense-bill-wrap--paid';
    wrap.setAttribute('data-testid', 'expense-bill-wrap');
    wrap.appendChild(row);
    outer.appendChild(wrap);
  } else if (!billStatus || billStatus.status === 'ok') {
    outer.appendChild(row);
  } else {
    const wrapClass = billStatus.status === 'past-due' ? 'expense-bill-wrap--past-due'
      : billStatus.status === 'due-soon' ? 'expense-bill-wrap--due-soon'
      : 'expense-bill-wrap--paid';
    const wrap = document.createElement('div');
    wrap.className = `expense-bill-wrap ${wrapClass}`;
    wrap.setAttribute('data-testid', 'expense-bill-wrap');
    wrap.appendChild(row);
    outer.appendChild(wrap);
  }

  outer.appendChild(ledgerPanel);
  return outer;
}
