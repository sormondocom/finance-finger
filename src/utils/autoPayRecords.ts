import { getExpenses, saveExpense } from '@/db';
import { accounting } from '@/accounting';
import { computeNextDue, billInterval } from '@/utils/billStatus';
import { expenseCycleCorrelationId } from '@/utils/expenseCatchUp';

export interface RecordedAutoPayItem {
  expenseId: string;
  description: string;
  amount: number;
  date: number;
}

export interface AutoPayResult {
  recorded: number;
  recordedItems: RecordedAutoPayItem[];
}

// Silently auto-records fixed-amount auto-pay bills.
//
// The single most recent missed cycle (i.e. "is this bill currently past
// due?") is ALWAYS recorded, regardless of `windowStart` — this matches the
// original, pre-catch-up behavior of checking on every launch, independent of
// how long the extension was closed. `windowStart` only extends how far back
// we ALSO sweep up additional older missed cycles; it must never gate away
// the current one, or a bill that's simply overdue right now would silently
// stop getting recorded whenever the gap since last open happens to be small
// (e.g. reopening the same day, or a session that just created the bill).
//
// Variable-amount auto-pay bills are NOT handled here; their amount isn't
// knowable in advance, so they're surfaced via enumerateLapsedExpenseCycles()
// + the catch-up mascot queue instead, where the user confirms an amount.
//
// `windowStart`: the oldest due date additional (non-current) cycles are
// allowed to backfill. `null` means no additional historical backfill (e.g.
// first-ever launch) — the current cycle is still recorded. Cycles older than
// both the window and the current one are skipped but still advance the
// stored anchor, so they aren't re-evaluated (and re-skipped) forever.
export async function autoRecordAutoPay(windowStart: Date | null): Promise<AutoPayResult> {
  const expenses = await getExpenses();
  const fixedAutoPayBills = expenses.filter(
    (e) => e.isAutoPay && e.isFixedAmount && e.recurring && !!e.dueDay,
  );

  let recordedCount = 0;
  const recordedItems: RecordedAutoPayItem[] = [];
  const now = Date.now();

  for (const expense of fixedAutoPayBills) {
    const interval = billInterval(expense.recurringFrequency);

    // Walk forward from the anchor, collecting every cycle due before now.
    const dueDates: number[] = [];
    let cursor = expense.date;
    for (;;) {
      const dueDateTs = computeNextDue(new Date(cursor), expense.dueDay!, interval).getTime();
      if (dueDateTs >= now) break;
      dueDates.push(dueDateTs);
      cursor = dueDateTs;
    }
    if (dueDates.length === 0) continue;

    const mostRecent = dueDates[dueDates.length - 1]!;
    const toRecord = dueDates.filter(
      (d) => d === mostRecent || (windowStart != null && d >= windowStart.getTime()),
    );

    for (const dueDateTs of toRecord) {
      await accounting.recordExpensePayment({
        expenseId: expense.id,
        description: expense.description,
        amount: expense.amount,
        date: dueDateTs,
        correlationId: expenseCycleCorrelationId(expense.id, new Date(dueDateTs)),
        ...(expense.bankAccountId ? { bankAccountId: expense.bankAccountId } : {}),
        ...(expense.linkedCardId ? { cardId: expense.linkedCardId } : {}),
      });

      // If the expense is linked to a card, also post a charge entry so the
      // card balance reflects the purchase (mirrors what openLogActualForm does).
      if (expense.linkedCardId) {
        await accounting.recordCharge({
          accountId: expense.linkedCardId,
          description: expense.description,
          amount: expense.amount,
          date: dueDateTs,
          ...(expense.categoryId ? { categoryId: expense.categoryId } : {}),
          sourceExpenseId: expense.id,
        });
      }

      recordedCount++;
      recordedItems.push({
        expenseId: expense.id,
        description: expense.description,
        amount: expense.amount,
        date: dueDateTs,
      });
    }

    // Single write per expense, advancing all the way to the most recent
    // cycle regardless of how many were actually recorded vs. skipped.
    if (mostRecent !== expense.date) {
      await saveExpense({ ...expense, date: mostRecent });
    }
  }

  return { recorded: recordedCount, recordedItems };
}
