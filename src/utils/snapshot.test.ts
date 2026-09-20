import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pruneSnapshots } from './snapshot';
import type { RawSnapshot } from '@/types';

vi.mock('@/db', () => ({
  saveSnapshot: vi.fn(),
  getSnapshots: vi.fn(),
  deleteSnapshot: vi.fn(),
}));

vi.mock('@/db/schema', () => ({
  getDB: vi.fn(),
}));

import { getSnapshots, deleteSnapshot } from '@/db';

// ── Helpers ───────────────────────────────────────────────────────────────────

let idCounter = 0;
function makeSnapshot(overrides: Partial<RawSnapshot> = {}): RawSnapshot {
  const id = `snap-${++idCounter}`;
  return {
    id,
    takenAt: Date.now(),
    label: 'Test snapshot',
    snapshotType: 'manual',
    stores: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  idCounter = 0;
  (deleteSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

// ── pruneSnapshots ────────────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date(2026, 8, 19, 12, 0, 0).getTime();

describe('pruneSnapshots', () => {
  beforeEach(() => {
    vi.setSystemTime(NOW);
  });

  it('does not delete anything when there are fewer than MIN_KEEP snapshots', async () => {
    const snaps = Array.from({ length: 4 }, () => makeSnapshot({ takenAt: NOW - 48 * HOUR_MS }));
    (getSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(snaps);

    await pruneSnapshots();
    expect(deleteSnapshot).not.toHaveBeenCalled();
  });

  it('keeps the newest MIN_KEEP snapshots regardless of age', async () => {
    // 5 snapshots all older than 24h — the MIN_KEEP boundary means none should be deleted
    const snaps = Array.from({ length: 5 }, (_, i) =>
      makeSnapshot({ takenAt: NOW - (30 + i) * HOUR_MS }),
    );
    (getSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(snaps);

    await pruneSnapshots();
    expect(deleteSnapshot).not.toHaveBeenCalled();
  });

  it('deletes old regular snapshots beyond MIN_KEEP when older than KEEP_HOURS', async () => {
    // 7 regular snapshots — 5 fresh, 2 stale (>24h)
    const fresh = Array.from({ length: 5 }, () => makeSnapshot({ takenAt: NOW - 1 * HOUR_MS }));
    const stale = Array.from({ length: 2 }, () => makeSnapshot({ takenAt: NOW - 48 * HOUR_MS }));
    // getSnapshots returns newest-first (by takenAt desc)
    (getSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([...fresh, ...stale]);

    await pruneSnapshots();
    expect(deleteSnapshot).toHaveBeenCalledTimes(2);
    expect(deleteSnapshot).toHaveBeenCalledWith(stale[0]!.id);
    expect(deleteSnapshot).toHaveBeenCalledWith(stale[1]!.id);
  });

  it('never deletes import-type snapshots', async () => {
    const importSnap = makeSnapshot({ snapshotType: 'import', takenAt: NOW - 48 * HOUR_MS });
    const regular = Array.from({ length: 6 }, () =>
      makeSnapshot({ takenAt: NOW - 48 * HOUR_MS }),
    );
    // importSnap is excluded from the regular pool; only regular snapshots are pruned
    (getSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue([importSnap, ...regular]);

    await pruneSnapshots();
    // Only the 1 regular snapshot beyond MIN_KEEP and older than KEEP_HOURS gets deleted
    expect(deleteSnapshot).not.toHaveBeenCalledWith(importSnap.id);
  });

  it('does not delete snapshots that are within KEEP_HOURS even if beyond MIN_KEEP', async () => {
    // 6 regular snapshots, all recent (within 24h)
    const snaps = Array.from({ length: 6 }, () => makeSnapshot({ takenAt: NOW - 1 * HOUR_MS }));
    (getSnapshots as ReturnType<typeof vi.fn>).mockResolvedValue(snaps);

    await pruneSnapshots();
    expect(deleteSnapshot).not.toHaveBeenCalled();
  });
});
