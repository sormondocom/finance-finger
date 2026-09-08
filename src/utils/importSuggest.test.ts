import { describe, it, expect } from 'vitest';
import { inferActionType, INCOME_KW, TRANSFER_KW, DEBT_PMT_KW } from './importSuggest';

// ── inferActionType ────────────────────────────────────────────────────────────

describe('inferActionType', () => {
  // Cards always return null — no radio inference for card form
  describe('credit card (isCard=true)', () => {
    it('returns null for payroll description', () => {
      expect(inferActionType('Payroll Direct Deposit', 2000, true)).toBeNull();
    });
    it('returns null for transfer description', () => {
      expect(inferActionType('Zelle Transfer', -100, true)).toBeNull();
    });
    it('returns null for debt payment description', () => {
      expect(inferActionType('Web Pymt Chase', -300, true)).toBeNull();
    });
  });

  // Bank account — income detection (credits only)
  describe('income inference (bank, credit amounts)', () => {
    const cases: [string, number][] = [
      ['Payroll Direct Deposit', 2400],
      ['SALARY PAYMENT', 3000],
      ['Direct Dep ADP', 1800],
      ['Direct Deposit from Employer', 2500],
      ['Dividend Reinvestment', 50],
      ['Interest Earned', 4.20],
      ['Tax Refund IRS', 890],
      ['ACH Credit ADP Payroll', 2200],
      ['Stipend Payment', 500],
      ['Expense Reimbursement', 125],
    ];

    cases.forEach(([desc, amount]) => {
      it(`recognizes "${desc}" as income`, () => {
        expect(inferActionType(desc, amount, false)).toBe('income');
      });
    });

    it('does NOT infer income for debit amounts (even with income keywords)', () => {
      expect(inferActionType('Payroll Reversal', -200, false)).toBeNull();
    });

    it('is case-insensitive', () => {
      expect(inferActionType('PAYROLL DEPOSIT', 1000, false)).toBe('income');
      expect(inferActionType('payroll deposit', 1000, false)).toBe('income');
    });
  });

  // Bank account — transfer detection (any sign)
  describe('transfer inference (bank, any sign)', () => {
    const cases: [string, number][] = [
      ['Transfer to Savings', -500],
      ['Xfer from Checking', 500],
      ['Zelle Payment from John', 75],
      ['Venmo payment', -40],
      ['Cash App Transfer', -20],
      ['Wire Transfer International', -1000],
      ['Peer Pay ACH', 300],
    ];

    cases.forEach(([desc, amount]) => {
      it(`recognizes "${desc}" as transfer`, () => {
        expect(inferActionType(desc, amount, false)).toBe('transfer');
      });
    });

    it('matches transfer for both debit and credit amounts', () => {
      expect(inferActionType('Zelle Transfer', -100, false)).toBe('transfer');
      expect(inferActionType('Zelle Transfer', 100, false)).toBe('transfer');
    });
  });

  // Bank account — debt payment detection (debits only)
  describe('debt-payment inference (bank, debit amounts)', () => {
    const cases: [string, number][] = [
      ['Web Pymt Chase Sapphire', -300],
      ['Web Pmt American Express', -250],
      ['Autopay Mortgage', -1200],
      ['Auto-Pay Car Loan', -450],
      ['Auto Pay Insurance', -80],
      ['CC Payment', -200],
      ['CC Pay Main', -150],
      ['Credit Card Payment', -500],
      ['E-Pay Utility', -90],
      ['EPay Electric', -65],
      ['Bill Pay Comcast', -120],
      ['Online Payment Spectrum', -55],
    ];

    cases.forEach(([desc, amount]) => {
      it(`recognizes "${desc}" as debt-payment`, () => {
        expect(inferActionType(desc, amount, false)).toBe('debt-payment');
      });
    });

    it('does NOT infer debt-payment for credit amounts', () => {
      expect(inferActionType('Autopay Refund', 300, false)).toBeNull();
    });
  });

  // No-match cases
  describe('no match → null', () => {
    it('returns null for a generic grocery description', () => {
      expect(inferActionType('Grocery Store', -82.50, false)).toBeNull();
    });
    it('returns null for a short/empty description', () => {
      expect(inferActionType('', 0, false)).toBeNull();
    });
    it('returns null for a coffee shop', () => {
      expect(inferActionType('Coffee Shop', -6.75, false)).toBeNull();
    });
    it('returns null for rent payment (not matching keywords)', () => {
      expect(inferActionType('Rent Payment', -1200, false)).toBeNull();
    });
  });

  // Priority: transfer wins over income (Zelle + credit)
  describe('priority ordering', () => {
    it('income wins over null for direct deposit credit', () => {
      expect(inferActionType('ACH Credit Direct Deposit', 500, false)).toBe('income');
    });
    it('transfer wins over income because transfer is checked after income (credit Zelle)', () => {
      // "Zelle" matches TRANSFER_KW; credit amount means income was also a candidate —
      // but income is checked first (only if no-debit), and this is a credit.
      // INCOME_KW does not match 'zelle', so we fall through to TRANSFER_KW.
      expect(inferActionType('Zelle Payment Received', 200, false)).toBe('transfer');
    });
    it('transfer wins for debit even if it could be debt-payment keyword order', () => {
      // 'transfer' is checked before 'debt-payment', so a transfer description wins
      expect(inferActionType('Wire Transfer Web Pmt', -500, false)).toBe('transfer');
    });
  });
});

// ── Regex exports sanity tests ─────────────────────────────────────────────────

describe('INCOME_KW', () => {
  it.each(['payroll', 'salary', 'direct dep', 'direct deposit', 'dividend', 'interest earned', 'tax refund', 'ach credit', 'stipend', 'reimbursement'])(
    'matches "%s"', (kw) => { expect(INCOME_KW.test(kw)).toBe(true); },
  );
  it.each(['paycheck', 'income', 'payment received', 'grocery'])(
    'does not match "%s"', (kw) => { expect(INCOME_KW.test(kw)).toBe(false); },
  );
});

describe('TRANSFER_KW', () => {
  it.each(['transfer', 'xfer', 'zelle', 'venmo', 'cash app', 'cashapp', 'wire transfer', 'peer pay'])(
    'matches "%s"', (kw) => { expect(TRANSFER_KW.test(kw)).toBe(true); },
  );
  it.each(['payment', 'deposit', 'grocery'])(
    'does not match "%s"', (kw) => { expect(TRANSFER_KW.test(kw)).toBe(false); },
  );
});

describe('DEBT_PMT_KW', () => {
  it.each(['web pymt', 'web pmt', 'autopay', 'auto-pay', 'auto pay', 'cc pay', 'cc payment', 'credit card payment', 'e-pay', 'epay', 'bill pay', 'online payment'])(
    'matches "%s"', (kw) => { expect(DEBT_PMT_KW.test(kw)).toBe(true); },
  );
  it.each(['payroll', 'salary', 'grocery', 'transfer'])(
    'does not match "%s"', (kw) => { expect(DEBT_PMT_KW.test(kw)).toBe(false); },
  );
});
