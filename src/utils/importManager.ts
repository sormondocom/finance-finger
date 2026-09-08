import { computeChecksum } from './csvParser';
import { getImportRecords, saveImportRecord } from '@/db';
import type { ImportRecord } from '@/types';

/** Returns the prior ImportRecord whose checksum matches, or null. */
export async function findDuplicateImport(rawText: string): Promise<ImportRecord | null> {
  const checksum = await computeChecksum(rawText);
  const records = await getImportRecords();
  return records.find((r) => r.checksum === checksum) ?? null;
}

/** Records a completed import for dedup tracking. */
export async function recordImport(
  opts: Omit<ImportRecord, 'id' | 'checksum'> & { rawText: string },
): Promise<ImportRecord> {
  const { rawText, ...rest } = opts;
  const checksum = await computeChecksum(rawText);
  const record: ImportRecord = {
    id: crypto.randomUUID(),
    checksum,
    ...rest,
  };
  await saveImportRecord(record);
  return record;
}

/** Formats a snapshot label for an import. */
export function importSnapshotLabel(targetName: string): string {
  const now = new Date();
  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `Import - ${targetName} - ${date} ${time}`;
}
