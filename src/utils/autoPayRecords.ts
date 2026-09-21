import browser from 'webextension-polyfill';
import { getExpenses, saveExpense } from '@/db';
import { accounting } from '@/accounting';
import { computeBillStatus } from '@/utils/billStatus';
import type { Expense } from '@/types';

export interface AutoPayPrompt {
  expense: Expense;
  dueDate: number;
}

export interface AutoPayResult {
  recorded: number;
  pendingPrompts: AutoPayPrompt[];
}

// Auto-records fixed-amount auto-pay bills whose due date has passed and no
// payment exists for the current billing cycle.  Variable-amount auto-pay
// bills that fall within the prompt window are returned in pendingPrompts so
// the foreground can notify the user to log the actual charge.
//
// Dedup: computeBillStatus(expense) returns 'paid' once expense.date has been
// updated to fall within the cycle window.  We update expense.date after every
// silent auto-record so subsequent runs skip already-recorded bills.
//
// Prompt window (autoPayPromptDays, default 7): bills whose due date is older
// than this many days are silently skipped — they are presumed handled via
// reconciliation or already logged manually.
export async function autoRecordAutoPay(): Promise<AutoPayResult> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const [storageResult, expenses] = await Promise.all([
    browser.storage.local.get('autoPayPromptDays'),
    getExpenses(),
  ]);

  const promptWindowDays = (storageResult['autoPayPromptDays'] as number | undefined) ?? 7;
  const cutoffTs = todayStart - promptWindowDays * 86_400_000;

  const autoPayBills = expenses.filter(
    (e) => e.isAutoPay && e.recurring && !!e.dueDay,
  );

  if (autoPayBills.length === 0) return { recorded: 0, pendingPrompts: [] };

  let recordedCount = 0;
  const pendingPrompts: AutoPayPrompt[] = [];

  for (const expense of autoPayBills) {
    const { status, dueDayThisMonth } = computeBillStatus(expense, now);

    if (status !== 'past-due') continue;
    if (!dueDayThisMonth) continue;

    const dueDateTs = dueDayThisMonth.getTime();

    // Due date is older than the prompt window — skip silently.
    if (dueDateTs < cutoffTs) continue;

    if (expense.isFixedAmount) {
      await accounting.recordExpensePayment({
        expenseId: expense.id,
        description: expense.description,
        amount: expense.amount,
        date: dueDateTs,
        ...(expense.bankAccountId ? { bankAccountId: expense.bankAccountId } : {}),
        ...(expense.linkedCardId  ? { cardId: expense.linkedCardId }         : {}),
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

      // Advance expense.date into the current cycle window so the next run of
      // computeBillStatus returns 'paid' and we don't double-record.
      await saveExpense({ ...expense, date: dueDateTs });
      recordedCount++;
    } else {
      pendingPrompts.push({ expense, dueDate: dueDateTs });
    }
  }

  return { recorded: recordedCount, pendingPrompts };
}
