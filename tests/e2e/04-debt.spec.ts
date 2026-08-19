/**
 * Debt page E2E tests.
 *
 * Covers: credit card, mortgage, medical, and loan debt types; add/edit/delete;
 * payoff strategy tabs; debt total display.
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
  await navigateTo(page, 'debt');
});

test.afterAll(async () => {
  await cleanup();
});

test('debt page loads with add button', async () => {
  await expect(page.locator('[data-testid="add-debt-btn"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/debt-01-landing.png' });
});

test('adds a credit card debt', async () => {
  await page.click('[data-testid="add-debt-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // Type defaults to 'card' — leave it
  await page.fill('#da-name', 'Visa Platinum');
  await page.fill('#da-balance', '4500');
  await page.fill('#da-apr', '22.99');
  await page.fill('#da-limit', '6000');

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="debt-row"]').filter({ hasText: 'Visa Platinum' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/debt-02-card-added.png' });
});

test('adds a mortgage', async () => {
  await page.click('[data-testid="add-debt-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.selectOption('#da-type', 'mortgage');
  await page.fill('#da-name', 'Home Mortgage');
  await page.fill('#da-balance', '285000');
  await page.fill('#da-apr', '6.75');
  await page.fill('#da-original', '320000');
  await page.fill('#da-term', '360');

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="debt-row"]').filter({ hasText: 'Home Mortgage' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/debt-03-mortgage-added.png' });
});

test('adds a medical debt', async () => {
  await page.click('[data-testid="add-debt-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.selectOption('#da-type', 'medical');
  await page.fill('#da-name', 'ER Bill');
  await page.fill('#da-balance', '2100');
  // Medical allows 0% APR
  await page.fill('#da-apr', '0');
  await page.fill('#da-payment-fixed', '150');

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="debt-row"]').filter({ hasText: 'ER Bill' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/debt-04-medical-added.png' });
});

test('adds an auto loan', async () => {
  await page.click('[data-testid="add-debt-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.selectOption('#da-type', 'loan');
  await page.fill('#da-name', 'Car Loan');
  await page.fill('#da-balance', '18500');
  await page.fill('#da-apr', '7.25');
  await page.fill('#da-original', '22000');
  await page.fill('#da-term', '60');

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="debt-row"]').filter({ hasText: 'Car Loan' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/debt-05-loan-added.png' });
});

test('debt total reflects all accounts', async () => {
  const total = await page.locator('[data-testid="debt-total-value"]').innerText();
  // 4500 + 285000 + 2100 + 18500 = 310100
  expect(total).toMatch(/\$310,100/);
});

test('edits the credit card', async () => {
  const row = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Visa Platinum' });
  await row.locator('[data-testid="debt-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // Type should be disabled in edit mode
  const typeSelect = page.locator('#da-type');
  await expect(typeSelect).toBeDisabled();

  await page.fill('#da-balance', '4200');
  await page.fill('#da-min-value', '25');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/debt-06-edited.png' });
});

test('strategy tabs are visible', async () => {
  await expect(page.locator('[data-testid="strategy-tab"]').first()).toBeVisible();
  const tabs = await page.locator('[data-testid="strategy-tab"]').all();
  expect(tabs.length).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: 'tests/screenshots/debt-07-strategy-tabs.png' });
});

test('switches payoff strategy to avalanche', async () => {
  await page.click('[data-testid="strategy-tab"][data-strategy="avalanche"]');
  const active = page.locator('[data-testid="strategy-tab"][data-strategy="avalanche"]');
  await expect(active).toHaveClass(/active/);
});

test('deletes the medical debt', async () => {
  page.once('dialog', (d) => d.accept());
  const row = page.locator('[data-testid="debt-row"]').filter({ hasText: 'ER Bill' });
  await row.locator('[data-testid="debt-delete"]').click();
  await expect(row).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/debt-08-deleted.png' });
});
