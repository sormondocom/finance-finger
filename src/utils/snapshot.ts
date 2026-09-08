import { getDB } from '@/db/schema';
import { saveSnapshot, getSnapshots, deleteSnapshot } from '@/db';
import type { RawSnapshot, RawSnapshotEntry } from '@/types';

const SNAPSHOT_STORES = [
  'notifications',
  'members',
  'income_sources',
  'expense_categories',
  'expenses',
  'credit_cards',
  'debt_payments',
  'card_charges',
  'scenarios',
  'settings',
  'expense_paid_records',
  'bank_accounts',
  'calendar_marks',
  'calendar_memos',
  'account_transfers',
  'bank_transactions',
  'import_records',
] as const;

const KEEP_HOURS = 24;
const MIN_KEEP = 5;

export async function takeSnapshot(
  label: string,
  snapshotType: RawSnapshot['snapshotType'] = 'manual',
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await getDB()) as any;
  const stores: Record<string, RawSnapshotEntry[]> = {};

  for (const storeName of SNAPSHOT_STORES) {
    const keys: string[] = await db.getAllKeys(storeName);
    const entries: RawSnapshotEntry[] = [];
    for (const key of keys) {
      const rec = await db.get(storeName, key);
      if (rec) entries.push({ key: String(key), rec });
    }
    stores[storeName] = entries;
  }

  const snapshot: RawSnapshot = {
    id: crypto.randomUUID(),
    takenAt: Date.now(),
    label,
    snapshotType,
    stores,
  };

  await saveSnapshot(snapshot);
  await pruneSnapshots();
}

export async function restoreSnapshot(snapshot: RawSnapshot): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await getDB()) as any;

  for (const storeName of SNAPSHOT_STORES) {
    const entries = snapshot.stores[storeName] ?? [];
    await db.clear(storeName);
    await Promise.all(entries.map(({ key, rec }: RawSnapshotEntry) => db.put(storeName, rec, key)));
  }
}

export async function pruneSnapshots(): Promise<void> {
  const all = await getSnapshots();
  const cutoff = Date.now() - KEEP_HOURS * 60 * 60 * 1000;
  // Import snapshots are user-pinned — they survive pruning entirely.
  // Only prune regular (manual/auto) snapshots.
  const regular = all.filter((s) => s.snapshotType !== 'import');
  const toDelete = regular.slice(MIN_KEEP).filter((s) => s.takenAt < cutoff);
  await Promise.all(toDelete.map((s) => deleteSnapshot(s.id)));
}
