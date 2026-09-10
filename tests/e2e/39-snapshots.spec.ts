/**
 * Snapshot / Restore E2E tests.
 *
 * Verifies: the snapshot section appears in Settings, manual snapshots can be
 * taken and listed, and a restore rolls back data to the selected point in time.
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo, TEST_PASSPHRASE } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;
let privateKey: string;

test.beforeAll(async () => {
  const ext = await launchExtensionContext();
  context = ext.context;
  cleanup = ext.cleanup;
  page = await context.newPage();
  await page.goto(ext.extUrl);
  const result = await completeSetupWizard(page);
  privateKey = result.privateKey;
  await navigateTo(page, 'settings');
});

test.afterAll(async () => {
  await cleanup();
});

// ── Section visibility ────────────────────────────────────────────────────────

test('snapshot section is visible in Settings', async () => {
  await expect(page.locator('[data-testid="settings-snapshot-list"]')).toBeVisible();
  await expect(page.locator('[data-testid="settings-snapshot-now-btn"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/snap-01-section.png' });
});

test('snapshot list is empty before any snapshot is taken', async () => {
  await expect(page.locator('[data-testid="settings-snapshot-empty"]')).toBeVisible();
});

// ── Manual snapshot ───────────────────────────────────────────────────────────

test('snapshot now button creates a snapshot and it appears in the list', async () => {
  await page.click('[data-testid="settings-snapshot-now-btn"]');
  // Button temporarily shows "Saving…" then reloads the section
  await expect(page.locator('[data-testid="settings-snapshot-row"]')).toBeVisible({ timeout: 10_000 });
  // Empty state should be gone
  await expect(page.locator('[data-testid="settings-snapshot-empty"]')).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/snap-02-snapshot-taken.png' });
});

test('snapshot row shows label and a restore button', async () => {
  const row = page.locator('[data-testid="settings-snapshot-row"]').first();
  await expect(row).toContainText('Manual');
  await expect(row.locator('[data-testid="settings-snapshot-restore-btn"]')).toBeVisible();
});

// ── Restore roundtrip ─────────────────────────────────────────────────────────

test('adds a household member that will be captured in a second snapshot', async () => {
  await navigateTo(page, 'settings');
  await page.click('[data-testid="settings-add-member-btn"]');
  await expect(page.locator('[data-testid="settings-add-member-form"]')).toBeVisible();
  await page.fill('[data-testid="settings-member-name-input"]', 'Snapshot Test Member');
  await page.click('[data-testid="settings-member-confirm"]');
  await expect(
    page.locator('[data-testid="settings-member-row"]').filter({ hasText: 'Snapshot Test Member' }),
  ).toBeVisible({ timeout: 8_000 });
  await page.screenshot({ path: 'tests/screenshots/snap-03-member-added.png' });
});

test('takes a second snapshot that captures the new member', async () => {
  await page.click('[data-testid="settings-snapshot-now-btn"]');
  // Wait until we see at least 2 snapshot rows (the first one + this new one)
  await expect(page.locator('[data-testid="settings-snapshot-row"]')).toHaveCount(2, { timeout: 10_000 });
  await page.screenshot({ path: 'tests/screenshots/snap-04-second-snapshot.png' });
});

test('deletes the member so we can verify restore brings it back', async () => {
  page.once('dialog', (d) => d.accept());
  const memberRow = page.locator('[data-testid="settings-member-row"]').filter({ hasText: 'Snapshot Test Member' });
  await memberRow.locator('[data-testid="settings-member-remove"]').click();
  await expect(memberRow).not.toBeVisible({ timeout: 6_000 });
  await page.screenshot({ path: 'tests/screenshots/snap-05-member-deleted.png' });
});

test('restoring the snapshot brings back the deleted member', async () => {
  // The newest (top) snapshot row was taken while the member existed — restore it.
  const restoreBtn = page.locator('[data-testid="settings-snapshot-restore-btn"]').first();
  await expect(restoreBtn).toBeVisible();

  // Intercept the confirm dialog (Playwright auto-accepts by default, but we use once() to be explicit)
  page.once('dialog', (d) => d.accept());
  await restoreBtn.click();

  // After restore the app reloads → lands on /unlock (vault key cleared from memory)
  await expect(page.locator('[data-testid="unlock-key-textarea"]')).toBeVisible({ timeout: 20_000 });
  await page.fill('[data-testid="unlock-key-textarea"]', privateKey);
  await page.fill('#unlock-pass', TEST_PASSPHRASE);
  await page.click('#unlock-btn');

  await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: 'tests/screenshots/snap-06-after-restore-unlock.png' });

  await navigateTo(page, 'settings');

  // "Snapshot Test Member" should be back
  await expect(
    page.locator('[data-testid="settings-member-row"]').filter({ hasText: 'Snapshot Test Member' }),
  ).toBeVisible({ timeout: 8_000 });
  await page.screenshot({ path: 'tests/screenshots/snap-07-member-restored.png' });
});

// ── Delete snapshot ───────────────────────────────────────────────────────────

test('deleting a snapshot removes it from the list', async () => {
  const initialCount = await page.locator('[data-testid="settings-snapshot-row"]').count();
  expect(initialCount).toBeGreaterThan(0);

  await page.locator('[data-testid="settings-snapshot-delete-btn"]').last().click();

  await expect(page.locator('[data-testid="settings-snapshot-row"]')).toHaveCount(
    initialCount - 1,
    { timeout: 8_000 },
  );
  await page.screenshot({ path: 'tests/screenshots/snap-08-snapshot-deleted.png' });
});
