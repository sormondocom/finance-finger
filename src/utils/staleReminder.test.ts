import { describe, it, expect } from 'vitest';
import { checkStaleReminder } from './staleReminder';

const NOW = new Date(2026, 8, 19).getTime(); // 2026-09-19

describe('checkStaleReminder', () => {
  it('does not nudge when there is no lastOpenedAt yet (fresh install)', () => {
    expect(checkStaleReminder(NOW, undefined, 7, undefined)).toEqual({ shouldNudge: false, daysSince: 0 });
  });

  it('does not nudge when staleReminderDays is 0 or negative (disabled)', () => {
    const lastOpenedAt = NOW - 30 * 86_400_000;
    expect(checkStaleReminder(NOW, lastOpenedAt, 0, undefined).shouldNudge).toBe(false);
    expect(checkStaleReminder(NOW, lastOpenedAt, -5, undefined).shouldNudge).toBe(false);
  });

  it('does not nudge when the gap is under the threshold', () => {
    const lastOpenedAt = NOW - 3 * 86_400_000;
    expect(checkStaleReminder(NOW, lastOpenedAt, 7, undefined).shouldNudge).toBe(false);
  });

  it('nudges once the gap reaches the threshold', () => {
    const lastOpenedAt = NOW - 7 * 86_400_000;
    const result = checkStaleReminder(NOW, lastOpenedAt, 7, undefined);
    expect(result.shouldNudge).toBe(true);
    expect(result.daysSince).toBe(7);
  });

  it('does not re-nudge within the same staleness episode', () => {
    const lastOpenedAt = NOW - 8 * 86_400_000;
    const lastStaleNudgeAt = NOW - 2 * 86_400_000; // nudged 2 days ago, after lastOpenedAt
    expect(checkStaleReminder(NOW, lastOpenedAt, 7, lastStaleNudgeAt).shouldNudge).toBe(false);
  });

  it('re-nudges after another full staleReminderDays has passed since the last nudge', () => {
    const lastOpenedAt = NOW - 20 * 86_400_000;
    const lastStaleNudgeAt = NOW - 7 * 86_400_000; // exactly staleReminderDays ago
    expect(checkStaleReminder(NOW, lastOpenedAt, 7, lastStaleNudgeAt).shouldNudge).toBe(true);
  });

  it('ignores a stale lastStaleNudgeAt from before the current episode (user reopened since)', () => {
    // lastStaleNudgeAt predates lastOpenedAt — it's from a PRIOR episode that
    // ended when the user reopened; this episode hasn't been nudged yet.
    const lastStaleNudgeAt = NOW - 100 * 86_400_000;
    const lastOpenedAt = NOW - 10 * 86_400_000;
    const result = checkStaleReminder(NOW, lastOpenedAt, 7, lastStaleNudgeAt);
    expect(result.shouldNudge).toBe(true);
  });
});
