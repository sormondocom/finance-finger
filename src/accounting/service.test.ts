import { describe, it, expect } from 'vitest';
import { deriveBalance } from './service';
import type { LedgerEntry } from '@/types';

function entry(overrides: Partial<LedgerEntry> & { type: LedgerEntry['type']; signedAmount: number }): LedgerEntry {
  return {
    id: crypto.randomUUID(),
    accountId: 'acc-1',
    accountType: 'debt',
    description: 'test',
    date: Date.now(),
    createdAt: Date.now(),
    ...overrides,
  };
}

// ── deriveBalance ─────────────────────────────────────────────────────────────

describe('deriveBalance', () => {
  it('returns 0 for empty ledger', () => {
    expect(deriveBalance([])).toBe(0);
  });

  it('accumulates positive signedAmounts for charges', () => {
    const entries = [
      entry({ type: 'charge', signedAmount: 100 }),
      entry({ type: 'charge', signedAmount: 50 }),
    ];
    expect(deriveBalance(entries)).toBe(150);
  });

  it('reduces balance for payments (negative signedAmount)', () => {
    const entries = [
      entry({ type: 'charge', signedAmount: 500 }),
      entry({ type: 'payment', signedAmount: -200 }),
    ];
    expect(deriveBalance(entries)).toBe(300);
  });

  it('reconciliation entry resets balance to targetBalance', () => {
    const entries = [
      entry({ type: 'charge', signedAmount: 999 }),
      entry({ type: 'reconciliation', signedAmount: 0, targetBalance: 1500 }),
    ];
    expect(deriveBalance(entries)).toBe(1500);
  });

  it('accumulates entries after a reconciliation', () => {
    const entries = [
      entry({ type: 'reconciliation', signedAmount: 0, targetBalance: 2000 }),
      entry({ type: 'charge', signedAmount: 300 }),
      entry({ type: 'payment', signedAmount: -100 }),
    ];
    expect(deriveBalance(entries)).toBe(2200);
  });

  it('multiple reconciliations each act as a hard reset', () => {
    const entries = [
      entry({ type: 'charge', signedAmount: 5000 }),
      entry({ type: 'reconciliation', signedAmount: 0, targetBalance: 1000 }),
      entry({ type: 'charge', signedAmount: 200 }),
      entry({ type: 'reconciliation', signedAmount: 0, targetBalance: 500 }),
      entry({ type: 'payment', signedAmount: -50 }),
    ];
    expect(deriveBalance(entries)).toBe(450);
  });

  it('reconciliation with missing targetBalance defaults to 0', () => {
    const entries = [
      entry({ type: 'charge', signedAmount: 999 }),
      entry({ type: 'reconciliation', signedAmount: 0 }),
    ];
    expect(deriveBalance(entries)).toBe(0);
  });

  it('handles bank-credit and bank-debit entries', () => {
    const entries = [
      entry({ type: 'bank-credit', signedAmount: 1000, accountType: 'bank' }),
      entry({ type: 'bank-debit', signedAmount: -250, accountType: 'bank' }),
    ];
    expect(deriveBalance(entries)).toBe(750);
  });

  it('handles transfer entries', () => {
    const entries = [
      entry({ type: 'transfer-out', signedAmount: -500 }),
      entry({ type: 'transfer-in', signedAmount: 500 }),
    ];
    expect(deriveBalance(entries)).toBe(0);
  });

  // Repeated floating-point addition over many entries reliably leaves
  // residue instead of an exact 0 (e.g. 4500 - 1500.33 - 1500.33 - 1499.34
  // lands on 2.2737e-13, not 0, in plain JS arithmetic). Every balance===0 /
  // balance>0 check downstream (debtCatchUp, paymentStatus, DebtList's
  // "paid off" styling, dashboard/notifier/calendar "still active" filters)
  // depends on deriveBalance rounding that noise away.
  it('a debt paid off across several decimal-heavy payments returns exact 0, not float dust', () => {
    const entries = [
      entry({ type: 'charge', signedAmount: 4500 }),
      entry({ type: 'payment', signedAmount: -1500.33 }),
      entry({ type: 'payment', signedAmount: -1500.33 }),
      entry({ type: 'payment', signedAmount: -1499.34 }),
    ];
    expect(deriveBalance(entries)).toBe(0);
  });

  it('rounds to the nearest cent rather than truncating a genuine sub-cent remainder', () => {
    const entries = [
      entry({ type: 'charge', signedAmount: 10 }),
      entry({ type: 'payment', signedAmount: -3.33 }),
      entry({ type: 'payment', signedAmount: -3.33 }),
      entry({ type: 'payment', signedAmount: -3.33 }),
    ];
    // 10 - 3.33*3 = 0.01 exactly in decimal; must not get rounded away to 0.
    expect(deriveBalance(entries)).toBe(0.01);
  });
});

// ── Settings reconciliation scenarios ─────────────────────────────────────────
// These describe the "Set Balance" flow from the Reconciliation section in
// Settings: the user states the true balance, we write a reconciliation entry,
// and subsequent activity accumulates from that point.

describe('reconciliation: Settings "Set Balance" flow', () => {
  it('corrects a drift by replacing old history with a new starting point', () => {
    // Existing ledger shows $3,200; user's statement says $3,050 — correct it.
    const before = [
      entry({ type: 'reconciliation', signedAmount: 0, targetBalance: 3200 }),
      entry({ type: 'charge', signedAmount: 100 }),   // balance: 3300
      entry({ type: 'payment', signedAmount: -250 }), // balance: 3050 (actual)
    ];
    expect(deriveBalance(before)).toBe(3050);

    // User sets balance to 3050 via Settings → reconciliation entry added
    const after = [
      ...before,
      entry({ type: 'reconciliation', signedAmount: 0, targetBalance: 3050 }),
    ];
    expect(deriveBalance(after)).toBe(3050);
  });

  it('allows new charges to accumulate after a manual reconciliation', () => {
    const entries = [
      entry({ type: 'reconciliation', signedAmount: 0, targetBalance: 5000 }),
      // User corrects via Settings:
      entry({ type: 'reconciliation', signedAmount: 0, targetBalance: 4800 }),
      // Subsequent activity:
      entry({ type: 'charge', signedAmount: 200 }),
    ];
    expect(deriveBalance(entries)).toBe(5000);
  });

  it('setting balance to zero pays off a debt in the ledger', () => {
    const entries = [
      entry({ type: 'reconciliation', signedAmount: 0, targetBalance: 1500 }),
      entry({ type: 'payment', signedAmount: -1500 }),
      // User confirms paid-off via Settings:
      entry({ type: 'reconciliation', signedAmount: 0, targetBalance: 0 }),
    ];
    expect(deriveBalance(entries)).toBe(0);
  });
});

// ── Void reversal replay ordering ─────────────────────────────────────────────
// deleteCharge/deleteDebtPayment/deleteExpensePayment/deleteIncomeSource all
// date their reversal entries to "now" (when the void happens), not to the
// original entry's business date. deriveBalance replays strictly in date
// order and treats a reconciliation as a hard reset — so a reversal dated
// to the ORIGINAL (earlier) date would replay before a later reconciliation
// and have its effect wiped out by that reconciliation's reset, making the
// void silently do nothing to the current balance. These tests model both
// datings directly against deriveBalance to prove the "now" dating is what
// actually makes a void take effect after a later reconciliation.

describe('void reversal dating vs. reconciliation ordering', () => {
  // deriveBalance trusts its input's order — it doesn't sort by date itself
  // (that's getAllLedgerEntries()'s job, which sorts by date then
  // createdAt). Both tests below construct entries in that already-sorted
  // order, exactly as the real DB layer would hand them to deriveBalance.

  it('a reversal dated to the ORIGINAL entry date is wiped out by a later reconciliation (the bug)', () => {
    const entries = [
      entry({ type: 'charge', signedAmount: 50, date: 1 }),                             // day 1: $50 charge
      // day 20: void, but WRONGLY dated to day 1 — sorts right after the
      // charge, BEFORE the day-10 reconciliation below.
      entry({ type: 'charge', signedAmount: -50, date: 1, description: 'Void: test' }),
      entry({ type: 'reconciliation', signedAmount: 0, targetBalance: 500, date: 10 }),  // day 10: reconcile (bakes in the $50)
    ];
    // Reversal replays BEFORE the reconciliation, so its cancel-out effect
    // (charge + reversal = 0) is wiped out by the reconciliation's hard reset.
    expect(deriveBalance(entries)).toBe(500);
  });

  it('a reversal dated to NOW correctly reduces the balance even after a later reconciliation (the fix)', () => {
    const entries = [
      entry({ type: 'charge', signedAmount: 50, date: 1 }),                              // day 1: $50 charge
      entry({ type: 'reconciliation', signedAmount: 0, targetBalance: 500, date: 10 }),  // day 10: reconcile
      entry({ type: 'charge', signedAmount: -50, date: 20, description: 'Void: test' }), // day 20: void, dated to now
    ];
    // Reversal replays AFTER the reconciliation, so it correctly reduces
    // the post-reconciliation balance by the voided amount.
    expect(deriveBalance(entries)).toBe(450);
  });
});
