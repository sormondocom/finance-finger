import type { CardCharge, DebtPayment, AccountTransfer, LedgerEntry, ExpensePaidRecord, IncomeSource } from '@/types';
import {
  saveCardCharge,
  getCardCharges,
  deleteCardCharge,
  createCardCharge,
  saveDebtPayment,
  getDebtPayments,
  getDebtAccounts,
  saveDebtAccount,
  getBankAccounts,
  saveBankAccount,
  deleteDebtPayment as dbDeleteDebtPayment,
  createDebtPayment,
  saveAccountTransfer,
  createAccountTransfer,
  getAccountTransfers,
  deleteAccountTransfer,
  saveLedgerEntry,
  getAllLedgerEntries,
  getLedgerEntriesForAccount,
  deleteLedgerEntriesForAccount,
  deleteLedgerEntry,
  deleteLedgerEntriesByCorrelation,
  deleteLedgerEntriesBySource,
  deleteBankTransactionsByAccount,
  createLedgerEntry,
  saveExpensePaidRecord,
  createExpensePaidRecord,
  getExpensePaidRecords,
  deleteExpensePaidRecord,
  getExpenses,
  saveExpense,
  getIncomeSources,
  deleteIncomeSource as deleteIncomeSourceRecord,
} from '@/db';
import type {
  IAccountingService,
  RecordChargeParams,
  UpdateChargeParams,
  RecordDebtPaymentParams,
  UpdateDebtPaymentParams,
  RecordBankDebitParams,
  RecordBankCreditParams,
  RecordTransferParams,
  ReconcileAccountParams,
  LedgerQueryParams,
  ResetAccountParams,
  RecordExpensePaymentParams,
  UpdateExpensePaymentParams,
} from './types';

// Derive balance by replaying ledger entries in chronological order.
// Reconciliation entries act as a hard reset to targetBalance.
export function deriveBalance(entries: LedgerEntry[]): number {
  let balance = 0;
  for (const entry of entries) {
    if (entry.type === 'reconciliation') {
      balance = entry.targetBalance ?? 0;
    } else {
      balance += entry.signedAmount;
    }
  }
  return balance;
}

export class AccountingService implements IAccountingService {
  // ── Internal balance sync helpers ─────────────────────────────────────────
  // These keep account.balance in the stored record up to date so that all
  // existing UI code that reads account.balance continues to work correctly
  // while the codebase migrates to deriving balance from the ledger.

  private async _syncDebtBalance(accountId: string): Promise<void> {
    const accounts = await getDebtAccounts();
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;
    const newBalance = await this.getDebtBalance(accountId);
    await saveDebtAccount({ ...account, balance: newBalance, updatedAt: Date.now() });
  }

  private async _syncBankBalance(accountId: string): Promise<void> {
    const accounts = await getBankAccounts();
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;
    const newBalance = await this.getBankBalance(accountId);
    await saveBankAccount({ ...account, balance: newBalance, updatedAt: Date.now() });
  }

  // ── Ledger seed migration ─────────────────────────────────────────────────
  // Accounts created before the ledger system was introduced have a stored
  // `balance` field but no ledger entries. The first accounting operation would
  // otherwise start deriveBalance from 0, producing a wrong result. This method
  // backfills a reconciliation entry from the stored balance the first time any
  // ledger entry is about to be written for such an account.

  private async _ensureLedgerSeed(accountId: string, accountType: 'debt' | 'bank'): Promise<void> {
    const existing = await getLedgerEntriesForAccount(accountId);
    if (existing.length > 0) return;

    const storedBalance = accountType === 'debt'
      ? (await getDebtAccounts()).find((a) => a.id === accountId)?.balance ?? 0
      : (await getBankAccounts()).find((a) => a.id === accountId)?.balance ?? 0;

    if (storedBalance <= 0) return;

    const seedEntry = createLedgerEntry(
      'reconciliation',
      accountId,
      accountType,
      0,
      'Opening balance',
      Date.now(),
      { priorBalance: 0, targetBalance: storedBalance },
    );
    await saveLedgerEntry(seedEntry);
  }

  // ── Card charges ──────────────────────────────────────────────────────────

  async recordCharge(params: RecordChargeParams): Promise<{ charge: CardCharge; entry: LedgerEntry }> {
    await this._ensureLedgerSeed(params.accountId, 'debt');
    const charge = createCardCharge(
      params.accountId,
      params.description,
      params.amount,
      params.date,
      params.categoryId,
    );
    if (params.note) charge.note = params.note;
    if (params.sourceExpenseId) charge.sourceExpenseId = params.sourceExpenseId;

    const entry = createLedgerEntry(
      'charge',
      params.accountId,
      'debt',
      params.amount,  // positive = owe more
      params.description,
      params.date,
      {
        ...(params.correlationId != null ? { correlationId: params.correlationId } : {}),
        sourceId: charge.id,
        sourceType: 'card-charge',
      },
    );

    await Promise.all([saveCardCharge(charge), saveLedgerEntry(entry)]);
    await this._syncDebtBalance(params.accountId);
    return { charge, entry };
  }

  async updateCharge(params: UpdateChargeParams): Promise<{ charge: CardCharge; entry?: LedgerEntry }> {
    const allCharges = await getCardCharges();
    const charge = allCharges.find((c) => c.id === params.chargeId);
    if (!charge) throw new Error(`Charge ${params.chargeId} not found`);

    const delta = params.amount - charge.amount;
    const updated: CardCharge = {
      ...charge,
      amount: params.amount,
      date: params.date,
      ...(params.description ? { merchant: params.description } : {}),
    };
    if (params.categoryId !== undefined) {
      if (params.categoryId === null) delete updated.categoryId;
      else updated.categoryId = params.categoryId;
    }
    if (params.note !== undefined) {
      if (params.note === null) delete updated.note;
      else updated.note = params.note;
    }

    let entry: LedgerEntry | undefined;
    if (delta !== 0) {
      entry = createLedgerEntry(
        'charge',
        charge.accountId,
        'debt',
        delta,  // signed delta: positive if charge grew, negative if it shrank
        `Update: ${updated.merchant}`,
        params.date,
        { sourceId: charge.id, sourceType: 'card-charge' },
      );
      await Promise.all([saveCardCharge(updated), saveLedgerEntry(entry)]);
    } else {
      await saveCardCharge(updated);
    }
    await this._syncDebtBalance(charge.accountId);

    // Keep the linked paid record in sync when amount or date changes.
    if (charge.sourceExpenseId) {
      const paidRecs = await getExpensePaidRecords(charge.sourceExpenseId);
      const linked = paidRecs.find((r) => r.cardId === charge.accountId);
      if (linked) await saveExpensePaidRecord({ ...linked, amount: params.amount, date: params.date });
    }

    return { charge: updated, ...(entry !== undefined ? { entry } : {}) };
  }

  async deleteCharge(chargeId: string): Promise<void> {
    const [allCharges, allEntries] = await Promise.all([getCardCharges(), getAllLedgerEntries()]);
    const charge = allCharges.find((c) => c.id === chargeId);
    if (!charge) return;

    const now = Date.now();
    const reversal = createLedgerEntry(
      'charge',
      charge.accountId,
      'debt',
      -charge.amount,  // reversal: negative = owe less
      `Void: ${charge.merchant}`,
      charge.date,
      { sourceId: chargeId, sourceType: 'card-charge' },
    );

    // Stamp the original charge entry with voidedAt so the UI can label it without
    // relying on description-string matching.
    const originalEntry = allEntries.find(
      (e) => e.sourceId === chargeId && e.type === 'charge' && e.signedAmount > 0,
    );
    const saves: Promise<unknown>[] = [deleteCardCharge(chargeId), saveLedgerEntry(reversal)];
    if (originalEntry) saves.push(saveLedgerEntry({ ...originalEntry, voidedAt: now, updatedAt: now }));
    await Promise.all(saves);
    await this._syncDebtBalance(charge.accountId);

    // If this charge was auto-created from a linked expense, remove the matching
    // paid record so the expense reverts to unpaid.
    if (charge.sourceExpenseId) {
      const paidRecs = await getExpensePaidRecords(charge.sourceExpenseId);
      const linked = paidRecs.find((r) => r.cardId === charge.accountId);
      if (linked) await deleteExpensePaidRecord(linked.id);
    }
  }

  // ── Debt payments ─────────────────────────────────────────────────────────

  async recordDebtPayment(params: RecordDebtPaymentParams): Promise<{ payment: DebtPayment; entry: LedgerEntry }> {
    await this._ensureLedgerSeed(params.accountId, 'debt');
    const payment = createDebtPayment(params.accountId, params.amount, params.type, params.note);
    payment.date = params.date;
    if (params.bankAccountId) payment.bankAccountId = params.bankAccountId;

    // When a bank account is the funding source, generate a shared correlationId so
    // both the debt-payment entry and the bank-debit entry are linked as a flow pair.
    const correlationId = params.bankAccountId
      ? (params.correlationId ?? crypto.randomUUID())
      : params.correlationId;

    const baseDesc = params.note ?? `${params.type === 'extra' ? 'Extra' : 'Regular'} payment`;

    // Include the debt account name in the bank-debit description so the bank account's
    // transaction history shows which card the payment went to.
    let bankDesc = baseDesc;
    if (params.bankAccountId) {
      const debtAccounts = await getDebtAccounts();
      const debtAccount = debtAccounts.find((a) => a.id === params.accountId);
      if (debtAccount) {
        bankDesc = params.note
          ? `${params.note} — ${debtAccount.name}`
          : `${params.type === 'extra' ? 'Extra' : 'Regular'} payment — ${debtAccount.name}`;
      }
    }

    const entry = createLedgerEntry(
      'payment',
      params.accountId,
      'debt',
      -params.amount,  // negative = owe less
      baseDesc,
      params.date,
      { ...(correlationId != null ? { correlationId } : {}), sourceId: payment.id, sourceType: 'debt-payment' },
    );

    const saveOps: Promise<unknown>[] = [saveDebtPayment(payment), saveLedgerEntry(entry)];

    if (params.bankAccountId && correlationId != null) {
      await this._ensureLedgerSeed(params.bankAccountId, 'bank');
      const bankEntry = createLedgerEntry(
        'bank-debit',
        params.bankAccountId,
        'bank',
        -params.amount,
        bankDesc,
        params.date,
        { correlationId, sourceId: payment.id, sourceType: 'debt-payment' },
      );
      saveOps.push(saveLedgerEntry(bankEntry));
    }

    await Promise.all(saveOps);
    await this._syncDebtBalance(params.accountId);
    return { payment, entry };
  }

  async updateDebtPayment(params: UpdateDebtPaymentParams): Promise<{ payment: DebtPayment; entry: LedgerEntry }> {
    const allPayments = await getDebtPayments();
    const payment = allPayments.find((p) => p.id === params.paymentId);
    if (!payment) throw new Error(`Payment ${params.paymentId} not found`);

    const delta = params.amount - payment.amount;  // positive = paid more, negative = paid less
    const { note: _n, bankAccountId: _b, ...base } = payment;
    const updated: DebtPayment = {
      ...base,
      amount: params.amount,
      date: params.date,
      type: params.type,
      ...(params.note ? { note: params.note } : {}),
      ...(params.bankAccountId ? { bankAccountId: params.bankAccountId } : {}),
    };

    const entry = createLedgerEntry(
      'payment',
      payment.accountId,
      'debt',
      -delta,  // -delta because: paying more means balance goes down more → more negative signed amount
      `Update payment`,
      params.date,
      { sourceId: payment.id, sourceType: 'debt-payment' },
    );

    await Promise.all([saveDebtPayment(updated), saveLedgerEntry(entry)]);
    await this._syncDebtBalance(payment.accountId);
    return { payment: updated, entry };
  }

  async deleteDebtPayment(paymentId: string): Promise<void> {
    const [allPayments, allEntries] = await Promise.all([getDebtPayments(), getAllLedgerEntries()]);
    const payment = allPayments.find((p) => p.id === paymentId);
    if (!payment) return;

    const now = Date.now();
    const reversal = createLedgerEntry(
      'payment',
      payment.accountId,
      'debt',
      payment.amount,  // reversal: positive = owe more again
      `Void payment`,
      payment.date,    // same business date so the reversal sorts near the original
      { sourceId: paymentId, sourceType: 'debt-payment' },
    );

    // Stamp the original payment entry with voidedAt.
    const originalPaymentEntry = allEntries.find(
      (e) => e.sourceId === paymentId && e.type === 'payment' && e.signedAmount < 0,
    );
    const saves: Promise<unknown>[] = [dbDeleteDebtPayment(paymentId), saveLedgerEntry(reversal)];
    if (originalPaymentEntry) saves.push(saveLedgerEntry({ ...originalPaymentEntry, voidedAt: now, updatedAt: now }));
    await Promise.all(saves);
    await this._syncDebtBalance(payment.accountId);

    // Write a bank-credit reversal instead of hard-deleting the bank-debit.
    if (payment.bankAccountId) {
      const bankDebitEntry = allEntries.find(
        (e) => e.sourceId === paymentId && e.type === 'bank-debit',
      );
      if (bankDebitEntry) {
        const bankReversal = createLedgerEntry(
          'bank-credit',
          bankDebitEntry.accountId,
          'bank',
          -bankDebitEntry.signedAmount,
          `Void: ${bankDebitEntry.description}`,
          payment.date,
          { sourceId: paymentId, sourceType: 'debt-payment' },
        );
        await Promise.all([
          saveLedgerEntry(bankReversal),
          saveLedgerEntry({ ...bankDebitEntry, voidedAt: now, updatedAt: now }),
        ]);
        await this._syncBankBalance(payment.bankAccountId);
      }
    }
  }

  // ── Bank account flows ────────────────────────────────────────────────────

  async recordBankDebit(params: RecordBankDebitParams): Promise<{ entry: LedgerEntry }> {
    const entry = createLedgerEntry(
      'bank-debit',
      params.accountId,
      'bank',
      -params.amount,
      params.description,
      params.date,
      { ...(params.correlationId != null ? { correlationId: params.correlationId } : {}) },
    );
    await saveLedgerEntry(entry);
    // Bank account displayed balance is a projection (income - expenses + starting balance).
    // We don't sync account.balance here — that field is the user-entered starting balance.
    return { entry };
  }

  async recordBankCredit(params: RecordBankCreditParams): Promise<{ entry: LedgerEntry }> {
    const entry = createLedgerEntry(
      'bank-credit',
      params.accountId,
      'bank',
      params.amount,
      params.description,
      params.date,
      { ...(params.correlationId != null ? { correlationId: params.correlationId } : {}) },
    );
    await saveLedgerEntry(entry);
    return { entry };
  }

  // ── Expense payments ──────────────────────────────────────────────────────

  async recordExpensePayment(params: RecordExpensePaymentParams): Promise<{ record: ExpensePaidRecord; bankEntry?: LedgerEntry }> {
    const record = createExpensePaidRecord(params.expenseId, params.amount, params.date);
    if (params.bankAccountId) record.bankAccountId = params.bankAccountId;
    if (params.cardId) record.cardId = params.cardId;

    const saveOps: Promise<unknown>[] = [saveExpensePaidRecord(record)];
    let bankEntry: LedgerEntry | undefined;

    if (params.bankAccountId) {
      await this._ensureLedgerSeed(params.bankAccountId, 'bank');
      bankEntry = createLedgerEntry(
        'bank-debit',
        params.bankAccountId,
        'bank',
        -params.amount,
        params.description,
        params.date,
        { sourceId: record.id, sourceType: 'expense-payment' },
      );
      saveOps.push(saveLedgerEntry(bankEntry));
    }

    await Promise.all(saveOps);
    return { record, ...(bankEntry != null ? { bankEntry } : {}) };
  }

  async deleteExpensePayment(record: ExpensePaidRecord): Promise<void> {
    const allEntries = await getAllLedgerEntries();

    // Void the bank-debit with a bank-credit reversal — same audit-trail approach used
    // for card charges, so both deletion paths are consistent.
    const now = Date.now();
    if (record.bankAccountId) {
      const bankDebit = allEntries.find(
        (e) => e.sourceId === record.id && e.type === 'bank-debit' && e.sourceType === 'expense-payment',
      );
      if (bankDebit) {
        const reversal = createLedgerEntry(
          'bank-credit',
          bankDebit.accountId,
          'bank',
          -bankDebit.signedAmount,  // bankDebit.signedAmount is negative; reversal is positive
          `Void: ${bankDebit.description}`,
          bankDebit.date,  // same business date as the original so the reversal sorts in the same day group
          { sourceId: record.id, sourceType: 'expense-payment' },
        );
        await Promise.all([
          saveLedgerEntry(reversal),
          saveLedgerEntry({ ...bankDebit, voidedAt: now, updatedAt: now }),
        ]);
        await this._syncBankBalance(record.bankAccountId);
      }
    }

    // Void the card charge via deleteCharge — same soft-delete path used by the debt page.
    // This writes a void reversal entry and keeps the original charge entry in the ledger,
    // so both deletion paths produce identical accounting behaviour.
    if (record.cardId) {
      const allCharges = await getCardCharges();
      const charge = allCharges.find(
        (c) => c.sourceExpenseId === record.expenseId && c.accountId === record.cardId,
      );
      if (charge) {
        await this.deleteCharge(charge.id);
        // deleteCharge already removes the linked ExpensePaidRecord; the explicit
        // deleteExpensePaidRecord call below is a no-op for the card path.
      }
    }

    await deleteExpensePaidRecord(record.id);
  }

  async updateExpensePayment(params: UpdateExpensePaymentParams): Promise<void> {
    const { record, amount, date, description, bankAccountId, cardId } = params;
    const allEntries = await getAllLedgerEntries();

    // Replace the bank-debit entry: remove old, write new
    if (record.bankAccountId) {
      const oldDebit = allEntries.find(
        (e) => e.sourceId === record.id && e.type === 'bank-debit' && e.sourceType === 'expense-payment',
      );
      if (oldDebit) {
        await deleteLedgerEntry(oldDebit.id);
        await this._syncBankBalance(record.bankAccountId);
      }
    }

    if (bankAccountId) {
      await this._ensureLedgerSeed(bankAccountId, 'bank');
      const newDebit = createLedgerEntry(
        'bank-debit',
        bankAccountId,
        'bank',
        -amount,
        description,
        date,
        { sourceId: record.id, sourceType: 'expense-payment' },
      );
      await saveLedgerEntry(newDebit);
      await this._syncBankBalance(bankAccountId);
    }

    const updated: ExpensePaidRecord = { ...record, amount, date };
    if (bankAccountId) updated.bankAccountId = bankAccountId;
    else delete updated.bankAccountId;
    if (cardId) updated.cardId = cardId;
    else delete updated.cardId;

    await saveExpensePaidRecord(updated);
  }

  // ── Transfers ─────────────────────────────────────────────────────────────

  async recordTransfer(params: RecordTransferParams): Promise<{ transfer: AccountTransfer; entries: LedgerEntry[] }> {
    const correlationId = crypto.randomUUID();
    const transfer = createAccountTransfer(
      params.fromAccountId,
      params.toAccountId,
      params.amount,
      params.date,
      params.note,
    );

    // For bank accounts: outflow = -amount (have less), inflow = +amount (have more)
    // For debt accounts: receiving payment = -amount (owe less), sending = +amount (owe more)
    const fromSignedAmount = params.fromAccountType === 'bank' ? -params.amount : params.amount;
    const toSignedAmount   = params.toAccountType   === 'bank' ? params.amount  : -params.amount;

    const outEntry = createLedgerEntry(
      'transfer-out',
      params.fromAccountId,
      params.fromAccountType,
      fromSignedAmount,
      params.note ?? 'Transfer out',
      params.date,
      { correlationId, sourceId: transfer.id, sourceType: 'transfer' },
    );

    const inEntry = createLedgerEntry(
      'transfer-in',
      params.toAccountId,
      params.toAccountType,
      toSignedAmount,
      params.note ?? 'Transfer in',
      params.date,
      { correlationId, sourceId: transfer.id, sourceType: 'transfer' },
    );

    await Promise.all([
      saveAccountTransfer(transfer),
      saveLedgerEntry(outEntry),
      saveLedgerEntry(inEntry),
    ]);

    const syncOps: Promise<void>[] = [];
    if (params.fromAccountType === 'debt') syncOps.push(this._syncDebtBalance(params.fromAccountId));
    else syncOps.push(this._syncBankBalance(params.fromAccountId));
    if (params.toAccountType === 'debt') syncOps.push(this._syncDebtBalance(params.toAccountId));
    else syncOps.push(this._syncBankBalance(params.toAccountId));
    await Promise.all(syncOps);

    return { transfer, entries: [outEntry, inEntry] };
  }

  // ── Reconciliation ────────────────────────────────────────────────────────

  async reconcileAccount(params: ReconcileAccountParams): Promise<{ entry: LedgerEntry }> {
    const priorBalance = params.accountType === 'debt'
      ? await this.getDebtBalance(params.accountId)
      : await this.getBankBalance(params.accountId);

    const date = params.date ?? Date.now();
    const entry = createLedgerEntry(
      'reconciliation',
      params.accountId,
      params.accountType,
      0,
      params.note ?? 'Balance adjustment',
      date,
      { priorBalance, targetBalance: params.targetBalance, ...(params.note != null ? { note: params.note } : {}) },
    );

    await saveLedgerEntry(entry);

    // Sync the stored account balance to the reconciled value
    if (params.accountType === 'debt') {
      await this._syncDebtBalance(params.accountId);
    } else {
      await this._syncBankBalance(params.accountId);
    }

    return { entry };
  }

  async batchReconcile(params: ReconcileAccountParams[]): Promise<{ entries: LedgerEntry[] }> {
    const results = await Promise.all(params.map((p) => this.reconcileAccount(p)));
    return { entries: results.map((r) => r.entry) };
  }

  // ── Derived balance queries ───────────────────────────────────────────────

  async getDebtBalance(accountId: string): Promise<number> {
    const entries = await getLedgerEntriesForAccount(accountId);
    if (entries.length === 0) {
      // No ledger entries yet (account predates the ledger, or no transactions
      // have been recorded through the accounting service). Fall back to the
      // balance stored on the account record so callers always get a useful value.
      const accounts = await getDebtAccounts();
      return accounts.find((a) => a.id === accountId)?.balance ?? 0;
    }
    return deriveBalance(entries);
  }

  async getBankBalance(accountId: string): Promise<number> {
    const entries = await getLedgerEntriesForAccount(accountId);
    if (entries.length === 0) {
      // Same fallback as getDebtBalance — covers opening balances set before
      // the ledger was adopted and accounts with no recorded transactions yet.
      const accounts = await getBankAccounts();
      return accounts.find((a) => a.id === accountId)?.balance ?? 0;
    }
    return deriveBalance(entries);
  }

  // ── Ledger reads ──────────────────────────────────────────────────────────

  async getLedgerEntries(params?: LedgerQueryParams): Promise<LedgerEntry[]> {
    let entries = await getAllLedgerEntries();
    if (params?.accountId) entries = entries.filter((e) => e.accountId === params.accountId);
    if (params?.accountType) entries = entries.filter((e) => e.accountType === params.accountType);
    if (params?.from !== undefined) entries = entries.filter((e) => e.date >= params.from!);
    if (params?.to !== undefined) entries = entries.filter((e) => e.date <= params.to!);
    if (params?.limit) entries = entries.slice(0, params.limit);
    return entries;
  }

  async getLedgerEntriesForAccount(accountId: string): Promise<LedgerEntry[]> {
    return getLedgerEntriesForAccount(accountId);
  }

  // ── Account history reset ─────────────────────────────────────────────────

  async resetAccount(params: ResetAccountParams): Promise<void> {
    const { accountId, accountType, newOpeningBalance, newOpeningBalanceNote } = params;

    // Gather correlation IDs from this account's entries BEFORE deleting anything —
    // counterpart entries on other accounts survive deleteLedgerEntriesForAccount
    // and must be cleaned up using the IDs we collect here.
    const myEntries = await getLedgerEntriesForAccount(accountId);
    const transferCorrelationIds = [
      ...new Set(
        myEntries
          .filter((e) => e.type === 'transfer-in' || e.type === 'transfer-out')
          .map((e) => e.correlationId)
          .filter((id): id is string => id != null),
      ),
    ];
    // Payment correlation IDs link debt-payment entries to their bank-debit counterparts.
    // We collect these from the ledger (not from DebtPayment records) because individually
    // voided payments have their DebtPayment records deleted — relying on DebtPayment would
    // miss those bank-debit entries and leave them as orphans after the reset.
    const paymentCorrelationIds = [
      ...new Set(
        myEntries
          .filter((e) => e.type === 'payment' && e.correlationId != null)
          .map((e) => e.correlationId!),
      ),
    ];

    // Find all AccountTransfer records for this account and collect counterpart IDs
    const allTransfers = await getAccountTransfers();
    const myTransfers = allTransfers.filter(
      (t) => t.fromAccountId === accountId || t.toAccountId === accountId,
    );
    const counterpartIds = [
      ...new Set(
        myTransfers.map((t) =>
          t.fromAccountId === accountId ? t.toAccountId : t.fromAccountId,
        ),
      ),
    ];

    // Load account lists once — used for balance zeroing and counterpart sync
    const [debtAccounts, bankAccounts] = await Promise.all([
      getDebtAccounts(),
      getBankAccounts(),
    ]);
    const debtIdSet = new Set(debtAccounts.map((a) => a.id));

    // Wipe this account's ledger entries
    await deleteLedgerEntriesForAccount(accountId);

    // Remove the counterpart side of every transfer this account participated in
    await Promise.all(
      transferCorrelationIds.map((cid) => deleteLedgerEntriesByCorrelation(cid)),
    );

    // Remove AccountTransfer records
    await Promise.all(myTransfers.map((t) => deleteAccountTransfer(t.id)));

    // Remove account-specific transaction records (expense PaidRecord is intentionally kept)
    if (accountType === 'debt') {
      const [charges, payments] = await Promise.all([getCardCharges(), getDebtPayments()]);
      const myCharges = charges.filter((c) => c.accountId === accountId);
      const myPayments = payments.filter((p) => p.accountId === accountId);
      await Promise.all([
        ...myCharges.map((c) => deleteCardCharge(c.id)),
        ...myPayments.map((p) => dbDeleteDebtPayment(p.id)),
      ]);
      // Remove bank-debit counterparts of this debt account's payments.
      // We use the correlationIds gathered from the ledger (not DebtPayment.bankAccountId)
      // so that bank-debit entries whose DebtPayment records were already deleted by a
      // prior individual void are not left as orphans after the reset.
      if (paymentCorrelationIds.length > 0) {
        // Identify which bank accounts had debit entries paired with these payments so
        // we can re-sync their projected balances after the entries are removed.
        const allCurrentEntries = await getAllLedgerEntries();
        const affectedBankIds = [
          ...new Set(
            allCurrentEntries
              .filter((e) => e.type === 'bank-debit' && e.correlationId != null && paymentCorrelationIds.includes(e.correlationId))
              .map((e) => e.accountId),
          ),
        ];
        await Promise.all(paymentCorrelationIds.map((cid) => deleteLedgerEntriesByCorrelation(cid)));
        await Promise.all(affectedBankIds.map((id) => this._syncBankBalance(id)));
      }
    } else {
      await deleteBankTransactionsByAccount(accountId);
      // Expunge DebtPayment records funded from this bank account and their
      // counterpart payment entries on the debt accounts.
      const allPayments = await getDebtPayments();
      const fundedPayments = allPayments.filter((p) => p.bankAccountId === accountId);
      if (fundedPayments.length > 0) {
        const affectedDebtIds = [...new Set(fundedPayments.map((p) => p.accountId))];
        await Promise.all([
          ...fundedPayments.map((p) => dbDeleteDebtPayment(p.id)),
          ...fundedPayments.map((p) => deleteLedgerEntriesBySource(p.id)),
        ]);
        await Promise.all(affectedDebtIds.map((id) => this._syncDebtBalance(id)));
      }
      // Expunge ExpensePaidRecord records funded from this bank account.
      // Their bank-debit ledger entries were already removed by deleteLedgerEntriesForAccount above.
      const allExpensePaidRecords = await getExpensePaidRecords();
      const bankExpenseRecords = allExpensePaidRecords.filter((r) => r.bankAccountId === accountId);
      if (bankExpenseRecords.length > 0) {
        const affectedExpenseIds = [...new Set(bankExpenseRecords.map((r) => r.expenseId))];
        await Promise.all(bankExpenseRecords.map((r) => deleteExpensePaidRecord(r.id)));
        // Update expense.date (last-paid tracker) for affected expenses
        const allExpenses = await getExpenses();
        await Promise.all(affectedExpenseIds.map(async (expId) => {
          const expense = allExpenses.find((e) => e.id === expId);
          if (!expense) return;
          const remaining = await getExpensePaidRecords(expId);
          if (remaining.length > 0) {
            await saveExpense({ ...expense, date: Math.max(...remaining.map((r) => r.date)) });
          }
        }));
      }
      // Expunge one-time income sources linked to this bank account.
      // Recurring sources are kept — they represent ongoing income configuration.
      const allIncomeSources = await getIncomeSources();
      const oneTimeLinked = allIncomeSources.filter(
        (s) => s.frequency === 'once' && s.bankAccountId === accountId,
      );
      if (oneTimeLinked.length > 0) {
        await Promise.all(oneTimeLinked.map((s) => deleteIncomeSourceRecord(s.id)));
      }
    }

    // Zero the stored balance field on the account record
    if (accountType === 'debt') {
      const account = debtAccounts.find((a) => a.id === accountId);
      if (account) await saveDebtAccount({ ...account, balance: 0, updatedAt: Date.now() });
    } else {
      const account = bankAccounts.find((a) => a.id === accountId);
      if (account) await saveBankAccount({ ...account, balance: 0, updatedAt: Date.now() });
    }

    // Sync counterpart accounts whose ledger entries were partially removed
    await Promise.all(
      counterpartIds.map((id) =>
        debtIdSet.has(id) ? this._syncDebtBalance(id) : this._syncBankBalance(id),
      ),
    );

    // Optionally write a fresh opening balance
    if (newOpeningBalance != null && newOpeningBalance >= 0) {
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      await this.reconcileAccount({
        accountId,
        accountType,
        targetBalance: newOpeningBalance,
        note: newOpeningBalanceNote ?? 'Opening balance after history reset',
        date: todayMidnight.getTime(),
      });
    }
  }

  // ── Income source deletion ─────────────────────────────────────────────────

  async deleteIncomeSource(source: IncomeSource): Promise<void> {
    // For one-time income linked to a bank account, write a reversal bank-debit
    // so the balance is corrected while the original credit stays in the audit trail.
    if (source.frequency === 'once' && source.bankAccountId) {
      const allEntries = await getAllLedgerEntries();
      const original = allEntries.find(
        (e) => e.correlationId === `income-once-${source.id}` && e.type === 'bank-credit',
      );
      if (original) {
        const now = Date.now();
        const reversal = createLedgerEntry(
          'bank-debit',
          source.bankAccountId,
          'bank',
          -source.amount,
          `Refund: ${source.name}`,
          original.date,  // same business date as the income — reversal stays in the same day group
        );
        await Promise.all([
          saveLedgerEntry(reversal),
          saveLedgerEntry({ ...original, refundedAt: now, updatedAt: now }),
        ]);
        await this._syncBankBalance(source.bankAccountId);
      }
    }
    await deleteIncomeSourceRecord(source.id);
  }
}
