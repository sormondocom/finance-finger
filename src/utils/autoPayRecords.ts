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
    // Billing hasn't started yet — expense.date is the real first due date the
    // user chose (possibly months out), not a prior cycle. Skip entirely until
    // it actually arrives. enumerateLapsedExpenseCycles() guards the same way
    // for non-fixed-amount bills.
    if (expense.notYetBilled && now < expense.date) continue;

    const interval = billInterval(expense.recurringFrequency);

    // Walk forward, collecting every cycle due before now. If billing hasn't
    // started yet (notYetBilled, and the guard above already confirmed
    // expense.date <= now), expense.date IS the first unpaid cycle itself —
    // not "already paid, find next after it" — so it's the first candidate
    // directly; computeNextDue only applies to cycles after that one. For an
    // ongoing bill (notYetBilled unset), expense.date really is the last paid
    // date, so every candidate — including the first — comes from computeNextDue.
    const dueDates: number[] = [];
    let cursor = expense.date;
    let candidate = expense.notYetBilled
      ? cursor
      : computeNextDue(new Date(cursor), expense.dueDay!, interval).getTime();
    while (candidate < now) {
      dueDates.push(candidate);
      cursor = candidate;
      candidate = computeNextDue(new Date(cursor), expense.dueDay!, interval).getTime();
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
    // cycle regardless of how many were actually recorded vs. skipped, and
    // clearing notYetBilled now that the first real cycle has been handled
    // (even if mostRecent happens to equal expense.date itself).
    if (mostRecent !== expense.date || expense.notYetBilled) {
      const updated = { ...expense, date: mostRecent };
      delete updated.notYetBilled;
      await saveExpense(updated);
    }
  }

  return { recorded: recordedCount, recordedItems };
}
