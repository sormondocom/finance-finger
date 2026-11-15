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

export function billInterval(freq: string | null | undefined): number {
  if (freq === 'quarterly') return 3;
  if (freq === 'annual')    return 12;
  return 1;
}

// ── Expense billing state — two-field invariant ─────────────────────────────────
//
// expense.date         The First Due Date the user entered — always required, for
//                       recurring and one-time expenses alike. Once a payment is
//                       recorded it's advanced to the payment timestamp, at which
//                       point computeBillStatus reads it as "lastPaid" to decide
//                       whether the current cycle has been paid.
//
// expense.notYetBilled  Guard for not-yet-started billing. Present only while
//                       `date` is a future due date that hasn't been billed yet.
//                       While set and today < date, status is suppressed (returns
//                       'ok' or 'due-soon' at most). Cleared implicitly once a
//                       payment is recorded (saveExpense advances expense.date and
//                       every recording path deletes notYetBilled on save).
//
// Files that write expense.date: ExpenseForm.ts (anchor setup), ExpensePaymentModal.ts
// (payment recorded), autoPayRecords.ts (auto-pay recorded).
//
export function computeBillStatus(expense: Expense, now = new Date()): BillPaymentStatus {
  if (!expense.recurring || !expense.dueDay) {
    return { status: 'ok', dueDayThisMonth: null };
  }

  // Nothing has ever been paid against this bill yet — expense.date is the
  // first due date itself (possibly in the past, today, or the future), not
  // a real prior payment. Handle it before the normal "paid within the last
  // 14 days" check below, which would otherwise misread a never-paid date
  // that happens to fall inside that lookback window as "already paid."
  if (expense.notYetBilled) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (todayStart < expense.date) {
      // Future first due: suppress past-due until it arrives. If it's within
      // 7 days, surface as due-soon so the user isn't surprised.
      const daysUntilFirstDue = Math.floor((expense.date - todayStart) / 86_400_000);
      if (daysUntilFirstDue > 7) {
        return { status: 'ok', dueDayThisMonth: null };
      }
      const firstDue = new Date(expense.date);
      const maxDay = new Date(firstDue.getFullYear(), firstDue.getMonth() + 1, 0).getDate();
      const clampedDay = Math.min(firstDue.getDate(), maxDay);
      return { status: 'due-soon', dueDayThisMonth: new Date(firstDue.getFullYear(), firstDue.getMonth(), clampedDay) };
    }
    // Due today or already passed, and never paid — this first cycle is
    // simply past-due (today counts as past-due, same as the ongoing-bill
    // convention below: daysUntilDue <= 0). dueDayThisMonth mirrors this
    // month's occurrence of the due day, same convention as the ongoing path.
    const year = now.getFullYear();
    const month = now.getMonth();
    const maxDay = new Date(year, month + 1, 0).getDate();
    const dueDayThisMonth = new Date(year, month, Math.min(expense.dueDay, maxDay));
    return { status: 'past-due', dueDayThisMonth };
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
