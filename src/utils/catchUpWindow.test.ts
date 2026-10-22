import { describe, it, expect } from 'vitest';
import { resolveCatchUpWindowStart } from './catchUpWindow';

const NOW = new Date(2026, 8, 19, 14, 30).getTime(); // 2026-09-19 14:30 local

describe('resolveCatchUpWindowStart', () => {
  it('returns null when there is no prior lastOpenedAt (fresh install)', () => {
    expect(resolveCatchUpWindowStart(null, NOW, 90)).toBeNull();
  });

  it('still covers today when reopened later the same calendar day (not null)', () => {
    const todayStart = new Date(NOW);
    todayStart.setHours(0, 0, 0, 0);

    // Same instant, a moment later, and a few hours earlier the same day —
    // all 0 calendar days apart — should all resolve to today's midnight,
    // not null. A same-day reopen still has "today" worth of catch-up to do.
    expect(resolveCatchUpWindowStart(NOW, NOW, 90)!.getTime()).toBe(todayStart.getTime());
    expect(resolveCatchUpWindowStart(NOW + 1000, NOW, 90)!.getTime()).toBe(todayStart.getTime());
    expect(resolveCatchUpWindowStart(NOW - 3 * 60 * 60 * 1000, NOW, 90)!.getTime()).toBe(todayStart.getTime());
  });

  it('counts the gap in whole calendar days, not fractional elapsed time', () => {
    // Closed late yesterday (11pm) and reopened early this morning (1am) —
    // under 24 hours of raw elapsed time, but 1 full calendar day apart.
    // The window must still cover all of yesterday, not stop partway through
    // it — otherwise something due yesterday morning would be silently missed.
    const todayStart = new Date(NOW);
    todayStart.setHours(0, 0, 0, 0);
    const yesterday11pm = new Date(todayStart.getTime() - 1 * 60 * 60 * 1000);
    const today1am = new Date(todayStart.getTime() + 1 * 60 * 60 * 1000);

    const result = resolveCatchUpWindowStart(yesterday11pm.getTime(), today1am.getTime(), 90);
    const expectedYesterdayStart = new Date(todayStart.getTime() - 86_400_000);
    expect(result!.getTime()).toBe(expectedYesterdayStart.getTime());
  });

  it('resolves to today-minus-N-days for a gap within the max window', () => {
    const prev = NOW - 5 * 86_400_000;
    const result = resolveCatchUpWindowStart(prev, NOW, 90);
    expect(result).not.toBeNull();
    const expected = new Date(NOW);
    expected.setHours(0, 0, 0, 0);
    expect(result!.getTime()).toBe(expected.getTime() - 5 * 86_400_000);
  });

  it('caps the lookback at maxWindowDays for a gap longer than the max', () => {
    const prev = NOW - 365 * 86_400_000; // a year ago
    const result = resolveCatchUpWindowStart(prev, NOW, 90);
    expect(result).not.toBeNull();
    const expected = new Date(NOW);
    expected.setHours(0, 0, 0, 0);
    expect(result!.getTime()).toBe(expected.getTime() - 90 * 86_400_000);
  });

  it('returns null when maxWindowDays is 0 (catch-up disabled)', () => {
    const prev = NOW - 5 * 86_400_000;
    expect(resolveCatchUpWindowStart(prev, NOW, 0)).toBeNull();
  });
});
