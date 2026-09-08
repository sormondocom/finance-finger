import { describe, it, expect } from 'vitest';
import { computeMinPayment, computePaymentStatus } from './paymentStatus';
import type { DebtAccount, DebtPayment } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAccount(overrides: Partial<DebtAccount> & { balance: number }): DebtAccount {
  return {
    id: 'acct-1',
    type: 'card',
    name: 'Test Card',
    apr: 20,
    paymentCycle: 'monthly',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makePayment(overrides: Partial<DebtPayment> & { amount: number; date: number }): DebtPayment {
  return {
    id: 'pmt-1',
    accountId: 'acct-1',
    type: 'regular',
    createdAt: 0,
    ...overrides,
  };
}

// ── computeMinPayment ─────────────────────────────────────────────────────────

describe('computeMinPayment', () => {
  it('returns undefined when no minimum is configured', () => {
    const acct = makeAccount({ balance: 1000 });
    expect(computeMinPayment(acct)).toBeUndefined();
  });

  it('returns the exact fixed minimum', () => {
    const acct = makeAccount({
      balance: 1000,
      minimumPaymentType: 'fixed',
      minimumPaymentValue: 75,
    });
    expect(computeMinPayment(acct)).toBe(75);
  });

  it('returns percentage of balance when above the $25 floor', () => {
    // 2% of $5000 = $100 → above floor
    const acct = makeAccount({
      balance: 5000,
      minimumPaymentType: 'percentage',
      minimumPaymentValue: 2,
    });
    expect(computeMinPayment(acct)).toBeCloseTo(100, 4);
  });

  it('returns the $25 floor when percentage would be below it', () => {
    // 2% of $100 = $2 → below $25 floor → clamp to 25
    const acct = makeAccount({
      balance: 100,
      minimumPaymentType: 'percentage',
      minimumPaymentValue: 2,
    });
    expect(computeMinPayment(acct)).toBe(25);
  });
});

// ── computePaymentStatus ──────────────────────────────────────────────────────

describe('computePaymentStatus', () => {
  it('returns paid-off when balance is 0', () => {
    const acct = makeAccount({
      balance: 0,
      minimumPaymentType: 'fixed',
      minimumPaymentValue: 50,
      dueDay: 15,
    });
    const result = computePaymentStatus(acct, [], new Date('2026-01-10'));
    expect(result.currentMonth).toBe('paid-off');
  });

  it('returns ok when no minimum is configured', () => {
    const acct = makeAccount({ balance: 1000, dueDay: 15 });
    const result = computePaymentStatus(acct, [], new Date('2026-01-10'));
    expect(result.currentMonth).toBe('ok');
    expect(result.minimumPayment).toBeUndefined();
  });

  it('returns paid when total payments in window meet the minimum', () => {
    // dueDay = 20; window starts Jan 6; payment on Jan 10 is inside window
    const acct = makeAccount({
      balance: 1000,
      minimumPaymentType: 'fixed',
      minimumPaymentValue: 100,
      dueDay: 20,
    });
    const pmt = makePayment({
      amount: 100,
      date: new Date('2026-01-10').getTime(),
    });
    const result = computePaymentStatus(acct, [pmt], new Date('2026-01-15'));
    expect(result.currentMonth).toBe('paid');
    expect(result.currentMonthTotal).toBe(100);
  });

  it('returns past-due when due date passed with no payment', () => {
    // dueDay = 5; now = Jan 15; Jan 5 already passed
    const acct = makeAccount({
      balance: 500,
      minimumPaymentType: 'fixed',
      minimumPaymentValue: 50,
      dueDay: 5,
    });
    const result = computePaymentStatus(acct, [], new Date('2026-01-15'));
    expect(result.currentMonth).toBe('past-due');
  });

  it('returns due-soon when due date is within 7 days and no payment', () => {
    // dueDay = 18; now = Jan 15; 3 days until due
    const acct = makeAccount({
      balance: 500,
      minimumPaymentType: 'fixed',
      minimumPaymentValue: 50,
      dueDay: 18,
    });
    const result = computePaymentStatus(acct, [], new Date('2026-01-15'));
    expect(result.currentMonth).toBe('due-soon');
  });

  it('returns ok when due date is far away and no payment', () => {
    // dueDay = 28; now = Jan 5; 23 days until due
    const acct = makeAccount({
      balance: 500,
      minimumPaymentType: 'fixed',
      minimumPaymentValue: 50,
      dueDay: 28,
    });
    const result = computePaymentStatus(acct, [], new Date('2026-01-05'));
    expect(result.currentMonth).toBe('ok');
  });

  it('accumulates multiple payments in the window', () => {
    const acct = makeAccount({
      balance: 1000,
      minimumPaymentType: 'fixed',
      minimumPaymentValue: 100,
      dueDay: 20,
    });
    const pmt1 = makePayment({ amount: 60, date: new Date('2026-01-08').getTime() });
    const pmt2 = makePayment({ amount: 50, date: new Date('2026-01-12').getTime() });
    const result = computePaymentStatus(acct, [pmt1, pmt2], new Date('2026-01-15'));
    expect(result.currentMonthTotal).toBe(110);
    expect(result.currentMonth).toBe('paid');
  });

  it('tracks extra payments separately from regular payments', () => {
    const acct = makeAccount({
      balance: 1000,
      minimumPaymentType: 'fixed',
      minimumPaymentValue: 50,
      dueDay: 20,
    });
    const regular = makePayment({ amount: 75, date: new Date('2026-01-10').getTime(), type: 'regular' });
    const extra   = makePayment({ id: 'pmt-2', amount: 100, date: new Date('2026-01-11').getTime(), type: 'extra' });
    const result = computePaymentStatus(acct, [regular, extra], new Date('2026-01-15'));
    expect(result.currentMonthExtra).toBe(100);
    expect(result.currentMonthTotal).toBe(175);
  });

  it('exposes accountId in the result', () => {
    const acct = makeAccount({ balance: 500, id: 'my-card' });
    const result = computePaymentStatus(acct, [], new Date('2026-01-10'));
    expect(result.accountId).toBe('my-card');
  });
});

// ── nextDueDateMs forwarding + advanceByCycle ─────────────────────────────────

describe('computePaymentStatus — nextDueDateMs forwarding', () => {
  it('advances a stale biweekly nextDueDateMs to the current month', () => {
    // nextDueDateMs=Dec 3, 2025; biweekly: +14 days each step
    // Dec 3 → Dec 17 → Dec 31 → Jan 14, 2026 (first date >= Jan 1)
    const acct = makeAccount({
      balance: 500,
      minimumPaymentType: 'fixed', minimumPaymentValue: 50,
      paymentCycle: 'biweekly',
      nextDueDateMs: new Date(2025, 11, 3).getTime(),
    });
    const result = computePaymentStatus(acct, [], new Date(2026, 0, 15));
    // Jan 14 < Jan 15 → past-due
    expect(result.currentMonth).toBe('past-due');
    expect(result.dueDayThisMonth?.getDate()).toBe(14);
  });

  it('advances a stale weekly nextDueDateMs to the current month', () => {
    // nextDueDateMs=Dec 26, 2025; weekly: +7 days
    // Dec 26 → Jan 2, 2026 (first >= Jan 1)
    const acct = makeAccount({
      balance: 500,
      minimumPaymentType: 'fixed', minimumPaymentValue: 50,
      paymentCycle: 'weekly',
      nextDueDateMs: new Date(2025, 11, 26).getTime(),
    });
    const result = computePaymentStatus(acct, [], new Date(2026, 0, 10));
    // Jan 2 < Jan 10 → past-due
    expect(result.currentMonth).toBe('past-due');
    expect(result.dueDayThisMonth?.getDate()).toBe(2);
  });

  it('advances a stale semimonthly nextDueDateMs to the current month', () => {
    // nextDueDateMs=Dec 20, 2025; semimonthly: +15 days
    // Dec 20 → Jan 4, 2026 (first >= Jan 1)
    const acct = makeAccount({
      balance: 500,
      minimumPaymentType: 'fixed', minimumPaymentValue: 50,
      paymentCycle: 'semimonthly',
      nextDueDateMs: new Date(2025, 11, 20).getTime(),
    });
    const result = computePaymentStatus(acct, [], new Date(2026, 0, 10));
    // Jan 4 < Jan 10 → past-due
    expect(result.currentMonth).toBe('past-due');
    expect(result.dueDayThisMonth?.getDate()).toBe(4);
  });

  it('nextDueDateMs already in current month is used as-is', () => {
    // nextDueDateMs=Jan 20, 2026; already >= Jan 1 → no advancement needed
    const acct = makeAccount({
      balance: 500,
      minimumPaymentType: 'fixed', minimumPaymentValue: 50,
      paymentCycle: 'monthly',
      nextDueDateMs: new Date(2026, 0, 20).getTime(),
    });
    const result = computePaymentStatus(acct, [], new Date(2026, 0, 15));
    // Jan 20 > Jan 15 → due-soon (5 days)
    expect(result.currentMonth).toBe('due-soon');
    expect(result.dueDayThisMonth?.getDate()).toBe(20);
  });

  it('nextDueDateMs in a future month does not set dueDayThisMonth', () => {
    // nextDueDateMs=Feb 15, 2026; now=Jan 15 → effectiveDueDate Feb 15, not in January
    const acct = makeAccount({
      balance: 500,
      minimumPaymentType: 'fixed', minimumPaymentValue: 50,
      paymentCycle: 'monthly',
      nextDueDateMs: new Date(2026, 1, 15).getTime(),
    });
    const result = computePaymentStatus(acct, [], new Date(2026, 0, 15));
    expect(result.currentMonth).toBe('ok');
    expect(result.dueDayThisMonth).toBeNull();
  });
});

// ── partial status ────────────────────────────────────────────────────────────

describe('computePaymentStatus — partial status', () => {
  it('returns partial when no due date is set but an incomplete payment was made', () => {
    // No dueDay, no nextDueDateMs → !effectiveDueDate path; windowStart=Jan 1
    const acct = makeAccount({
      balance: 500,
      minimumPaymentType: 'fixed', minimumPaymentValue: 100,
    });
    const pmt = makePayment({ amount: 50, date: new Date(2026, 0, 5).getTime() });
    const result = computePaymentStatus(acct, [pmt], new Date(2026, 0, 15));
    expect(result.currentMonth).toBe('partial');
  });

  it('returns ok when no due date is set and no payment was made', () => {
    const acct = makeAccount({
      balance: 500,
      minimumPaymentType: 'fixed', minimumPaymentValue: 100,
    });
    const result = computePaymentStatus(acct, [], new Date(2026, 0, 15));
    expect(result.currentMonth).toBe('ok');
  });

  it('returns partial in due-soon window when payment exists but is below minimum', () => {
    // dueDay=18; now=Jan 15 (3 days to due); payment=30 < min=100 → partial not due-soon
    const acct = makeAccount({
      balance: 500,
      minimumPaymentType: 'fixed', minimumPaymentValue: 100,
      dueDay: 18,
    });
    // windowStart=Jan 4 (Jan 18 - 14); payment Jan 10 is in window
    const pmt = makePayment({ amount: 30, date: new Date(2026, 0, 10).getTime() });
    const result = computePaymentStatus(acct, [pmt], new Date(2026, 0, 15));
    expect(result.currentMonth).toBe('partial');
  });

  it('returns partial when due date is far away but incomplete payment was made', () => {
    // dueDay=28; now=Jan 15 (13 days); windowStart=Jan 14; payment Jan 15 in window
    const acct = makeAccount({
      balance: 500,
      minimumPaymentType: 'fixed', minimumPaymentValue: 100,
      dueDay: 28,
    });
    const pmt = makePayment({ amount: 30, date: new Date(2026, 0, 15).getTime() });
    const result = computePaymentStatus(acct, [pmt], new Date(2026, 0, 15));
    expect(result.currentMonth).toBe('partial');
  });

  it('returns partial when nextDueDateMs is in a future month but an early payment landed in the window', () => {
    // nextDueDateMs=Feb 2, 2026; windowStart=Jan 19 (Feb 2 - 14 days); windowEnd=Jan 31
    // effectiveDueDate is Feb (not current month Jan) → future-month branch
    // Payment Jan 25 is in window → currentMonthTotal=50 → 50 > 0 → partial
    const acct = makeAccount({
      balance: 500,
      minimumPaymentType: 'fixed', minimumPaymentValue: 100,
      paymentCycle: 'monthly',
      nextDueDateMs: new Date(2026, 1, 2).getTime(),
    });
    const pmt = makePayment({ amount: 50, date: new Date(2026, 0, 25).getTime() });
    const result = computePaymentStatus(acct, [pmt], new Date(2026, 0, 15));
    expect(result.currentMonth).toBe('partial');
    expect(result.dueDayThisMonth).toBeNull();
  });
});

// ── historicalMonths ──────────────────────────────────────────────────────────

describe('computePaymentStatus — historicalMonths', () => {
  it('builds a historical month entry from a prior payment', () => {
    // now=Jan 15; dueDay=20; windowStart=Jan 6
    // Dec 10 payment is before windowStart → historical; Jan 10 is in window → current
    const acct = makeAccount({
      balance: 1000,
      minimumPaymentType: 'fixed', minimumPaymentValue: 100,
      dueDay: 20,
    });
    const pmt1 = makePayment({ id: 'h1', amount: 120, date: new Date(2025, 11, 10).getTime() });
    const pmt2 = makePayment({ id: 'c1', amount: 100, date: new Date(2026, 0, 10).getTime() });
    const result = computePaymentStatus(acct, [pmt1, pmt2], new Date(2026, 0, 15));

    expect(result.currentMonth).toBe('paid');
    expect(result.historicalMonths).toHaveLength(1);
    const dec = result.historicalMonths[0]!;
    expect(dec.key).toBe('2025-12');
    expect(dec.total).toBe(120);
    expect(dec.minimumMet).toBe(true);
    expect(dec.extra).toBe(0);
  });

  it('tracks extra-type historical payments separately', () => {
    const acct = makeAccount({
      balance: 1000,
      minimumPaymentType: 'fixed', minimumPaymentValue: 100,
      dueDay: 20,
    });
    const regular = makePayment({ id: 'r1', amount: 100, date: new Date(2025, 10, 5).getTime(), type: 'regular' });
    const extra   = makePayment({ id: 'e1', amount: 50,  date: new Date(2025, 10, 10).getTime(), type: 'extra' });
    const result = computePaymentStatus(acct, [regular, extra], new Date(2026, 0, 15));

    const nov = result.historicalMonths.find(m => m.key === '2025-11')!;
    expect(nov).toBeDefined();
    expect(nov.total).toBe(150);
    expect(nov.extra).toBe(50);
    expect(nov.minimumMet).toBe(true);
  });

  it('historical months are sorted newest first', () => {
    const acct = makeAccount({
      balance: 1000,
      minimumPaymentType: 'fixed', minimumPaymentValue: 100,
      dueDay: 20,
    });
    const pmt1 = makePayment({ id: 'n1', amount: 100, date: new Date(2025, 10, 5).getTime() });
    const pmt2 = makePayment({ id: 'o1', amount: 80,  date: new Date(2025, 9, 5).getTime() });
    const result = computePaymentStatus(acct, [pmt1, pmt2], new Date(2026, 0, 15));

    expect(result.historicalMonths[0]!.key).toBe('2025-11');
    expect(result.historicalMonths[1]!.key).toBe('2025-10');
  });

  it('minimumMet is false when historical total is below the minimum', () => {
    const acct = makeAccount({
      balance: 1000,
      minimumPaymentType: 'fixed', minimumPaymentValue: 100,
      dueDay: 20,
    });
    const pmt = makePayment({ id: 'n1', amount: 80, date: new Date(2025, 10, 5).getTime() });
    const result = computePaymentStatus(acct, [pmt], new Date(2026, 0, 15));

    expect(result.historicalMonths[0]!.minimumMet).toBe(false);
    expect(result.historicalMonths[0]!.total).toBe(80);
  });

  it('excludes from history a prior-month payment that falls within the current billing window', () => {
    // dueDay=5; windowStart=Dec 22 (Jan 5 - 14 days)
    // Dec 24 is in window → counted in current month, excluded from history
    // Dec 5 is before window → historical
    const acct = makeAccount({
      balance: 1000,
      minimumPaymentType: 'fixed', minimumPaymentValue: 100,
      dueDay: 5,
    });
    const inWindow  = makePayment({ id: 'w1', amount: 100, date: new Date(2025, 11, 24).getTime() });
    const historical = makePayment({ id: 'h1', amount: 80,  date: new Date(2025, 11, 5).getTime() });
    const result = computePaymentStatus(acct, [inWindow, historical], new Date(2026, 0, 15));

    expect(result.currentMonthTotal).toBe(100);
    expect(result.currentMonth).toBe('paid');
    expect(result.historicalMonths).toHaveLength(1);
    expect(result.historicalMonths[0]!.total).toBe(80);
  });
});
