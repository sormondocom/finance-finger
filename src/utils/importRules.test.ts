import { describe, it, expect } from 'vitest';
import { normalizePattern, toRuleAction } from './importRules';
import type { ReviewAction } from '@/types';

// ── normalizePattern ──────────────────────────────────────────────────────────

describe('normalizePattern', () => {
  it('lowercases a simple two-word description', () => {
    expect(normalizePattern('NETFLIX PREMIUM')).toBe('netflix premium');
  });

  it('replaces dots and asterisks with word boundaries', () => {
    // "NETFLIX.COM*US" → split on [^a-z0-9]+ → ["netflix", "com", "us"] → first 2 = "netflix com"
    expect(normalizePattern('NETFLIX.COM*US')).toBe('netflix com');
  });

  it('keeps embedded numbers (only non-alphanumeric chars split)', () => {
    // "STARBUCKS #1234" → split on [^a-z0-9]+ → ["starbucks", "1234"] → "starbucks 1234"
    expect(normalizePattern('STARBUCKS #1234')).toBe('starbucks 1234');
  });

  it('caps the result at 24 characters', () => {
    // A description that generates a long first word — cap at 24 chars via .slice(0, 24)
    // "abcdefghijklmnopqrstuvwxyz" (26 chars) → single word → slice(0,24) = 24 chars
    const long = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const result = normalizePattern(long);
    expect(result.length).toBeLessThanOrEqual(24);
  });

  it('handles a short single-word description', () => {
    expect(normalizePattern('NETFLIX')).toBe('netflix');
  });

  it('returns an empty string for empty input', () => {
    // lower = "", words = [] after filter, joined = "", fallback lower.slice(0,24) = ""
    expect(normalizePattern('')).toBe('');
  });

  it('filters out words shorter than 2 characters', () => {
    // "A STORE" → lower = "a store" → split → ["a", "store"] → filter ≥2 → ["store"] → "store"
    expect(normalizePattern('A STORE')).toBe('store');
  });

  it('takes only the first two meaningful words', () => {
    // "WHOLE FOODS MARKET" → words = ["whole", "foods", "market"] → first 2 = "whole foods"
    expect(normalizePattern('WHOLE FOODS MARKET')).toBe('whole foods');
  });

  it('trims leading and trailing whitespace before processing', () => {
    expect(normalizePattern('  WALMART  ')).toBe('walmart');
  });

  it('handles descriptions with multiple punctuation separators', () => {
    // "SQ *COFFEE BAR" → split on [^a-z0-9]+ → ["sq", "coffee", "bar"] → first 2 → "sq coffee"
    expect(normalizePattern('SQ *COFFEE BAR')).toBe('sq coffee');
  });

  it('falls back to raw lowercased input when all words are too short', () => {
    // "A B" → lower = "a b", words after filter = [] → joined = "" → fallback = lower.slice(0,24) = "a b"
    expect(normalizePattern('A B')).toBe('a b');
  });
});

// ── toRuleAction ──────────────────────────────────────────────────────────────

describe('toRuleAction', () => {
  it('converts an expense action', () => {
    const action: ReviewAction = { type: 'expense', expenseId: 'exp-1' };
    expect(toRuleAction(action)).toEqual({ type: 'expense', expenseId: 'exp-1' });
  });

  it('converts an expense action and drops the note field', () => {
    const action: ReviewAction = { type: 'expense', expenseId: 'exp-1', note: 'groceries' };
    const result = toRuleAction(action);
    expect(result).toEqual({ type: 'expense', expenseId: 'exp-1' });
    expect(result).not.toHaveProperty('note');
  });

  it('converts a debt-payment action', () => {
    const action: ReviewAction = { type: 'debt-payment', debtAccountId: 'debt-1' };
    expect(toRuleAction(action)).toEqual({ type: 'debt-payment', debtAccountId: 'debt-1' });
  });

  it('converts a debt-payment action and drops the note field', () => {
    const action: ReviewAction = { type: 'debt-payment', debtAccountId: 'debt-1', note: 'card payment' };
    const result = toRuleAction(action);
    expect(result).toEqual({ type: 'debt-payment', debtAccountId: 'debt-1' });
    expect(result).not.toHaveProperty('note');
  });

  it('converts a transfer action', () => {
    const action: ReviewAction = { type: 'transfer', toAccountId: 'acct-2' };
    expect(toRuleAction(action)).toEqual({ type: 'transfer', toAccountId: 'acct-2' });
  });

  it('converts a transfer action and drops the note field', () => {
    const action: ReviewAction = { type: 'transfer', toAccountId: 'acct-2', note: 'savings move' };
    const result = toRuleAction(action);
    expect(result).toEqual({ type: 'transfer', toAccountId: 'acct-2' });
    expect(result).not.toHaveProperty('note');
  });

  it('converts an income action and drops the note field', () => {
    const action: ReviewAction = { type: 'income', note: 'paycheck' };
    const result = toRuleAction(action);
    expect(result).toEqual({ type: 'income' });
    expect(result).not.toHaveProperty('note');
  });

  it('converts an income action without a note', () => {
    const action: ReviewAction = { type: 'income' };
    expect(toRuleAction(action)).toEqual({ type: 'income' });
  });

  it('converts a category action with categoryId', () => {
    const action: ReviewAction = { type: 'category', categoryId: 'cat-1' };
    expect(toRuleAction(action)).toEqual({ type: 'category', categoryId: 'cat-1' });
  });

  it('converts a category action without categoryId (no categoryId key in result)', () => {
    const action: ReviewAction = { type: 'category' };
    const result = toRuleAction(action);
    expect(result).toEqual({ type: 'category' });
    expect(result).not.toHaveProperty('categoryId');
  });

  it('converts a category action and drops the note field', () => {
    const action: ReviewAction = { type: 'category', categoryId: 'cat-1', note: 'misc' };
    const result = toRuleAction(action);
    expect(result).toEqual({ type: 'category', categoryId: 'cat-1' });
    expect(result).not.toHaveProperty('note');
  });

  it('returns null for a skip action', () => {
    const action: ReviewAction = { type: 'skip' };
    expect(toRuleAction(action)).toBeNull();
  });
});
