import type { CardCharge, DebtPayment, AccountTransfer, LedgerEntry, ExpensePaidRecord, IncomeSource } from '@/types';


// ── Param types ───────────────────────────────────────────────────────────────

export interface RecordChargeParams {
  accountId: string;
  description: string;
  amount: number;
  date: number;
  categoryId?: string;
  note?: string;
  sourceExpenseId?: string;
  correlationId?: string;
}

export interface UpdateChargeParams {
  chargeId: string;
  amount: number;
  date: number;
  description?: string;
  categoryId?: string | null;  // null = clear it
  note?: string | null;        // null = clear it
}

export interface RecordDebtPaymentParams {
  accountId: string;
  amount: number;
  date: number;
  type: 'regular' | 'extra';
  note?: string;
  bankAccountId?: string;
  correlationId?: string;
}

export interface UpdateDebtPaymentParams {
  paymentId: string;
  amount: number;
  date: number;
  type: 'regular' | 'extra';
  note?: string | null;
  bankAccountId?: string | null;
}

export interface RecordBankDebitParams {
  accountId: string;
  description: string;
  amount: number;
  date: number;
  correlationId?: string;
}

export interface RecordBankCreditParams {
  accountId: string;
  description: string;
  amount: number;
  date: number;
  correlationId?: string;
}

export interface RecordTransferParams {
  fromAccountId: string;
  fromAccountType: 'bank' | 'debt';
  toAccountId: string;
  toAccountType: 'bank' | 'debt';
  amount: number;
  date: number;
  note?: string;
}

export interface ReconcileAccountParams {
  accountId: string;
  accountType: 'bank' | 'debt';
  targetBalance: number;
  note?: string;
  /** Defaults to Date.now() */
  date?: number;
}

export interface LedgerQueryParams {
  accountId?: string;
  accountType?: 'bank' | 'debt';
  from?: number;
  to?: number;
  limit?: number;
}

export interface ResetAccountParams {
  accountId: string;
  accountType: 'bank' | 'debt';
  /** If provided, writes a reconciliation entry with this as the new opening balance. */
  newOpeningBalance?: number;
  /** Memo for the opening balance reconciliation entry. */
  newOpeningBalanceNote?: string;
}

export interface RecordExpensePaymentParams {
  expenseId: string;
  description: string;
  amount: number;
  date: number;
  bankAccountId?: string;
  cardId?: string;
}

export interface UpdateExpensePaymentParams {
  record: import('@/types').ExpensePaidRecord;
  amount: number;
  date: number;
  description: string;
  bankAccountId?: string;
  cardId?: string;
}

// ── Service interface ─────────────────────────────────────────────────────────

export interface IAccountingService {
  // Card charges
  recordCharge(params: RecordChargeParams): Promise<{ charge: CardCharge; entry: LedgerEntry }>;
  updateCharge(params: UpdateChargeParams): Promise<{ charge: CardCharge; entry?: LedgerEntry }>;
  deleteCharge(chargeId: string): Promise<void>;

  // Debt payments
  recordDebtPayment(params: RecordDebtPaymentParams): Promise<{ payment: DebtPayment; entry: LedgerEntry }>;
  updateDebtPayment(params: UpdateDebtPaymentParams): Promise<{ payment: DebtPayment; entry: LedgerEntry }>;
  deleteDebtPayment(paymentId: string): Promise<void>;

  // Bank account flows
  recordBankDebit(params: RecordBankDebitParams): Promise<{ entry: LedgerEntry }>;
  recordBankCredit(params: RecordBankCreditParams): Promise<{ entry: LedgerEntry }>;

  // Transfers
  recordTransfer(params: RecordTransferParams): Promise<{ transfer: AccountTransfer; entries: LedgerEntry[] }>;

  // Reconciliation / clean break
  reconcileAccount(params: ReconcileAccountParams): Promise<{ entry: LedgerEntry }>;
  batchReconcile(params: ReconcileAccountParams[]): Promise<{ entries: LedgerEntry[] }>;

  // Derived balance queries
  getDebtBalance(accountId: string): Promise<number>;
  getBankBalance(accountId: string): Promise<number>;

  // Ledger reads
  getLedgerEntries(params?: LedgerQueryParams): Promise<LedgerEntry[]>;
  getLedgerEntriesForAccount(accountId: string): Promise<LedgerEntry[]>;

  // Expense payments
  recordExpensePayment(params: RecordExpensePaymentParams): Promise<{ record: ExpensePaidRecord; bankEntry?: LedgerEntry }>;
  updateExpensePayment(params: UpdateExpensePaymentParams): Promise<void>;
  deleteExpensePayment(record: ExpensePaidRecord): Promise<void>;

  // History reset
  resetAccount(params: ResetAccountParams): Promise<void>;

  // Debt account deletion (hard delete cascade — charges, payments, ledger, FK unlinks)
  deleteDebtAccount(accountId: string): Promise<void>;

  // Income source deletion (void + delete — keeps audit trail)
  deleteIncomeSource(source: IncomeSource): Promise<void>;
}
