import type { Expense } from '@/types';
import { computeNextDue, billInterval } from '@/utils/billStatus';

export interface LapsedExpenseCycle {
  expenseId: string;
  description: string;
  dueDate: number;
  expectedAmount: number;
  isAutoPay: boolean;
  correlationId: string;
}

export function expenseCycleCorrelationId(expenseId: string, dueDate: Date): string {
  const y = dueDate.getFullYear();
  const m = String(dueDate.getMonth() + 1).padStart(2, '0');
  const d = String(dueDate.getDate()).padStart(2, '0');
  return `expense-cycle-${expenseId}-${y}-${m}-${d}`;
}

// Pure. Covers both variable-amount auto-pay bills and plain recurring bills
// with a dueDay — i.e. everything NOT handled by autoRecordAutoPay's silent
// fixed-amount path (callers filter that out before passing an expense here).
// Walks forward from expense.date (the billing anchor) via computeNextDue —
// the same per-cycle stepping computeBillStatus already uses for its
// current-cycle check — collecting every due date in [windowStart, now)
// whose cycle hasn't been paid (expense.date hasn't advanced past it yet).
export function enumerateLapsedExpenseCycles(
  expense: Expense,
  now: Date,
  windowStart: Date,
): LapsedExpenseCycle[] {
  if (!expense.recurring || !expense.dueDay) return [];
  if (expense.firstDueDate && now.getTime() < expense.firstDueDate) return [];

  const interval = billInterval(expense.recurringFrequency);
  const results: LapsedExpenseCycle[] = [];

  let candidate = computeNextDue(new Date(expense.date), expense.dueDay, interval);
  while (candidate < now) {
    if (candidate >= windowStart) {
      results.push({
        expenseId: expense.id,
        description: expense.description,
        dueDate: candidate.getTime(),
        expectedAmount: expense.amount,
        isAutoPay: !!expense.isAutoPay,
        correlationId: expenseCycleCorrelationId(expense.id, candidate),
      });
    }
    candidate = computeNextDue(candidate, expense.dueDay, interval);
  }

  return results;
}
