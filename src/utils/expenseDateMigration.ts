import { getExpenses, saveExpense } from '@/db';
import type { Expense } from '@/types';

type LegacyExpense = Expense & {
  startDate?: number;
  firstDueDate?: number;
  threshold?: number;
};

// One-time migration for the startDate/firstDueDate/threshold removal (now
// collapsed to a single required `date` + `notYetBilled` flag, and `amount`
// as the one amount-due figure — see types/index.ts). IndexedDB stores
// encrypted blobs, so schema.ts's upgrade() never sees plaintext and can't do
// this; it has to run after unlock instead, same pattern as catchUp.ts's
// one-time settings migration. Cheap no-op on every launch after the first,
// since no legacy fields remain once a record has been normalized.
export async function migrateLegacyExpenseDates(): Promise<void> {
  const expenses = await getExpenses() as LegacyExpense[];

  for (const expense of expenses) {
    if (expense.startDate == null && expense.firstDueDate == null && expense.threshold == null) continue;

    const updated: LegacyExpense = { ...expense };
    if (updated.firstDueDate != null) {
      // Billing hadn't started under the old model — the real due date was
      // held separately in firstDueDate while `date` was just the (now
      // removed) informational start date. Promote it to be `date` directly.
      updated.date = updated.firstDueDate;
      updated.notYetBilled = true;
    }
    delete updated.startDate;
    delete updated.firstDueDate;
    delete updated.threshold;

    await saveExpense(updated);
  }
}
