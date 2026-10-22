import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCatchUp } from './catchUp';
import type { DebtAccount, Expense } from '@/types';
import type { MissedPayday } from '@/utils/paydayDeposits';
import type { LapsedDebtCycle } from '@/utils/debtCatchUp';
import type { LapsedExpenseCycle } from '@/utils/expenseCatchUp';

vi.mock('webextension-polyfill', () => ({
  default: { storage: { local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() } } },
}));

vi.mock('@/db', () => ({
  getDebtAccounts: vi.fn(),
  getDebtPayments: vi.fn(),
  getExpenses: vi.fn(),
  getBankAccounts: vi.fn(),
  getExpensePaidRecords: vi.fn(),
}));

vi.mock('@/accounting', () => ({
  accounting: { recordBankCredit: vi.fn() },
}));

vi.mock('@/utils/errorUI', () => ({
  showActionableToast: vi.fn(),
}));

vi.mock('@/app/router', () => ({
  navigate: vi.fn(),
}));

vi.mock('@/utils/paydayDeposits', () => ({
  autoRecordPaydays: vi.fn(),
}));

vi.mock('@/utils/autoPayRecords', () => ({
  autoRecordAutoPay: vi.fn(),
}));

vi.mock('@/utils/debtCatchUp', () => ({
  enumerateLapsedDebtCycles: vi.fn(),
}));

vi.mock('@/utils/expenseCatchUp', () => ({
  enumerateLapsedExpenseCycles: vi.fn(),
}));

vi.mock('@/mascot/Mascot', () => ({
  showCatchUpQueue: vi.fn(),
}));

vi.mock('@/components/DebtPaymentModal', () => ({
  openDebtPaymentModal: vi.fn(),
}));

vi.mock('@/components/ExpensePaymentModal', () => ({
  openExpensePaymentModal: vi.fn(),
}));

import browser from 'webextension-polyfill';
import { getDebtAccounts, getDebtPayments, getExpenses, getBankAccounts, getExpensePaidRecords } from '@/db';
import { accounting } from '@/accounting';
import { showActionableToast } from '@/utils/errorUI';
import { autoRecordPaydays } from '@/utils/paydayDeposits';
import { autoRecordAutoPay } from '@/utils/autoPayRecords';
import { enumerateLapsedDebtCycles } from '@/utils/debtCatchUp';
import { enumerateLapsedExpenseCycles } from '@/utils/expenseCatchUp';
import { showCatchUpQueue } from '@/mascot/Mascot';

const NOW = new Date(2026, 8, 19).getTime();

function makeDebtAccount(overrides: Partial<DebtAccount> = {}): DebtAccount {
  return {
    id: 'acc-1', type: 'card', name: 'Visa', balance: 500, apr: 20,
    paymentCycle: 'monthly', createdAt: 0, updatedAt: 0, ...overrides,
  };
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1', categoryId: 'cat-1', memberId: null, description: 'Electric Bill',
    amount: 100, date: NOW, recurring: true, recurringFrequency: 'monthly', dueDay: 1,
    createdAt: 0, ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(NOW);

  (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (browser.storage.local.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (browser.storage.local.remove as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

  (getDebtAccounts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (getDebtPayments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (getExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (getBankAccounts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (getExpensePaidRecords as ReturnType<typeof vi.fn>).mockResolvedValue([]);

  (autoRecordPaydays as ReturnType<typeof vi.fn>).mockResolvedValue({ recorded: 0, pendingPrompts: [] });
  (autoRecordAutoPay as ReturnType<typeof vi.fn>).mockResolvedValue({ recorded: 0, recordedItems: [] });
  (enumerateLapsedDebtCycles as ReturnType<typeof vi.fn>).mockReturnValue([]);
  (enumerateLapsedExpenseCycles as ReturnType<typeof vi.fn>).mockReturnValue([]);
  (showCatchUpQueue as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (accounting.recordBankCredit as ReturnType<typeof vi.fn>).mockResolvedValue({ entry: {} });
});

describe('runCatchUp — legacy settings migration', () => {
  it('seeds catchUpWindowDays from the max of the legacy settings and removes them', async () => {
    (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      missedPaydayPromptDays: 3,
      autoPayPromptDays: 10,
    });

    await runCatchUp(null);

    expect(browser.storage.local.set).toHaveBeenCalledWith({ catchUpWindowDays: 10 });
    expect(browser.storage.local.remove).toHaveBeenCalledWith(['missedPaydayPromptDays', 'autoPayPromptDays']);
  });

  it('defaults to 90 when no catchUpWindowDays and no legacy keys exist', async () => {
    (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await runCatchUp(null);

    expect(browser.storage.local.set).toHaveBeenCalledWith({ catchUpWindowDays: 90 });
  });

  it('does not re-migrate once catchUpWindowDays is already set', async () => {
    (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({ catchUpWindowDays: 45 });

    await runCatchUp(null);

    expect(browser.storage.local.set).not.toHaveBeenCalledWith(expect.objectContaining({ catchUpWindowDays: expect.anything() }));
    expect(browser.storage.local.remove).not.toHaveBeenCalled();
  });
});

describe('runCatchUp — fresh install (prevOpenedAt null)', () => {
  it('still runs the silent payday/auto-pay functions with a null window, and skips debt/expense enumeration entirely', async () => {
    await runCatchUp(null);

    expect(autoRecordPaydays).toHaveBeenCalledWith(null);
    expect(autoRecordAutoPay).toHaveBeenCalledWith(null);
    expect(enumerateLapsedDebtCycles).not.toHaveBeenCalled();
    expect(enumerateLapsedExpenseCycles).not.toHaveBeenCalled();
    expect(showCatchUpQueue).not.toHaveBeenCalled();
  });
});

describe('runCatchUp — merging and ordering', () => {
  it('merges payday, debt-cycle, and expense-cycle items in that order', async () => {
    (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({ catchUpWindowDays: 90 });
    const payday: MissedPayday = { sourceName: 'Job', bankAccountId: 'bank-1', amount: 1000, date: NOW, correlationId: 'payday-src-1-2026-09-18' };
    const debtCycle: LapsedDebtCycle = { accountId: 'acc-1', accountName: 'Visa', dueDate: NOW, minimumPayment: 50, correlationId: 'debt-cycle-acc-1-2026-09-18' };
    const expenseCycle: LapsedExpenseCycle = { expenseId: 'exp-1', description: 'Electric Bill', dueDate: NOW, expectedAmount: 100, isAutoPay: false, correlationId: 'expense-cycle-exp-1-2026-09-18' };

    (autoRecordPaydays as ReturnType<typeof vi.fn>).mockResolvedValue({ recorded: 0, pendingPrompts: [payday] });
    (getDebtAccounts as ReturnType<typeof vi.fn>).mockResolvedValue([makeDebtAccount()]);
    (getExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([makeExpense()]);
    (enumerateLapsedDebtCycles as ReturnType<typeof vi.fn>).mockReturnValue([debtCycle]);
    (enumerateLapsedExpenseCycles as ReturnType<typeof vi.fn>).mockReturnValue([expenseCycle]);

    await runCatchUp(NOW - 10 * 86_400_000);

    expect(showCatchUpQueue).toHaveBeenCalledOnce();
    const [items] = (showCatchUpQueue as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(items).toEqual([
      { kind: 'payday', data: payday },
      { kind: 'debt-cycle', data: debtCycle },
      { kind: 'expense-cycle', data: expenseCycle },
    ]);
  });

  it('does not call showCatchUpQueue when there is nothing to catch up', async () => {
    (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({ catchUpWindowDays: 90 });
    await runCatchUp(NOW - 10 * 86_400_000);
    expect(showCatchUpQueue).not.toHaveBeenCalled();
  });

  it('shows an actionable toast listing each auto-pay bill that was recorded silently', async () => {
    (autoRecordAutoPay as ReturnType<typeof vi.fn>).mockResolvedValue({
      recorded: 2,
      recordedItems: [
        { expenseId: 'exp-1', description: 'Netflix', amount: 18, date: NOW },
        { expenseId: 'exp-2', description: 'Hulu', amount: 12, date: NOW },
      ],
    });

    await runCatchUp(NOW - 10 * 86_400_000);

    expect(showActionableToast).toHaveBeenCalledOnce();
    const [message, type, actions] = (showActionableToast as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(message).toContain('2 auto-pay bills recorded automatically');
    expect(type).toBe('info');
    expect(actions).toHaveLength(2);
    expect(actions[0].label).toContain('Netflix');
    expect(actions[1].label).toContain('Hulu');
  });

  it('does not show a toast when nothing was auto-recorded', async () => {
    (autoRecordAutoPay as ReturnType<typeof vi.fn>).mockResolvedValue({ recorded: 0, recordedItems: [] });
    await runCatchUp(NOW - 10 * 86_400_000);
    expect(showActionableToast).not.toHaveBeenCalled();
  });
});

describe('runCatchUp — decline filtering', () => {
  it('excludes debt/expense cycles whose correlationId was already declined', async () => {
    (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      catchUpWindowDays: 90,
      catchUpDeclinedCycles: { 'debt-cycle-acc-1-2026-09-18': NOW - 86_400_000 },
    });
    const debtCycle: LapsedDebtCycle = { accountId: 'acc-1', accountName: 'Visa', dueDate: NOW, minimumPayment: 50, correlationId: 'debt-cycle-acc-1-2026-09-18' };
    (getDebtAccounts as ReturnType<typeof vi.fn>).mockResolvedValue([makeDebtAccount()]);
    (enumerateLapsedDebtCycles as ReturnType<typeof vi.fn>).mockReturnValue([debtCycle]);

    await runCatchUp(NOW - 10 * 86_400_000);

    expect(showCatchUpQueue).not.toHaveBeenCalled();
  });

  it('declining one cycle does not suppress a different, later cycle for the same account/expense', async () => {
    // Two distinct lapsed cycles for the same debt account — only the OLDER
    // one's correlationId (pinned to its own due date) has been declined.
    (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      catchUpWindowDays: 90,
      catchUpDeclinedCycles: { 'debt-cycle-acc-1-2026-08-18': NOW - 86_400_000 },
    });
    const olderCycle: LapsedDebtCycle = { accountId: 'acc-1', accountName: 'Visa', dueDate: NOW - 30 * 86_400_000, minimumPayment: 50, correlationId: 'debt-cycle-acc-1-2026-08-18' };
    const newerCycle: LapsedDebtCycle = { accountId: 'acc-1', accountName: 'Visa', dueDate: NOW, minimumPayment: 50, correlationId: 'debt-cycle-acc-1-2026-09-18' };
    (getDebtAccounts as ReturnType<typeof vi.fn>).mockResolvedValue([makeDebtAccount()]);
    (enumerateLapsedDebtCycles as ReturnType<typeof vi.fn>).mockReturnValue([olderCycle, newerCycle]);

    await runCatchUp(NOW - 40 * 86_400_000);

    expect(showCatchUpQueue).toHaveBeenCalledOnce();
    const [items] = (showCatchUpQueue as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(items).toEqual([{ kind: 'debt-cycle', data: newerCycle }]);
  });
});

describe('runCatchUp — expense scope filter', () => {
  it('excludes fixed-amount auto-pay expenses from enumeration (handled silently by autoRecordAutoPay instead)', async () => {
    (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({ catchUpWindowDays: 90 });
    const fixedAutoPay = makeExpense({ id: 'exp-fixed', isAutoPay: true, isFixedAmount: true });
    const variableAutoPay = makeExpense({ id: 'exp-variable', isAutoPay: true, isFixedAmount: false });
    (getExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([fixedAutoPay, variableAutoPay]);

    await runCatchUp(NOW - 10 * 86_400_000);

    expect(enumerateLapsedExpenseCycles).toHaveBeenCalledTimes(1);
    expect(enumerateLapsedExpenseCycles).toHaveBeenCalledWith(variableAutoPay, expect.any(Date), expect.any(Date));
  });
});

describe('runCatchUp — recordPayday handler', () => {
  it('wires the payday handler to accounting.recordBankCredit with the right params', async () => {
    (browser.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({ catchUpWindowDays: 90 });
    const payday: MissedPayday = { sourceName: 'Job', bankAccountId: 'bank-1', amount: 1000, date: NOW, correlationId: 'payday-src-1-2026-09-18' };
    (autoRecordPaydays as ReturnType<typeof vi.fn>).mockResolvedValue({ recorded: 0, pendingPrompts: [payday] });

    await runCatchUp(NOW - 10 * 86_400_000);

    const [, handlers] = (showCatchUpQueue as ReturnType<typeof vi.fn>).mock.calls[0]!;
    await handlers.recordPayday(payday);

    expect(accounting.recordBankCredit).toHaveBeenCalledWith({
      accountId: 'bank-1',
      description: 'Job',
      amount: 1000,
      date: NOW,
      correlationId: 'payday-src-1-2026-09-18',
    });
  });
});
