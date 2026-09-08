/**
 * E2E tests for the Setup Wizard — Import Key path.
 *
 * Covers the alternative flow where a user has an existing PGP key pair
 * and pastes it into the import tab instead of generating new keys.
 *
 * Key differences from the generate path:
 *   - "Import existing keys" tab is selected
 *   - Public and private key text areas are filled
 *   - Save-key step shows "You imported your own key" (no download button)
 *   - Next button is NOT disabled (no download required)
 *
 * A real ECC key pair is generated in beforeAll via openpgp so the
 * validatePrivateKey call in Setup.ts succeeds.
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { generateTestKeyPair, type TestKeyPair } from '../helpers/pgp';
import { TEST_HOUSEHOLD } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;
let testKey: TestKeyPair;

test.beforeAll(async () => {
  // Generate a fresh key pair for the import path
  testKey = await generateTestKeyPair(
    'Import Test User',
    'import@financial-finger.local',
    'import-test-passphrase-123',
  );

  const ext = await launchExtensionContext();
  context = ext.context;
  cleanup = ext.cleanup;
  page = await context.newPage();
  await page.goto(ext.extUrl);
}, 60_000);

test.afterAll(async () => {
  await cleanup();
});

// ── Welcome step ───────────────────────────────────────────────────────────────

test('welcome step is shown on first launch', async () => {
  await expect(page.locator('[data-testid="setup-next"]')).toBeVisible();
});

test('advance past welcome step', async () => {
  await page.click('[data-testid="setup-next"]');
  await expect(page.locator('[data-testid="mascot-option-buck"]')).toBeVisible();
});

// ── Mascot step ────────────────────────────────────────────────────────────────

test('advance past mascot step', async () => {
  await page.click('[data-testid="setup-next"]');
  // Key generation step should now be visible
  await expect(page.locator('[data-testid="tab-generate"]')).toBeVisible();
});

// ── Keys step — import tab ────────────────────────────────────────────────────

test('import tab is accessible and switching to it shows the import form', async () => {
  const importTab = page.locator('[data-testid="tab-import"]');
  await expect(importTab).toBeVisible();
  await importTab.click();
  await expect(page.locator('#import-pub')).toBeVisible();
  await expect(page.locator('#import-priv')).toBeVisible();
  await expect(page.locator('#import-pass')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/33-01-import-tab.png' });
});

test('pasting public and private keys into the import form', async () => {
  await page.fill('#import-pub', testKey.publicKey);
  await page.fill('#import-priv', testKey.privateKey);
  await page.fill('#import-pass', testKey.passphrase);
  await page.screenshot({ path: 'tests/screenshots/33-02-import-filled.png' });
});

test('submitting with empty passphrase shows an error', async () => {
  // Clear passphrase to trigger error, then restore
  await page.fill('#import-pass', '');
  await page.click('[data-testid="setup-next"]');

  const errEl = page.locator('#key-error');
  await expect(errEl).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: 'tests/screenshots/33-03-import-error.png' });

  // Restore correct passphrase
  await page.fill('#import-pass', testKey.passphrase);
});

test('clicking Import & Continue with valid keys advances to the save-key step', async () => {
  await page.click('[data-testid="setup-next"]');
  // Key validation takes a moment
  await expect(page.locator('[data-testid="save-private-key"]').or(
    page.locator('text=imported your own key'),
  )).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'tests/screenshots/33-04-save-key-step.png' });
});

// ── Save-key step — import variant ────────────────────────────────────────────

test('save-key step says key is already backed up (no download button)', async () => {
  // "You imported your own key — make sure it's already backed up." message shown
  const msg = page.locator('text=imported your own key');
  await expect(msg).toBeVisible();
  // The "Save Private Key" download button should NOT be present
  await expect(page.locator('[data-testid="save-private-key"]')).not.toBeVisible();
});

test('Next button is not disabled on the save-key step for imported keys', async () => {
  // On the generate path Next is disabled until the key is downloaded.
  // On the import path it should be enabled immediately.
  const nextBtn = page.locator('[data-testid="setup-next"]');
  await expect(nextBtn).toBeEnabled();
});

test('advance past save-key step to profile', async () => {
  await page.click('[data-testid="setup-next"]');
  await expect(page.locator('#profile-name')).toBeVisible();
});

// ── Profile + done ─────────────────────────────────────────────────────────────

test('fill in household name and advance to done', async () => {
  await page.fill('#profile-name', TEST_HOUSEHOLD);
  await page.click('[data-testid="setup-next"]');
  await expect(page.locator('[data-testid="setup-enter-app"]')).toBeVisible({ timeout: 15_000 });
});

test('entering the app via import path lands on dashboard', async () => {
  await page.click('[data-testid="setup-enter-app"]');
  await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/33-05-dashboard-after-import.png' });
});
