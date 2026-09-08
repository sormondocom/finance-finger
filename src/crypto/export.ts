import {
  getMembers,
  getIncomeSources,
  getCategories,
  getExpenses,
  getDebtAccounts,
  getScenarios,
  getDebtPayments,
  getCardCharges,
  getExpensePaidRecords,
  getBankAccounts,
  getAccountTransfers,
  getAllCalendarMarks,
  getAllCalendarMemos,
  getCustomNotifications,
  getAllSettings,
  saveMember,
  saveIncomeSource,
  saveCategory,
  saveExpense,
  saveDebtAccount,
  saveScenario,
  saveDebtPayment,
  saveCardCharge,
  saveExpensePaidRecord,
  saveBankAccount,
  saveAccountTransfer,
  saveCalendarMark,
  saveCalendarMemo,
  saveCustomNotification,
  saveSetting,
  deleteMember,
  deleteIncomeSource,
  deleteCategory,
  deleteExpense,
  deleteDebtAccount,
  deleteScenario,
  deleteDebtPayment,
  deleteCardCharge,
  deleteExpensePaidRecord,
  deleteBankAccount,
  deleteAccountTransfer,
  deleteCalendarMark,
  deleteCalendarMemo,
  deleteCustomNotification,
  deleteSetting,
} from '@/db';
import { encryptToPublicKey, decryptWithPrivateKey } from './pgp';
import type {
  HouseholdMember,
  IncomeSource,
  ExpenseCategory,
  Expense,
  DebtAccount,
  Scenario,
  DebtPayment,
  CardCharge,
  ExpensePaidRecord,
  BankAccount,
  AccountTransfer,
  CalendarMark,
  CalendarMemo,
  CustomNotification,
} from '@/types';

export const EXPORT_VERSION = 4 as const;

export interface ExportBundle {
  version: number;
  exportedAt: number;
  exporterName: string;
  members: HouseholdMember[];
  incomeSources: IncomeSource[];
  expenseCategories: ExpenseCategory[];
  expenses: Expense[];
  debtAccounts: DebtAccount[];
  debtPayments?: DebtPayment[];
  cardCharges?: CardCharge[];
  expensePaidRecords?: ExpensePaidRecord[];
  bankAccounts?: BankAccount[];
  accountTransfers?: AccountTransfer[];
  scenarios: Scenario[];
  calendarMarks?: CalendarMark[];
  calendarMemos?: CalendarMemo[];
  notifications?: CustomNotification[];
  settings?: Array<{ key: string; value: unknown }>;
}

export interface ImportResult {
  members: number;
  incomeSources: number;
  expenseCategories: number;
  expenses: number;
  debtAccounts: number;
  debtPayments: number;
  cardCharges: number;
  expensePaidRecords: number;
  bankAccounts: number;
  accountTransfers: number;
  scenarios: number;
  calendarMarks: number;
  calendarMemos: number;
  notifications: number;
  settings: number;
}

export async function buildExportBundle(exporterName: string): Promise<ExportBundle> {
  const [
    members,
    incomeSources,
    expenseCategories,
    expenses,
    debtAccounts,
    debtPayments,
    cardCharges,
    expensePaidRecords,
    bankAccounts,
    accountTransfers,
    scenarios,
    calendarMarks,
    calendarMemos,
    notifications,
    settings,
  ] = await Promise.all([
    getMembers(),
    getIncomeSources(),
    getCategories(),
    getExpenses(),
    getDebtAccounts(),
    getDebtPayments(),
    getCardCharges(),
    getExpensePaidRecords(),
    getBankAccounts(),
    getAccountTransfers(),
    getScenarios(),
    getAllCalendarMarks(),
    getAllCalendarMemos(),
    getCustomNotifications(),
    getAllSettings(),
  ]);
  return {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    exporterName,
    members,
    incomeSources,
    expenseCategories,
    expenses,
    debtAccounts,
    debtPayments,
    cardCharges,
    expensePaidRecords,
    bankAccounts,
    accountTransfers,
    scenarios,
    calendarMarks,
    calendarMemos,
    notifications,
    settings,
  };
}

export async function encryptExport(bundle: ExportBundle, recipientPublicKey: string): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(bundle));
  return encryptToPublicKey(bytes, recipientPublicKey);
}

export async function decryptImport(
  armoredMessage: string,
  privateKeyArmored: string,
  passphrase: string,
): Promise<ExportBundle> {
  const bytes = await decryptWithPrivateKey(armoredMessage, privateKeyArmored, passphrase);
  const bundle = JSON.parse(new TextDecoder().decode(bytes)) as ExportBundle;
  if (bundle.version < 1 || bundle.version > EXPORT_VERSION) {
    throw new Error(`Unsupported export version: ${bundle.version}`);
  }
  return bundle;
}

export async function applyImport(bundle: ExportBundle, mode: 'merge' | 'replace'): Promise<ImportResult> {
  if (mode === 'replace') {
    const [
      existingMembers, existingSources, existingCats, existingExpenses,
      existingAccounts, existingScenarios, existingPayments, existingCharges,
      existingPaidRecords, existingBankAccounts, existingTransfers, existingMarks,
      existingMemos, existingNotifs, existingSettings,
    ] = await Promise.all([
      getMembers(),
      getIncomeSources(),
      getCategories(),
      getExpenses(),
      getDebtAccounts(),
      getScenarios(),
      getDebtPayments(),
      getCardCharges(),
      getExpensePaidRecords(),
      getBankAccounts(),
      getAccountTransfers(),
      getAllCalendarMarks(),
      getAllCalendarMemos(),
      getCustomNotifications(),
      getAllSettings(),
    ]);
    await Promise.all([
      ...existingMembers.map((m) => deleteMember(m.id)),
      ...existingSources.map((s) => deleteIncomeSource(s.id)),
      ...existingCats.map((c) => deleteCategory(c.id)),
      ...existingExpenses.map((e) => deleteExpense(e.id)),
      ...existingAccounts.map((a) => deleteDebtAccount(a.id)),
      ...existingScenarios.map((s) => deleteScenario(s.id)),
      ...existingPayments.map((p) => deleteDebtPayment(p.id)),
      ...existingCharges.map((c) => deleteCardCharge(c.id)),
      ...existingPaidRecords.map((r) => deleteExpensePaidRecord(r.id)),
      ...existingBankAccounts.map((a) => deleteBankAccount(a.id)),
      ...existingTransfers.map((t) => deleteAccountTransfer(t.id)),
      ...existingMarks.map((m) => deleteCalendarMark(m.date)),
      ...existingMemos.map((m) => deleteCalendarMemo(m.id)),
      ...existingNotifs.map((n) => deleteCustomNotification(n.id)),
      ...existingSettings.map((s) => deleteSetting(s.key)),
    ]);
  }

  await Promise.all([
    ...bundle.members.map(saveMember),
    ...bundle.incomeSources.map(saveIncomeSource),
    ...bundle.expenseCategories.map(saveCategory),
    ...bundle.expenses.map(saveExpense),
    ...bundle.debtAccounts.map(saveDebtAccount),
    ...(bundle.debtPayments ?? []).map(saveDebtPayment),
    ...(bundle.cardCharges ?? []).map(saveCardCharge),
    ...(bundle.expensePaidRecords ?? []).map(saveExpensePaidRecord),
    ...(bundle.bankAccounts ?? []).map(saveBankAccount),
    ...(bundle.accountTransfers ?? []).map(saveAccountTransfer),
    ...bundle.scenarios.map(saveScenario),
    ...(bundle.calendarMarks ?? []).map(saveCalendarMark),
    ...(bundle.calendarMemos ?? []).map(saveCalendarMemo),
    ...(bundle.notifications ?? []).map(saveCustomNotification),
    ...(bundle.settings ?? []).map((s) => saveSetting(s.key, s.value)),
  ]);

  return {
    members: bundle.members.length,
    incomeSources: bundle.incomeSources.length,
    expenseCategories: bundle.expenseCategories.length,
    expenses: bundle.expenses.length,
    debtAccounts: bundle.debtAccounts.length,
    debtPayments: (bundle.debtPayments ?? []).length,
    cardCharges: (bundle.cardCharges ?? []).length,
    expensePaidRecords: (bundle.expensePaidRecords ?? []).length,
    bankAccounts: (bundle.bankAccounts ?? []).length,
    accountTransfers: (bundle.accountTransfers ?? []).length,
    scenarios: bundle.scenarios.length,
    calendarMarks: (bundle.calendarMarks ?? []).length,
    calendarMemos: (bundle.calendarMemos ?? []).length,
    notifications: (bundle.notifications ?? []).length,
    settings: (bundle.settings ?? []).length,
  };
}
