/**
 * E2E tests for the Insights / "Learn" page.
 *
 * Verifies:
 *   - Page loads with the Education heading
 *   - All five topic tabs are present
 *   - The default "Debt Basics" tab is active
 *   - Switching tabs updates the active state
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
  await navigateTo(page, 'insights');
});

test.afterAll(async () => {
  await cleanup();
});

test('insights page loads with Education heading', async () => {
  await expect(page.locator('h1')).toContainText('Education');
});

test('all five topic tabs are visible', async () => {
  await expect(page.locator('[data-testid="insights-tab-debt"]')).toBeVisible();
  await expect(page.locator('[data-testid="insights-tab-budgeting"]')).toBeVisible();
  await expect(page.locator('[data-testid="insights-tab-credit"]')).toBeVisible();
  await expect(page.locator('[data-testid="insights-tab-savings"]')).toBeVisible();
  await expect(page.locator('[data-testid="insights-tab-security"]')).toBeVisible();
});

test('Debt Basics tab is active by default', async () => {
  await expect(page.locator('[data-testid="insights-tab-debt"]')).toHaveClass(/active/);
});

test('clicking a different tab makes it active and deactivates Debt Basics', async () => {
  await page.click('[data-testid="insights-tab-budgeting"]');
  await expect(page.locator('[data-testid="insights-tab-budgeting"]')).toHaveClass(/active/);
  await expect(page.locator('[data-testid="insights-tab-debt"]')).not.toHaveClass(/active/);
});

test('clicking back to Debt Basics restores it as active', async () => {
  await page.click('[data-testid="insights-tab-debt"]');
  await expect(page.locator('[data-testid="insights-tab-debt"]')).toHaveClass(/active/);
  await expect(page.locator('[data-testid="insights-tab-budgeting"]')).not.toHaveClass(/active/);
});
