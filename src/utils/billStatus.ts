import type { Expense } from '@/types';

export type BillStatus = 'paid' | 'due-soon' | 'past-due' | 'ok';

export interface BillPaymentStatus {
  status: BillStatus;
  dueDayThisMonth: Date | null;
}

export function computeBillStatus(expense: Expense, now = new Date()): BillPaymentStatus {
  if (!expense.recurring || !expense.dueDay) {
    return { status: 'ok', dueDayThisMonth: null };
  }

  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  const maxDay = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.min(expense.dueDay, maxDay);
  const dueDayThisMonth = new Date(year, month, clampedDay);

  // Paid = expense.date (last marked-paid timestamp) falls in this calendar month
  const lastPaid = new Date(expense.date);
  const paidThisMonth =
    lastPaid.getFullYear() === year && lastPaid.getMonth() === month;

  if (paidThisMonth) {
    return { status: 'paid', dueDayThisMonth };
  }

  const daysUntilDue = clampedDay - today;
  let status: BillStatus;
  if (daysUntilDue < 0) status = 'past-due';
  else if (daysUntilDue <= 7) status = 'due-soon';
  else status = 'ok';

  return { status, dueDayThisMonth };
}
