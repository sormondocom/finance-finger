/**
 * Generates docs/data-model.md from src/types/index.ts using the TypeScript
 * compiler API (already a devDep — no new packages required).
 *
 * Run:   node scripts/generate-data-model.js
 *        npm run docs
 *
 * The output is committed to the repo so it can be linked from README.md.
 * CI validates it is current: if `git diff docs/data-model.md` is non-empty,
 * the docs job fails and asks the author to run `npm run docs` and re-commit.
 */

import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC  = resolve(ROOT, 'src/types/index.ts');
const OUT  = resolve(ROOT, 'docs/data-model.md');

// ── Parse ────────────────────────────────────────────────────────────────────

const src = readFileSync(SRC, 'utf8');
const sf  = ts.createSourceFile('index.ts', src, ts.ScriptTarget.Latest, true);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Raw source text of a node (no leading trivia). */
function nodeText(node) {
  return src.slice(node.getStart(sf), node.getEnd()).trim();
}

/** Trailing //‑comment on a declaration, stripped of the // prefix. */
function trailingComment(node) {
  const ranges = ts.getTrailingCommentRanges(src, node.getEnd());
  if (!ranges || !ranges.length) return '';
  const r = ranges[0];
  let text = src.slice(r.pos, r.end);
  if (text.startsWith('//')) text = text.slice(2).trim();
  return text;
}

/**
 * Returns the section title embedded in the node's leading trivia, e.g.:
 *   "// ── Vault / Config ──────────────────" → "Vault / Config"
 * Returns null when no such marker is present.
 */
function sectionTitle(node) {
  const trivia = src.slice(node.getFullStart(), node.getStart(sf));
  const m = /\/\/\s*─{2,}([^─\n]+?)─*\s*$/m.exec(trivia);
  return m ? m[1].trim() : null;
}

/**
 * Stringify a type node to a single clean line, stripping any embedded
 * inline comments (// ...) that TypeScript leaves in trivia between
 * union members of multi-line type aliases.
 */
function typeOneLiner(typeNode) {
  // Grab raw text; strip //‑comments; collapse whitespace; trim leading " |"
  const raw = nodeText(typeNode)
    .replace(/\/\/[^\n]*/g, '')  // remove inline comments
    .replace(/\s*\|\s*/g, ' | ') // normalise pipe spacing
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\|\s*/, '');       // drop leading " | " from multi-line unions
  return raw;
}

/** Escape pipe chars in Markdown table cells. */
function mdEscape(s) {
  return s.replace(/\|/g, '\\|');
}

// ── Build markdown ────────────────────────────────────────────────────────────

const lines = [];

lines.push('# Financial Finger — Data Model');
lines.push('');
lines.push('> Auto-generated from [`src/types/index.ts`](../src/types/index.ts).');
lines.push('> Run `npm run docs` to regenerate after editing the types file.');
lines.push('');
lines.push('---');
lines.push('');

let currentSection = null; // null = before any section, string = inside named section

for (const stmt of sf.statements) {
  const isExported = stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
  if (!isExported) continue;

  // ── Named section from comment trivia ─────────────────────────────────────
  const section = sectionTitle(stmt);
  if (section && section !== currentSection) {
    lines.push(`## ${section}`);
    lines.push('');
    currentSection = section;
  } else if (!section && currentSection === null) {
    // First exported declarations before any section marker
    lines.push('## Core Types');
    lines.push('');
    currentSection = 'Core Types';
  }

  // ── Interface declaration ─────────────────────────────────────────────────
  if (ts.isInterfaceDeclaration(stmt)) {
    lines.push(`### \`${stmt.name.text}\``);
    lines.push('');

    const props = stmt.members.filter(ts.isPropertySignature);
    if (props.length > 0) {
      lines.push('| Field | Type | Notes |');
      lines.push('|---|---|---|');
      for (const prop of props) {
        const name    = nodeText(prop.name) + (prop.questionToken ? '?' : '');
        const type    = prop.type ? mdEscape(typeOneLiner(prop.type)) : 'unknown';
        const comment = trailingComment(prop);
        lines.push(`| \`${name}\` | \`${type}\` | ${comment} |`);
      }
      lines.push('');
    }
    continue;
  }

  // ── Type alias ────────────────────────────────────────────────────────────
  if (ts.isTypeAliasDeclaration(stmt)) {
    const name = stmt.name.text;
    const body = typeOneLiner(stmt.type);
    lines.push(`### \`${name}\``);
    lines.push('');
    lines.push('```typescript');
    lines.push(`type ${name} = ${body}`);
    lines.push('```');
    lines.push('');
  }
}

// ── Write ────────────────────────────────────────────────────────────────────

mkdirSync(resolve(ROOT, 'docs'), { recursive: true });
writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log('✓  docs/data-model.md generated from src/types/index.ts');
