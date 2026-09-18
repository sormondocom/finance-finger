/** Converts a YYYY-MM-DD date input string to a local-midnight timestamp. Falls back to now if empty. */
export function dateInputToTimestamp(dateStr: string): number {
  return dateStr ? new Date(dateStr + 'T00:00:00').getTime() : Date.now();
}

/** Formats a timestamp as a YYYY-MM-DD string using the local timezone. */
export function timestampToDateInput(ms: number): string {
  const d = new Date(ms);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Returns today's date as YYYY-MM-DD in the local timezone. */
export function todayDateInput(): string {
  return timestampToDateInput(Date.now());
}
