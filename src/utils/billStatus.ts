import type { Expense } from '@/types';

export type BillStatus = 'paid' | 'due-soon' | 'past-due' | 'ok';

export interface BillPaymentStatus {
  status: BillStatus;
  dueDayThisMonth: Date | null;
}

/**
 * Returns the next due date strictly after lastPaid, advancing by monthInterval months.
 * Exported so the expense form can compute default date-picker values.
 */
export function computeNextDue(lastPaid: Date, dueDay: number, monthInterval: number): Date {
  const candidate = new Date(lastPaid.getFullYear(), lastPaid.getMonth(), dueDay);
  while (candidate <= lastPaid) {
    candidate.setMonth(candidate.getMonth() + monthInterval);
  }
  return candidate;
}

function billInterval(freq: string | null | undefined): number {
  if (freq === 'quarterly') return 3;
  if (freq === 'annual')    return 12;
  return 1;
}

export function computeBillStatus(expense: Expense, now = new Date()): BillPaymentStatus {
  if (!expense.recurring || !expense.dueDay) {
    return { status: 'ok', dueDayThisMonth: null };
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
