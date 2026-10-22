import { describe, it, expect } from 'vitest';
import { enumerateLapsedDebtCycles, debtCycleCorrelationId } from './debtCatchUp';
import type { DebtAccount, DebtPayment } from '@/types';

function makeAccount(overrides: Partial<DebtAccount> = {}): DebtAccount {
  return {
    id: 'acc-1',
    type: 'card',
    name: 'Visa',
    balance: 1000,
    apr: 20,
    paymentCycle: 'monthly',
    minimumPaymentType: 'fixed',
    minimumPaymentValue: 100,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makePayment(overrides: Partial<DebtPayment> = {}): DebtPayment {
  return {
    id: 'pay-1',
    accountId: 'acc-1',
    amount: 100,
    date: Date.now(),
    type: 'regular',
    createdAt: 0,
    ...overrides,
  };
}

describe('debtCycleCorrelationId', () => {
  it('encodes accountId and the cycle due date', () => {
    expect(debtCycleCorrelationId('acc-1', new Date(2026, 0, 5))).toBe('debt-cycle-acc-1-2026-01-05');
  });
});

describe('enumerateLapsedDebtCycles', () => {
  it('returns one lapsed cycle per missed month, excluding the not-yet-due current cycle', () => {
    const account = makeAccount({ nextDueDateMs: new Date(2026, 0, 1).getTime() }); // Jan 1
    const now = new Date(2026, 2, 15); // March 15 — April 1 hasn't come due yet
    const windowStart = new Date(2026, 0, 1);

    const result = enumerateLapsedDebtCycles(account, [], now, windowStart);

    expect(result.map((c) => c.dueDate)).toEqual([
      new Date(2026, 0, 1).getTime(),
      new Date(2026, 1, 1).getTime(),
      new Date(2026, 2, 1).getTime(),
    ]);
  });

  it('excludes a cycle that has a qualifying payment', () => {
    const account = makeAccount({ nextDueDateMs: new Date(2026, 0, 1).getTime() });
    const now = new Date(2026, 2, 15);
    const windowStart = new Date(2026, 0, 1);
    const payments = [makePayment({ date: new Date(2026, 1, 3).getTime(), amount: 100 })]; // pays Feb's cycle

    const result = enumerateLapsedDebtCycles(account, payments, now, windowStart);

    expect(result.map((c) => c.dueDate)).toEqual([
      new Date(2026, 0, 1).getTime(),
      new Date(2026, 2, 1).getTime(),
    ]);
  });

  it('does not count a payment below the minimum as qualifying', () => {
    const account = makeAccount({ nextDueDateMs: new Date(2026, 0, 1).getTime(), minimumPaymentValue: 100 });
    const now = new Date(2026, 0, 20); // before Feb 1 comes due — only Jan's cycle is lapsed
    const windowStart = new Date(2026, 0, 1);
    const payments = [makePayment({ date: new Date(2026, 0, 5).getTime(), amount: 20 })]; // below minimum

    const result = enumerateLapsedDebtCycles(account, payments, now, windowStart);

    expect(result).toHaveLength(1);
    expect(result[0]!.dueDate).toBe(new Date(2026, 0, 1).getTime());
  });

  it('respects windowStart — cycles before it are not surfaced', () => {
    const account = makeAccount({ nextDueDateMs: new Date(2026, 0, 1).getTime() });
    const now = new Date(2026, 2, 15);
    const windowStart = new Date(2026, 1, 1); // Feb 1 — Jan excluded

    const result = enumerateLapsedDebtCycles(account, [], now, windowStart);

    expect(result.map((c) => c.dueDate)).toEqual([
      new Date(2026, 1, 1).getTime(),
      new Date(2026, 2, 1).getTime(),
    ]);
  });

  it('steps biweekly cycles correctly', () => {
    const account = makeAccount({ paymentCycle: 'biweekly', nextDueDateMs: new Date(2026, 0, 5).getTime() }); // a Monday
    const now = new Date(2026, 1, 20); // ~6.5 weeks later
    const windowStart = new Date(2026, 0, 1);

    const result = enumerateLapsedDebtCycles(account, [], now, windowStart);

    expect(result.map((c) => c.dueDate)).toEqual([
      new Date(2026, 0, 5).getTime(),
      new Date(2026, 0, 19).getTime(),
      new Date(2026, 1, 2).getTime(),
      new Date(2026, 1, 16).getTime(),
    ]);
  });

  it('returns nothing for a paid-off account', () => {
    const account = makeAccount({ balance: 0, nextDueDateMs: new Date(2026, 0, 1).getTime() });
    const result = enumerateLapsedDebtCycles(account, [], new Date(2026, 2, 15), new Date(2026, 0, 1));
    expect(result).toEqual([]);
  });

  it('returns nothing for an account with no due-date anchor', () => {
    const account = makeAccount();
    delete account.nextDueDateMs;
    const result = enumerateLapsedDebtCycles(account, [], new Date(2026, 2, 15), new Date(2026, 0, 1));
    expect(result).toEqual([]);
  });
});
