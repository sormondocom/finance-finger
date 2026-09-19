/**
 * E2E tests for the Help page.
 *
 * Verifies:
 *   - Page loads with Help heading
 *   - All section tabs are present
 *   - Default "Setup & Security" section is active
 *   - The "?" context buttons on other pages deeplink into the correct section
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
  await navigateTo(page, 'help');
});

test.afterAll(async () => {
  await cleanup();
});

test('help page loads with Help heading', async () => {
  await expect(page.locator('h1')).toContainText('Help');
});

test('all section tabs are visible', async () => {
  await expect(page.locator('[data-testid="help-tab-setup"]')).toBeVisible();
  await expect(page.locator('[data-testid="help-tab-dashboard"]')).toBeVisible();
  await expect(page.locator('[data-testid="help-tab-income"]')).toBeVisible();
  await expect(page.locator('[data-testid="help-tab-accounts"]')).toBeVisible();
  await expect(page.locator('[data-testid="help-tab-expenses"]')).toBeVisible();
  await expect(page.locator('[data-testid="help-tab-debt"]')).toBeVisible();
  await expect(page.locator('[data-testid="help-tab-budget"]')).toBeVisible();
  await expect(page.locator('[data-testid="help-tab-reports"]')).toBeVisible();
});

test('Setup & Security section is active by default', async () => {
  await expect(page.locator('[data-testid="help-tab-setup"]')).toHaveClass(/active/);
  await expect(page.locator('#help-grid')).not.toBeEmpty();
});

// ── Context-sensitive deeplink from "?" buttons ───────────────────────────────

test('? button on Income page navigates to Help with Income section active', async () => {
  await navigateTo(page, 'income');
  await page.click('[data-testid="help-btn-income"]');
  await expect(page.locator('h1')).toContainText('Help', { timeout: 8_000 });
  await expect(page.locator('[data-testid="help-tab-income"]')).toHaveClass(/active/, { timeout: 5_000 });
  await expect(page.locator('#help-grid')).toContainText('Income Sources');
});
