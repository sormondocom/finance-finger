/**
 * Generates a draft [Unreleased] changelog section from git commits since
 * the last version tag.  Output is printed to stdout — paste it into
 * CHANGELOG.md under the [Unreleased] heading.
 *
 * Usage:
 *   node scripts/draft-changelog.js          # since last tag
 *   node scripts/draft-changelog.js v0.4.0   # since a specific tag
 *   npm run changelog
 */

import { execSync } from 'node:child_process';

const since = process.argv[2] ?? latestTag();

function latestTag() {
  try {
    return execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const range = since ? `${since}..HEAD` : 'HEAD';
const raw = execSync(`git log ${range} --pretty=format:"%s"`, { encoding: 'utf8' }).trim();

if (!raw) {
  console.log(`No commits found since ${since ?? 'beginning'}.`);
  process.exit(0);
}

const commits = raw.split('\n').filter(Boolean);

// Bucket commits into rough categories by keyword heuristics.
// These are best-effort — review and reclassify before committing.
const added    = [];
const changed  = [];
const fixed    = [];
const other    = [];

const ADD_WORDS    = /^(add|adding|new|implement|creat|introduc)/i;
const FIX_WORDS    = /^(fix|fixing|bug|repair|correct|resolv)/i;
const CHANGE_WORDS = /^(updat|chang|refactor|improv|enhanc|bump|increment|version|bump|migrat|mark)/i;

for (const msg of commits) {
  const lower = msg.toLowerCase();
  if (ADD_WORDS.test(lower))       added.push(msg);
  else if (FIX_WORDS.test(lower))  fixed.push(msg);
  else if (CHANGE_WORDS.test(lower)) changed.push(msg);
  else                             other.push(msg);
}

const lines = [
  `## [Unreleased] — draft since ${since ?? 'beginning'}`,
  '',
  '> ⚠️  Auto-drafted from git log. Review each line, split compound commits,',
  '>    reclassify as needed, and remove this notice before publishing.',
  '',
];

function section(title, items) {
  if (!items.length) return;
  lines.push(`### ${title}`);
  for (const item of items) lines.push(`- ${item}`);
  lines.push('');
}

section('Added',   added);
section('Changed', changed);
section('Fixed',   fixed);
section('Other',   other);

console.log(lines.join('\n'));
