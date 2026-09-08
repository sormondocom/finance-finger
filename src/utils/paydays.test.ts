import { describe, it, expect } from 'vitest';
import { getPaydaysInMonth } from './paydays';
import type { IncomeSource } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSource(overrides: Partial<IncomeSource> & { frequency: IncomeSource['frequency'] }): IncomeSource {
  return {
    id: 'src-1',
    memberId: 'member-1',
    name: 'Test Income',
    amount: 1000,
    active: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

// Use local date constructors to avoid UTC-midnight-off-by-one in any timezone.
const Y = 2026;
const JAN = 0;
const FEB = 1;

// Jan 1, 2026 — the algorithm uses getDay() / getDate() in local time, so we
// must create dates with new Date(year, month, day) (local), not ISO strings.
const jan1  = new Date(2026, 0, 1).getTime();  // Thursday
const jan8  = new Date(2026, 0, 8).getTime();
const jan15 = new Date(2026, 0, 15).getTime();
const jan31 = new Date(2026, 0, 31).getTime();
const jan5  = new Date(2026, 0, 5).getTime();
const jan2  = new Date(2026, 0, 2).getTime();  // Friday

// ── monthly ───────────────────────────────────────────────────────────────────

describe('getPaydaysInMonth — monthly', () => {
  it('returns the paydayRef day clamped to the month', () => {
    const src = makeSource({ frequency: 'monthly', paydayRef: jan15 });
    expect(getPaydaysInMonth(src, Y, JAN)).toEqual([15]);
    expect(getPaydaysInMonth(src, Y, FEB)).toEqual([15]);
  });

  it('clamps day 31 to the last day of a 28-day month', () => {
    const src = makeSource({ frequency: 'monthly', paydayRef: jan31 });
    // Feb 2026 has 28 days
    expect(getPaydaysInMonth(src, Y, FEB)).toEqual([28]);
  });

  it('returns empty when no paydayRef is set', () => {
    const src = makeSource({ frequency: 'monthly' });
    expect(getPaydaysInMonth(src, Y, JAN)).toEqual([]);
  });
});

// ── biweekly ──────────────────────────────────────────────────────────────────

describe('getPaydaysInMonth — biweekly', () => {
  it('returns days that are exact 14-day multiples from the reference', () => {
    // Jan 1, 2026 (Thursday): diff 0→day 1, diff 14→day 15, diff 28→day 29
    const src = makeSource({ frequency: 'biweekly', paydayRef: jan1 });
    expect(getPaydaysInMonth(src, Y, JAN)).toEqual([1, 15, 29]);
  });

  it('returns 2 paydays when the cycle lands on day 8 and 22', () => {
    // Jan 8: diff 0→day 8, diff 14→day 22; no 36th day
    const src = makeSource({ frequency: 'biweekly', paydayRef: jan8 });
    expect(getPaydaysInMonth(src, Y, JAN)).toEqual([8, 22]);
  });

  it('returns empty when no paydayRef is set', () => {
    const src = makeSource({ frequency: 'biweekly' });
    expect(getPaydaysInMonth(src, Y, JAN)).toEqual([]);
  });
});

// ── weekly ────────────────────────────────────────────────────────────────────

describe('getPaydaysInMonth — weekly', () => {
  it('returns all days matching the day-of-week of the reference (5 Thursdays in Jan 2026)', () => {
    // Jan 1, 2026 is Thursday
    const src = makeSource({ frequency: 'weekly', paydayRef: jan1 });
    expect(getPaydaysInMonth(src, Y, JAN)).toEqual([1, 8, 15, 22, 29]);
  });

  it('returns 5 Fridays in January 2026 when reference is a Friday', () => {
    // Jan 2, 2026 is Friday
    const src = makeSource({ frequency: 'weekly', paydayRef: jan2 });
    expect(getPaydaysInMonth(src, Y, JAN)).toEqual([2, 9, 16, 23, 30]);
  });

  it('returns empty when no paydayRef is set', () => {
    const src = makeSource({ frequency: 'weekly' });
    expect(getPaydaysInMonth(src, Y, JAN)).toEqual([]);
  });
});

// ── semimonthly ───────────────────────────────────────────────────────────────

describe('getPaydaysInMonth — semimonthly', () => {
  it('1-15 schedule returns [1, 15] for all months', () => {
    const src = makeSource({
      frequency: 'semimonthly',
      semimonthlySchedule: '1-15',
    });
    expect(getPaydaysInMonth(src, Y, JAN)).toEqual([1, 15]);
    expect(getPaydaysInMonth(src, Y, FEB)).toEqual([1, 15]);
  });

  it('15-end schedule returns [15, last-day-of-month]', () => {
    const src = makeSource({
      frequency: 'semimonthly',
      semimonthlySchedule: '15-end',
    });
    expect(getPaydaysInMonth(src, Y, JAN)).toEqual([15, 31]);
    expect(getPaydaysInMonth(src, Y, FEB)).toEqual([15, 28]); // Feb 2026 has 28 days
  });

  it('legacy path (no semimonthlySchedule) uses paydayRef day and day+15', () => {
    // paydayRef day = 5 → paydays 5 and 20
    const src = makeSource({
      frequency: 'semimonthly',
      paydayRef: jan5,
    });
    expect(getPaydaysInMonth(src, Y, JAN)).toEqual([5, 20]);
  });

  it('returns empty when neither schedule nor paydayRef is set', () => {
    const src = makeSource({ frequency: 'semimonthly' });
    expect(getPaydaysInMonth(src, Y, JAN)).toEqual([]);
  });
});

// ── quarterly ─────────────────────────────────────────────────────────────────

describe('getPaydaysInMonth — quarterly', () => {
  it('returns the paydayRef day in the matching quarter month', () => {
    // paydayRef = Jan 15; quarterly cycle from Jan: Jan, Apr, Jul, Oct
    const src = makeSource({ frequency: 'quarterly', paydayRef: jan15 });
    expect(getPaydaysInMonth(src, Y, JAN)).toEqual([15]); // Jan → match
    expect(getPaydaysInMonth(src, Y, FEB)).toEqual([]);   // Feb → no match
    expect(getPaydaysInMonth(src, Y, 3)).toEqual([15]);   // Apr → match
  });

  it('returns empty when no paydayRef is set', () => {
    const src = makeSource({ frequency: 'quarterly' });
    expect(getPaydaysInMonth(src, Y, JAN)).toEqual([]);
  });
});

// ── annual ────────────────────────────────────────────────────────────────────

describe('getPaydaysInMonth — annual', () => {
  it('returns the paydayRef day only in the matching month of the year', () => {
    // paydayRef = March 10
    const src = makeSource({
      frequency: 'annual',
      paydayRef: new Date(2026, 2, 10).getTime(), // March
    });
    expect(getPaydaysInMonth(src, Y, 2)).toEqual([10]); // March → match
    expect(getPaydaysInMonth(src, Y, JAN)).toEqual([]); // January → no match
  });

  it('returns empty when no paydayRef is set', () => {
    const src = makeSource({ frequency: 'annual' });
    expect(getPaydaysInMonth(src, Y, JAN)).toEqual([]);
  });
});
