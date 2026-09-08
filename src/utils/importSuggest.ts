/**
 * Pure keyword-inference helpers for the import wizard's auto-suggest step.
 * Exported separately so they can be unit-tested without a DOM environment.
 */

export const INCOME_KW   = /\b(payroll|salary|direct\s+dep(?:osit)?|dividend|interest\s+earned|tax\s+refund|ach\s+credit|stipend|reimbursement)\b/i;
export const TRANSFER_KW = /\b(transfer|xfer|zelle|venmo|cash\s*app|wire\s+transfer|peer\s+pay)\b/i;
export const DEBT_PMT_KW = /\b(web\s+py?mt|autopay|auto[-\s]pay|cc\s+pay(?:ment)?|credit\s+card\s+pay(?:ment)?|e[-\s]?pay|bill\s+pay|online\s+payment)\b/i;

/**
 * Infers an action type from a transaction description and amount sign.
 * Only applies to bank accounts (isCard=true always returns null).
 * Returns null when no confident inference can be made.
 */
export function inferActionType(
  description: string,
  amount: number,
  isCard: boolean,
): 'income' | 'transfer' | 'debt-payment' | null {
  if (isCard) return null;
  const desc = description.toLowerCase().trim();
  const isDebit = amount < 0;
  if (!isDebit && INCOME_KW.test(desc))  return 'income';
  if (TRANSFER_KW.test(desc))            return 'transfer';
  if (isDebit && DEBT_PMT_KW.test(desc)) return 'debt-payment';
  return null;
}
