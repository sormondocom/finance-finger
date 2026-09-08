import { getDB } from './schema';
import { encryptRecord, decryptRecord } from '@/crypto/vault';
import type { RawSnapshot } from '@/types';
import type {
  HouseholdMember,
  AvatarType,
  IncomeSource,
  ExpenseCategory,
  Expense,
  ExpensePaidRecord,
  DebtAccount,
  DebtAccountType,
  DebtPayment,
  CardCharge,
  Scenario,
  ThemeSettings,
  BankAccount,
  BankAccountType,
  BankAccountOwnership,
  AccountTransfer,
  CustomNotification,
  NotificationTriggerType,
  CalendarMark,
  CalendarMemo,
  BankTransaction,
  ImportRecord,
  TransactionRule,
} from '@/types';

function uuid(): string {
  return crypto.randomUUID();
}

// ── Members ───────────────────────────────────────────────────────────────────

export async function saveMember(member: HouseholdMember): Promise<void> {
  const db = await getDB();
  await db.put('members', await encryptRecord(member), member.id);
}

export async function getMembers(): Promise<HouseholdMember[]> {
  const db = await getDB();
  const keys = await db.getAllKeys('members');
  return Promise.all(
    keys.map(async (k) => {
      const rec = await db.get('members', k);
      return decryptRecord<HouseholdMember>(rec!);
    }),
  );
}

export async function deleteMember(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('members', id);
}

export function createMember(name: string, avatarType?: AvatarType): HouseholdMember {
  const member: HouseholdMember = { id: uuid(), name, createdAt: Date.now() };
  if (avatarType !== undefined) member.avatarType = avatarType;
  return member;
}

// ── Income Sources ────────────────────────────────────────────────────────────

export async function saveIncomeSource(source: IncomeSource): Promise<void> {
  const db = await getDB();
  await db.put('income_sources', await encryptRecord(source), source.id);
}

export async function getIncomeSources(): Promise<IncomeSource[]> {
  const db = await getDB();
  const keys = await db.getAllKeys('income_sources');
  return Promise.all(
    keys.map(async (k) => {
      const rec = await db.get('income_sources', k);
      return decryptRecord<IncomeSource>(rec!);
    }),
  );
}

export async function deleteIncomeSource(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('income_sources', id);
}

export function createIncomeSource(
  memberId: string,
  name: string,
  amount: number,
  frequency: IncomeSource['frequency'],
): IncomeSource {
  const now = Date.now();
  return {
    id: uuid(),
    memberId,
    name,
    amount,
    frequency,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

// ── Expense Categories ────────────────────────────────────────────────────────

export async function saveCategory(category: ExpenseCategory): Promise<void> {
  const db = await getDB();
  await db.put('expense_categories', await encryptRecord(category), category.id);
}

export async function getCategories(): Promise<ExpenseCategory[]> {
  const db = await getDB();
  const keys = await db.getAllKeys('expense_categories');
  return Promise.all(
    keys.map(async (k) => {
      const rec = await db.get('expense_categories', k);
      return decryptRecord<ExpenseCategory>(rec!);
    }),
  );
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('expense_categories', id);
}

export function createCategory(
  name: string,
  color: string,
  parentId: string | null = null,
): ExpenseCategory {
  return { id: uuid(), name, color, parentId, createdAt: Date.now() };
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export async function saveExpense(expense: Expense): Promise<void> {
  const db = await getDB();
  await db.put('expenses', await encryptRecord(expense), expense.id);
}

export async function getExpenses(): Promise<Expense[]> {
  const db = await getDB();
  const keys = await db.getAllKeys('expenses');
  return Promise.all(
    keys.map(async (k) => {
      const rec = await db.get('expenses', k);
      return decryptRecord<Expense>(rec!);
    }),
  );
}

export async function deleteExpense(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('expenses', id);
}

export function createExpense(
  categoryId: string,
  description: string,
  amount: number,
  date: number,
  memberId: string | null = null,
): Expense {
  return {
    id: uuid(),
    categoryId,
    memberId,
    description,
    amount,
    date,
    recurring: false,
    recurringFrequency: null,
    createdAt: Date.now(),
  };
}

// ── Debt Accounts (store name kept as 'credit_cards' for backward compat) ─────

export async function saveDebtAccount(account: DebtAccount): Promise<void> {
  const db = await getDB();
  await db.put('credit_cards', await encryptRecord(account), account.id);
}

export async function getDebtAccounts(): Promise<DebtAccount[]> {
  const db = await getDB();
  const keys = await db.getAllKeys('credit_cards');
  const accounts = await Promise.all(
    keys.map(async (k) => {
      const rec = await db.get('credit_cards', k);
      return decryptRecord<DebtAccount>(rec!);
    }),
  );
  // Migrate legacy records that pre-date the type field
  return accounts.map((a) => a.type ? a : { ...a, type: 'card' as const });
}

export async function deleteDebtAccount(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('credit_cards', id);
}

export function createDebtAccount(
  type: DebtAccountType,
  name: string,
  balance: number,
  apr: number,
): DebtAccount {
  const now = Date.now();
  return {
    id: uuid(),
    type,
    name,
    balance,
    apr,
    paymentCycle: 'monthly',
    createdAt: now,
    updatedAt: now,
  };
}

// ── Debt Payments ─────────────────────────────────────────────────────────────

export async function saveDebtPayment(payment: DebtPayment): Promise<void> {
  const db = await getDB();
  await db.put('debt_payments', await encryptRecord(payment), payment.id);
}

export async function getDebtPayments(): Promise<DebtPayment[]> {
  const db = await getDB();
  const keys = await db.getAllKeys('debt_payments');
  const payments = await Promise.all(
    keys.map(async (k) => {
      const rec = await db.get('debt_payments', k);
      return decryptRecord<DebtPayment>(rec!);
    }),
  );
  return payments.sort((a, b) => b.date - a.date || b.createdAt - a.createdAt);
}

export async function deleteDebtPayment(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('debt_payments', id);
}

export function createDebtPayment(
  accountId: string,
  amount: number,
  type: 'regular' | 'extra',
  note?: string,
): DebtPayment {
  const now = Date.now();
  const payment: DebtPayment = { id: uuid(), accountId, amount, type, date: now, createdAt: now };
  if (note) payment.note = note;
  return payment;
}

// ── Card Charges ──────────────────────────────────────────────────────────────

export async function saveCardCharge(charge: CardCharge): Promise<void> {
  const db = await getDB();
  await db.put('card_charges', await encryptRecord(charge), charge.id);
}

export async function getCardCharges(accountId?: string): Promise<CardCharge[]> {
  const db = await getDB();
  const keys = await db.getAllKeys('card_charges');
  const all = await Promise.all(
    keys.map(async (k) => {
      const rec = await db.get('card_charges', k);
      return decryptRecord<CardCharge>(rec!);
    }),
  );
  const filtered = accountId ? all.filter((c) => c.accountId === accountId) : all;
  return filtered.sort((a, b) => b.date - a.date || b.createdAt - a.createdAt);
}

export async function deleteCardCharge(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('card_charges', id);
}

export async function findChargeByExpenseId(expenseId: string): Promise<CardCharge | null> {
  const all = await getCardCharges();
  return all.find((c) => c.sourceExpenseId === expenseId) ?? null;
}

export async function findChargesByExpenseId(expenseId: string): Promise<CardCharge[]> {
  const all = await getCardCharges();
  return all.filter((c) => c.sourceExpenseId === expenseId);
}

export function createCardCharge(
  accountId: string,
  merchant: string,
  amount: number,
  date: number,
  categoryId?: string,
  note?: string,
): CardCharge {
  const now = Date.now();
  const charge: CardCharge = { id: uuid(), accountId, merchant, amount, date, createdAt: now };
  if (categoryId) charge.categoryId = categoryId;
  if (note) charge.note = note;
  return charge;
}

// ── Expense Paid Records ──────────────────────────────────────────────────────

export async function saveExpensePaidRecord(record: ExpensePaidRecord): Promise<void> {
  const db = await getDB();
  await db.put('expense_paid_records', await encryptRecord(record), record.id);
}

export async function getExpensePaidRecords(expenseId?: string): Promise<ExpensePaidRecord[]> {
  const db = await getDB();
  const keys = await db.getAllKeys('expense_paid_records');
  const all = await Promise.all(
    keys.map(async (k) => {
      const rec = await db.get('expense_paid_records', k);
      return decryptRecord<ExpensePaidRecord>(rec!);
    }),
  );
  const filtered = expenseId ? all.filter((r) => r.expenseId === expenseId) : all;
  return filtered.sort((a, b) => b.date - a.date);
}

export async function deleteExpensePaidRecord(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('expense_paid_records', id);
}

export function createExpensePaidRecord(
  expenseId: string,
  amount: number,
  date?: number,
  cardId?: string,
): ExpensePaidRecord {
  const now = Date.now();
  const record: ExpensePaidRecord = { id: crypto.randomUUID(), expenseId, amount, date: date ?? now, createdAt: now };
  if (cardId) record.cardId = cardId;
  return record;
}

// ── Credit Card Payments category (auto-created for payment expenses) ─────────

let _creditCardCategoryId: string | null = null;

export async function ensureCreditCardCategory(): Promise<string> {
  if (_creditCardCategoryId) return _creditCardCategoryId;
  const categories = await getCategories();
  const existing = categories.find((c) => c.name === 'Credit Card Payments' && c.parentId === null);
  if (existing) {
    _creditCardCategoryId = existing.id;
    return existing.id;
  }
  const cat: ExpenseCategory = { id: uuid(), name: 'Credit Card Payments', color: '#3b82f6', parentId: null, createdAt: Date.now() };
  await saveCategory(cat);
  _creditCardCategoryId = cat.id;
  return cat.id;
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

export async function saveScenario(scenario: Scenario): Promise<void> {
  const db = await getDB();
  await db.put('scenarios', await encryptRecord(scenario), scenario.id);
}

export async function getScenarios(): Promise<Scenario[]> {
  const db = await getDB();
  const keys = await db.getAllKeys('scenarios');
  const results: Scenario[] = [];
  for (const k of keys) {
    const rec = await db.get('scenarios', k);
    if (rec) results.push(await decryptRecord<Scenario>(rec));
  }
  return results.sort((a, b) => a.createdAt - b.createdAt);
}

export async function deleteScenario(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('scenarios', id);
}

export function createScenario(name: string, description: string, color: string): Scenario {
  const now = Date.now();
  return {
    id: uuid(),
    name,
    description,
    color,
    active: false,
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ── Bank Accounts ─────────────────────────────────────────────────────────────

export async function saveBankAccount(account: BankAccount): Promise<void> {
  const db = await getDB();
  await db.put('bank_accounts', await encryptRecord(account), account.id);
}

export async function getBankAccounts(): Promise<BankAccount[]> {
  const db = await getDB();
  const keys = await db.getAllKeys('bank_accounts');
  const accounts = await Promise.all(
    keys.map(async (k) => {
      const rec = await db.get('bank_accounts', k);
      return decryptRecord<BankAccount>(rec!);
    }),
  );
  return accounts.sort((a, b) => a.createdAt - b.createdAt);
}

export async function deleteBankAccount(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('bank_accounts', id);
}

export function createBankAccount(
  name: string,
  accountType: BankAccountType,
  ownership: BankAccountOwnership,
): BankAccount {
  const now = Date.now();
  return { id: uuid(), name, accountType, ownership, createdAt: now, updatedAt: now };
}

// ── Account Transfers ─────────────────────────────────────────────────────────

export async function saveAccountTransfer(transfer: AccountTransfer): Promise<void> {
  const db = await getDB();
  await db.put('account_transfers', await encryptRecord(transfer), transfer.id);
}

export async function getAccountTransfers(): Promise<AccountTransfer[]> {
  const db = await getDB();
  const keys = await db.getAllKeys('account_transfers');
  const all = await Promise.all(
    keys.map(async (k) => {
      const rec = await db.get('account_transfers', k);
      return decryptRecord<AccountTransfer>(rec!);
    }),
  );
  return all.sort((a, b) => b.date - a.date);
}

export async function deleteAccountTransfer(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('account_transfers', id);
}

export function createAccountTransfer(
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  date: number,
  note?: string,
): AccountTransfer {
  const now = Date.now();
  const transfer: AccountTransfer = { id: uuid(), fromAccountId, toAccountId, amount, date, createdAt: now };
  if (note) transfer.note = note;
  return transfer;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export async function saveSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put('settings', await encryptRecord(value), key);
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const db = await getDB();
  const rec = await db.get('settings', key);
  if (!rec) return null;
  return decryptRecord<T>(rec);
}

export async function getAllSettings(): Promise<Array<{ key: string; value: unknown }>> {
  const db = await getDB();
  const keys = await db.getAllKeys('settings');
  return Promise.all(
    keys.map(async (k) => {
      const rec = await db.get('settings', k);
      const value = await decryptRecord<unknown>(rec!);
      return { key: k, value };
    }),
  );
}

export async function deleteSetting(key: string): Promise<void> {
  const db = await getDB();
  await db.delete('settings', key);
}

export async function getTheme(): Promise<ThemeSettings> {
  return (
    (await getSetting<ThemeSettings>('theme')) ?? {
      colorScheme: 'auto',
      accentColor: '#C9A84C',
    }
  );
}

// ── Calendar Marks ────────────────────────────────────────────────────────────

export async function saveCalendarMark(mark: CalendarMark): Promise<void> {
  const db = await getDB();
  await db.put('calendar_marks', await encryptRecord(mark), mark.date);
}

export async function getAllCalendarMarks(): Promise<CalendarMark[]> {
  const db = await getDB();
  const keys = await db.getAllKeys('calendar_marks');
  return Promise.all(
    keys.map(async (k) => {
      const rec = await db.get('calendar_marks', k);
      return decryptRecord<CalendarMark>(rec!);
    }),
  );
}

export async function getCalendarMarksForMonth(year: number, month: number): Promise<CalendarMark[]> {
  const db = await getDB();
  const m = String(month + 1).padStart(2, '0');
  const range = IDBKeyRange.bound(`${year}-${m}-01`, `${year}-${m}-31`);
  const keys = await db.getAllKeys('calendar_marks', range);
  return Promise.all(
    keys.map(async (k) => {
      const rec = await db.get('calendar_marks', k);
      return decryptRecord<CalendarMark>(rec!);
    }),
  );
}

export async function deleteCalendarMark(date: string): Promise<void> {
  const db = await getDB();
  await db.delete('calendar_marks', date);
}

export async function deleteCalendarMarksForMonth(year: number, month: number): Promise<void> {
  const db = await getDB();
  const m = String(month + 1).padStart(2, '0');
  const range = IDBKeyRange.bound(`${year}-${m}-01`, `${year}-${m}-31`);
  const keys = await db.getAllKeys('calendar_marks', range);
  await Promise.all(keys.map((k) => db.delete('calendar_marks', k)));
}

// ── Calendar Memos ────────────────────────────────────────────────────────────

export function createCalendarMemo(date: string, text: string, memberId?: string): CalendarMemo {
  return { id: uuid(), date, text, ...(memberId ? { memberId } : {}), createdAt: Date.now() };
}

export async function saveCalendarMemo(memo: CalendarMemo): Promise<void> {
  const db = await getDB();
  await db.put('calendar_memos', await encryptRecord(memo), memo.id);
}

export async function getAllCalendarMemos(): Promise<CalendarMemo[]> {
  const db = await getDB();
  const keys = await db.getAllKeys('calendar_memos');
  const all = await Promise.all(
    keys.map(async (k) => {
      const rec = await db.get('calendar_memos', k);
      return decryptRecord<CalendarMemo>(rec!);
    }),
  );
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getCalendarMemosForMonth(year: number, month: number): Promise<CalendarMemo[]> {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
  const all = await getAllCalendarMemos();
  return all.filter((m) => m.date.startsWith(prefix));
}

export async function deleteCalendarMemo(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('calendar_memos', id);
}

// ── Custom Notifications ──────────────────────────────────────────────────────

export async function saveCustomNotification(notif: CustomNotification): Promise<void> {
  const db = await getDB();
  await db.put('notifications', await encryptRecord(notif), notif.id);
}

export async function getCustomNotifications(): Promise<CustomNotification[]> {
  const db = await getDB();
  const keys = await db.getAllKeys('notifications');
  const results: CustomNotification[] = [];
  for (const k of keys) {
    const rec = await db.get('notifications', k);
    if (rec) results.push(await decryptRecord<CustomNotification>(rec));
  }
  return results.sort((a, b) => a.createdAt - b.createdAt);
}

export async function deleteCustomNotification(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('notifications', id);
}

export function createCustomNotification(label: string, triggerType: NotificationTriggerType): CustomNotification {
  const now = Date.now();
  return { id: crypto.randomUUID(), label, triggerType, active: true, createdAt: now, updatedAt: now };
}

// ── Bank Transactions ─────────────────────────────────────────────────────────

export async function saveBankTransaction(tx: BankTransaction): Promise<void> {
  const db = await getDB();
  await db.put('bank_transactions', await encryptRecord(tx), tx.id);
}

export async function getBankTransactions(bankAccountId?: string): Promise<BankTransaction[]> {
  const db = await getDB();
  const keys = await db.getAllKeys('bank_transactions');
  const all = await Promise.all(
    keys.map(async (k) => {
      const rec = await db.get('bank_transactions', k);
      return decryptRecord<BankTransaction>(rec!);
    }),
  );
  const filtered = bankAccountId ? all.filter((t) => t.bankAccountId === bankAccountId) : all;
  return filtered.sort((a, b) => b.date - a.date || b.createdAt - a.createdAt);
}

export async function deleteBankTransaction(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('bank_transactions', id);
}

export async function deleteBankTransactionsByAccount(bankAccountId: string): Promise<void> {
  const all = await getBankTransactions(bankAccountId);
  const db = await getDB();
  await Promise.all(all.map((t) => db.delete('bank_transactions', t.id)));
}

// ── Import Records ────────────────────────────────────────────────────────────

export async function saveImportRecord(record: ImportRecord): Promise<void> {
  const db = await getDB();
  await db.put('import_records', await encryptRecord(record), record.id);
}

export async function getImportRecords(): Promise<ImportRecord[]> {
  const db = await getDB();
  const keys = await db.getAllKeys('import_records');
  const all = await Promise.all(
    keys.map(async (k) => {
      const rec = await db.get('import_records', k);
      return decryptRecord<ImportRecord>(rec!);
    }),
  );
  return all.sort((a, b) => b.importedAt - a.importedAt);
}

export async function deleteImportRecord(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('import_records', id);
}

// ── Transaction Rules ─────────────────────────────────────────────────────────

export async function saveTransactionRule(rule: TransactionRule): Promise<void> {
  const db = await getDB();
  await db.put('transaction_rules', await encryptRecord(rule), rule.id);
}

export async function getTransactionRules(): Promise<TransactionRule[]> {
  const db = await getDB();
  const keys = await db.getAllKeys('transaction_rules');
  const all = await Promise.all(
    keys.map(async (k) => {
      const rec = await db.get('transaction_rules', k);
      return decryptRecord<TransactionRule>(rec!);
    }),
  );
  return all.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

export async function deleteTransactionRule(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('transaction_rules', id);
}

export async function clearAllTransactionRules(): Promise<void> {
  const db = await getDB();
  await db.clear('transaction_rules');
}

// ── Snapshots ─────────────────────────────────────────────────────────────────

export async function saveSnapshot(snapshot: RawSnapshot): Promise<void> {
  const db = await getDB();
  await db.put('snapshots', snapshot, snapshot.id);
}

export async function getSnapshots(): Promise<RawSnapshot[]> {
  const db = await getDB();
  const all = await db.getAll('snapshots');
  return all.sort((a, b) => b.takenAt - a.takenAt);
}

export async function deleteSnapshot(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('snapshots', id);
}
