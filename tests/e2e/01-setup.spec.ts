/**
 * Setup wizard E2E tests.
 *
 * Covers: key generation, mascot selection, profile creation, household member add,
 * and final "Enter Financial Finger" transition to the dashboard.
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import {
  TEST_KEY_NAME,
  TEST_KEY_EMAIL,
  TEST_PASSPHRASE,
  TEST_HOUSEHOLD,
} from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let extUrl: string;
let cleanup: () => Promise<void>;

test.beforeAll(async () => {
  const ext = await launchExtensionContext();
  context = ext.context;
  extUrl = ext.extUrl;
  cleanup = ext.cleanup;
  page = await context.newPage();
  await page.goto(extUrl);
});

test.afterAll(async () => {
  await cleanup();
});

test('shows welcome step on first launch', async () => {
  await expect(page.locator('[data-testid="setup-step-dot"]').first()).toBeVisible();
  await expect(page.locator('[data-testid="setup-next"]')).toBeVisible();
  await expect(page).toHaveTitle(/Financial Finger/i);
  await page.screenshot({ path: 'tests/screenshots/01-welcome.png' });
});

test('advances to mascot step', async () => {
  await page.click('[data-testid="setup-next"]');
  await expect(page.locator('[data-testid="mascot-option-buck"]')).toBeVisible();
  await expect(page.locator('[data-testid="mascot-option-penny"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/02-mascot.png' });
});

test('selects Penny mascot then switches back to Buck', async () => {
  await page.click('[data-testid="mascot-option-penny"]');
  await expect(page.locator('[data-testid="mascot-option-penny"]')).toHaveClass(/selected/);
  await page.click('[data-testid="mascot-option-buck"]');
  await expect(page.locator('[data-testid="mascot-option-buck"]')).toHaveClass(/selected/);
});

test('advances to key generation step', async () => {
  await page.click('[data-testid="setup-next"]');
  await expect(page.locator('[data-testid="tab-generate"]')).toBeVisible();
  await expect(page.locator('[data-testid="tab-import"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/03-keys.png' });
});

test('generates a key pair', async () => {
  await page.fill('#key-name', TEST_KEY_NAME);
  await page.fill('#key-email', TEST_KEY_EMAIL);
  await page.fill('#key-pass', TEST_PASSPHRASE);
  await page.click('[data-testid="setup-next"]');

  // Key generation — allow up to 30 s; save button appears when done
  await expect(page.locator('[data-testid="save-private-key"]')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: 'tests/screenshots/04-save-key.png' });
});

test('copies private key to clipboard', async () => {
  // Firefox extension pages already have clipboard access after a user gesture;
  // grantPermissions does not accept clipboard-read/write on Firefox.
  if (context.browser()?.browserType().name() !== 'firefox') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  }
  await page.click('[data-testid="copy-private-key"]');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('-----BEGIN PGP PRIVATE KEY BLOCK-----');
});

test('advances past save-key step', async () => {
  // Download the private key first — this enables the continue button
  await page.click('[data-testid="save-private-key"]');
  await page.click('[data-testid="setup-next"]');
  await expect(page.locator('#profile-name')).toBeVisible();
});

test('requires a household name', async () => {
  // Leave it blank and try to advance
  await page.fill('#profile-name', '');
  await page.click('[data-testid="setup-next"]');
  await expect(page.locator('.form-error')).toBeVisible();
});

test('fills profile and finalizes setup', async () => {
  await page.fill('#profile-name', TEST_HOUSEHOLD);
  await page.click('[data-testid="setup-next"]');
  await expect(page.locator('[data-testid="setup-enter-app"]')).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: 'tests/screenshots/05-done.png' });
});

test('adds a household member on the done screen', async () => {
  await page.click('[data-testid="setup-add-person"]');
  await page.fill('#adder-name', 'Daisy');
  await page.click('[data-testid="adder-confirm"]');
  await expect(page.locator('[data-testid="member-card"][data-member-name="Daisy"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/05b-member-added.png' });
});

test('enters the app and lands on dashboard', async () => {
  await page.click('[data-testid="setup-enter-app"]');
  await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/06-dashboard.png' });
});
