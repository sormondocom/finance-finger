import { describe, it, expect } from 'vitest';
import { escapeHtml } from './escapeHtml';

describe('escapeHtml', () => {
  it('passes through plain text unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('escapes less-than', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes greater-than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's fine")).toBe('it&#39;s fine');
  });

  it('escapes a full XSS payload', () => {
    const input = `<img src="x" onerror='alert(1)'>`;
    const result = escapeHtml(input);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain('"');
    expect(result).not.toContain("'");
    expect(result).toBe('&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('escapes multiple occurrences in the same string', () => {
    expect(escapeHtml('a & b & c')).toBe('a &amp; b &amp; c');
  });

  it('escapes ampersand before other characters to avoid double-escaping', () => {
    // If & is replaced first then < can't produce &lt; → no double-encoding
    const result = escapeHtml('&lt;');
    expect(result).toBe('&amp;lt;');
  });
});
