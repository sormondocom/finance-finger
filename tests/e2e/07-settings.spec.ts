/**
 * Settings page E2E tests.
 *
 * Covers: household name update (reflected on dashboard), member add/remove
 * flows. Mascot section and theme toggles are present but limited to existence
 * checks since they rely on browser.storage.local config that the wizard seeds.
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

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
  await navigateTo(page, 'settings');
});

test.afterAll(async () => {
  await cleanup();
});

// ── Page structure ────────────────────────────────────────────────────────────

test('settings page renders household section', async () => {
  await expect(page.locator('h1')).toContainText('Settings');
  await expect(page.locator('[data-testid="settings-profile-name-input"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/settings-01-page.png' });
});

test('household name input shows current value', async () => {
  const input = page.locator('[data-testid="settings-profile-name-input"]');
  await expect(input).toBeVisible();
  // Setup wizard sets a household name
  const value = await input.inputValue();
  expect(value.length).toBeGreaterThan(0);
});

// ── Household name update ─────────────────────────────────────────────────────

test('can update household name', async () => {
  await page.fill('[data-testid="settings-profile-name-input"]', 'Test Family');
  await page.click('[data-testid="settings-profile-name-save"]');
  // Toast appears briefly; input retains new value
  await expect(page.locator('[data-testid="settings-profile-name-input"]')).toHaveValue('Test Family');
  await page.screenshot({ path: 'tests/screenshots/settings-02-name-updated.png' });
});

test('updated household name appears on dashboard', async () => {
  await navigateTo(page, 'dashboard');
  await expect(page.locator('.dashboard-title')).toContainText('Test Family');
  await navigateTo(page, 'settings');
});

// ── Members list ──────────────────────────────────────────────────────────────

test('members list is visible', async () => {
  await expect(page.locator('[data-testid="settings-members-list"]')).toBeVisible();
});

test('add-member button is visible', async () => {
  await expect(page.locator('[data-testid="settings-add-member-btn"]')).toBeVisible();
});

// ── Add member ────────────────────────────────────────────────────────────────

test('clicking add-member reveals the add form', async () => {
  await page.click('[data-testid="settings-add-member-btn"]');
  await expect(page.locator('[data-testid="settings-add-member-form"]')).toBeVisible();
  await expect(page.locator('[data-testid="settings-member-name-input"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/settings-03-add-form.png' });
});

test('can type a member name', async () => {
  await page.fill('[data-testid="settings-member-name-input"]', 'Alice');
  await expect(page.locator('[data-testid="settings-member-name-input"]')).toHaveValue('Alice');
});

test('selecting member type buttons is interactive', async () => {
  // Adult Female type button
  await page.click('[data-testid="settings-member-type-female"]');
  // Just check button is visible and clickable (styling change is cosmetic)
  await expect(page.locator('[data-testid="settings-member-type-female"]')).toBeVisible();
});

test('confirming add saves the member and shows them in the list', async () => {
  await page.click('[data-testid="settings-member-confirm"]');
  // Form hides, member appears in roster
  await expect(page.locator('[data-testid="settings-add-member-form"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="settings-member-row"]').filter({ hasText: 'Alice' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/settings-04-member-added.png' });
});

test('add-member button reappears after adding', async () => {
  await expect(page.locator('[data-testid="settings-add-member-btn"]')).toBeVisible();
});

test('added member shows remove button', async () => {
  const row = page.locator('[data-testid="settings-member-row"]').filter({ hasText: 'Alice' });
  await expect(row.locator('[data-testid="settings-member-remove"]')).toBeVisible();
});

// ── Cancel add ────────────────────────────────────────────────────────────────

test('cancel on add form hides the form without adding', async () => {
  const countBefore = await page.locator('[data-testid="settings-member-row"]').count();

  await page.click('[data-testid="settings-add-member-btn"]');
  await page.fill('[data-testid="settings-member-name-input"]', 'Ghost Member');
  await page.click('[data-testid="settings-member-cancel"]');

  await expect(page.locator('[data-testid="settings-add-member-form"]')).not.toBeVisible();
  const countAfter = await page.locator('[data-testid="settings-member-row"]').count();
  expect(countAfter).toBe(countBefore);
});

// ── Remove member ─────────────────────────────────────────────────────────────

test('can remove a member', async () => {
  // Use dialog auto-accept
  page.once('dialog', (dialog) => dialog.accept());
  const row = page.locator('[data-testid="settings-member-row"]').filter({ hasText: 'Alice' });
  await row.locator('[data-testid="settings-member-remove"]').click();

  await expect(page.locator('[data-testid="settings-member-row"]').filter({ hasText: 'Alice' })).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/settings-05-member-removed.png' });
});
