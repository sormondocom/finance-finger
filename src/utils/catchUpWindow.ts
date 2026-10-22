// Resolves how far back catch-up logic (paydays, auto-pay, debt payments,
// recurring bills) should look when the extension reopens after a gap.
//
// `prevOpenedAt` is the previous value of the `lastOpenedAt` storage key —
// read BEFORE it gets overwritten with the current timestamp, so the gap can
// be measured. `null` means there is no prior stamp (a fresh install), in
// which case there is nothing to catch up — never treat a missing stamp as
// an unbounded lookback. `maxWindowDays <= 0` means catch-up is disabled.
//
// The gap is measured in whole CALENDAR days (midnight to midnight), not raw
// elapsed milliseconds — using fractional days would mean reopening even a
// few hours after a same-day close could land the window's lower bound AFTER
// midnight of "yesterday", silently excluding anything due yesterday. A
// same-day reopen (0 calendar days apart) still returns today's midnight,
// not null — there's still "today" to check.
export function resolveCatchUpWindowStart(
  prevOpenedAt: number | null,
  now: number,
  maxWindowDays: number,
): Date | null {
  if (prevOpenedAt == null || maxWindowDays <= 0) return null;

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const prevOpenedDayStart = new Date(prevOpenedAt);
  prevOpenedDayStart.setHours(0, 0, 0, 0);

  const daysSince = Math.round((todayStart.getTime() - prevOpenedDayStart.getTime()) / 86_400_000);
  const effectiveDays = Math.max(0, Math.min(daysSince, maxWindowDays));

  return new Date(todayStart.getTime() - effectiveDays * 86_400_000);
}
