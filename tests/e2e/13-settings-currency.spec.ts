/**
 * Settings – Currency E2E tests.
 *
 * Verifies: the currency picker is visible on the Settings page,
 * changing the currency persists across navigation, and the new
 * symbol appears in money values rendered by the app.
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
});

test.afterAll(async () => {
  await cleanup();
});

// ── Seed: add income so we have a currency-formatted value to observe ──────────

test('adds monthly income to produce a formatted dollar amount', async () => {
  await navigateTo(page, 'income');
  // Add a household member first (required for income source)
  await page.fill('[data-testid="add-member-input"]', 'Pat');
  await page.click('[data-testid="add-member-btn"]');
  await expect(page.locator('[data-testid="member-chip"]').filter({ hasText: 'Pat' })).toBeVisible();

  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#sf-name', 'Salary');
  await page.fill('#sf-amount', '5000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Salary' })).toBeVisible();
});

test('dashboard shows income in USD by default', async () => {
  await navigateTo(page, 'dashboard');
  const incomeValue = page.locator('[data-testid="summary-value-income"]');
  await expect(incomeValue).toBeVisible();
  const text = await incomeValue.textContent();
  // USD formatting: "$5,000" (or similar — just check for $ and no €)
  expect(text).toMatch(/\$/);
  await page.screenshot({ path: 'tests/screenshots/currency-01-usd.png' });
});

// ── Currency picker ────────────────────────────────────────────────────────────

test('currency picker is visible on the Settings page', async () => {
  await navigateTo(page, 'settings');
  await expect(page.locator('[data-testid="currency-row"]')).toBeVisible();
  await expect(page.locator('[data-testid="currency-select"]')).toBeVisible();
  await expect(page.locator('[data-testid="currency-save"]')).toBeVisible();
});

test('currency-select defaults to USD', async () => {
  const select = page.locator('[data-testid="currency-select"]');
  const selected = await select.evaluate(
    (el: HTMLSelectElement) => el.value,
  );
  expect(selected).toBe('USD');
});

test('can change currency to EUR and save', async () => {
  await page.selectOption('[data-testid="currency-select"]', 'EUR');
  await page.click('[data-testid="currency-save"]');
  // Toast appears briefly — check its text
  await expect(page.locator('text=Currency set to EUR')).toBeVisible({ timeout: 3000 });
  await page.screenshot({ path: 'tests/screenshots/currency-02-saved.png' });
});

test('currency setting persists after navigating away and back', async () => {
  await navigateTo(page, 'dashboard');
  await navigateTo(page, 'settings');
  const select = page.locator('[data-testid="currency-select"]');
  const selected = await select.evaluate(
    (el: HTMLSelectElement) => el.value,
  );
  expect(selected).toBe('EUR');
});

test('dashboard shows income formatted with EUR symbol after currency change', async () => {
  await navigateTo(page, 'dashboard');
  const incomeValue = page.locator('[data-testid="summary-value-income"]');
  await expect(incomeValue).toBeVisible();
  const text = await incomeValue.textContent();
  // EUR formatting: "€5,000" (or locale equivalent — just check for € and no $)
  expect(text).toMatch(/€/);
  expect(text).not.toMatch(/\$/);
  await page.screenshot({ path: 'tests/screenshots/currency-03-eur.png' });
});

test('can switch back to USD', async () => {
  await navigateTo(page, 'settings');
  await page.selectOption('[data-testid="currency-select"]', 'USD');
  await page.click('[data-testid="currency-save"]');
  await expect(page.locator('text=Currency set to USD')).toBeVisible({ timeout: 3000 });

  await navigateTo(page, 'dashboard');
  const incomeValue = page.locator('[data-testid="summary-value-income"]');
  await expect(incomeValue).toBeVisible();
  const text = await incomeValue.textContent();
  expect(text).toMatch(/\$/);
});
