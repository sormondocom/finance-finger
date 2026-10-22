import { describe, it, expect, vi, beforeEach } from 'vitest';
import { autoRecordAutoPay } from './autoPayRecords';
import type { Expense } from '@/types';

vi.mock('@/db', () => ({
  getExpenses: vi.fn(),
  saveExpense: vi.fn(),
}));

vi.mock('@/accounting', () => ({
  accounting: {
    recordExpensePayment: vi.fn(),
    recordCharge: vi.fn(),
  },
}));

import { getExpenses, saveExpense } from '@/db';
import { accounting } from '@/accounting';

function makeExpense(overrides: Partial<Expense> = {}): Expense {
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
    isAutoPay: true,
    isFixedAmount: true,
    createdAt: 0,
    ...overrides,
  };
}

const NOW = new Date(2026, 2, 15).getTime(); // March 15, 2026

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(NOW);
  (accounting.recordExpensePayment as ReturnType<typeof vi.fn>).mockResolvedValue({ record: {} });
  (accounting.recordCharge as ReturnType<typeof vi.fn>).mockResolvedValue({ charge: {}, entry: {} });
  (saveExpense as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

function windowStart(days: number): Date {
  return new Date(NOW - days * 86_400_000);
}

describe('autoRecordAutoPay — null window', () => {
  it('still records the current overdue cycle when windowStart is null (no historical backfill, but the bill is still currently past due)', async () => {
    // This matches the original, pre-catch-up behavior: whether a currently
    // overdue bill gets recorded must never depend on how long the extension
    // was closed — only ADDITIONAL older cycles are gated by the window.
    (getExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([makeExpense({ date: new Date(2026, 1, 1).getTime() })]);
    const result = await autoRecordAutoPay(null);
    expect(result.recorded).toBe(1);
    expect(accounting.recordExpensePayment).toHaveBeenCalledWith(expect.objectContaining({ date: new Date(2026, 2, 1).getTime() }));
  });

  it('does not backfill OLDER cycles when windowStart is null — only the current one', async () => {
    (getExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([makeExpense({ date: new Date(2026, 0, 1).getTime() })]);
    const result = await autoRecordAutoPay(null);
    expect(result.recorded).toBe(1);
    expect(accounting.recordExpensePayment).toHaveBeenCalledOnce();
    expect(accounting.recordExpensePayment).toHaveBeenCalledWith(expect.objectContaining({ date: new Date(2026, 2, 1).getTime() }));
  });

  it('does nothing when nothing is currently overdue, regardless of window', async () => {
    (getExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([makeExpense({ date: NOW })]);
    const result = await autoRecordAutoPay(null);
    expect(result).toEqual({ recorded: 0, recordedItems: [] });
    expect(accounting.recordExpensePayment).not.toHaveBeenCalled();
  });
});

describe('autoRecordAutoPay — scope filtering', () => {
  it('ignores variable-amount bills entirely (handled by the catch-up checklist instead)', async () => {
    (getExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([makeExpense({ isFixedAmount: false })]);
    const result = await autoRecordAutoPay(windowStart(90));
    expect(result).toEqual({ recorded: 0, recordedItems: [] });
    expect(accounting.recordExpensePayment).not.toHaveBeenCalled();
  });

  it('ignores non-auto-pay bills', async () => {
    (getExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([makeExpense({ isAutoPay: false })]);
    const result = await autoRecordAutoPay(windowStart(90));
    expect(result).toEqual({ recorded: 0, recordedItems: [] });
  });

  it('ignores non-recurring or dueDay-less expenses', async () => {
    (getExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeExpense({ recurring: false }),
      (() => { const e = makeExpense(); delete e.dueDay; return e; })(),
    ]);
    const result = await autoRecordAutoPay(windowStart(90));
    expect(result).toEqual({ recorded: 0, recordedItems: [] });
  });
});

describe('autoRecordAutoPay — multi-cycle recording', () => {
  it('records a single missed cycle and advances the anchor once', async () => {
    (getExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([makeExpense({ date: new Date(2026, 1, 1).getTime() })]);

    const result = await autoRecordAutoPay(windowStart(90));

    expect(result.recorded).toBe(1);
    expect(accounting.recordExpensePayment).toHaveBeenCalledOnce();
    expect(accounting.recordExpensePayment).toHaveBeenCalledWith(expect.objectContaining({
      expenseId: 'exp-1',
      amount: 18,
      date: new Date(2026, 2, 1).getTime(),
      correlationId: 'expense-cycle-exp-1-2026-03-01',
    }));
    expect(saveExpense).toHaveBeenCalledOnce();
    expect(saveExpense).toHaveBeenCalledWith(expect.objectContaining({ date: new Date(2026, 2, 1).getTime() }));
  });

  it('records every missed cycle, not just the most recent one, with a single final save', async () => {
    // Last paid Jan 1 — Feb 1 and Mar 1 are both missed by March 15 (Apr 1 not yet due).
    (getExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([makeExpense({ date: new Date(2026, 0, 1).getTime() })]);

    const result = await autoRecordAutoPay(windowStart(90));

    expect(result.recorded).toBe(2);
    expect(accounting.recordExpensePayment).toHaveBeenCalledTimes(2);
    expect(accounting.recordExpensePayment).toHaveBeenNthCalledWith(1, expect.objectContaining({ date: new Date(2026, 1, 1).getTime() }));
    expect(accounting.recordExpensePayment).toHaveBeenNthCalledWith(2, expect.objectContaining({ date: new Date(2026, 2, 1).getTime() }));
    expect(saveExpense).toHaveBeenCalledOnce();
    expect(saveExpense).toHaveBeenCalledWith(expect.objectContaining({ date: new Date(2026, 2, 1).getTime() }));
  });

  it('also posts a card charge when the bill is linked to a card', async () => {
    (getExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeExpense({ date: new Date(2026, 1, 1).getTime(), linkedCardId: 'card-1' }),
    ]);

    await autoRecordAutoPay(windowStart(90));

    expect(accounting.recordCharge).toHaveBeenCalledOnce();
    expect(accounting.recordCharge).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'card-1', amount: 18 }));
  });

  it('skips cycles older than windowStart but still advances the anchor past them', async () => {
    // Last paid over a year ago; the window only reaches back to Feb 23, so every
    // monthly cycle from Jan 2025 through Feb 2026 is too old to record — but the
    // anchor must still walk all the way through them so the next run doesn't
    // re-evaluate (and re-skip) a year of ancient history forever. Only the cycle
    // that falls within the window (March 1) actually gets recorded.
    (getExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeExpense({ date: new Date(2025, 0, 1).getTime() }),
    ]);

    const result = await autoRecordAutoPay(windowStart(20));

    expect(result.recorded).toBe(1);
    expect(accounting.recordExpensePayment).toHaveBeenCalledOnce();
    expect(accounting.recordExpensePayment).toHaveBeenCalledWith(expect.objectContaining({ date: new Date(2026, 2, 1).getTime() }));
    expect(saveExpense).toHaveBeenCalledWith(expect.objectContaining({ date: new Date(2026, 2, 1).getTime() }));
  });
});
