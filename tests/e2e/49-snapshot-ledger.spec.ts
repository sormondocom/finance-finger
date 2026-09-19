/**
 * Snapshot / restore — ledger store round-trip E2E test.
 *
 * Verifies that the ledgerEntries store is included in snapshots and that
 * a restore correctly rolls back ledger state to the snapshotted point in time.
 *
 * Pattern (inverse restore):
 *   1. Create a debt account (opening reconciliation entry — 1 entry total).
 *   2. Snapshot.
 *   3. Record a payment (payment entry — 2 entries total).
 *   4. Restore the snapshot (should roll back to 1 entry).
 *   5. Unlock and verify: count = 1, payment entry is gone.
 *
 * If ledgerEntries is missing from SNAPSHOT_STORES, restore will silently
 * leave the post-snapshot payment entry in place and the count will be 2.
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo, TEST_PASSPHRASE } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;
let privateKey: string;

const today = new Date().toISOString().split('T')[0]!;

test.beforeAll(async () => {
  const ext = await launchExtensionContext();
  context = ext.context;
  cleanup = ext.cleanup;
  page = await context.newPage();
  await page.goto(ext.extUrl);
  const result = await completeSetupWizard(page);
  privateKey = result.privateKey;
});

test.afterAll(async () => {
  await cleanup();
});

// ── Setup: debt account → opening reconciliation entry ────────────────────────

test('setup: add Snap Card debt account ($2,000) — creates opening reconciliation entry', async () => {
  await navigateTo(page, 'debt');
  await page.click('[data-testid="add-debt-btn"]');
  await page.fill('#da-name', 'Snap Card');
  await page.fill('#da-balance', '2000');
  await page.fill('#da-apr', '18.99');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Confirm 1 ledger entry (opening reconciliation)
  await navigateTo(page, 'ledger');
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('1');
  const row = page.locator('[data-testid="ledger-entry-row"]').first();
  await expect(row.locator('.ledger-recon-value')).toContainText('$2,000.00');
  await page.screenshot({ path: 'tests/screenshots/snapledger-01-before-snapshot.png' });
});

// ── Snapshot ──────────────────────────────────────────────────────────────────

test('take a snapshot (captures the 1-entry ledger state)', async () => {
  await navigateTo(page, 'settings');
  await page.click('[data-testid="settings-snapshot-now-btn"]');
  await expect(page.locator('[data-testid="settings-snapshot-row"]')).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: 'tests/screenshots/snapledger-02-snapshot-taken.png' });
});

// ── Post-snapshot change: record a payment ────────────────────────────────────

test('record a $500 payment on Snap Card — adds a payment entry (2 entries total)', async () => {
  await navigateTo(page, 'debt');
  const debtRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Snap Card' });
  await debtRow.locator('[data-testid="debt-pay-btn"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('[data-testid="debt-pay-amount"]', '500');
  await page.fill('[data-testid="debt-pay-date"]', today);
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  await navigateTo(page, 'ledger');
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('2');
  await page.screenshot({ path: 'tests/screenshots/snapledger-03-after-payment.png' });
});

// ── Restore and verify ────────────────────────────────────────────────────────

test('restoring the snapshot rolls back the ledger to 1 entry', async () => {
  await navigateTo(page, 'settings');
  const restoreBtn = page.locator('[data-testid="settings-snapshot-restore-btn"]').first();
  await expect(restoreBtn).toBeVisible();
  await restoreBtn.click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.click('[data-testid="confirm-ok"]');

  // Restore clears the vault key from memory — lands on /unlock
  await expect(page.locator('[data-testid="unlock-key-textarea"]')).toBeVisible({ timeout: 20_000 });
  await page.fill('[data-testid="unlock-key-textarea"]', privateKey);
  await page.fill('#unlock-pass', TEST_PASSPHRASE);
  await page.click('#unlock-btn');
  await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: 'tests/screenshots/snapledger-04-after-restore.png' });

  // Ledger must be back to 1 entry — the payment entry does not survive restore
  await navigateTo(page, 'ledger');
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('1');
  const row = page.locator('[data-testid="ledger-entry-row"]').first();
  await expect(row.locator('.ledger-recon-value')).toContainText('$2,000.00');
  await page.screenshot({ path: 'tests/screenshots/snapledger-05-ledger-restored.png' });
});
