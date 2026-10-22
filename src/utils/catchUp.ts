import browser from 'webextension-polyfill';
import { getDebtAccounts, getDebtPayments, getExpenses, getBankAccounts, getExpensePaidRecords } from '@/db';
import { accounting } from '@/accounting';
import { showActionableToast } from '@/utils/errorUI';
import { fmtCents } from '@/utils/finance';
import { userLocale } from '@/utils/locale';
import { navigate } from '@/app/router';
import { resolveCatchUpWindowStart } from '@/utils/catchUpWindow';
import { autoRecordPaydays } from '@/utils/paydayDeposits';
import { autoRecordAutoPay } from '@/utils/autoPayRecords';
import { enumerateLapsedDebtCycles, type LapsedDebtCycle } from '@/utils/debtCatchUp';
import { enumerateLapsedExpenseCycles, type LapsedExpenseCycle } from '@/utils/expenseCatchUp';
import { showCatchUpQueue, type CatchUpItem } from '@/mascot/Mascot';
import { openDebtPaymentModal } from '@/components/DebtPaymentModal';
import { openExpensePaymentModal } from '@/components/ExpensePaymentModal';

const DEFAULT_CATCH_UP_WINDOW_DAYS = 90;
const DECLINE_PRUNE_DAYS = 180;

interface CatchUpSettings {
  catchUpWindowDays: number;
  catchUpDeclinedCycles: Record<string, number>;
}

// One-time migration: if the new shared setting hasn't been set yet but either
// legacy per-category setting exists, seed from whichever was more generous so
// existing users don't silently jump to a different default.
async function loadCatchUpSettings(): Promise<CatchUpSettings> {
  const result = await browser.storage.local.get([
    'catchUpWindowDays', 'catchUpDeclinedCycles', 'missedPaydayPromptDays', 'autoPayPromptDays',
  ]);

  let catchUpWindowDays = result['catchUpWindowDays'] as number | undefined;
  if (catchUpWindowDays == null) {
    const legacyPayday  = result['missedPaydayPromptDays'] as number | undefined;
    const legacyAutoPay = result['autoPayPromptDays'] as number | undefined;
    catchUpWindowDays = (legacyPayday != null || legacyAutoPay != null)
      ? Math.max(legacyPayday ?? 3, legacyAutoPay ?? 7)
      : DEFAULT_CATCH_UP_WINDOW_DAYS;
    await browser.storage.local.set({ catchUpWindowDays });
    await browser.storage.local.remove(['missedPaydayPromptDays', 'autoPayPromptDays']);
  }

  const catchUpDeclinedCycles = (result['catchUpDeclinedCycles'] as Record<string, number> | undefined) ?? {};
  return { catchUpWindowDays, catchUpDeclinedCycles };
}

// Persists a "not yet" answer for one specific lapsed cycle so it isn't re-asked
// on the next reopen. Because each cycle's correlationId is pinned to its own
// due date, a later cycle naturally gets a different id and isn't suppressed —
// no expiry logic is needed for correctness. Old entries are pruned on write.
async function declineCycle(correlationId: string): Promise<void> {
  const result = await browser.storage.local.get('catchUpDeclinedCycles');
  const existing = (result['catchUpDeclinedCycles'] as Record<string, number> | undefined) ?? {};
  const now = Date.now();
  const cutoff = now - DECLINE_PRUNE_DAYS * 86_400_000;

  const pruned: Record<string, number> = {};
  for (const [key, declinedAt] of Object.entries(existing)) {
    if (declinedAt >= cutoff) pruned[key] = declinedAt;
  }
  pruned[correlationId] = now;

  await browser.storage.local.set({ catchUpDeclinedCycles: pruned });
}

// Orchestrates everything that needs to happen on reopen: silently catches up
// paydays and fixed-amount auto-pay bills (real ledger entries, no confirmation
// needed), then surfaces every lapsed debt payment and other recurring bill as
// a single mascot-hosted checklist the user confirms or declines one at a time.
//
// `prevOpenedAt` is the OLD value of the `lastOpenedAt` storage key, read by the
// caller before it gets overwritten — null means a fresh install (nothing to
// catch up).
export async function runCatchUp(prevOpenedAt: number | null): Promise<void> {
  const now = Date.now();
  const { catchUpWindowDays, catchUpDeclinedCycles } = await loadCatchUpSettings();
  const windowStart = resolveCatchUpWindowStart(prevOpenedAt, now, catchUpWindowDays);

  const [paydayResult, autoPayResult] = await Promise.all([
    autoRecordPaydays(windowStart),
    autoRecordAutoPay(windowStart),
  ]);

  if (autoPayResult.recordedItems.length > 0) {
    const n = autoPayResult.recorded;
    showActionableToast(
      `${n} auto-pay bill${n > 1 ? 's' : ''} recorded automatically:`,
      'info',
      autoPayResult.recordedItems.map((item) => ({
        label: `${item.description} — ${fmtCents.format(item.amount)} (${new Date(item.date).toLocaleDateString(userLocale, { month: 'short', day: 'numeric' })})`,
        onClick: () => {
          sessionStorage.setItem('cal-focus-expense', item.expenseId);
          navigate('/expenses');
        },
      })),
    );
  }

  const [debtAccounts, debtPayments, expenses, bankAccounts, allPaidRecords] = await Promise.all([
    getDebtAccounts(), getDebtPayments(), getExpenses(), getBankAccounts(), getExpensePaidRecords(),
  ]);

  let lapsedDebt: LapsedDebtCycle[] = [];
  let lapsedExpenses: LapsedExpenseCycle[] = [];

  if (windowStart != null) {
    lapsedDebt = debtAccounts
      .flatMap((a) => enumerateLapsedDebtCycles(
        a, debtPayments.filter((p) => p.accountId === a.id), new Date(now), windowStart,
      ))
      .filter((c) => !(c.correlationId in catchUpDeclinedCycles));

    lapsedExpenses = expenses
      .filter((e) => e.recurring && !!e.dueDay && !(e.isAutoPay && e.isFixedAmount))
      .flatMap((e) => enumerateLapsedExpenseCycles(e, new Date(now), windowStart))
      .filter((c) => !(c.correlationId in catchUpDeclinedCycles));
  }

  const items: CatchUpItem[] = [
    ...paydayResult.pendingPrompts.map((data) => ({ kind: 'payday' as const, data })),
    ...lapsedDebt.map((data) => ({ kind: 'debt-cycle' as const, data })),
    ...lapsedExpenses.map((data) => ({ kind: 'expense-cycle' as const, data })),
  ];
  if (items.length === 0) return;

  const debtAccountMap = new Map(debtAccounts.map((a) => [a.id, a]));
  const expenseMap = new Map(expenses.map((e) => [e.id, e]));

  await showCatchUpQueue(items, {
    recordPayday: (m) => accounting.recordBankCredit({
      accountId: m.bankAccountId,
      description: m.sourceName,
      amount: m.amount,
      date: m.date,
      correlationId: m.correlationId,
    }).then(() => undefined),

    confirmDebtCycle: (c) => new Promise<void>((resolve) => {
      const account = debtAccountMap.get(c.accountId);
      if (!account) { resolve(); return; }
      openDebtPaymentModal({
        account,
        bankAccounts,
        defaultDate: c.dueDate,
        onClose: resolve,
        onSave: () => undefined,
      });
    }),

    confirmExpenseCycle: (c) => new Promise<void>((resolve) => {
      const expense = expenseMap.get(c.expenseId);
      if (!expense) { resolve(); return; }
      openExpensePaymentModal({
        expense,
        bankAccounts,
        cardAccounts: debtAccounts,
        allPaidRecords,
        defaultDate: c.dueDate,
        onClose: resolve,
        onSave: () => undefined,
      });
    }),

    declineDebtCycle: (c) => declineCycle(c.correlationId),
    declineExpenseCycle: (c) => declineCycle(c.correlationId),
  });
}
