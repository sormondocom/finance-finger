// Pure CSV parsing utilities — no DOM, no side effects, fully testable.

export interface ParsedCSV {
  headers: string[];   // first row (may be data if no header row)
  rows: string[][];    // all rows including header
}

// ── Delimiter detection ───────────────────────────────────────────────────────

const CANDIDATE_DELIMITERS = [',', ';', '\t', '|'] as const;
export type Delimiter = (typeof CANDIDATE_DELIMITERS)[number] | string;

/**
 * Scores a delimiter by counting occurrences in the first few lines and
 * checking that the count is consistent (not just one line with many).
 */
export function detectDelimiter(text: string): Delimiter {
  const sample = text.slice(0, 4000);
  const lines = sample.split('\n').filter((l) => l.trim().length > 0).slice(0, 10);
  if (lines.length === 0) return ',';

  let best: Delimiter = ',';
  let bestScore = -1;

  for (const delim of CANDIDATE_DELIMITERS) {
    const counts = lines.map((l) => countUnquoted(l, delim));
    const nonZero = counts.filter((c) => c > 0);
    if (nonZero.length === 0) continue;
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    // Score: prefer consistent counts across lines with higher count
    const consistency = max === 0 ? 0 : min / max;
    const score = nonZero.length * consistency * (nonZero[0] ?? 0);
    if (score > bestScore) { bestScore = score; best = delim; }
  }

  return best;
}

/** Counts delimiter occurrences outside of double-quoted regions. */
function countUnquoted(line: string, delim: string): number {
  let count = 0;
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuote = !inQuote; continue; }
    if (!inQuote && line.startsWith(delim, i)) count++;
  }
  return count;
}

// ── CSV parser ────────────────────────────────────────────────────────────────

/**
 * Parses the full text of a delimited file.
 * @param quoteChar Single character used to quote fields. Empty string disables quoting.
 */
export function parseCSV(text: string, delimiter: Delimiter, quoteChar: string = '"'): ParsedCSV {
  const rows = splitRows(text, delimiter, quoteChar);
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0]!;
  return { headers, rows };
}

function splitRows(text: string, delimiter: Delimiter, quoteChar: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuote = false;
  let i = 0;
  const n = text.length;
  const q = quoteChar.length === 1 ? quoteChar : null; // null = quoting disabled

  while (i < n) {
    const ch = text[i]!;

    if (inQuote) {
      if (q && ch === q) {
        // Escaped quote (qq) or end of quoted field
        if (text[i + 1] === q) { field += q; i += 2; continue; }
        inQuote = false; i++; continue;
      }
      field += ch; i++; continue;
    }

    if (q && ch === q) { inQuote = true; i++; continue; }

    if (text.startsWith(delimiter, i)) {
      cur.push(field.trim());
      field = '';
      i += delimiter.length;
      continue;
    }

    if (ch === '\r' && text[i + 1] === '\n') {
      cur.push(field.trim()); rows.push(cur); cur = []; field = ''; i += 2; continue;
    }
    if (ch === '\n') {
      cur.push(field.trim()); rows.push(cur); cur = []; field = ''; i++; continue;
    }

    field += ch; i++;
  }

  // Final field / row
  if (field.trim() || cur.length > 0) {
    cur.push(field.trim());
    if (cur.some((f) => f.length > 0)) rows.push(cur);
  }

  // Normalise: ensure every row has the same column count as the header
  if (rows.length > 0) {
    const width = rows[0]!.length;
    for (let r = 1; r < rows.length; r++) {
      while (rows[r]!.length < width) rows[r]!.push('');
      if (rows[r]!.length > width) rows[r] = rows[r]!.slice(0, width);
    }
  }

  return rows;
}

// ── Date parsing ──────────────────────────────────────────────────────────────

const MONTH_ABBRS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/**
 * Attempts to parse a date string in many common bank-statement formats.
 * Returns a local-midnight timestamp, or null if unparseable.
 */
export function parseDate(value: string): number | null {
  const v = value.trim();
  if (!v) return null;

  // ISO 8601: 2026-09-06 or 2026/09/06
  let m = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return local(+m[1]!, +m[2]! - 1, +m[3]!);

  // Compact ISO: 20260906
  m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return local(+m[1]!, +m[2]! - 1, +m[3]!);

  // US: MM/DD/YYYY or M/D/YYYY or MM/DD/YY
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const yr = +m[3]! < 100 ? (+m[3]! < 50 ? 2000 + +m[3]! : 1900 + +m[3]!) : +m[3]!;
    return local(yr, +m[1]! - 1, +m[2]!);
  }

  // US with dashes: MM-DD-YYYY
  m = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return local(+m[3]!, +m[1]! - 1, +m[2]!);

  // "Sep 6, 2026" or "September 6, 2026"
  m = v.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mo = MONTH_ABBRS[m[1]!.toLowerCase()];
    if (mo !== undefined) return local(+m[3]!, mo, +m[2]!);
  }

  // "6 Sep 2026" or "6 September 2026"
  m = v.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const mo = MONTH_ABBRS[m[2]!.toLowerCase()];
    if (mo !== undefined) return local(+m[3]!, mo, +m[1]!);
  }

  // "6-Sep-2026"
  m = v.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);
  if (m) {
    const mo = MONTH_ABBRS[m[2]!.toLowerCase()];
    if (mo !== undefined) return local(+m[3]!, mo, +m[1]!);
  }

  return null;
}

function local(year: number, month: number, day: number): number | null {
  if (month < 0 || month > 11 || day < 1 || day > 31 || year < 1900 || year > 2200) return null;
  return new Date(year, month, day).getTime();
}

// ── Amount parsing ────────────────────────────────────────────────────────────

/**
 * Parses a dollar/amount string to a float.
 * Handles: currency symbols, thousand separators (comma), accounting
 * negatives (parentheses), European decimal commas when unambiguous.
 * Returns null if the string cannot be parsed as a finite number.
 */
export function parseAmount(value: string): number | null {
  let v = value.trim();
  if (!v) return null;

  const isNeg = v.startsWith('(') && v.endsWith(')') || v.startsWith('-');

  // Strip currency symbols and whitespace
  v = v.replace(/[$€£¥₹₩₽]/g, '').trim();
  // Strip parentheses
  v = v.replace(/[()]/g, '').trim();
  // Strip leading minus for uniform handling
  v = v.replace(/^-/, '').trim();

  // European format: 1.234,56 → if last separator is a comma after a period
  if (/\d\.\d{3},\d{1,2}$/.test(v)) {
    v = v.replace(/\./g, '').replace(',', '.');
  } else {
    // Standard: remove thousand commas
    v = v.replace(/,/g, '');
  }

  const num = parseFloat(v);
  if (!isFinite(num)) return null;
  return isNeg ? -num : num;
}

// ── Checksum ──────────────────────────────────────────────────────────────────

/** SHA-256 hex digest of the raw file text — used for duplicate detection. */
export async function computeChecksum(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
