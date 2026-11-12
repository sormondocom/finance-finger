import { describe, it, expect } from 'vitest';
import { getLines } from './messages';

describe('getLines', () => {
  it('never picks a variant that renders a literal "0" for a placeholder', () => {
    // Reproduces the reported bug: an extra payment saves real interest but
    // doesn't shave off a full month, so months is "0" — a variant built
    // around "{months} months sooner" would read as nonsensical ("debt-free
    // a whole 0 months sooner") even though the interest savings are real.
    const substitutions = { months: '0', interest: '$357.87', amount: '$50.00', date: 'March 2027' };

    for (const gender of ['buck', 'penny'] as const) {
      for (let i = 0; i < 100; i++) {
        const lines = getLines('debt-free-improvement', gender, substitutions);
        const joined = lines.join(' ');
        expect(joined).not.toContain('0 months');
        expect(joined).not.toContain('{months}');
      }
    }
  });

  it('does pick a months-mentioning variant when months is actually nonzero', () => {
    const substitutions = { months: '4', interest: '$357.87', amount: '$50.00', date: 'March 2027' };
    const seenMonthsMention = new Set<boolean>();

    for (let i = 0; i < 100; i++) {
      const lines = getLines('debt-free-improvement', 'penny', substitutions);
      seenMonthsMention.add(lines.join(' ').includes('4 months'));
    }

    // Over 100 draws from a 2-option pool, both variants should appear.
    expect(seenMonthsMention.has(true)).toBe(true);
    expect(seenMonthsMention.has(false)).toBe(true);
  });

  it('falls back to a greeting-shaped line for an unknown-but-typed trigger with no substitutions', () => {
    const lines = getLines('custom', 'buck', {});
    expect(lines.length).toBeGreaterThan(0);
  });
});
