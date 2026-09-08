import type { ReviewAction, TransactionRuleAction } from '@/types';

/**
 * Normalizes a transaction description into a short, stable pattern key
 * used to match repeat vendors across imports.
 *
 * Strategy: lowercase, split on non-alphanumeric runs, take the first two
 * meaningful words (≥2 chars), join them, cap at 24 chars.
 */
export function normalizePattern(description: string): string {
  const lower = description.toLowerCase().trim();
  const words = lower.split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
  return words.slice(0, 2).join(' ').slice(0, 24) || lower.slice(0, 24);
}

/**
 * Converts a ReviewAction (which may include a note or be 'skip') to a
 * TransactionRuleAction for storage. Returns null for 'skip'.
 */
export function toRuleAction(action: ReviewAction): TransactionRuleAction | null {
  switch (action.type) {
    case 'expense':       return { type: 'expense', expenseId: action.expenseId };
    case 'debt-payment':  return { type: 'debt-payment', debtAccountId: action.debtAccountId };
    case 'transfer':      return { type: 'transfer', toAccountId: action.toAccountId };
    case 'income':        return { type: 'income' };
    case 'category':      return { type: 'category', ...(action.categoryId ? { categoryId: action.categoryId } : {}) };
    default:              return null;
  }
}
