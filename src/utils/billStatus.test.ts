import { describe, it, expect } from 'vitest';
import { computeBillStatus, computeNextDue } from './billStatus';
import type { Expense } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Use local date constructors throughout — ISO strings parse as UTC midnight
// which resolves to the previous calendar day in UTC- timezones.

function makeExpense(overrides: Partial<Expense>): Expense {
  return {
    id: 'test',
    categoryId: 'cat',
    memberId: null,
    description: 'Test bill',
    amount: 100,
    date: new Date(2025, 11, 1).getTime(), // Dec 1, 2025
    recurring: true,
    recurringFrequency: 'monthly',
    createdAt: 0,
    ...overrides,
  };
}

// ── computeNextDue ────────────────────────────────────────────────────────────

describe('computeNextDue', () => {
  it('returns same month when dueDay is still ahead of lastPaid', () => {
    const lastPaid = new Date(2026, 0, 1); // Jan 1
    const result = computeNextDue(lastPaid, 15, 1);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(15);
  });

  it('advances to next month when dueDay has already passed', () => {
    const lastPaid = new Date(2026, 0, 20); // Jan 20
    const result = computeNextDue(lastPaid, 15, 1);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(15);
  });

  it('advances quarterly (interval=3)', () => {
    const lastPaid = new Date(2026, 0, 15); // Jan 15
    const result = computeNextDue(lastPaid, 1, 3);
    expect(result.getMonth()).toBe(3); // April
    expect(result.getDate()).toBe(1);
  });

  it('advances annual (interval=12)', () => {
    const lastPaid = new Date(2026, 0, 15); // Jan 15
    const result = computeNextDue(lastPaid, 1, 12);
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(1);
  });
});

// ── computeBillStatus ─────────────────────────────────────────────────────────

describe('computeBillStatus', () => {
  it('returns ok for non-recurring expenses', () => {
    const expense = makeExpense({ recurring: false, dueDay: 10 });
    const result = computeBillStatus(expense, new Date(2026, 0, 15));
    expect(result.status).toBe('ok');
    expect(result.dueDayThisMonth).toBeNull();
  });

  it('returns ok when recurring has no dueDay', () => {
    const expense = makeExpense({ recurring: true });
    delete (expense as Partial<typeof expense>).dueDay;
    const result = computeBillStatus(expense, new Date(2026, 0, 15));
    expect(result.status).toBe('ok');
    expect(result.dueDayThisMonth).toBeNull();
  });

  it('returns paid when lastPaid is within the 14-day window before dueDay', () => {
    // dueDay=20; window starts Jan 6; lastPaid Jan 10 is inside the window
    const expense = makeExpense({
      dueDay: 20,
      date: new Date(2026, 0, 10).getTime(),
    });
    const result = computeBillStatus(expense, new Date(2026, 0, 15));
    expect(result.status).toBe('paid');
    expect(result.dueDayThisMonth?.getDate()).toBe(20);
  });

  it('returns past-due when due date already passed and not paid', () => {
    // dueDay=5; window starts Dec 22; lastPaid Dec 1 is outside window
    const expense = makeExpense({
      dueDay: 5,
      date: new Date(2025, 11, 1).getTime(),
    });
    // now=Jan 15 → dueDay 5 already passed
    const result = computeBillStatus(expense, new Date(2026, 0, 15));
    expect(result.status).toBe('past-due');
  });

  it('returns due-soon when due date is within 7 days and not paid', () => {
    // dueDay=18; now=Jan 15 → 3 days until due
    const expense = makeExpense({
      dueDay: 18,
      date: new Date(2025, 11, 1).getTime(),
    });
    const result = computeBillStatus(expense, new Date(2026, 0, 15));
    expect(result.status).toBe('due-soon');
  });

  it('returns ok when due date is far away', () => {
    // dueDay=28; now=Jan 5 → 23 days until due
    const expense = makeExpense({
      dueDay: 28,
      date: new Date(2025, 11, 1).getTime(),
    });
    const result = computeBillStatus(expense, new Date(2026, 0, 5));
    expect(result.status).toBe('ok');
  });

  it('quarterly bill in its due month returns a status other than ok', () => {
    // lastPaid=Oct 1, 2025; quarterly → nextDue=Jan 1, 2026; now=Jan 5 → past-due
    const expense = makeExpense({
      recurringFrequency: 'quarterly',
      dueDay: 1,
      date: new Date(2025, 9, 1).getTime(), // Oct 1
    });
    const result = computeBillStatus(expense, new Date(2026, 0, 5)); // Jan 5
    expect(result.status).toBe('past-due');
    expect(result.dueDayThisMonth).not.toBeNull();
  });

  it('quarterly bill outside its due month returns ok', () => {
    // lastPaid=Oct 1, 2025; nextDue=Jan 1, 2026; now=Feb 15 → wrong month → ok
    const expense = makeExpense({
      recurringFrequency: 'quarterly',
      dueDay: 1,
      date: new Date(2025, 9, 1).getTime(), // Oct 1
    });
    const result = computeBillStatus(expense, new Date(2026, 1, 15)); // Feb 15
    expect(result.status).toBe('ok');
    expect(result.dueDayThisMonth).toBeNull();
  });

  it('quarterly bill paid early in its due month returns paid', () => {
    // dueDay=5; lastPaid=Jan 3 (before the 5th) → computeNextDue returns Jan 5
    // now=Jan 10; nextDue Jan 2026 is current month; paidThisCycle=true → paid
    const expense = makeExpense({
      recurringFrequency: 'quarterly',
      dueDay: 5,
      date: new Date(2026, 0, 3).getTime(), // Jan 3
    });
    const result = computeBillStatus(expense, new Date(2026, 0, 10)); // Jan 10
    expect(result.status).toBe('paid');
    expect(result.dueDayThisMonth?.getDate()).toBe(5);
  });

  it('annual bill uses a 12-month interval', () => {
    // lastPaid=Jan 1, 2025; annual → nextDue=Jan 1, 2026; now=Jan 5, 2026 → past-due
    const expense = makeExpense({
      recurringFrequency: 'annual',
      dueDay: 1,
      date: new Date(2025, 0, 1).getTime(),
    });
    const result = computeBillStatus(expense, new Date(2026, 0, 5));
    expect(result.status).toBe('past-due');
    expect(result.dueDayThisMonth?.getDate()).toBe(1);
  });

  it('quarterly bill due-soon (within 7 days, in due month, not paid)', () => {
    // lastPaid=Oct 20, 2025; nextDue=Jan 20, 2026; now=Jan 17 (3 days away)
    const expense = makeExpense({
      recurringFrequency: 'quarterly',
      dueDay: 20,
      date: new Date(2025, 9, 20).getTime(), // Oct 20
    });
    const result = computeBillStatus(expense, new Date(2026, 0, 17));
    expect(result.status).toBe('due-soon');
  });

  it('quarterly bill ok (in due month, far away, not paid)', () => {
    // lastPaid=Oct 28, 2025; nextDue=Jan 28, 2026; now=Jan 5 (23 days away)
    const expense = makeExpense({
      recurringFrequency: 'quarterly',
      dueDay: 28,
      date: new Date(2025, 9, 28).getTime(), // Oct 28
    });
    const result = computeBillStatus(expense, new Date(2026, 0, 5));
    expect(result.status).toBe('ok');
    expect(result.dueDayThisMonth?.getDate()).toBe(28);
  });
});
