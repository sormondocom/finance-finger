import type {
  DebtAccount,
  PaymentCycle,
  DebtStrategy,
  AmortizationPeriod,
  AmortizationResult,
  MultiCardMonthly,
  MultiCardResult,
} from '@/types';

// ── Formulas ──────────────────────────────────────────────────────────────────
//
// All calculations use NOMINAL APR — the rate printed on your statement and
// legally required by disclosure law in the US and most other markets.
// (Nominal APR differs from Effective Annual Rate / EAR, which compounds
//  the periodic rate back up to an annual figure.  We use nominal because
//  it matches the rate on the debt agreement.)
//
// PERIODIC INTEREST RATE (single-card)
//   r = APR / 100 / N
//   N = periods per year:  weekly 52 · biweekly 26 · semimonthly 24 · monthly 12
//
// INTEREST ACCRUED IN ONE PERIOD
//   I = B × r       (B = current balance)
//
// MINIMUM PAYMENT
//   fixed:      min(B, fixedAmount)
//   percentage: min(B, max(MIN_PAYMENT_FLOOR, B × pct%))
//   The $25 floor prevents the "always owe $0.37" edge case on tiny balances.
//
// PAYMENT PER PERIOD
//   payment = min(minPayment + extraPayment,  B + I)   ← never overpay
//
// PRINCIPAL REDUCTION
//   Δ = payment − I
//   If APR is high enough that I > minPayment, Δ is negative — the schedule
//   shows this explicitly so the user can see the debt-trap condition.
//
// BALANCE UPDATE
//   B′ = max(0, B − Δ)
//
// MULTI-CARD (amortizeMultiCard) — always runs on a monthly basis
//   r_m = APR / 100 / 12
//   This equals (nominal weekly rate) × 52/12 = (biweekly) × 26/12 = APR/12,
//   so no separate conversion is needed; the monthly simplification is exact
//   for nominal APR across all payment cycles.
//
//   Strategy ordering:
//     Avalanche — highest APR first (minimises total interest paid)
//     Snowball  — lowest balance first (maximises early payoff wins)
//     Custom    — preserves the caller-supplied order
//
//   Payment rollover: when a card reaches zero its minimum payment is added
//   to the focus card's payment each subsequent month ("the snowball effect").
//
// MINIMUM-PAYMENT TRAP DETECTION
//   A card is flagged as a trap if paying the minimum only results in:
//     years-to-payoff > 3   OR   total-interest / original-balance > 0.50
//
// ── Change policy ─────────────────────────────────────────────────────────────
// Any change to a formula above MUST also update:
//   1. The comment block you are reading now
//   2. The "Amortization engine — formulas" section in CONTRIBUTING.md
//   3. Affected unit tests in src/engine/amortize.test.ts
// The engine must never be a black box.
//
// ── Constants ─────────────────────────────────────────────────────────────────

const PERIODS_PER_YEAR: Record<PaymentCycle, number> = {
  weekly:      52,
  biweekly:    26,
  semimonthly: 24,
  monthly:     12,
};

const DAYS_PER_PERIOD: Record<PaymentCycle, number> = {
  weekly:      7,
  biweekly:    14,
  semimonthly: 15,   // approximate
  monthly:     30,   // approximate
};

const MIN_PAYMENT_FLOOR = 25;   // $25 floor for percentage-based minimums
const MAX_PERIODS       = 1200; // 100-year safety cap
const ZERO_THRESHOLD    = 0.005;

// ── Helpers ───────────────────────────────────────────────────────────────────

function addPeriods(start: Date, periods: number, cycle: PaymentCycle): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + periods * DAYS_PER_PERIOD[cycle]);
  return d;
}

function calcMinPayment(card: DebtAccount, balance: number): number {
  if (card.minimumPaymentValue == null) return 0;
  if (card.minimumPaymentType === 'fixed') {
    return Math.min(balance, card.minimumPaymentValue);
  }
  const pct = balance * (card.minimumPaymentValue / 100);
  return Math.min(balance, Math.max(MIN_PAYMENT_FLOOR, pct));
}

// ── Single-card amortization ──────────────────────────────────────────────────

export function amortizeSingleCard(
  card: DebtAccount,
  extraPayment = 0,
  startDate = new Date(),
  maxPeriods = MAX_PERIODS,
): AmortizationResult {
  const baseRate = card.apr / 100 / PERIODS_PER_YEAR[card.paymentCycle];

  let balance = card.balance;
  const originalBalance = balance;
  const schedule: AmortizationPeriod[] = [];
  let totalInterest = 0;
  let period = 0;

  while (balance > ZERO_THRESHOLD && period < maxPeriods) {
    period++;

    const periodDate = addPeriods(startDate, period, card.paymentCycle);
    const inIntro = !!card.introAprEndDate && periodDate.getTime() <= card.introAprEndDate;
    const periodicRate = inIntro ? 0 : baseRate;

    const interest = balance * periodicRate;
    const minPayment = calcMinPayment(card, balance);
    let payment = minPayment + extraPayment;

    // Cap: never pay more than what's owed
    payment = Math.min(payment, balance + interest);

    // If APR is so high that min payment < interest, that's the trap — show it
    const principal = payment - interest;
    balance = Math.max(0, balance - principal);
    totalInterest += interest;

    schedule.push({
      period,
      date: periodDate,
      payment,
      interest,
      principal,
      remainingBalance: balance,
    });

    if (balance <= ZERO_THRESHOLD) break;
  }

  return {
    schedule,
    totalInterest,
    totalPaid: originalBalance + totalInterest,
    originalBalance,
    debtFreeDate: schedule[schedule.length - 1]?.date ?? startDate,
    periodsToPayoff: schedule.length,
  };
}

// ── Multi-card amortization ───────────────────────────────────────────────────

function sortByStrategy(cards: DebtAccount[], strategy: DebtStrategy): DebtAccount[] {
  if (strategy === 'avalanche') {
    return [...cards].sort((a, b) => b.apr - a.apr);
  }
  if (strategy === 'snowball') {
    return [...cards].sort((a, b) => a.balance - b.balance);
  }
  // 'custom' — preserve the order passed in
  return [...cards];
}

export function amortizeMultiCard(
  cards: DebtAccount[],
  strategy: DebtStrategy,
  extraMonthlyPayment = 0,
  startDate = new Date(),
  maxMonths = MAX_PERIODS,
): MultiCardResult {
  if (cards.length === 0) {
    return { monthly: [], paidOffOrder: [], totalInterest: 0, totalPaid: 0, debtFreeDate: null };
  }

  const baseMonthlyRate = (card: DebtAccount): number => card.apr / 100 / 12;

  const order = sortByStrategy(cards, strategy);
  const balances = new Map(cards.map((c) => [c.id, c.balance]));
  const paidOffOrder: string[] = [];
  const monthly: MultiCardMonthly[] = [];

  let month = 0;
  let totalInterest = 0;
  let totalPaid = 0;
  let rolledOverMinimum = 0;

  while (month < maxMonths) {
    month++;

    const periodDate = new Date(startDate);
    periodDate.setMonth(periodDate.getMonth() + month);

    const active = order.filter((c) => (balances.get(c.id) ?? 0) > ZERO_THRESHOLD);
    if (active.length === 0) break;

    const focusCard = active[0]!;

    for (const card of active) {
      const balance = balances.get(card.id) ?? 0;
      const inIntro = !!card.introAprEndDate && periodDate.getTime() <= card.introAprEndDate;
      const interest = balance * (inIntro ? 0 : baseMonthlyRate(card));
      const minPayment = calcMinPayment(card, balance);

      let payment = minPayment;
      if (card.id === focusCard.id) {
        payment += extraMonthlyPayment + rolledOverMinimum;
      }

      payment = Math.min(payment, balance + interest);
      const principal = payment - interest;
      const newBalance = Math.max(0, balance - principal);

      balances.set(card.id, newBalance);
      totalInterest += interest;
      totalPaid += payment;

      if (newBalance <= ZERO_THRESHOLD) {
        if (!paidOffOrder.includes(card.id)) {
          paidOffOrder.push(card.id);
          rolledOverMinimum += calcMinPayment(card, balance);
        }
      }
    }

    const totalBalance = Array.from(balances.values()).reduce((s, b) => s + b, 0);
    monthly.push({ month, date: periodDate, totalBalance });
  }

  const debtFreeDate = monthly.find((m) => m.totalBalance <= ZERO_THRESHOLD)?.date ?? null;

  return { monthly, paidOffOrder, totalInterest, totalPaid, debtFreeDate };
}

// ── What-if comparison ────────────────────────────────────────────────────────

export interface WhatIfComparison {
  minOnly:    MultiCardResult;
  withExtra:  MultiCardResult;
  interestSaved: number;
  monthsSaved:   number;
  extraAmount:   number;
}

export function comparePayoffScenarios(
  cards: DebtAccount[],
  strategy: DebtStrategy,
  extraMonthlyPayment: number,
  startDate = new Date(),
  maxMonths = MAX_PERIODS,
): WhatIfComparison {
  const minOnly   = amortizeMultiCard(cards, strategy, 0, startDate, maxMonths);
  const withExtra = amortizeMultiCard(cards, strategy, extraMonthlyPayment, startDate, maxMonths);

  const monthsMin   = minOnly.monthly.length;
  const monthsExtra = withExtra.monthly.length;

  return {
    minOnly,
    withExtra,
    interestSaved: minOnly.totalInterest - withExtra.totalInterest,
    monthsSaved:   monthsMin - monthsExtra,
    extraAmount:   extraMonthlyPayment,
  };
}

// ── Minimum-payment trap detector ─────────────────────────────────────────────

export interface TrapInfo {
  isTrap: boolean;
  yearsToPayoff: number;
  totalInterestRatio: number; // interest / original balance
}

export function detectMinimumPaymentTrap(card: DebtAccount): TrapInfo {
  if (card.minimumPaymentValue == null) {
    return { isTrap: false, yearsToPayoff: 0, totalInterestRatio: 0 };
  }
  const result = amortizeSingleCard(card, 0);
  const years = result.periodsToPayoff / PERIODS_PER_YEAR[card.paymentCycle];
  const ratio = card.balance > 0 ? result.totalInterest / card.balance : 0;
  return {
    isTrap: years > 3 || ratio > 0.5,
    yearsToPayoff: years,
    totalInterestRatio: ratio,
  };
}
