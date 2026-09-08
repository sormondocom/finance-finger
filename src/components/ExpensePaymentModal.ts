import { openFormModal } from '@/components/Modal';
import { navigate } from '@/app/router';
import {
  saveExpense, saveExpensePaidRecord, createExpensePaidRecord, getExpensePaidRecords,
  saveCardCharge, deleteCardCharge, createCardCharge, findChargeByExpenseId,
} from '@/db';
import { fmtCents } from '@/utils/finance';
import { showMascot } from '@/mascot/Mascot';
import { computeNextDue } from '@/utils/billStatus';
import { refreshNotifier, getOverageTrend } from '@/utils/notifier';
import type { Expense, ExpensePaidRecord, DebtAccount, BankAccount } from '@/types';

function freqInterval(freq: string | null | undefined): number {
  if (freq === 'quarterly') return 3;
  if (freq === 'annual')    return 12;
  return 1;
}

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
  allPaidRecords,
  existingRecord,
  onSave,
}: ExpensePaymentModalOptions): void {
  const isBill = expense.recurring && !!expense.dueDay;
  const isFixed = !!expense.isFixedAmount;
  const isUpdate = !!existingRecord;
  const currFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
  const today = new Date().toISOString().split('T')[0]!;
  const prefillDate = existingRecord
    ? new Date(existingRecord.date).toISOString().split('T')[0]!
    : today;
  const prefillAmount = existingRecord ? existingRecord.amount : expense.amount;

  const body = document.createElement('div');
  body.className = 'expense-form';

  body.innerHTML = `
    <p class="text-sm text-muted">
      ${isUpdate
        ? `Update the recorded payment for <strong>${expense.description}</strong>.`
        : `How much was the actual ${isBill ? 'bill' : 'expense'} for <strong>${expense.description}</strong>?`}
    </p>
    <div class="form-group">
      <label class="form-label" for="mp-amount">Actual amount</label>
      <input id="mp-amount" type="number" min="0" step="0.01"
        value="${prefillAmount.toFixed(2)}" ${isFixed ? 'readonly style="opacity:0.7"' : ''} />
      ${isFixed
        ? '<span class="form-hint">Fixed amount — same as estimated amount</span>'
        : expense.threshold
          ? `<span class="form-hint">Estimated: ${currFmt.format(expense.amount)} · Target: ${currFmt.format(expense.threshold)}</span>`
          : `<span class="form-hint">${freqThresholdLabel(expense.recurringFrequency)} Threshold: ${currFmt.format(expense.amount)}</span>`}
    </div>
    <div class="form-group">
      <label class="form-label" for="mp-date">Date paid</label>
      <input id="mp-date" type="date" value="${prefillDate}" />
    </div>
    <div id="mp-overage-msg" style="display:none"></div>
  `;

  // Unified "Pay from" dropdown — bank accounts + credit cards in optgroups
  const modalRef: { close?: () => void } = {};
  const sourceGroup = document.createElement('div');
  sourceGroup.className = 'form-group';
  const overageMsg = body.querySelector<HTMLElement>('#mp-overage-msg')!;

  const hasAnySources = bankAccounts.length > 0 || cardAccounts.length > 0;

  const defaultSourceValue = (() => {
    if (existingRecord?.bankAccountId) return `bank:${existingRecord.bankAccountId}`;
    if (existingRecord?.cardId)        return `card:${existingRecord.cardId}`;
    if (expense.bankAccountId)         return `bank:${expense.bankAccountId}`;
    if (expense.linkedCardId)          return `card:${expense.linkedCardId}`;
    return '';
  })();

  const srcLabel = document.createElement('label');
  srcLabel.className = 'form-label';
  srcLabel.htmlFor = 'mp-source';
  srcLabel.innerHTML = 'Pay from <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span>';
  sourceGroup.appendChild(srcLabel);

  if (hasAnySources) {
    const srcSel = document.createElement('select');
    srcSel.id = 'mp-source';
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '— Not specified —';
    srcSel.appendChild(noneOpt);

    if (bankAccounts.length > 0) {
      const bankGroup = document.createElement('optgroup');
      bankGroup.label = 'Accounts';
      bankAccounts.forEach((b) => {
        const opt = document.createElement('option');
        opt.value = `bank:${b.id}`;
        opt.textContent = b.name;
        opt.selected = defaultSourceValue === `bank:${b.id}`;
        bankGroup.appendChild(opt);
      });
      srcSel.appendChild(bankGroup);
    }

    if (cardAccounts.length > 0) {
      const cardGroup = document.createElement('optgroup');
      cardGroup.label = 'Credit Cards';
      cardAccounts.forEach((a) => {
        const opt = document.createElement('option');
        opt.value = `card:${a.id}`;
        opt.textContent = a.name;
        opt.selected = defaultSourceValue === `card:${a.id}`;
        cardGroup.appendChild(opt);
      });
      srcSel.appendChild(cardGroup);
    }

    sourceGroup.appendChild(srcSel);
  } else {
    const hint = document.createElement('span');
    hint.className = 'form-hint';
    hint.textContent = 'No accounts or cards set up. ';
    const bankLink = document.createElement('a');
    bankLink.href = '#';
    bankLink.textContent = 'Add a bank account →';
    bankLink.addEventListener('click', (e) => {
      e.preventDefault();
      modalRef.close?.();
      navigate('/accounts');
    });
    const sep = document.createTextNode(' · ');
    const cardLink = document.createElement('a');
    cardLink.href = '#';
    cardLink.textContent = 'Add a credit card →';
    cardLink.addEventListener('click', (e) => {
      e.preventDefault();
      modalRef.close?.();
      navigate('/debt');
    });
    hint.appendChild(bankLink);
    hint.appendChild(sep);
    hint.appendChild(cardLink);
    sourceGroup.appendChild(hint);
  }

  body.insertBefore(sourceGroup, overageMsg);

  // ── Billing cycle selector (bills, new payment only) ─────────────────────
  let upcomingCycleWindowStart = 0;
  let prevCycleWindowStart = 0;
  let twoAgoCycleWindowStart = 0;
  let prevCycleDueTime = 0;
  let twoAgoCycleDueTime = 0;
  let isUpcomingCyclePaid = false;
  let isPrevCyclePaid = false;
  let isTwoAgoCyclePaid = false;
  let cycleErrorEl: HTMLElement | null = null;
  let selectedCycle: 'upcoming' | 'previous' = 'upcoming';
  const selectedCycles = new Set<string>();

  if (isBill) {
    const interval = freqInterval(expense.recurringFrequency);
    const lastPaidDate = new Date(expense.date);
    let nextDue: Date;
    let prevDue: Date;
    let twoAgoDue: Date;

    if (interval === 1) {
      const now = new Date();
      const y = now.getFullYear(), mo = now.getMonth();
      const dueDay = expense.dueDay!;
      nextDue   = new Date(y, mo,     Math.min(dueDay, new Date(y, mo + 1, 0).getDate()));
      prevDue   = new Date(y, mo - 1, Math.min(dueDay, new Date(y, mo,     0).getDate()));
      twoAgoDue = new Date(y, mo - 2, Math.min(dueDay, new Date(y, mo - 1, 0).getDate()));
      upcomingCycleWindowStart = nextDue.getTime()   - 14 * 24 * 60 * 60 * 1000;
      prevCycleWindowStart     = prevDue.getTime()   - 14 * 24 * 60 * 60 * 1000;
      twoAgoCycleWindowStart   = twoAgoDue.getTime() - 14 * 24 * 60 * 60 * 1000;
      prevCycleDueTime         = prevDue.getTime();
      twoAgoCycleDueTime       = twoAgoDue.getTime();
    } else {
      nextDue   = computeNextDue(lastPaidDate, expense.dueDay!, interval);
      prevDue   = new Date(nextDue); prevDue.setMonth(prevDue.getMonth() - interval);
      twoAgoDue = new Date(nextDue); twoAgoDue.setMonth(twoAgoDue.getMonth() - 2 * interval);
      upcomingCycleWindowStart = new Date(nextDue.getFullYear(),   nextDue.getMonth(),   1).getTime();
      prevCycleWindowStart     = new Date(prevDue.getFullYear(),   prevDue.getMonth(),   1).getTime();
      twoAgoCycleWindowStart   = new Date(twoAgoDue.getFullYear(), twoAgoDue.getMonth(), 1).getTime();
      prevCycleDueTime         = prevDue.getTime();
      twoAgoCycleDueTime       = twoAgoDue.getTime();
    }

    const relevantRecs = allPaidRecords.filter(
      (r) => r.expenseId === expense.id && !(isUpdate && existingRecord && r.id === existingRecord.id),
    );
    isUpcomingCyclePaid = relevantRecs.some((r) => r.date >= upcomingCycleWindowStart);
    isPrevCyclePaid     = relevantRecs.some((r) => r.date >= prevCycleWindowStart && r.date < upcomingCycleWindowStart);
    isTwoAgoCyclePaid   = relevantRecs.some((r) => r.date >= twoAgoCycleWindowStart && r.date < prevCycleWindowStart);

    const fmtDue = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const cycleGroup = document.createElement('div');
    cycleGroup.className = 'form-group';
    const cycleError = document.createElement('p');
    cycleError.className = 'form-error';
    cycleError.style.display = 'none';
    cycleErrorEl = cycleError;

    if (isUpdate && existingRecord) {
      selectedCycle = existingRecord.date >= upcomingCycleWindowStart ? 'upcoming' : 'previous';

      const cycleLbl = document.createElement('label');
      cycleLbl.className = 'form-label';
      cycleLbl.textContent = 'Billing cycle';
      cycleGroup.appendChild(cycleLbl);

      const cycleBar = document.createElement('div');
      cycleBar.className = 'cycle-selector';

      const editPillsData: Array<{ value: 'upcoming' | 'previous'; label: string; paid: boolean }> = [
        { value: 'upcoming', label: fmtDue(nextDue), paid: isUpcomingCyclePaid },
        { value: 'previous', label: fmtDue(prevDue), paid: isPrevCyclePaid },
      ];
      const editPills: HTMLButtonElement[] = [];
      const refreshEditPills = () => {
        editPills.forEach((p) => p.classList.toggle('active', p.dataset['cycle'] === selectedCycle));
      };
      editPillsData.forEach(({ value, label, paid }) => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'cycle-pill';
        pill.dataset['cycle'] = value;
        pill.textContent = paid ? `${label} · paid` : label;
        if (paid) pill.classList.add('cycle-pill--paid');
        pill.addEventListener('click', () => {
          if (paid) {
            cycleError.textContent = `⚠ The ${label} cycle is already paid.`;
            cycleError.style.display = '';
            return;
          }
          cycleError.style.display = 'none';
          selectedCycle = value;
          refreshEditPills();
        });
        editPills.push(pill);
        cycleBar.appendChild(pill);
      });
      refreshEditPills();
      cycleGroup.appendChild(cycleBar);
    } else {
      if (!isUpcomingCyclePaid)    selectedCycles.add('upcoming');
      else if (!isPrevCyclePaid)   selectedCycles.add('previous');
      else if (!isTwoAgoCyclePaid) selectedCycles.add('twoago');

      const cycleLbl = document.createElement('label');
      cycleLbl.className = 'form-label';
      cycleLbl.textContent = 'Billing cycles covered';
      cycleGroup.appendChild(cycleLbl);

      const cycleBar = document.createElement('div');
      cycleBar.className = 'cycle-selector';

      const newPillsData = [
        { key: 'upcoming', label: fmtDue(nextDue),   paid: isUpcomingCyclePaid },
        { key: 'previous', label: fmtDue(prevDue),   paid: isPrevCyclePaid },
        { key: 'twoago',   label: fmtDue(twoAgoDue), paid: isTwoAgoCyclePaid },
      ];

      const refreshNewPills = () => {
        cycleBar.querySelectorAll<HTMLButtonElement>('.cycle-pill').forEach((p) => {
          if (!p.classList.contains('cycle-pill--paid')) {
            p.classList.toggle('active', selectedCycles.has(p.dataset['cycleKey']!));
          }
        });
      };

      newPillsData.forEach(({ key, label, paid }) => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'cycle-pill';
        pill.dataset['cycleKey'] = key;
        pill.textContent = paid ? `${label} · paid` : label;
        if (paid) {
          pill.classList.add('cycle-pill--paid');
          pill.disabled = true;
        } else {
          pill.addEventListener('click', () => {
            if (selectedCycles.has(key)) {
              if (selectedCycles.size === 1) {
                cycleError.textContent = '⚠ At least one billing cycle must be selected.';
                cycleError.style.display = '';
                return;
              }
              selectedCycles.delete(key);
            } else {
              selectedCycles.add(key);
            }
            cycleError.style.display = 'none';
            refreshNewPills();
          });
        }
        cycleBar.appendChild(pill);
      });

      refreshNewPills();
      cycleGroup.appendChild(cycleBar);
    }

    cycleGroup.appendChild(cycleError);
    body.insertBefore(cycleGroup, sourceGroup);
  }

  const amountInput = body.querySelector<HTMLInputElement>('#mp-amount')!;
  const overageLimit = expense.threshold ?? expense.amount;

  if (!isFixed) {
    amountInput.addEventListener('input', () => {
      const val = parseFloat(amountInput.value);
      if (!isNaN(val) && val > overageLimit) {
        const over = val - overageLimit;
        const label = expense.threshold ? 'Over target by' : `Over ${freqThresholdLabel(expense.recurringFrequency).toLowerCase()} threshold by`;
        overageMsg.textContent = `⚠ ${label} ${currFmt.format(over)}`;
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
      const paidDate = dateStr ? new Date(dateStr + 'T00:00:00').getTime() : Date.now();
      const sourceVal = body.querySelector<HTMLSelectElement>('#mp-source')?.value ?? '';
      const selectedCardId = sourceVal.startsWith('card:') ? sourceVal.slice(5) : null;
      const selectedBankId = sourceVal.startsWith('bank:') ? sourceVal.slice(5) : null;

      const { cardId: _cid, bankAccountId: _bid, ...baseFields } =
        isUpdate && existingRecord ? existingRecord : createExpensePaidRecord(expense.id, paidAmount, paidDate);
      const record: ExpensePaidRecord = {
        ...baseFields,
        amount: paidAmount,
        date: paidDate,
        ...(selectedCardId ? { cardId: selectedCardId } : {}),
        ...(selectedBankId ? { bankAccountId: selectedBankId } : {}),
      };
      const ops: Promise<unknown>[] = [saveExpensePaidRecord(record)];

      if (isBill) {
        let expenseDateForCycle: number;
        if (!isUpdate) {
          if (selectedCycles.size === 0) {
            if (cycleErrorEl) {
              cycleErrorEl.textContent = '⚠ Select at least one billing cycle.';
              cycleErrorEl.style.display = '';
            }
            return;
          }
          const cycleWindowMap: Record<string, number> = {
            upcoming: upcomingCycleWindowStart,
            previous: prevCycleWindowStart,
            twoago:   twoAgoCycleWindowStart,
          };
          const cycleOrder = ['upcoming', 'previous', 'twoago'];
          const mostRecentKey = cycleOrder.find((k) => selectedCycles.has(k)) ?? 'upcoming';
          const mostRecentWindowStart = cycleWindowMap[mostRecentKey]!;
          expenseDateForCycle = paidDate >= mostRecentWindowStart ? paidDate : mostRecentWindowStart;

          const extraCycleDueTimes: Record<string, number> = {
            previous: prevCycleDueTime,
            twoago:   twoAgoCycleDueTime,
          };
          const extraKeys = cycleOrder.filter((k) => k !== mostRecentKey && selectedCycles.has(k));
          for (const key of extraKeys) {
            const extraDate = extraCycleDueTimes[key] ?? paidDate;
            const extraRecord = createExpensePaidRecord(expense.id, paidAmount, extraDate);
            if (selectedCardId) extraRecord.cardId = selectedCardId;
            else if (selectedBankId) extraRecord.bankAccountId = selectedBankId;
            ops.push(saveExpensePaidRecord(extraRecord));
          }
        } else {
          const windowStart = selectedCycle === 'upcoming' ? upcomingCycleWindowStart : prevCycleWindowStart;
          const cycleDate = paidDate >= windowStart ? paidDate : windowStart;
          const freshRecords = await getExpensePaidRecords(expense.id);
          const others = freshRecords.filter((rec) => rec.id !== existingRecord!.id);
          expenseDateForCycle = others.length > 0
            ? Math.max(cycleDate, ...others.map((rec) => rec.date))
            : cycleDate;
        }
        ops.push(saveExpense({ ...expense, date: expenseDateForCycle }));
      }

      const existingCharge = await findChargeByExpenseId(expense.id);
      if (selectedCardId) {
        if (existingCharge && existingCharge.accountId === selectedCardId) {
          ops.push(saveCardCharge({ ...existingCharge, amount: paidAmount, date: paidDate }));
        } else {
          if (existingCharge) ops.push(deleteCardCharge(existingCharge.id));
          const charge = createCardCharge(selectedCardId, expense.description, paidAmount, paidDate, expense.categoryId || undefined);
          charge.sourceExpenseId = expense.id;
          ops.push(saveCardCharge(charge));
        }
      } else if (existingCharge) {
        ops.push(deleteCardCharge(existingCharge.id));
      }

      await Promise.all(ops);
      close();
      await onSave();
      refreshNotifier();

      if (paidAmount > overageLimit) {
        const overCount = await getOverageTrend(expense.id, overageLimit);
        if (overCount >= 2) {
          const fmtLimit = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(overageLimit);
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
