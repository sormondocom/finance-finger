/**
 * E2E tests for the Help page.
 *
 * Verifies:
 *   - Page loads with Help heading
 *   - All section tabs are present
 *   - Default "Setup & Security" section content renders
 *   - Switching sections renders the correct content
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

test('Setup & Security section is active by default and shows setup content', async () => {
  await expect(page.locator('[data-testid="help-tab-setup"]')).toHaveClass(/active/);
  const grid = page.locator('#help-grid');
  await expect(grid).toContainText('Six-Step Setup Wizard');
  await expect(grid).toContainText('PGP Key Pair');
});

test('clicking the Income tab shows income content', async () => {
  await page.click('[data-testid="help-tab-income"]');
  const grid = page.locator('#help-grid');
  await expect(grid).toContainText('Household Members');
  await expect(grid).toContainText('Income Sources');
  await expect(page.locator('[data-testid="help-tab-income"]')).toHaveClass(/active/);
});

test('clicking the Expenses & Bills tab shows expense content', async () => {
  await page.click('[data-testid="help-tab-expenses"]');
  const grid = page.locator('#help-grid');
  await expect(grid).toContainText('Expense Categories');
  await expect(grid).toContainText('Bill Tracking');
});

test('clicking the Debt tab shows debt content', async () => {
  await page.click('[data-testid="help-tab-debt"]');
  const grid = page.locator('#help-grid');
  // Debt section should have content relevant to debt management
  await expect(grid).toBeVisible();
  await expect(grid).not.toBeEmpty();
});

test('clicking the Dashboard tab shows dashboard content', async () => {
  await page.click('[data-testid="help-tab-dashboard"]');
  const grid = page.locator('#help-grid');
  await expect(grid).toContainText('Summary Cards');
});

// ── Context-sensitive deeplink from "?" buttons ───────────────────────────────

test('? button on Income page navigates to Help with Income section active', async () => {
  await navigateTo(page, 'income');
  // The "?" help button is in the page heading
  await page.click('button[title*="help"], button[aria-label*="help"], button.help-btn, [data-testid="help-btn"]', { timeout: 5_000 }).catch(async () => {
    // Fallback: click the button with "?" text near the heading
    await page.locator('button').filter({ hasText: '?' }).first().click();
  });
  // Should land on Help page with Income section
  await expect(page.locator('h1')).toContainText('Help', { timeout: 8_000 });
  await expect(page.locator('[data-testid="help-tab-income"]')).toHaveClass(/active/, { timeout: 5_000 });
  await expect(page.locator('#help-grid')).toContainText('Income Sources');
});
