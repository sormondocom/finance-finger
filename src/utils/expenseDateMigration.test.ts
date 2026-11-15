import { describe, it, expect, vi, beforeEach } from 'vitest';
import { migrateLegacyExpenseDates } from './expenseDateMigration';
import type { Expense } from '@/types';

vi.mock('@/db', () => ({
  getExpenses: vi.fn(),
  saveExpense: vi.fn(),
}));

import { getExpenses, saveExpense } from '@/db';

function makeExpense(overrides: Record<string, unknown> = {}): Expense {
  return {
    id: 'exp-1',
    categoryId: 'cat-1',
    memberId: null,
    description: 'Netflix',
    amount: 18,
    date: new Date(2026, 0, 1).getTime(),
    recurring: true,
    recurringFrequency: 'monthly',
    dueDay: 1,
    createdAt: 0,
    ...overrides,
  } as Expense;
}

beforeEach(() => {
  vi.clearAllMocks();
  (saveExpense as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

describe('migrateLegacyExpenseDates', () => {
  it('leaves an already-migrated expense untouched', async () => {
    (getExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([makeExpense()]);
    await migrateLegacyExpenseDates();
    expect(saveExpense).not.toHaveBeenCalled();
  });

  it('promotes a legacy firstDueDate to be the real date, and sets notYetBilled', async () => {
    const firstDueDate = new Date(2026, 5, 1).getTime(); // June 1, still in the future under the old guard
    (getExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeExpense({ date: new Date(2026, 0, 1).getTime(), startDate: new Date(2026, 0, 1).getTime(), firstDueDate }),
    ]);

    await migrateLegacyExpenseDates();

    expect(saveExpense).toHaveBeenCalledOnce();
    const saved = (saveExpense as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(saved.date).toBe(firstDueDate);
    expect(saved.notYetBilled).toBe(true);
    expect('startDate' in saved).toBe(false);
    expect('firstDueDate' in saved).toBe(false);
  });

  it('drops a legacy startDate (informational-only) without touching date, when billing had already started', async () => {
    (getExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeExpense({ date: new Date(2026, 2, 1).getTime(), startDate: new Date(2025, 11, 1).getTime() }),
    ]);

    await migrateLegacyExpenseDates();

    expect(saveExpense).toHaveBeenCalledOnce();
    const saved = (saveExpense as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(saved.date).toBe(new Date(2026, 2, 1).getTime());
    expect(saved.notYetBilled).toBeUndefined();
    expect('startDate' in saved).toBe(false);
  });

  it('drops a legacy threshold', async () => {
    (getExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([makeExpense({ threshold: 120 })]);
    await migrateLegacyExpenseDates();
    expect(saveExpense).toHaveBeenCalledOnce();
    const saved = (saveExpense as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect('threshold' in saved).toBe(false);
  });

  it('migrates each expense independently', async () => {
    (getExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeExpense({ id: 'a' }),
      makeExpense({ id: 'b', threshold: 50 }),
      makeExpense({ id: 'c' }),
    ]);
    await migrateLegacyExpenseDates();
    expect(saveExpense).toHaveBeenCalledOnce();
    expect((saveExpense as ReturnType<typeof vi.fn>).mock.calls[0]![0].id).toBe('b');
  });
});
