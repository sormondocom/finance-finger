/**
 * Import Review & Repeat Detection Settings E2E tests.
 *
 * Focuses on the Repeat Transaction Detection section in Settings.
 * A fresh extension context is used for isolation.
 *
 * Test outline:
 *   1.  Repeat detection section title is visible in Settings.
 *   2.  Enable toggle is checked by default.
 *   3.  Threshold input shows default value of 5.
 *   4.  Rules list shows empty-state message before any imports.
 *   5.  Threshold can be changed and saved (shows toast).
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

test.beforeAll(async () => {
  const ext = await launchExtensionContext();
  context = ext.context;
  cleanup = ext.cleanup;
  page = await context.newPage();
  await page.goto(ext.extUrl);
  await completeSetupWizard(page);

  // Create a bank account for this test context
  await navigateTo(page, 'accounts');
  await page.click('[data-testid="add-account-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#ba-name', 'Review Test Checking');
  await page.click('[data-testid="modal-submit"]');
  await expect(
    page.locator('[data-testid="account-row"]').filter({ hasText: 'Review Test Checking' }),
  ).toBeVisible({ timeout: 8_000 });
});

test.afterAll(async () => {
  await cleanup();
});

test('repeat detection section is visible in settings', async () => {
  await navigateTo(page, 'settings');
  await expect(page.locator('text=Repeat Transaction Detection')).toBeVisible({ timeout: 6_000 });
  await page.screenshot({ path: 'tests/screenshots/import-review-01-settings.png' });
});

test('enable toggle is checked by default', async () => {
  // The enable checkbox inside the "Enable auto-matching" row should be checked
  // It's labelled "Enabled" and is a checkbox
  const enableCheck = page.locator('input[type="checkbox"]').first();
  await expect(enableCheck).toBeChecked({ timeout: 4_000 });
});

test('threshold input shows default value of 5', async () => {
  // The threshold number input has a default of 5 and min=1, max=50
  const thresholdInput = page.locator('input[type="number"][min="1"][max="50"]');
  await expect(thresholdInput).toBeVisible({ timeout: 4_000 });
  // Default from getSetting returns null → displayed as '5'
  await expect(thresholdInput).toHaveValue('5');
});

test('rules list shows empty state before any imports', async () => {
  // The rules list shows "No rules yet..." when no imports have been confirmed
  const rulesList = page.locator('.import-rules-list');
  await expect(rulesList).toBeVisible({ timeout: 4_000 });
  await expect(rulesList).toContainText('No rules yet');
  await page.screenshot({ path: 'tests/screenshots/import-review-02-empty-rules.png' });
});

test('can change threshold and save shows toast', async () => {
  await navigateTo(page, 'settings');
  const thresholdInput = page.locator('[data-testid="settings-repeat-threshold"]');
  await thresholdInput.fill('3');
  await expect(thresholdInput).toHaveValue('3');

  // Click the Save button adjacent to the threshold input
  const saveBtn = page.locator('[data-testid="settings-repeat-threshold-save"]');
  await saveBtn.click();

  // A toast "Threshold updated!" should appear
  await expect(page.locator('text=Threshold updated!')).toBeVisible({ timeout: 4_000 });
  await page.screenshot({ path: 'tests/screenshots/import-review-03-threshold-saved.png' });
});
