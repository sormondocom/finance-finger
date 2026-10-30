import { describe, it, expect } from 'vitest';
import { toCsv } from './csvExport';

describe('toCsv — formula injection (CWE-1236)', () => {
  it('prefixes a string field starting with = with an apostrophe', () => {
    const csv = toCsv(['Name'], [['=HYPERLINK("http://evil/","x")']]);
    // Apostrophe-prefixed, then quoted+escaped as usual since it contains ".
    expect(csv).toBe('Name\r\n"\'=HYPERLINK(""http://evil/"",""x"")"');
  });

  it('prefixes string fields starting with +, -, or @', () => {
    const csv = toCsv(['Name'], [['+1+1'], ['-2+3+cmd'], ['@SUM(A1)']]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe("'+1+1");
    expect(lines[2]).toBe("'-2+3+cmd");
    expect(lines[3]).toBe("'@SUM(A1)");
  });

  it('does not touch a legitimate negative number value', () => {
    const csv = toCsv(['Amount'], [[-50]]);
    expect(csv).toBe('Amount\r\n-50');
  });

  it('does not touch a legitimate positive number value', () => {
    const csv = toCsv(['Amount'], [[1234.5]]);
    expect(csv).toBe('Amount\r\n1234.5');
  });

  it('leaves an ordinary string untouched', () => {
    const csv = toCsv(['Name'], [['Whole Foods Market']]);
    expect(csv).toBe('Name\r\nWhole Foods Market');
  });

  it('still quotes a prefixed field that also contains a comma', () => {
    const csv = toCsv(['Name'], [['=A, B']]);
    expect(csv).toBe('Name\r\n"\'=A, B"');
  });
});
