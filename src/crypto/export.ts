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
  saveMember,
  saveIncomeSource,
  saveCategory,
  saveExpense,
  saveDebtAccount,
  saveScenario,
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
} from '@/db';
import { encryptToPublicKey, decryptWithPrivateKey } from './pgp';
import type { HouseholdMember, IncomeSource, ExpenseCategory, Expense, DebtAccount, Scenario } from '@/types';

export const EXPORT_VERSION = 1 as const;

export interface ExportBundle {
  version: typeof EXPORT_VERSION;
  exportedAt: number;
  exporterName: string;
  members: HouseholdMember[];
  incomeSources: IncomeSource[];
  expenseCategories: ExpenseCategory[];
  expenses: Expense[];
  debtAccounts: DebtAccount[];
  scenarios: Scenario[];
}

export interface ImportResult {
  members: number;
  incomeSources: number;
  expenseCategories: number;
  expenses: number;
  debtAccounts: number;
  scenarios: number;
}

export async function buildExportBundle(exporterName: string): Promise<ExportBundle> {
  const [members, incomeSources, expenseCategories, expenses, debtAccounts, scenarios] = await Promise.all([
    getMembers(),
    getIncomeSources(),
    getCategories(),
    getExpenses(),
    getDebtAccounts(),
    getScenarios(),
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
    scenarios,
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
  if (bundle.version !== EXPORT_VERSION) {
    throw new Error(`Unsupported export version: ${bundle.version}`);
  }
  return bundle;
}

export async function applyImport(bundle: ExportBundle, mode: 'merge' | 'replace'): Promise<ImportResult> {
  if (mode === 'replace') {
    const [
      existingMembers, existingSources, existingCats, existingExpenses,
      existingAccounts, existingScenarios, existingPayments, existingCharges,
      existingPaidRecords, existingBankAccounts,
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
    ]);
  }

  await Promise.all([
    ...bundle.members.map(saveMember),
    ...bundle.incomeSources.map(saveIncomeSource),
    ...bundle.expenseCategories.map(saveCategory),
    ...bundle.expenses.map(saveExpense),
    ...bundle.debtAccounts.map(saveDebtAccount),
    ...bundle.scenarios.map(saveScenario),
  ]);

  return {
    members: bundle.members.length,
    incomeSources: bundle.incomeSources.length,
    expenseCategories: bundle.expenseCategories.length,
    expenses: bundle.expenses.length,
    debtAccounts: bundle.debtAccounts.length,
    scenarios: bundle.scenarios.length,
  };
}
