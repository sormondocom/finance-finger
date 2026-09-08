import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { importSnapshotLabel } from './importManager';

// importSnapshotLabel is pure-ish (uses Date) — we can spy on Date to make it deterministic.

describe('importSnapshotLabel', () => {
  beforeEach(() => {
    // Fix clock to 2026-09-06 15:00:00 local time
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 6, 15, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('includes the target name', () => {
    const label = importSnapshotLabel('Chase Checking');
    expect(label).toContain('Chase Checking');
  });

  it('starts with "Import -"', () => {
    const label = importSnapshotLabel('Chase Checking');
    expect(label.startsWith('Import -')).toBe(true);
  });

  it('includes the year', () => {
    const label = importSnapshotLabel('My Card');
    expect(label).toContain('2026');
  });

  it('produces a different label for a different account name', () => {
    const a = importSnapshotLabel('Account A');
    const b = importSnapshotLabel('Account B');
    expect(a).not.toBe(b);
  });
});
