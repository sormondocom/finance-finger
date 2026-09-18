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
