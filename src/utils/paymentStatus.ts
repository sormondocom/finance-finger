import type { DebtAccount, DebtPayment, PaymentCycle } from '@/types';

export type MonthPaymentStatus =
  | 'paid'      // payments this month >= minimum
  | 'partial'   // some payment, but below minimum, due date still future
  | 'due-soon'  // no qualifying payment, due within 7 days
  | 'past-due'  // due date has passed without meeting minimum
  | 'ok'        // no minimum set, or due date is far away
  | 'paid-off'; // balance is $0

export interface HistoricalMonth {
  key: string;        // "2026-07"
  label: string;      // "Jul 2026"
  total: number;
  extra: number;      // sum of 'extra' type payments
  minimumMet: boolean;
}

export interface AccountPaymentStatus {
  accountId: string;
  currentMonth: MonthPaymentStatus;
  dueDayThisMonth: Date | null;
  minimumPayment: number | undefined;
  currentMonthTotal: number;
  currentMonthExtra: number;  // sum of 'extra' type payments in the current billing window
  historicalMonths: HistoricalMonth[];
}

export function computeMinPayment(a: DebtAccount): number | undefined {
  if (a.minimumPaymentValue == null) return undefined;
  if (a.minimumPaymentType === 'fixed') return a.minimumPaymentValue;
  return Math.max(a.balance * a.minimumPaymentValue / 100, 25);
}

function advanceByCycle(date: Date, cycle: PaymentCycle): Date {
  const d = new Date(date);
  switch (cycle) {
    case 'monthly': {
      const targetDay = d.getDate();
      d.setMonth(d.getMonth() + 1);
      const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(targetDay, maxDay));
      break;
    }
    case 'biweekly':    d.setDate(d.getDate() + 14); break;
    case 'weekly':      d.setDate(d.getDate() + 7);  break;
    case 'semimonthly': d.setDate(d.getDate() + 15); break;
  }
  return d;
}

export function computePaymentStatus(
  account: DebtAccount,
  payments: DebtPayment[],
  now = new Date(),
): AccountPaymentStatus {
  const minPay = computeMinPayment(account);
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const currentKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  // Compute the effective next due date FIRST so the payment window can use it.
  // If nextDueDateMs is stored, advance it forward by the payment cycle until it
  // reaches the current month or a future month. This prevents a newly-added card
  // from immediately showing past-due when the day-of-month has already passed.
  let effectiveDueDate: Date | null = null;
  if (account.nextDueDateMs) {
    let candidate = new Date(account.nextDueDateMs);
    const currentMonthStart = new Date(year, month, 1);
    while (candidate < currentMonthStart) {
      candidate = advanceByCycle(candidate, account.paymentCycle);
    }
    effectiveDueDate = candidate;
  } else if (account.dueDay) {
    // Legacy path: no nextDueDateMs — project dueDay into current month
    const maxDay = new Date(year, month + 1, 0).getDate();
    effectiveDueDate = new Date(year, month, Math.min(account.dueDay, maxDay));
  }

  // Billing cycle window: 14 days before the due date through end of current month.
  // This captures early payments (e.g., paying Aug 31 for a Sep 9 due date).
  // Falls back to calendar-month start when no due date is configured.
  const windowEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const windowStart = effectiveDueDate
    ? new Date(effectiveDueDate.getTime() - 14 * 24 * 60 * 60 * 1000)
    : new Date(year, month, 1);

  const thisMonthPayments = payments.filter((p) => {
    const d = new Date(p.date);
    return d >= windowStart && d <= windowEnd;
  });
  const currentMonthTotal = thisMonthPayments.reduce((s, p) => s + p.amount, 0);
  const currentMonthExtra = thisMonthPayments
    .filter((p) => p.type === 'extra')
    .reduce((s, p) => s + p.amount, 0);

  // dueDayThisMonth is only populated when the effective due date falls in the current month
  let dueDayThisMonth: Date | null = null;
  if (effectiveDueDate) {
    const inCurrentMonth =
      effectiveDueDate.getFullYear() === year && effectiveDueDate.getMonth() === month;
    if (inCurrentMonth) dueDayThisMonth = effectiveDueDate;
  }

  let currentMonth: MonthPaymentStatus;
  if (account.balance === 0) {
    currentMonth = 'paid-off';
  } else if (minPay == null) {
    currentMonth = 'ok';
  } else if (currentMonthTotal >= minPay) {
    currentMonth = 'paid';
  } else if (!effectiveDueDate) {
    currentMonth = currentMonthTotal > 0 ? 'partial' : 'ok';
  } else {
    const inCurrentMonth =
      effectiveDueDate.getFullYear() === year && effectiveDueDate.getMonth() === month;
    if (!inCurrentMonth) {
      // Due date is in a future month — nothing is due yet this cycle
      currentMonth = currentMonthTotal > 0 ? 'partial' : 'ok';
    } else {
      const daysUntilDue = effectiveDueDate.getDate() - today;
      if (daysUntilDue <= 0) {
        currentMonth = 'past-due';
      } else if (daysUntilDue <= 7) {
        currentMonth = currentMonthTotal > 0 ? 'partial' : 'due-soon';
      } else {
        currentMonth = currentMonthTotal > 0 ? 'partial' : 'ok';
      }
    }
  }

  const historicalMonths = buildHistoricalMonths(payments, minPay, currentKey, windowStart);

  return { accountId: account.id, currentMonth, dueDayThisMonth, minimumPayment: minPay, currentMonthTotal, currentMonthExtra, historicalMonths };
}

function buildHistoricalMonths(
  payments: DebtPayment[],
  minimumPayment: number | undefined,
  currentKey: string,
  currentWindowStart: Date,
): HistoricalMonth[] {
  const byMonth = new Map<string, { total: number; extra: number }>();
  for (const p of payments) {
    const d = new Date(p.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (key === currentKey) continue;
    // Skip payments that fall in the current billing window (already counted in current month)
    if (d >= currentWindowStart) continue;
    const existing = byMonth.get(key) ?? { total: 0, extra: 0 };
    existing.total += p.amount;
    if (p.type === 'extra') existing.extra += p.amount;
    byMonth.set(key, existing);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, { total, extra }]) => {
      const [yearStr, monthStr] = key.split('-');
      const label = new Date(Number(yearStr), Number(monthStr) - 1, 1)
        .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      return { key, label, total, extra, minimumMet: minimumPayment != null ? total >= minimumPayment : false };
    });
}
