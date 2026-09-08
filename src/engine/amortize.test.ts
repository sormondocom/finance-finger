import { describe, it, expect } from 'vitest';
import {
  amortizeSingleCard,
  amortizeMultiCard,
  comparePayoffScenarios,
  detectMinimumPaymentTrap,
} from './amortize';
import type { DebtAccount } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<DebtAccount> & { balance: number; apr: number }): DebtAccount {
  return {
    id: 'test',
    type: 'card',
    name: 'Test Card',
    paymentCycle: 'monthly',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

// Fixed start date so schedule dates are deterministic.
const START = new Date('2026-01-01');

// ── amortizeSingleCard ────────────────────────────────────────────────────────

describe('amortizeSingleCard', () => {
  it('pays off a balance with only an extra payment when no minimum is set', () => {
    const card = makeCard({ balance: 1000, apr: 24 });
    const result = amortizeSingleCard(card, 100, START);

    expect(result.originalBalance).toBe(1000);
    expect(result.schedule.length).toBeGreaterThan(0);
    expect(result.schedule.length).toBeLessThan(20); // should pay off in under 20 months
    expect(result.schedule[result.schedule.length - 1]!.remainingBalance).toBeCloseTo(0, 1);
    expect(result.totalInterest).toBeGreaterThan(0);
    expect(result.totalPaid).toBeGreaterThan(1000);
  });

  it('total paid equals original balance plus total interest', () => {
    const card = makeCard({
      balance: 2000, apr: 18,
      minimumPaymentType: 'fixed', minimumPaymentValue: 50,
    });
    const result = amortizeSingleCard(card, 0, START);

    expect(result.totalPaid).toBeCloseTo(result.originalBalance + result.totalInterest, 0);
  });

  it('an extra payment reduces total interest and payoff time vs minimum-only', () => {
    const card = makeCard({
      balance: 5000, apr: 20,
      minimumPaymentType: 'fixed', minimumPaymentValue: 100,
    });
    const minOnly  = amortizeSingleCard(card, 0,   START);
    const withExtra = amortizeSingleCard(card, 100, START);

    expect(withExtra.totalInterest).toBeLessThan(minOnly.totalInterest);
    expect(withExtra.periodsToPayoff).toBeLessThan(minOnly.periodsToPayoff);
  });

  it('honors a 0% intro APR period — no interest accrues during intro', () => {
    const introEnd = new Date('2026-06-30').getTime();
    const card = makeCard({
      balance: 1000, apr: 24,
      minimumPaymentType: 'fixed', minimumPaymentValue: 50,
      introAprEndDate: introEnd,
    });
    const result = amortizeSingleCard(card, 0, START);

    // During the intro window (~6 months) each period's interest should be $0
    const introMonths = result.schedule.filter((p) => p.date.getTime() <= introEnd);
    introMonths.forEach((p) => expect(p.interest).toBeCloseTo(0, 5));

    // After intro window interest accrues
    const afterIntro = result.schedule.filter((p) => p.date.getTime() > introEnd);
    const totalAfterInterest = afterIntro.reduce((s, p) => s + p.interest, 0);
    expect(totalAfterInterest).toBeGreaterThan(0);
  });

  it('never overpays — final payment is exactly the remaining balance plus interest', () => {
    const card = makeCard({
      balance: 500, apr: 12,
      minimumPaymentType: 'fixed', minimumPaymentValue: 50,
    });
    const result = amortizeSingleCard(card, 0, START);
    const last = result.schedule[result.schedule.length - 1]!;

    // Loop exits when balance < ZERO_THRESHOLD (0.005); remaining must be within that
    expect(last.remainingBalance).toBeLessThan(0.005);
    // Balance never goes negative — Math.max(0, ...) in the engine ensures this
    expect(last.remainingBalance).toBeGreaterThanOrEqual(0);
  });

  it('handles biweekly payment cycle correctly', () => {
    const card = makeCard({
      balance: 1000, apr: 24, paymentCycle: 'biweekly',
      minimumPaymentType: 'fixed', minimumPaymentValue: 50,
    });
    const result = amortizeSingleCard(card, 0, START);
    // Biweekly: 26 periods/year, so periodic rate = 24%/26 ≈ 0.923%
    const firstInterest = result.schedule[0]!.interest;
    expect(firstInterest).toBeCloseTo(1000 * (0.24 / 26), 4);
  });

  it('returns a debt-free date equal to the last schedule entry date', () => {
    const card = makeCard({
      balance: 1000, apr: 12,
      minimumPaymentType: 'fixed', minimumPaymentValue: 100,
    });
    const result = amortizeSingleCard(card, 0, START);
    const lastDate = result.schedule[result.schedule.length - 1]!.date;

    expect(result.debtFreeDate.getTime()).toBe(lastDate.getTime());
  });
});

// ── amortizeMultiCard ─────────────────────────────────────────────────────────

describe('amortizeMultiCard', () => {
  it('returns empty result for zero cards', () => {
    const result = amortizeMultiCard([], 'avalanche', 0, START);
    expect(result.monthly).toHaveLength(0);
    expect(result.debtFreeDate).toBeNull();
    expect(result.totalInterest).toBe(0);
  });

  it('avalanche pays off highest-APR card first', () => {
    const low  = makeCard({ id: 'low',  balance: 1000, apr: 10, name: 'Low APR',
      minimumPaymentType: 'fixed', minimumPaymentValue: 50 });
    const high = makeCard({ id: 'high', balance: 1000, apr: 30, name: 'High APR',
      minimumPaymentType: 'fixed', minimumPaymentValue: 50 });

    const result = amortizeMultiCard([low, high], 'avalanche', 100, START);
    // High APR card should appear first in the paid-off order
    expect(result.paidOffOrder[0]).toBe('high');
  });

  it('snowball pays off lowest-balance card first', () => {
    const small = makeCard({ id: 'small', balance: 200,  apr: 10, name: 'Small',
      minimumPaymentType: 'fixed', minimumPaymentValue: 25 });
    const large = makeCard({ id: 'large', balance: 2000, apr: 5,  name: 'Large',
      minimumPaymentType: 'fixed', minimumPaymentValue: 50 });

    const result = amortizeMultiCard([large, small], 'snowball', 50, START);
    expect(result.paidOffOrder[0]).toBe('small');
  });

  it('snowball rollover: freed minimum accelerates the next card', () => {
    const small = makeCard({ id: 'small', balance: 100,  apr: 5, name: 'Small',
      minimumPaymentType: 'fixed', minimumPaymentValue: 25 });
    const large = makeCard({ id: 'large', balance: 2000, apr: 5, name: 'Large',
      minimumPaymentType: 'fixed', minimumPaymentValue: 50 });

    // No extra payment — rely purely on rollover
    const withRollover    = amortizeMultiCard([large, small], 'snowball',  0, START);
    // Simulate no rollover by using only the large card in isolation
    const noRollover      = amortizeMultiCard([large],        'snowball',  0, START);

    // With rollover the large card should pay off sooner because it gets the
    // $25 freed when the small card is paid off.
    expect(withRollover.monthly.length).toBeLessThan(noRollover.monthly.length);
  });

  it('extra payment saves total interest across all cards vs minimum-only', () => {
    const a = makeCard({ id: 'a', balance: 3000, apr: 18,
      minimumPaymentType: 'fixed', minimumPaymentValue: 75 });
    const b = makeCard({ id: 'b', balance: 1500, apr: 24,
      minimumPaymentType: 'fixed', minimumPaymentValue: 40 });

    const minOnly   = amortizeMultiCard([a, b], 'avalanche',   0, START);
    const withExtra = amortizeMultiCard([a, b], 'avalanche', 100, START);

    expect(withExtra.totalInterest).toBeLessThan(minOnly.totalInterest);
    expect(withExtra.monthly.length).toBeLessThan(minOnly.monthly.length);
  });

  it('total balance reaches zero by the debt-free date', () => {
    const card = makeCard({ balance: 1000, apr: 12,
      minimumPaymentType: 'fixed', minimumPaymentValue: 50 });
    const result = amortizeMultiCard([card], 'avalanche', 0, START);

    const debtFreeMonth = result.monthly.find((m) => m.totalBalance <= 0.005);
    expect(debtFreeMonth).toBeDefined();
  });

  it('custom strategy directs extra payment to the first card in input order, not the most efficient', () => {
    // Two equal-balance cards. Avalanche targets the high-APR card → finishes fastest.
    // Custom keeps input order; if low-APR is listed first, extra goes there instead.
    const lowApr  = makeCard({ id: 'low',  balance: 1000, apr: 5,  name: 'Low APR',
      minimumPaymentType: 'fixed', minimumPaymentValue: 50 });
    const highApr = makeCard({ id: 'high', balance: 1000, apr: 25, name: 'High APR',
      minimumPaymentType: 'fixed', minimumPaymentValue: 50 });

    // Custom: input order [lowApr, highApr] → extra goes to lowApr (suboptimal)
    const custom    = amortizeMultiCard([lowApr, highApr], 'custom',    100, START);
    // Avalanche: extra goes to highApr (optimal)
    const avalanche = amortizeMultiCard([lowApr, highApr], 'avalanche', 100, START);

    // Avalanche pays less total interest because it targets the costly card first
    expect(avalanche.totalInterest).toBeLessThan(custom.totalInterest);
    // Custom still beats minimum-only — the extra payment does reduce interest
    const minOnly = amortizeMultiCard([lowApr, highApr], 'custom', 0, START);
    expect(custom.totalInterest).toBeLessThan(minOnly.totalInterest);
  });
});

// ── detectMinimumPaymentTrap ──────────────────────────────────────────────────

describe('detectMinimumPaymentTrap', () => {
  it('flags a high-APR card with a small percentage minimum as a trap', () => {
    const card = makeCard({
      balance: 5000, apr: 25,
      minimumPaymentType: 'percentage', minimumPaymentValue: 2,
    });
    const info = detectMinimumPaymentTrap(card);
    expect(info.isTrap).toBe(true);
    expect(info.yearsToPayoff).toBeGreaterThan(3);
  });

  it('does not flag a card with a large fixed payment as a trap', () => {
    const card = makeCard({
      balance: 1000, apr: 18,
      minimumPaymentType: 'fixed', minimumPaymentValue: 200,
    });
    const info = detectMinimumPaymentTrap(card);
    expect(info.isTrap).toBe(false);
    expect(info.yearsToPayoff).toBeLessThan(3);
  });

  it('returns isTrap=false when no minimum is set', () => {
    const card = makeCard({ balance: 1000, apr: 20 });
    const info = detectMinimumPaymentTrap(card);
    expect(info.isTrap).toBe(false);
    expect(info.yearsToPayoff).toBe(0);
  });

  it('totalInterestRatio > 0.5 is a trap', () => {
    // $1000 at 30% APR with 2% minimum — interest will exceed 50% of balance
    const card = makeCard({
      balance: 1000, apr: 30,
      minimumPaymentType: 'percentage', minimumPaymentValue: 2,
    });
    const info = detectMinimumPaymentTrap(card);
    expect(info.totalInterestRatio).toBeGreaterThan(0.5);
    expect(info.isTrap).toBe(true);
  });
});

// ── comparePayoffScenarios ────────────────────────────────────────────────────

describe('comparePayoffScenarios', () => {
  it('interestSaved is positive when extra payment reduces interest', () => {
    const card = makeCard({
      balance: 4000, apr: 20,
      minimumPaymentType: 'fixed', minimumPaymentValue: 80,
    });
    const result = comparePayoffScenarios([card], 'avalanche', 100, START);
    expect(result.interestSaved).toBeGreaterThan(0);
    expect(result.monthsSaved).toBeGreaterThan(0);
  });

  it('interestSaved is 0 when extra payment is 0', () => {
    const card = makeCard({
      balance: 1000, apr: 15,
      minimumPaymentType: 'fixed', minimumPaymentValue: 50,
    });
    const result = comparePayoffScenarios([card], 'avalanche', 0, START);
    expect(result.interestSaved).toBeCloseTo(0, 2);
    expect(result.monthsSaved).toBe(0);
  });

  it('exposes the extra amount in the result', () => {
    const card = makeCard({
      balance: 1000, apr: 15,
      minimumPaymentType: 'fixed', minimumPaymentValue: 50,
    });
    const result = comparePayoffScenarios([card], 'avalanche', 75, START);
    expect(result.extraAmount).toBe(75);
  });
});
