import { describe, it, expect } from 'vitest';
import { enumerateLapsedExpenseCycles, expenseCycleCorrelationId } from './expenseCatchUp';
import type { Expense } from '@/types';

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1',
    categoryId: 'cat-1',
    memberId: null,
    description: 'Electric Bill',
    amount: 150,
    date: new Date(2026, 0, 1).getTime(), // last paid Jan 1
    recurring: true,
    recurringFrequency: 'monthly',
    dueDay: 1,
    createdAt: 0,
    ...overrides,
  };
}

describe('expenseCycleCorrelationId', () => {
  it('encodes expenseId and the cycle due date', () => {
    expect(expenseCycleCorrelationId('exp-1', new Date(2026, 1, 1))).toBe('expense-cycle-exp-1-2026-02-01');
  });
});

describe('enumerateLapsedExpenseCycles', () => {
  it('returns one lapsed cycle per missed month, excluding the not-yet-due current cycle', () => {
    const expense = makeExpense();
    const now = new Date(2026, 2, 15); // March 15 — April 1 hasn't come due yet
    const windowStart = new Date(2026, 0, 1);

    const result = enumerateLapsedExpenseCycles(expense, now, windowStart);

    expect(result.map((c) => c.dueDate)).toEqual([
      new Date(2026, 1, 1).getTime(),
      new Date(2026, 2, 1).getTime(),
    ]);
    expect(result[0]!.expectedAmount).toBe(150);
    expect(result[0]!.isAutoPay).toBe(false);
  });

  it('respects windowStart — cycles before it are not surfaced', () => {
    const expense = makeExpense();
    const now = new Date(2026, 2, 15);
    const windowStart = new Date(2026, 2, 1); // only March

    const result = enumerateLapsedExpenseCycles(expense, now, windowStart);

    expect(result.map((c) => c.dueDate)).toEqual([new Date(2026, 2, 1).getTime()]);
  });

  it('steps quarterly cycles correctly', () => {
    const expense = makeExpense({ recurringFrequency: 'quarterly' });
    const now = new Date(2026, 8, 15); // Sept 15 — Oct 1 hasn't come due yet
    const windowStart = new Date(2026, 0, 1);

    const result = enumerateLapsedExpenseCycles(expense, now, windowStart);

    expect(result.map((c) => c.dueDate)).toEqual([
      new Date(2026, 3, 1).getTime(), // April
      new Date(2026, 6, 1).getTime(), // July
    ]);
  });

  it('suppresses everything while billing has not started (firstDueDate in the future)', () => {
    const expense = makeExpense({ firstDueDate: new Date(2026, 5, 1).getTime() });
    const now = new Date(2026, 2, 15);
    const windowStart = new Date(2026, 0, 1);

    expect(enumerateLapsedExpenseCycles(expense, now, windowStart)).toEqual([]);
  });

  it('carries isAutoPay through for variable-amount auto-pay bills', () => {
    const expense = makeExpense({ isAutoPay: true });
    const now = new Date(2026, 2, 15);
    const windowStart = new Date(2026, 0, 1);

    const result = enumerateLapsedExpenseCycles(expense, now, windowStart);
    expect(result.every((c) => c.isAutoPay)).toBe(true);
  });

  it('returns nothing for a non-recurring expense', () => {
    const expense = makeExpense({ recurring: false });
    expect(enumerateLapsedExpenseCycles(expense, new Date(2026, 2, 15), new Date(2026, 0, 1))).toEqual([]);
  });

  it('returns nothing when there is no dueDay', () => {
    const expense = makeExpense();
    delete expense.dueDay;
    expect(enumerateLapsedExpenseCycles(expense, new Date(2026, 2, 15), new Date(2026, 0, 1))).toEqual([]);
  });
});
