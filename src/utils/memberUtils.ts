import { getIncomeSources, getBankAccounts, getExpenses, saveBankAccount, saveExpense, deleteMember } from '@/db';
import { accounting } from '@/accounting';

export async function deleteMemberWithCleanup(memberId: string): Promise<void> {
  const [sources, accounts, expenses] = await Promise.all([
    getIncomeSources(),
    getBankAccounts(),
    getExpenses(),
  ]);
  await Promise.all([
    ...sources.filter((s) => s.memberId === memberId).map((s) => accounting.deleteIncomeSource(s)),
    ...accounts.filter((a) => a.memberId === memberId).map(({ memberId: _, ...a }) => saveBankAccount(a)),
    ...expenses.filter((e) => e.memberId === memberId).map((e) => saveExpense({ ...e, memberId: null })),
  ]);
  await deleteMember(memberId);
}
