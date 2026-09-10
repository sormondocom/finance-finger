import { describe, it, expect } from 'vitest';
import { MONTHLY_FACTORS, toMonthly, sourceMonthly, setCurrency, getCurrentCurrency } from './finance';

// ── MONTHLY_FACTORS ───────────────────────────────────────────────────────────

describe('MONTHLY_FACTORS', () => {
  it('hourly factor is 40 * 52 / 12 (≈173.33 h/month)', () => {
    expect(MONTHLY_FACTORS.hourly).toBeCloseTo(40 * 52 / 12, 8);
  });

  it('monthly factor is exactly 1', () => {
    expect(MONTHLY_FACTORS.monthly).toBe(1);
  });

  it('annual factor converts yearly to monthly (1/12)', () => {
    expect(MONTHLY_FACTORS.annual).toBeCloseTo(1 / 12, 8);
  });

  it('quarterly factor converts quarterly to monthly (1/3)', () => {
    expect(MONTHLY_FACTORS.quarterly).toBeCloseTo(1 / 3, 8);
  });

  it('semimonthly factor is 2 (twice per month)', () => {
    expect(MONTHLY_FACTORS.semimonthly).toBe(2);
  });

  it('once factor is 0 (one-time payments excluded from recurring totals)', () => {
    expect(MONTHLY_FACTORS.once).toBe(0);
  });
});

// ── toMonthly ─────────────────────────────────────────────────────────────────

describe('toMonthly', () => {
  it('monthly amount is unchanged', () => {
    expect(toMonthly(3000, 'monthly')).toBe(3000);
  });

  it('annual amount divides by 12', () => {
    expect(toMonthly(12000, 'annual')).toBeCloseTo(1000, 4);
  });

  it('quarterly amount divides by 3', () => {
    expect(toMonthly(3000, 'quarterly')).toBeCloseTo(1000, 4);
  });

  it('biweekly amount multiplies by 26/12 (exact annual fraction)', () => {
    expect(toMonthly(1000, 'biweekly')).toBeCloseTo(1000 * 26 / 12, 8);
  });

  it('weekly amount multiplies by 52/12 (exact annual fraction)', () => {
    expect(toMonthly(1000, 'weekly')).toBeCloseTo(1000 * 52 / 12, 8);
  });

  it('semimonthly amount multiplies by 2', () => {
    expect(toMonthly(1500, 'semimonthly')).toBe(3000);
  });

  it('once returns 0 (one-time excluded from monthly totals)', () => {
    expect(toMonthly(5000, 'once')).toBe(0);
  });
});

// ── sourceMonthly ─────────────────────────────────────────────────────────────

describe('sourceMonthly', () => {
  it('uses amount + amount2 for semimonthly with two unequal paychecks', () => {
    const source = { amount: 1000, amount2: 1200, frequency: 'semimonthly' as const };
    expect(sourceMonthly(source)).toBe(2200);
  });

  it('falls back to toMonthly when semimonthly has no amount2', () => {
    const source = { amount: 1500, frequency: 'semimonthly' as const };
    expect(sourceMonthly(source)).toBe(3000); // 1500 × 2
  });

  it('treats amount2=0 as present (not undefined) — uses amount + 0', () => {
    // When amount2 is explicitly 0, it's considered set (not null/undefined)
    const source = { amount: 1000, amount2: 0, frequency: 'semimonthly' as const };
    // amount2 != null → uses amount + amount2 = 1000 + 0
    // This is the correct behaviour: the second paycheck is $0 (e.g. variable pay)
    expect(sourceMonthly(source)).toBe(1000);
  });

  it('handles non-semimonthly frequency with standard toMonthly', () => {
    const source = { amount: 12000, frequency: 'annual' as const };
    expect(sourceMonthly(source)).toBeCloseTo(1000, 4);
  });

  it('handles monthly source', () => {
    const source = { amount: 5000, frequency: 'monthly' as const };
    expect(sourceMonthly(source)).toBe(5000);
  });
});

// ── setCurrency / getCurrentCurrency ──────────────────────────────────────────

describe('setCurrency / getCurrentCurrency', () => {
  it('getCurrentCurrency returns USD by default', () => {
    expect(getCurrentCurrency()).toBe('USD');
  });

  it('setCurrency changes the active currency', () => {
    setCurrency('EUR');
    expect(getCurrentCurrency()).toBe('EUR');
  });

  it('setCurrency can be changed back', () => {
    setCurrency('GBP');
    expect(getCurrentCurrency()).toBe('GBP');
    setCurrency('USD');
    expect(getCurrentCurrency()).toBe('USD');
  });
});
