/**
 * E2E tests for the Insights / "Learn" page.
 *
 * Verifies:
 *   - Page loads with the Education heading
 *   - All five topic tabs are present
 *   - The default "Debt Basics" tab is active and shows debt content
 *   - Switching tabs renders different content
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
  const debtTab = page.locator('[data-testid="insights-tab-debt"]');
  await expect(debtTab).toHaveClass(/active/);
});

test('debt content cards are shown by default (APR, Minimum Payment, Avalanche)', async () => {
  const grid = page.locator('#insights-grid');
  await expect(grid).toContainText('What is APR?');
  await expect(grid).toContainText('Minimum Payment Trap');
  await expect(grid).toContainText('Avalanche vs. Snowball');
});

test('clicking Budgeting tab shows budgeting content', async () => {
  await page.click('[data-testid="insights-tab-budgeting"]');
  const grid = page.locator('#insights-grid');
  await expect(grid).toContainText('50/30/20');
  await expect(grid).toContainText('Emergency Fund');
});

test('Budgeting tab is now active and Debt tab is no longer active', async () => {
  await expect(page.locator('[data-testid="insights-tab-budgeting"]')).toHaveClass(/active/);
  await expect(page.locator('[data-testid="insights-tab-debt"]')).not.toHaveClass(/active/);
});

test('clicking Credit tab shows credit content', async () => {
  await page.click('[data-testid="insights-tab-credit"]');
  const grid = page.locator('#insights-grid');
  await expect(grid).toContainText('Credit Utilization');
  await expect(grid).toContainText('Credit Score');
});

test('clicking Saving & Investing tab shows savings content', async () => {
  await page.click('[data-testid="insights-tab-savings"]');
  const grid = page.locator('#insights-grid');
  await expect(grid).toContainText('Compound Interest');
});

test('clicking Privacy & Security tab shows security content', async () => {
  await page.click('[data-testid="insights-tab-security"]');
  const grid = page.locator('#insights-grid');
  await expect(grid).toContainText('Public & Private Keys');
  await expect(grid).toContainText('Financial Finger');
});

test('clicking back to Debt Basics restores debt content', async () => {
  await page.click('[data-testid="insights-tab-debt"]');
  await expect(page.locator('#insights-grid')).toContainText('What is APR?');
  await expect(page.locator('[data-testid="insights-tab-debt"]')).toHaveClass(/active/);
});
