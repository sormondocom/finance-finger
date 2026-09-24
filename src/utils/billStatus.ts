import type { Expense } from '@/types';

export type BillStatus = 'paid' | 'due-soon' | 'past-due' | 'ok';

export interface BillPaymentStatus {
  status: BillStatus;
  dueDayThisMonth: Date | null;
}

/**
 * Returns the next due date strictly after lastPaid, advancing by monthInterval months.
 * Exported so the expense form can compute default date-picker values.
 *
 * dueDay is clamped to the actual days in the target month on each iteration so that
 * e.g. a bill due on the 31st in a month with only 28 days lands on the 28th rather
 * than overflowing into the next month entirely.
 */
export function computeNextDue(lastPaid: Date, dueDay: number, monthInterval: number): Date {
  let year  = lastPaid.getFullYear();
  let month = lastPaid.getMonth();

  const clampedDate = (): Date => {
    const maxDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(dueDay, maxDay));
  };

  let candidate = clampedDate();
  while (candidate <= lastPaid) {
    month += monthInterval;
    if (month > 11) { year += Math.floor(month / 12); month = month % 12; }
    candidate = clampedDate();
  }
  return candidate;
}

function billInterval(freq: string | null | undefined): number {
  if (freq === 'quarterly') return 3;
  if (freq === 'annual')    return 12;
  return 1;
}

// ── Expense billing state — three-field invariant ──────────────────────────────
//
// expense.date      Billing anchor / last-paid tracker. Starts as the Start Date
//                   the user entered. After every recorded payment it is advanced
//                   to the payment timestamp. computeBillStatus reads this as
//                   "lastPaid" to decide whether the current cycle has been paid.
//
// expense.startDate Informational only — the date the user says the service began.
//                   Never used for billing status computation.
//
// expense.firstDueDate  Guard for not-yet-started billing. Present only if the
//                       user entered a First Due Date that is in the future at
//                       creation time. While today < firstDueDate the status is
//                       suppressed (returns 'ok' or 'due-soon' at most). Cleared
//                       implicitly once a payment is recorded (saveExpense advances
//                       expense.date and ExpenseForm deletes firstDueDate on save).
//
// Files that write expense.date: ExpenseForm.ts (anchor setup), ExpensePaymentModal.ts
// (payment recorded), autoPayRecords.ts (auto-pay recorded).
//
export function computeBillStatus(expense: Expense, now = new Date()): BillPaymentStatus {
  if (!expense.recurring || !expense.dueDay) {
    return { status: 'ok', dueDayThisMonth: null };
  }

  // Billing hasn't started yet — suppress past-due until first due date arrives.
  // If firstDueDate is within 7 days, surface as due-soon so user isn't surprised.
  if (expense.firstDueDate) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (todayStart < expense.firstDueDate) {
      const daysUntilFirstDue = Math.floor((expense.firstDueDate - todayStart) / 86_400_000);
      if (daysUntilFirstDue > 7) {
        return { status: 'ok', dueDayThisMonth: null };
      }
      const firstDue = new Date(expense.firstDueDate);
      const maxDay = new Date(firstDue.getFullYear(), firstDue.getMonth() + 1, 0).getDate();
      const clampedDay = Math.min(firstDue.getDate(), maxDay);
      return { status: 'due-soon', dueDayThisMonth: new Date(firstDue.getFullYear(), firstDue.getMonth(), clampedDay) };
    }
  }

  const year  = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const lastPaid = new Date(expense.date);
  const interval = billInterval(expense.recurringFrequency);

  // ── Multi-month bills (quarterly, annual): only active in their due month ─
  if (interval > 1) {
    const nextDue = computeNextDue(lastPaid, expense.dueDay, interval);

    if (nextDue.getFullYear() !== year || nextDue.getMonth() !== month) {
      return { status: 'ok', dueDayThisMonth: null };
    }

    const maxDay = new Date(year, month + 1, 0).getDate();
    const clampedDay = Math.min(expense.dueDay, maxDay);
    const dueDayThisMonth = new Date(year, month, clampedDay);

    const paidThisCycle =
      lastPaid.getFullYear() === nextDue.getFullYear() &&
      lastPaid.getMonth()    === nextDue.getMonth();

    if (paidThisCycle) return { status: 'paid', dueDayThisMonth };

    const daysUntilDue = clampedDay - today;
    const status: BillStatus =
      daysUntilDue <= 0 ? 'past-due'  :
      daysUntilDue <= 7 ? 'due-soon'  : 'ok';
    return { status, dueDayThisMonth };
  }

  // ── Monthly (and weekly / biweekly / semimonthly) ─────────────────────────
  const maxDay = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.min(expense.dueDay, maxDay);
  const dueDayThisMonth = new Date(year, month, clampedDay);

  // Paid if lastPaid falls within 14 days before the due date through end of month.
  // This covers early payments (e.g., paying Aug 31 for a Sep 9 due date).
  const cycleWindowStart = new Date(dueDayThisMonth.getTime() - 14 * 24 * 60 * 60 * 1000);
  if (lastPaid >= cycleWindowStart) return { status: 'paid', dueDayThisMonth };

  const daysUntilDue = clampedDay - today;
  const status: BillStatus =
    daysUntilDue <= 0 ? 'past-due'  :
    daysUntilDue <= 7 ? 'due-soon'  : 'ok';
  return { status, dueDayThisMonth };
}
