import browser from 'webextension-polyfill';
import { getIncomeSources, getAllLedgerEntries } from '@/db';
import { getPaydaysInMonth } from '@/utils/paydays';
import { accounting } from '@/accounting';

export interface MissedPayday {
  sourceName: string;
  bankAccountId: string;
  amount: number;
  date: number;        // midnight local time of the scheduled payday
  correlationId: string;
}

export interface PaydayResult {
  recorded: number;
  pendingPrompts: MissedPayday[];
}

export function paydayCorrelationId(sourceId: string, year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `payday-${sourceId}-${year}-${mm}-${dd}`;
}

// Records bank-credit entries for same-day paydays and prompts the user for recent ones.
//
// Windows (relative to now):
//   same day (dayDiff = 0) AND on/after account reset → auto-record silently
//   dayDiff 1–N, OR same day but before reset         → return in pendingPrompts (user decides)
//   dayDiff > N                                       → ignored (stale)
//
// N comes from storage key missedPaydayPromptDays (default 3).
//
// The account reset timestamp only blocks silent auto-recording; paydays within the
// prompt window are always surfaced to the user even if the account was reset after them.
export async function autoRecordPaydays(): Promise<PaydayResult> {
  const now = Date.now();

  const [storageResult, sources, allEntries] = await Promise.all([
    browser.storage.local.get(['missedPaydayPromptDays', 'accountResetTimestamps']),
    getIncomeSources(),
    getAllLedgerEntries(),
  ]);

  const promptWindowDays = (storageResult['missedPaydayPromptDays'] as number | undefined) ?? 3;
  const resetTimestamps  = (storageResult['accountResetTimestamps']  as Record<string, number> | undefined) ?? {};

  const AUTO_RECORD_DAYS = 0; // only auto-record on the same calendar day as payday
  const nowDate      = new Date(now);
  const todayStart   = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  const cutoffDayStart = new Date(
    nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - promptWindowDays,
  ).getTime();

  const activeSources = sources.filter((s) => s.active && s.bankAccountId && s.frequency !== 'once');
  if (activeSources.length === 0) return { recorded: 0, pendingPrompts: [] };

  const recorded = new Set(
    allEntries
      .filter((e) => e.type === 'bank-credit' && e.correlationId?.startsWith('payday-'))
      .map((e) => e.correlationId!),
  );

  // Build the list of months to check — from the cutoff day's month through the current month.
  const monthsToCheck: Array<{ year: number; month: number }> = [];
  {
    const cutoffDate = new Date(cutoffDayStart);
    let y = cutoffDate.getFullYear();
    let m = cutoffDate.getMonth();
    for (;;) {
      monthsToCheck.push({ year: y, month: m });
      if (y === nowDate.getFullYear() && m === nowDate.getMonth()) break;
      m++; if (m > 11) { y++; m = 0; }
    }
  }

  let recordedCount = 0;
  const pendingPrompts: MissedPayday[] = [];

  for (const source of activeSources) {
    if (!source.bankAccountId) continue;
    const bankResetTs = resetTimestamps[source.bankAccountId] ?? 0;
    const bankResetDayStart = bankResetTs > 0
      ? (() => { const d = new Date(bankResetTs); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); })()
      : 0;

    for (const { year, month } of monthsToCheck) {
      const days = getPaydaysInMonth(source, year, month);
      for (let i = 0; i < days.length; i++) {
        const day      = days[i]!;
        const paydayTs = new Date(year, month, day).getTime();

        if (paydayTs > now)            continue;   // future
        if (paydayTs < cutoffDayStart) continue;   // outside the prompt window

        const corrId = paydayCorrelationId(source.id, year, month, day);
        if (recorded.has(corrId)) continue;

        const amount =
          source.frequency === 'semimonthly' && source.amount2 != null && i === 1
            ? source.amount2
            : source.amount;

        const dayDiff = (todayStart - paydayTs) / 86_400_000;

        // Auto-record only for same-day paydays that were not before the account reset.
        // Pre-reset paydays go to pendingPrompts so the user can choose whether to
        // re-record the deposit against the new opening balance.
        if (dayDiff <= AUTO_RECORD_DAYS && paydayTs >= bankResetDayStart) {
          await accounting.recordBankCredit({
            accountId: source.bankAccountId,
            description: source.name,
            amount,
            date: paydayTs,
            correlationId: corrId,
          });
          recorded.add(corrId);
          recordedCount++;
        } else {
          pendingPrompts.push({
            sourceName: source.name,
            bankAccountId: source.bankAccountId,
            amount,
            date: paydayTs,
            correlationId: corrId,
          });
        }
      }
    }
  }

  return { recorded: recordedCount, pendingPrompts };
}
