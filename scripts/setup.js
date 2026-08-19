/**
 * Builds Financial Finger for Chrome and Firefox in one step, then runs
 * end-to-end tests against the Chrome build.  The build is considered
 * broken if any E2E tests fail.
 *
 * Run once after `npm install`:  node scripts/setup.js
 * Re-run any time source files change to refresh the dist folders.
 *
 * Skip E2E tests (exception — use sparingly):
 *   node scripts/setup.js --skip-tests
 *   SKIP_TESTS=1 npm run setup
 */
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT       = resolve(__dirname, '..');
const node       = process.execPath;
const vite       = resolve(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const playwright = resolve(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');

const skipTests =
  process.argv.includes('--skip-tests') || process.env['SKIP_TESTS'] === '1';

function run(bin, args) {
  return new Promise((done, fail) => {
    const proc = spawn(bin, args, { stdio: 'inherit', cwd: ROOT });
    proc.on('close', code => {
      if (code === 0) done();
      else fail(new Error(`${[bin, ...args].join(' ')} exited with code ${code}`));
    });
  });
}

async function main() {
  // Generate PNG icons (Chrome requires PNGs; Firefox uses SVG)
  await run(node, [resolve(__dirname, 'generate-icons.js')]);

  console.log('\nBuilding Chrome distribution…');
  await run(node, [vite, 'build', '--mode', 'chrome']);

  if (skipTests) {
    console.log('\n⚠️  E2E tests skipped (--skip-tests / SKIP_TESTS=1).  Use sparingly.');
  } else {
    console.log('\nRunning end-to-end tests…');
    await run(node, [playwright, 'test']);
    console.log('\n✓ All E2E tests passed.');
  }

  console.log('\nBuilding Firefox distribution…');
  await run(node, [vite, 'build', '--mode', 'firefox']);

  console.log(`
Build complete! Load each browser from its dist folder:

── Chrome / Edge / Brave / Arc ──────────────────────────────
1. Open chrome://extensions  (or your browser's equivalent)
2. Enable Developer mode (toggle, top-right)
3. Click "Load unpacked" → select  dist/chrome/

── Firefox ──────────────────────────────────────────────────
1. Open about:debugging
2. Click "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on…"
4. Navigate to  dist/firefox/  and select manifest.json

Both folders are independent — you can have Chrome and Firefox
running the extension at the same time for side-by-side testing.

Note: Firefox temporary add-ons are removed when the browser
closes. For persistence, sign via addons.mozilla.org or use
Firefox Developer Edition with xpinstall.signatures.required
set to false in about:config.
`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
