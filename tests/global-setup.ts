/**
 * Playwright global setup: patches Playwright's bundled Firefox so Juggler can
 * interact with moz-extension:// pages.
 *
 * By default, JugglerFrameChild.jsm contains an early-return guard that
 * prevents the Juggler frame agent from being initialised for extension pages:
 *
 *   if (this.document.documentURI.startsWith('moz-extension://'))
 *     return;
 *
 * This makes page.goto() hang indefinitely on any moz-extension:// URL and
 * blocks all locator queries on those pages.  Removing the guard is the
 * accepted approach; see https://github.com/microsoft/playwright/issues/2644
 * and the DuckDuckGo firefox-webext-playwright-harness for prior art.
 *
 * The patch is applied once to omni.ja (Firefox's internal resource archive)
 * and is idempotent: subsequent runs detect the in-source marker and exit
 * early.  To restore the original binary run:
 *   npx playwright install firefox
 */
import type { FullConfig } from '@playwright/test';
import { firefox } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import JSZip from 'jszip';

const JUGGLER_ENTRY = 'chrome/juggler/content/content/JugglerFrameChild.jsm';

// The exact guard string as it appears in Playwright's bundled Firefox.
// If a future Playwright update changes this, the patch will throw rather than
// silently succeed — forcing a deliberate review of the new source.
const MOZ_EXT_GUARD = `\n    if (this.document.documentURI.startsWith('moz-extension://'))\n      return;`;
const PATCH_MARKER = '/* ff-ext-patched: moz-extension guard removed */';

async function patchFirefoxIfNeeded(): Promise<void> {
  const binDir = path.dirname(firefox.executablePath());
  // On macOS the binary lives in Contents/MacOS; omni.ja is in Contents/Resources.
  const firefoxDir = process.platform === 'darwin'
    ? path.join(binDir, '..', 'Resources')
    : binDir;
  const omniPath = path.join(firefoxDir, 'omni.ja');

  const data = await fs.readFile(omniPath);
  const zip = await JSZip.loadAsync(data);

  const zipFile = zip.file(JUGGLER_ENTRY);
  if (!zipFile) {
    throw new Error(
      `Could not find ${JUGGLER_ENTRY} in omni.ja.\n` +
      `Run "npx playwright install firefox" to reinstall the Firefox binary.`,
    );
  }

  const src = await zipFile.async('string');

  if (src.includes(PATCH_MARKER)) {
    return; // Already patched — nothing to do.
  }

  if (!src.includes(MOZ_EXT_GUARD)) {
    throw new Error(
      `Expected guard string not found in ${JUGGLER_ENTRY}.\n` +
      `Playwright Firefox may have been updated — review the guard and update this patch.\n` +
      `Run "npx playwright install firefox" to restore the original binary.`,
    );
  }

  const patched = src.replace(MOZ_EXT_GUARD, `\n    ${PATCH_MARKER}`);

  // Preserve the original STORE (uncompressed) method for this entry.
  zip.file(JUGGLER_ENTRY, patched, { compression: 'STORE' });

  const output = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(omniPath, output);

  console.log('\n✓ Patched Playwright Firefox: moz-extension:// pages are now testable.\n');
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  if (process.env['BROWSER'] !== 'firefox') return;
  await patchFirefoxIfNeeded();
}
