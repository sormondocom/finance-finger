import { describe, it, expect } from 'vitest';
import { detectDelimiter, parseCSV, parseDate, parseAmount } from './csvParser';

// ── detectDelimiter ───────────────────────────────────────────────────────────

describe('detectDelimiter', () => {
  it('detects comma as delimiter', () => {
    const text = 'date,amount,description\n2026-01-01,100.00,Coffee\n2026-01-02,200.00,Groceries';
    expect(detectDelimiter(text)).toBe(',');
  });

  it('detects semicolon as delimiter', () => {
    const text = 'date;amount;description\n2026-01-01;100.00;Coffee\n2026-01-02;200.00;Groceries';
    expect(detectDelimiter(text)).toBe(';');
  });

  it('detects tab as delimiter', () => {
    const text = 'date\tamount\tdescription\n2026-01-01\t100.00\tCoffee';
    expect(detectDelimiter(text)).toBe('\t');
  });

  it('detects pipe as delimiter', () => {
    const text = 'date|amount|description\n2026-01-01|100.00|Coffee\n2026-01-02|200.00|Groceries';
    expect(detectDelimiter(text)).toBe('|');
  });

  it('falls back to comma on empty text', () => {
    expect(detectDelimiter('')).toBe(',');
  });
});

// ── parseCSV ──────────────────────────────────────────────────────────────────

describe('parseCSV', () => {
  it('parses a simple comma-delimited file', () => {
    const text = 'Date,Amount,Description\n2026-01-01,100.00,Coffee\n2026-01-02,200.00,Groceries';
    const { headers, rows } = parseCSV(text, ',');
    expect(headers).toEqual(['Date', 'Amount', 'Description']);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(['2026-01-01', '100.00', 'Coffee']);
    expect(rows[2]).toEqual(['2026-01-02', '200.00', 'Groceries']);
  });

  it('handles quoted fields containing commas', () => {
    const text = 'Date,Description,Amount\n2026-01-01,"Lunch, coffee",12.50';
    const { rows } = parseCSV(text, ',');
    expect(rows[1]![1]).toBe('Lunch, coffee');
  });

  it('handles escaped double-quotes inside quoted fields', () => {
    const text = 'Date,Description\n2026-01-01,"He said ""hello"""';
    const { rows } = parseCSV(text, ',');
    expect(rows[1]![1]).toBe('He said "hello"');
  });

  it('handles Windows-style CRLF line endings', () => {
    const text = 'Date,Amount\r\n2026-01-01,50.00\r\n2026-01-02,75.00';
    const { rows } = parseCSV(text, ',');
    expect(rows).toHaveLength(3);
  });

  it('normalises short rows to header width', () => {
    const text = 'A,B,C\n1,2\n4,5,6';
    const { rows } = parseCSV(text, ',');
    expect(rows[1]).toEqual(['1', '2', '']);
    expect(rows[2]).toEqual(['4', '5', '6']);
  });

  it('handles tab delimiter', () => {
    const text = 'Date\tAmount\n2026-01-01\t99.99';
    const { rows } = parseCSV(text, '\t');
    expect(rows[1]).toEqual(['2026-01-01', '99.99']);
  });

  it('returns empty result for empty input', () => {
    const { headers, rows } = parseCSV('', ',');
    expect(headers).toEqual([]);
    expect(rows).toHaveLength(0);
  });

  it('ignores a trailing empty line', () => {
    const text = 'Date,Amount\n2026-01-01,10.00\n';
    const { rows } = parseCSV(text, ',');
    expect(rows).toHaveLength(2);
  });
});

// ── parseCSV with quoteChar ───────────────────────────────────────────────────

describe('parseCSV with quoteChar', () => {
  it("single-quote quoteChar: fields quoted with ' parse correctly", () => {
    const text = "Date,Description,Amount\n2026-01-01,'Coffee Shop',12.50";
    const { rows } = parseCSV(text, ',', "'");
    expect(rows[1]![1]).toBe('Coffee Shop');
  });

  it("single-quote quoteChar: field containing a comma is kept as one field", () => {
    const text = "Date,Description,Amount\n2026-01-01,'Lunch, coffee',12.50";
    const { rows } = parseCSV(text, ',', "'");
    expect(rows[1]![1]).toBe('Lunch, coffee');
  });

  it("single-quote quoteChar: two single-quotes inside a field are an escaped quote", () => {
    // 'it''s here' → it's here
    const text = "Date,Description\n2026-01-01,'it''s here'";
    const { rows } = parseCSV(text, ',', "'");
    expect(rows[1]![1]).toBe("it's here");
  });

  it("quoteChar='' disables quoting: double-quote is treated as a literal character", () => {
    // With no quoting, " chars are just literal — the field value includes them
    const text = 'a,"quoted",c\n1,2,3';
    const { rows } = parseCSV(text, ',', '');
    // headers: 'a', '"quoted"' (quotes are literal, but trimmed), 'c'
    expect(rows[0]![0]).toBe('a');
    expect(rows[0]![1]).toBe('"quoted"');
    expect(rows[0]![2]).toBe('c');
  });

  it("quoteChar='' with comma inside double-quotes: comma is a delimiter (quotes not honored)", () => {
    // With quoting disabled, "a, b" is not one field — the comma splits it
    const text = 'a,"b,c",d\n1,2,3';
    const { rows } = parseCSV(text, ',', '');
    // header row splits at every comma: 'a', '"b', 'c"', 'd'
    // but field.trim() is applied, so: 'a', '"b', 'c"', 'd'
    expect(rows[0]).toHaveLength(4);
    expect(rows[0]![0]).toBe('a');
    expect(rows[0]![1]).toBe('"b');
    expect(rows[0]![2]).toBe('c"');
    expect(rows[0]![3]).toBe('d');
  });

  it('default quoteChar (double-quote) still works normally', () => {
    // Verify the default still splits correctly
    const text = 'a,"b,c",d';
    const { rows } = parseCSV(text, ',');
    expect(rows[0]).toHaveLength(3);
    expect(rows[0]![1]).toBe('b,c');
  });
});

// ── parseDate ─────────────────────────────────────────────────────────────────

describe('parseDate', () => {
  const expectDate = (result: number | null, y: number, m: number, d: number) => {
    expect(result).not.toBeNull();
    const dt = new Date(result!);
    expect(dt.getFullYear()).toBe(y);
    expect(dt.getMonth()).toBe(m);
    expect(dt.getDate()).toBe(d);
  };

  it('parses ISO 8601: 2026-09-06', () => expectDate(parseDate('2026-09-06'), 2026, 8, 6));
  it('parses ISO with slash: 2026/09/06', () => expectDate(parseDate('2026/09/06'), 2026, 8, 6));
  it('parses compact ISO: 20260906', () => expectDate(parseDate('20260906'), 2026, 8, 6));
  it('parses US format: 09/06/2026', () => expectDate(parseDate('09/06/2026'), 2026, 8, 6));
  it('parses US short year: 09/06/26', () => expectDate(parseDate('09/06/26'), 2026, 8, 6));
  it('parses US dashes: 09-06-2026', () => expectDate(parseDate('09-06-2026'), 2026, 8, 6));
  it('parses long month: Sep 6, 2026', () => expectDate(parseDate('Sep 6, 2026'), 2026, 8, 6));
  it('parses full month: September 6, 2026', () => expectDate(parseDate('September 6, 2026'), 2026, 8, 6));
  it('parses DMY: 6 Sep 2026', () => expectDate(parseDate('6 Sep 2026'), 2026, 8, 6));
  it('parses dash DMY: 6-Sep-2026', () => expectDate(parseDate('6-Sep-2026'), 2026, 8, 6));
  it('returns null for empty string', () => expect(parseDate('')).toBeNull());
  it('returns null for garbage input', () => expect(parseDate('not-a-date')).toBeNull());
  it('returns null for out-of-range month', () => expect(parseDate('2026-13-01')).toBeNull());
});

// ── parseAmount ───────────────────────────────────────────────────────────────

describe('parseAmount', () => {
  it('parses a plain number', () => expect(parseAmount('1234.56')).toBeCloseTo(1234.56));
  it('parses with thousand comma: 1,234.56', () => expect(parseAmount('1,234.56')).toBeCloseTo(1234.56));
  it('parses with currency symbol: $1,234.56', () => expect(parseAmount('$1,234.56')).toBeCloseTo(1234.56));
  it('parses euro symbol: €1234.56', () => expect(parseAmount('€1234.56')).toBeCloseTo(1234.56));
  it('parses negative with dash: -99.50', () => expect(parseAmount('-99.50')).toBeCloseTo(-99.50));
  it('parses accounting negative: (99.50)', () => expect(parseAmount('(99.50)')).toBeCloseTo(-99.50));
  it('parses accounting with symbol: ($99.50)', () => expect(parseAmount('($99.50)')).toBeCloseTo(-99.50));
  it('parses European format: 1.234,56', () => expect(parseAmount('1.234,56')).toBeCloseTo(1234.56));
  it('parses zero', () => expect(parseAmount('0.00')).toBeCloseTo(0));
  it('returns null for empty string', () => expect(parseAmount('')).toBeNull());
  it('returns null for non-numeric', () => expect(parseAmount('n/a')).toBeNull());
});
