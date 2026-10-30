import type { DebtAccount, DebtPayment } from '@/types';
import { advanceByCycle, computeMinPayment, hasQualifyingPaymentForCycle } from '@/utils/paymentStatus';

export interface LapsedDebtCycle {
  accountId: string;
  accountName: string;
  dueDate: number;
  minimumPayment: number | undefined;
  correlationId: string;
}

export function debtCycleCorrelationId(accountId: string, dueDate: Date): string {
  const y = dueDate.getFullYear();
  const m = String(dueDate.getMonth() + 1).padStart(2, '0');
  const d = String(dueDate.getDate()).padStart(2, '0');
  return `debt-cycle-${accountId}-${y}-${m}-${d}`;
}

// Pure. Walks forward from the account's known due-date anchor, one payment
// cycle at a time, collecting every cycle whose due date falls in
// [windowStart, now) with no qualifying payment. The in-progress "current"
// cycle (due date >= now) is left to the existing computePaymentStatus badge,
// not this enumerator — this only surfaces cycles that have fully lapsed.
//
// Requires `nextDueDateMs` to anchor the cycle math precisely (needed for
// weekly/biweekly accounts in particular). Accounts with only a legacy
// `dueDay` and no `nextDueDateMs`, or no due-date info at all, are skipped —
// same treatment as paid-off accounts (balance === 0).
export function enumerateLapsedDebtCycles(
  account: DebtAccount,
  payments: DebtPayment[],
  now: Date,
  windowStart: Date,
): LapsedDebtCycle[] {
  if (account.balance === 0) return [];
  if (!account.nextDueDateMs) return [];

  const minPay = computeMinPayment(account);
  const results: LapsedDebtCycle[] = [];

  let candidate = new Date(account.nextDueDateMs);
  // Fast-forward to the first cycle at or after windowStart.
  while (candidate < windowStart) {
    candidate = advanceByCycle(candidate, account.paymentCycle, account.dueDay);
  }

  while (candidate < now) {
    if (!hasQualifyingPaymentForCycle(payments, candidate, minPay)) {
      results.push({
        accountId: account.id,
        accountName: account.name,
        dueDate: candidate.getTime(),
        minimumPayment: minPay,
        correlationId: debtCycleCorrelationId(account.id, candidate),
      });
    }
    candidate = advanceByCycle(candidate, account.paymentCycle, account.dueDay);
  }

  return results;
}
