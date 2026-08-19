/**
 * Expenses page E2E tests.
 *
 * Covers: category management, expense CRUD, filter by category/type, monthly total.
 *
 * Field IDs in the expense form use the "ef-" prefix (ef-desc, ef-amount, ef-cat, etc.).
 * New expenses default to one-time (recurring checkbox is unchecked); check #ef-recurring
 * to make an expense recurring.
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
  await navigateTo(page, 'expenses');
});

test.afterAll(async () => {
  await cleanup();
});

test('expenses page loads', async () => {
  await expect(page.locator('[data-testid="add-expense-btn"]')).toBeVisible();
  await expect(page.locator('[data-testid="add-category-btn"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/expenses-01-landing.png' });
});

test('adds a category', async () => {
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'Groceries');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="category-pill"]').filter({ hasText: 'Groceries' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/expenses-02-category-added.png' });
});

test('adds a second category', async () => {
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'Utilities');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="category-pill"]').filter({ hasText: 'Utilities' })).toBeVisible();
});

test('adds a recurring expense', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ef-desc', 'Whole Foods Run');
  await page.fill('#ef-amount', '320');
  await page.selectOption('#ef-cat', { label: 'Groceries' });
  // Check recurring — new expenses default to one-time (unchecked)
  await page.check('#ef-recurring');

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Whole Foods Run' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/expenses-03-expense-added.png' });
});

test('adds a one-time expense', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ef-desc', 'New Fridge');
  await page.fill('#ef-amount', '850');
  await page.selectOption('#ef-cat', { label: 'Utilities' });
  // Leave recurring unchecked — new expenses are one-time by default

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'New Fridge' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/expenses-04-onetime-added.png' });
});

test('monthly total reflects recurring expenses only', async () => {
  const total = await page.locator('[data-testid="expenses-monthly-total"]').innerText();
  expect(total).toMatch(/\$320/);
});

test('filters by category', async () => {
  // Click the Groceries filter chip specifically
  await page.locator('[data-testid="filter-category"]').filter({ hasText: 'Groceries' }).click();
  const rows = page.locator('[data-testid="expense-row"]');
  await expect(rows.filter({ hasText: 'Whole Foods Run' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/expenses-05-filtered.png' });

  // Reset filter
  await page.click('[data-testid="filter-category-all"]');
});

test('edits an expense', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Whole Foods Run' });
  await row.locator('[data-testid="expense-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ef-amount', '350');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Whole Foods Run' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/expenses-06-edited.png' });
});

test('deletes an expense', async () => {
  page.once('dialog', (d) => d.accept());
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'New Fridge' });
  await row.locator('[data-testid="expense-delete"]').click();
  await expect(row).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/expenses-07-deleted.png' });
});

test('removes a category', async () => {
  page.once('dialog', (d) => d.accept());
  const pill = page.locator('[data-testid="category-pill"]').filter({ hasText: 'Utilities' });
  await pill.locator('[data-testid="category-remove"]').click();
  await expect(pill).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/expenses-08-category-removed.png' });
});
