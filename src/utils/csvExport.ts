import { downloadFile } from './download';

/** Quotes a CSV field only when it needs it (contains a comma, quote, or newline). */
function csvField(value: string | number): string {
  let s = String(value);
  // Neutralize formula injection (CWE-1236): Excel/Sheets/LibreOffice treat a
  // cell starting with =, +, -, or @ as a formula to evaluate on open — a
  // user-entered merchant/category/account name is free text that could
  // start with any of these. A leading apostrophe forces it to be read as
  // plain text instead; it's the standard mitigation and is visible as a
  // literal character only if pasted back in, not on open. Scoped to
  // `string` inputs only — a `number` value (a money amount) can
  // legitimately start with "-" and must never be coerced into text.
  if (typeof value === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  return [headers, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
  downloadFile(toCsv(headers, rows), filename, 'text/csv;charset=utf-8;');
}
