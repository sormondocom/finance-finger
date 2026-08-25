import { getDB } from './schema';
import { encryptRecord, decryptRecord } from '@/crypto/vault';
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

export function createExpensePaidRecord(expenseId: string, amount: number): ExpensePaidRecord {
  const now = Date.now();
  return { id: crypto.randomUUID(), expenseId, amount, date: now, createdAt: now };
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

export async function getTheme(): Promise<ThemeSettings> {
  return (
    (await getSetting<ThemeSettings>('theme')) ?? {
      colorScheme: 'auto',
      accentColor: '#C9A84C',
    }
  );
}
