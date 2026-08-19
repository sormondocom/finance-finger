/**
 * Export / Import E2E tests.
 *
 * Uses two independent browser contexts:
 *   Context A — the sender; adds member "Alice Export Test", exports to Person B's public key
 *   Context B — the recipient (Person B); imports the .ffx file with Person B's private key
 *
 * Person B's ECC key pair is generated in beforeAll via openpgp in the Node.js test process.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo, TEST_PASSPHRASE } from '../helpers/setup-wizard';
import { generateTestKeyPair, type TestKeyPair } from '../helpers/pgp';
import type { Page } from '@playwright/test';

let personBKey: TestKeyPair;
let exportedFfxContent: string;
let ctxBPrivateKey: string;

let pageA: Page;
let cleanupA: () => Promise<void>;

let pageB: Page;
let cleanupB: () => Promise<void>;

test.beforeAll(async () => {
  // Two full setup wizards + PGP key generation — extend hook timeout to 3 min
  personBKey = await generateTestKeyPair(
    'Person B',
    'person.b@test.local',
    'person-b-test-passphrase',
  );

  // ── Context A (sender) ──────────────────────────────────────────────────
  const extA = await launchExtensionContext();
  cleanupA = extA.cleanup;
  pageA = await extA.context.newPage();
  await pageA.goto(extA.extUrl);
  await completeSetupWizard(pageA);

  // Navigate to Settings and add a household member so the export has meaningful data
  await navigateTo(pageA, 'settings');
  await pageA.click('[data-testid="settings-add-member-btn"]');
  await expect(pageA.locator('[data-testid="settings-add-member-form"]')).toBeVisible();
  await pageA.fill('[data-testid="settings-member-name-input"]', 'Alice Export Test');
  await pageA.click('[data-testid="settings-member-confirm"]');
  await expect(
    pageA.locator('[data-testid="settings-member-row"]').filter({ hasText: 'Alice Export Test' }),
  ).toBeVisible({ timeout: 8_000 });

  // Open export modal (no saved sharing keys → key textarea shown directly)
  await pageA.click('[data-testid="settings-export-btn"]');
  await expect(pageA.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // Paste Person B's public key and wait for the 400 ms debounce + async parse
  await pageA.fill('[data-testid="key-textarea"]', personBKey.publicKey);
  await expect(pageA.locator('[data-testid="key-preview"]')).toBeVisible({ timeout: 8_000 });

  // Intercept the download triggered by triggerDownload()
  const downloadPromise = pageA.waitForEvent('download');
  await pageA.click('[data-testid="modal-submit"]');
  const download = await downloadPromise;

  const tmpPath = await download.path();
  if (!tmpPath) throw new Error('Export download path is null — download may have failed');
  exportedFfxContent = fs.readFileSync(tmpPath, 'utf-8');

  // ── Context B (recipient, Person B) ────────────────────────────────────
  const extB = await launchExtensionContext();
  cleanupB = extB.cleanup;
  pageB = await extB.context.newPage();
  await pageB.goto(extB.extUrl);
  const { privateKey } = await completeSetupWizard(pageB);
  ctxBPrivateKey = privateKey;
  await navigateTo(pageB, 'settings');
}, 180_000);

test.afterAll(async () => {
  await cleanupA?.();
  await cleanupB?.();
});

// ── Export error validation (Context A) ──────────────────────────────────────

test('export modal shows error when no recipient key is provided', async () => {
  await pageA.click('[data-testid="settings-export-btn"]');
  await expect(pageA.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // Submit without providing any key
  await pageA.click('[data-testid="modal-submit"]');

  await expect(pageA.locator('[data-testid="export-error"]')).toBeVisible();
  await expect(pageA.locator('[data-testid="export-error"]')).toContainText('Please provide');
  await pageA.screenshot({ path: 'tests/screenshots/ei-01-export-error.png' });

  await pageA.click('[data-testid="modal-cancel"]');
  await expect(pageA.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Import error validation (Context B) ──────────────────────────────────────

test('import modal shows error when message field is empty', async () => {
  await pageB.click('[data-testid="settings-import-btn"]');
  await expect(pageB.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await pageB.click('[data-testid="modal-submit"]');

  await expect(pageB.locator('[data-testid="import-error"]')).toBeVisible();
  await expect(pageB.locator('[data-testid="import-error"]')).toContainText(
    'Please paste the .ffx content',
  );

  await pageB.click('[data-testid="modal-cancel"]');
  await expect(pageB.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('import modal shows error when private key field is empty', async () => {
  await pageB.click('[data-testid="settings-import-btn"]');
  await expect(pageB.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await pageB.fill('#im-message', exportedFfxContent);
  await pageB.click('[data-testid="modal-submit"]');

  await expect(pageB.locator('[data-testid="import-error"]')).toBeVisible();
  await expect(pageB.locator('[data-testid="import-error"]')).toContainText(
    'Please paste your private key',
  );

  await pageB.click('[data-testid="modal-cancel"]');
  await expect(pageB.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('import modal shows error when passphrase is empty', async () => {
  await pageB.click('[data-testid="settings-import-btn"]');
  await expect(pageB.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await pageB.fill('#im-message', exportedFfxContent);
  await pageB.fill('#im-private-key', personBKey.privateKey);
  await pageB.click('[data-testid="modal-submit"]');

  await expect(pageB.locator('[data-testid="import-error"]')).toBeVisible();
  await expect(pageB.locator('[data-testid="import-error"]')).toContainText(
    'Passphrase is required',
  );

  await pageB.click('[data-testid="modal-cancel"]');
  await expect(pageB.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('import modal shows decryption error for wrong passphrase', async () => {
  await pageB.click('[data-testid="settings-import-btn"]');
  await expect(pageB.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await pageB.fill('#im-message', exportedFfxContent);
  await pageB.fill('#im-private-key', personBKey.privateKey);
  await pageB.fill('#im-passphrase', 'this-is-the-wrong-passphrase');
  await pageB.click('[data-testid="modal-submit"]');

  await expect(pageB.locator('[data-testid="import-error"]')).toBeVisible({ timeout: 20_000 });
  await expect(pageB.locator('[data-testid="import-error"]')).toContainText('Decryption failed');
  await pageB.screenshot({ path: 'tests/screenshots/ei-02-import-wrong-passphrase.png' });

  await pageB.click('[data-testid="modal-cancel"]');
  await expect(pageB.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Successful import (Context B) ─────────────────────────────────────────────

test('import succeeds with matching private key and passphrase', async () => {
  await pageB.click('[data-testid="settings-import-btn"]');
  await expect(pageB.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await pageB.fill('#im-message', exportedFfxContent);
  await pageB.fill('#im-private-key', personBKey.privateKey);
  await pageB.fill('#im-passphrase', personBKey.passphrase);
  await pageB.click('[data-testid="modal-submit"]');

  // Import success toast — stays visible for 8 seconds
  const toast = pageB.locator('body').getByText(/Imported \d+ records?/);
  await expect(toast).toBeVisible({ timeout: 30_000 });
  await pageB.screenshot({ path: 'tests/screenshots/ei-03-import-success.png' });
});

test('imported member appears in Context B after page reload', async () => {
  // Click the Reload button inside the success toast (toast stays 8s — still present)
  await expect(pageB.locator('button:has-text("Reload")')).toBeVisible({ timeout: 5_000 });
  await pageB.click('button:has-text("Reload")');

  // location.reload() clears the in-memory vault key → app lands on /unlock, not /dashboard
  await expect(pageB.locator('#unlock-key')).toBeVisible({ timeout: 15_000 });
  await pageB.fill('#unlock-key', ctxBPrivateKey);
  await pageB.fill('#unlock-pass', TEST_PASSPHRASE);
  await pageB.click('#unlock-btn');

  // After successful unlock, launchApp() runs and the nav appears
  await expect(pageB.locator('[data-testid="nav-dashboard"]')).toBeVisible({ timeout: 20_000 });

  await navigateTo(pageB, 'settings');

  // "Alice Export Test" was a member in Context A — it should now appear in Context B
  await expect(
    pageB.locator('[data-testid="settings-member-row"]').filter({ hasText: 'Alice Export Test' }),
  ).toBeVisible({ timeout: 8_000 });
  await pageB.screenshot({ path: 'tests/screenshots/ei-04-imported-member-visible.png' });
});
