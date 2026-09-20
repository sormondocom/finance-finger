import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOverageTrend } from './notifier';
import type { ExpensePaidRecord } from '@/types';

vi.mock('@/db', () => ({
  getDebtAccounts: vi.fn(),
  getDebtPayments: vi.fn(),
  getExpenses: vi.fn(),
  getExpensePaidRecords: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: { action: { setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() } },
}));

import { getExpensePaidRecords } from '@/db';

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW = new Date(2026, 8, 19).getTime();

let idCounter = 0;
function makePaid(amount: number, daysAgo: number): ExpensePaidRecord {
  return {
    id: `rec-${++idCounter}`,
    expenseId: 'exp-1',
    amount,
    date: NOW - daysAgo * 24 * 60 * 60 * 1000,
    createdAt: NOW,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(NOW);
  idCounter = 0;
});

// ── getOverageTrend ───────────────────────────────────────────────────────────

describe('getOverageTrend', () => {
  it('returns 0 when there are no paid records', async () => {
    (getExpensePaidRecords as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    expect(await getOverageTrend('exp-1', 100)).toBe(0);
  });

  it('counts records where amount exceeds the threshold', async () => {
    (getExpensePaidRecords as ReturnType<typeof vi.fn>).mockResolvedValue([
      makePaid(150, 10),
      makePaid(80, 20),
      makePaid(120, 40),
    ]);
    expect(await getOverageTrend('exp-1', 100)).toBe(2);
  });

  it('ignores records older than 6 months', async () => {
    (getExpensePaidRecords as ReturnType<typeof vi.fn>).mockResolvedValue([
      makePaid(150, 10),       // recent, over threshold
      makePaid(200, 190),      // > 6 months ago — ignored
    ]);
    expect(await getOverageTrend('exp-1', 100)).toBe(1);
  });

  it('limits the look-back window to the 6 most recent records', async () => {
    // 7 records all within 6 months — only the newest 6 count
    (getExpensePaidRecords as ReturnType<typeof vi.fn>).mockResolvedValue([
      makePaid(50, 5),    // under
      makePaid(50, 10),   // under
      makePaid(50, 20),   // under
      makePaid(50, 30),   // under
      makePaid(50, 40),   // under
      makePaid(50, 50),   // under — 6th most recent
      makePaid(200, 60),  // over — 7th, should be excluded from the window
    ]);
    expect(await getOverageTrend('exp-1', 100)).toBe(0);
  });

  it('does not count equal-to-threshold amounts as over', async () => {
    (getExpensePaidRecords as ReturnType<typeof vi.fn>).mockResolvedValue([
      makePaid(100, 10),
    ]);
    expect(await getOverageTrend('exp-1', 100)).toBe(0);
  });

  it('counts all records when all exceed the threshold', async () => {
    (getExpensePaidRecords as ReturnType<typeof vi.fn>).mockResolvedValue([
      makePaid(200, 5),
      makePaid(200, 15),
      makePaid(200, 25),
    ]);
    // All 3 are within 6 months and over the threshold
    expect(await getOverageTrend('exp-1', 100)).toBe(3);
  });
});
