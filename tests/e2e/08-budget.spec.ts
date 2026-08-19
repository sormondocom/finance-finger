/**
 * Budget page E2E tests.
 *
 * The budget page shows monthly income vs recurring expenses with a donut
 * chart, category breakdown, and cash-flow bars.  Tests build state
 * cumulatively: start with empty state, add income, then add a recurring
 * expense, and verify the computed stats at each step.
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
  await navigateTo(page, 'budget');
});

test.afterAll(async () => {
  await cleanup();
});

// ── Empty state ───────────────────────────────────────────────────────────────

test('budget page shows empty state when no income or expenses exist', async () => {
  await expect(page.locator('[data-testid="budget-empty"]')).toBeVisible();
  await expect(page.locator('h1')).toContainText('Budget Overview');
  await page.screenshot({ path: 'tests/screenshots/budget-01-empty.png' });
});

// ── After adding income ───────────────────────────────────────────────────────

test('set up: add a monthly income source', async () => {
  await navigateTo(page, 'income');

  // Add a household member inline (no modal — fill input + click button)
  await page.fill('[data-testid="add-member-input"]', 'Jordan');
  await page.click('[data-testid="add-member-btn"]');
  await expect(page.locator('[data-testid="member-chip"]').filter({ hasText: 'Jordan' })).toBeVisible();

  // Add income source via modal
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#sf-name', 'Salary');
  await page.fill('#sf-amount', '5000');
  // Frequency defaults to monthly — leave it

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Salary' })).toBeVisible();
});

test('budget summary shows income after adding a source', async () => {
  await navigateTo(page, 'budget');

  await expect(page.locator('[data-testid="budget-summary"]')).toBeVisible();
  await expect(page.locator('[data-testid="budget-income-value"]')).toContainText('$5,000');
  await expect(page.locator('[data-testid="budget-expenses-value"]')).toContainText('—');
  await page.screenshot({ path: 'tests/screenshots/budget-02-income-only.png' });
});

test('surplus stat shows full income when no expenses', async () => {
  await expect(page.locator('[data-testid="budget-stat-surplus"]')).toContainText('Surplus');
  await expect(page.locator('[data-testid="budget-surplus-value"]')).toContainText('$5,000');
});

test('cash flow card is visible when income exists', async () => {
  await expect(page.locator('[data-testid="budget-cashflow-card"]')).toBeVisible();
});

// ── After adding a recurring expense ─────────────────────────────────────────

test('set up: add a recurring expense with a category', async () => {
  await navigateTo(page, 'expenses');

  // Add a category
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'Housing');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="category-pill"]').filter({ hasText: 'Housing' })).toBeVisible();

  // Add recurring expense
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#ef-desc', 'Rent');
  await page.fill('#ef-amount', '1500');
  await page.selectOption('#ef-cat', { label: 'Housing' });
  await page.check('#ef-recurring');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Rent' })).toBeVisible();
});

test('budget summary shows expenses after adding a recurring expense', async () => {
  await navigateTo(page, 'budget');

  await expect(page.locator('[data-testid="budget-expenses-value"]')).toContainText('$1,500');
  await page.screenshot({ path: 'tests/screenshots/budget-03-with-expense.png' });
});

test('surplus is income minus expenses', async () => {
  await expect(page.locator('[data-testid="budget-stat-surplus"]')).toContainText('Surplus');
  await expect(page.locator('[data-testid="budget-surplus-value"]')).toContainText('$3,500');
});

test('category breakdown card is visible with at least one row', async () => {
  await expect(page.locator('[data-testid="budget-breakdown-card"]')).toBeVisible();
  await expect(page.locator('[data-testid="budget-breakdown-row"]')).toBeVisible();
  await expect(page.locator('[data-testid="budget-breakdown-row"]')).toContainText('Housing');
});

test('donut chart card is visible', async () => {
  await expect(page.locator('[data-testid="budget-chart-card"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/budget-04-with-chart.png' });
});

test('cash flow card shows income, expenses, and surplus bars', async () => {
  const cashflow = page.locator('[data-testid="budget-cashflow-card"]');
  await expect(cashflow).toBeVisible();
  await expect(cashflow).toContainText('Income');
  await expect(cashflow).toContainText('Expenses');
  await expect(cashflow).toContainText('Surplus');
});
