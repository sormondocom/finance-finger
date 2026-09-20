import { describe, it, expect, vi, beforeEach } from 'vitest';
import { paydayCorrelationId, autoRecordPaydays } from './paydayDeposits';
import type { IncomeSource, LedgerEntry } from '@/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(),
      },
    },
  },
}));

vi.mock('@/db', () => ({
  getIncomeSources: vi.fn(),
  getAllLedgerEntries: vi.fn(),
}));

vi.mock('@/accounting', () => ({
  accounting: {
    recordBankCredit: vi.fn(),
  },
}));

vi.mock('@/utils/paydays', () => ({
  getPaydaysInMonth: vi.fn(),
}));

import browser from 'webextension-polyfill';
import { getIncomeSources, getAllLedgerEntries } from '@/db';
import { accounting } from '@/accounting';
import { getPaydaysInMonth } from '@/utils/paydays';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSource(overrides: Partial<IncomeSource> = {}): IncomeSource {
  return {
    id: 'src-1',
    memberId: 'member-1',
    name: 'Main Job',
    amount: 2000,
    frequency: 'biweekly',
    active: true,
    bankAccountId: 'bank-1',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeLedgerEntry(correlationId: string): LedgerEntry {
  return {
    id: 'entry-1',
    type: 'bank-credit',
    accountId: 'bank-1',
    accountType: 'bank',
    signedAmount: 2000,
    description: 'Main Job',
    date: Date.now(),
    createdAt: Date.now(),
    correlationId,
  };
}

// ── paydayCorrelationId ───────────────────────────────────────────────────────

describe('paydayCorrelationId', () => {
  it('pads month and day with leading zeros', () => {
    expect(paydayCorrelationId('src-abc', 2026, 0, 1)).toBe('payday-src-abc-2026-01-01');
    expect(paydayCorrelationId('src-abc', 2026, 11, 31)).toBe('payday-src-abc-2026-12-31');
  });

  it('encodes year, month (0-based → 1-based), and day', () => {
    expect(paydayCorrelationId('src-xyz', 2025, 5, 15)).toBe('payday-src-xyz-2025-06-15');
  });

  it('is stable — same inputs always produce the same ID', () => {
    const a = paydayCorrelationId('src-1', 2026, 8, 19);
    const b = paydayCorrelationId('src-1', 2026, 8, 19);
    expect(a).toBe(b);
  });
});

// ── autoRecordPaydays ─────────────────────────────────────────────────────────

const TODAY = new Date(2026, 8, 19).getTime(); // 2026-09-19 local midnight

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(TODAY);

  (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
    missedPaydayPromptDays: 3,
    accountResetTimestamps: {},
  });
  (getAllLedgerEntries as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (accounting.recordBankCredit as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: {} });
});

describe('autoRecordPaydays — no sources', () => {
  it('returns zero recorded and empty prompts when no active sources', async () => {
    (getIncomeSources as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const result = await autoRecordPaydays();
    expect(result).toEqual({ recorded: 0, pendingPrompts: [] });
  });

  it('ignores inactive sources', async () => {
    (getIncomeSources as ReturnType<typeof vi.fn>).mockResolvedValue([makeSource({ active: false })]);
    const result = await autoRecordPaydays();
    expect(result).toEqual({ recorded: 0, pendingPrompts: [] });
  });

  it('ignores sources without a bankAccountId', async () => {
    (getIncomeSources as ReturnType<typeof vi.fn>).mockResolvedValue([makeSource({ bankAccountId: undefined })]);
    const result = await autoRecordPaydays();
    expect(result).toEqual({ recorded: 0, pendingPrompts: [] });
  });

  it('ignores once-frequency sources', async () => {
    (getIncomeSources as ReturnType<typeof vi.fn>).mockResolvedValue([makeSource({ frequency: 'once' })]);
    (getPaydaysInMonth as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const result = await autoRecordPaydays();
    expect(result).toEqual({ recorded: 0, pendingPrompts: [] });
  });
});

describe('autoRecordPaydays — same-day auto-record', () => {
  it('auto-records a payday that falls today', async () => {
    const source = makeSource({ id: 'src-1', frequency: 'monthly' });
    (getIncomeSources as ReturnType<typeof vi.fn>).mockResolvedValue([source]);
    (getPaydaysInMonth as ReturnType<typeof vi.fn>).mockImplementation((_src, year, month) => {
      if (year === 2026 && month === 8) return [19];
      return [];
    });

    const result = await autoRecordPaydays();

    expect(result.recorded).toBe(1);
    expect(result.pendingPrompts).toHaveLength(0);
    expect(accounting.recordBankCredit).toHaveBeenCalledOnce();
    expect(accounting.recordBankCredit).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'bank-1',
      amount: 2000,
      correlationId: 'payday-src-1-2026-09-19',
    }));
  });

  it('does not re-record a payday already in the ledger', async () => {
    const source = makeSource({ id: 'src-1', frequency: 'monthly' });
    (getIncomeSources as ReturnType<typeof vi.fn>).mockResolvedValue([source]);
    (getPaydaysInMonth as ReturnType<typeof vi.fn>).mockImplementation((_src, year, month) => {
      if (year === 2026 && month === 8) return [19];
      return [];
    });
    (getAllLedgerEntries as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeLedgerEntry('payday-src-1-2026-09-19'),
    ]);

    const result = await autoRecordPaydays();
    expect(result.recorded).toBe(0);
    expect(accounting.recordBankCredit).not.toHaveBeenCalled();
  });
});

describe('autoRecordPaydays — missed payday prompts', () => {
  it('returns payday from yesterday in pendingPrompts (not auto-recorded)', async () => {
    const source = makeSource({ id: 'src-1', frequency: 'monthly' });
    (getIncomeSources as ReturnType<typeof vi.fn>).mockResolvedValue([source]);
    (getPaydaysInMonth as ReturnType<typeof vi.fn>).mockImplementation((_src, year, month) => {
      if (year === 2026 && month === 8) return [18]; // yesterday
      return [];
    });

    const result = await autoRecordPaydays();
    expect(result.recorded).toBe(0);
    expect(result.pendingPrompts).toHaveLength(1);
    expect(result.pendingPrompts[0]!.sourceName).toBe('Main Job');
    expect(result.pendingPrompts[0]!.correlationId).toBe('payday-src-1-2026-09-18');
  });

  it('ignores paydays older than promptWindowDays', async () => {
    const source = makeSource({ id: 'src-1', frequency: 'monthly' });
    (getIncomeSources as ReturnType<typeof vi.fn>).mockResolvedValue([source]);
    (getPaydaysInMonth as ReturnType<typeof vi.fn>).mockImplementation((_src, year, month) => {
      if (year === 2026 && month === 8) return [14]; // 5 days ago, outside window of 3
      return [];
    });

    const result = await autoRecordPaydays();
    expect(result.pendingPrompts).toHaveLength(0);
    expect(result.recorded).toBe(0);
  });

  it('respects custom promptWindowDays from storage', async () => {
    (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      missedPaydayPromptDays: 7,
      accountResetTimestamps: {},
    });
    const source = makeSource({ id: 'src-1', frequency: 'monthly' });
    (getIncomeSources as ReturnType<typeof vi.fn>).mockResolvedValue([source]);
    (getPaydaysInMonth as ReturnType<typeof vi.fn>).mockImplementation((_src, year, month) => {
      if (year === 2026 && month === 8) return [13]; // 6 days ago — inside window of 7
      return [];
    });

    const result = await autoRecordPaydays();
    expect(result.pendingPrompts).toHaveLength(1);
  });
});

describe('autoRecordPaydays — account reset gating', () => {
  it('auto-records a same-day payday when it falls on the same calendar day as the reset', async () => {
    // The reset timestamp is normalized to day-start before comparison, so a reset
    // at 10am on the 19th does NOT block a payday that's midnight of the 19th.
    const resetTs = new Date(2026, 8, 19, 10, 0, 0).getTime(); // reset today at 10am
    (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      missedPaydayPromptDays: 3,
      accountResetTimestamps: { 'bank-1': resetTs },
    });

    const source = makeSource({ id: 'src-1', frequency: 'monthly' });
    (getIncomeSources as ReturnType<typeof vi.fn>).mockResolvedValue([source]);
    (getPaydaysInMonth as ReturnType<typeof vi.fn>).mockImplementation((_src, year, month) => {
      if (year === 2026 && month === 8) return [19];
      return [];
    });

    const result = await autoRecordPaydays();
    // payday day == reset day → still auto-recorded (day-granularity comparison)
    expect(result.recorded).toBe(1);
    expect(result.pendingPrompts).toHaveLength(0);
  });

  it('sends a payday to pendingPrompts when it falls before the reset day', async () => {
    // Reset happened yesterday → today's payday is after the reset, but yesterday's payday is before it.
    const resetTs = new Date(2026, 8, 19).getTime(); // reset today (midnight)
    (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      missedPaydayPromptDays: 3,
      accountResetTimestamps: { 'bank-1': resetTs },
    });

    const source = makeSource({ id: 'src-1', frequency: 'monthly' });
    (getIncomeSources as ReturnType<typeof vi.fn>).mockResolvedValue([source]);
    // Payday was yesterday (day 18) — within the 3-day prompt window but before the reset day
    (getPaydaysInMonth as ReturnType<typeof vi.fn>).mockImplementation((_src, year, month) => {
      if (year === 2026 && month === 8) return [18];
      return [];
    });

    const result = await autoRecordPaydays();
    expect(result.recorded).toBe(0);
    expect(result.pendingPrompts).toHaveLength(1);
  });
});
