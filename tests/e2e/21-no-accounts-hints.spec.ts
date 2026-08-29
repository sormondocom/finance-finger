/**
 * "No accounts" and "no credit cards" hint tests.
 *
 * Uses a fresh extension context with NO bank accounts and NO debt accounts
 * set up, so both the Income and Expense forms show hint text with navigation
 * links instead of dropdowns.
 *
 *  1.  Income source form: no dropdown — shows "No bank accounts set up yet."
 *  2.  Clicking that hint link navigates to the Accounts page.
 *  3.  Expense form: no bank-account dropdown — shows "No bank accounts set up yet."
 *  4.  Clicking the expense bank-account hint navigates to the Accounts page.
 *  5.  Expense form: no card dropdown — shows "No credit cards set up yet."
 *  6.  Clicking the expense card hint navigates to the Debt section.
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

// ── Fixture: a household member is needed before adding income sources ─────────

test('fixture: adds a household member so the income form is accessible', async () => {
  await navigateTo(page, 'income');
  await page.fill('[data-testid="add-member-input"]', 'Jordan');
  await page.click('[data-testid="add-member-btn"]');
  await expect(page.locator('[data-testid="member-chip"]').filter({ hasText: 'Jordan' })).toBeVisible();
});

// ── Income source form: no accounts ───────────────────────────────────────────

test('income source form shows "No bank accounts" hint when no accounts exist', async () => {
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // No dropdown — hint text should appear instead
  await expect(page.locator('[data-testid="sf-account-select"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="modal-dialog"]')).toContainText('No bank accounts set up yet');
  await page.screenshot({ path: 'tests/screenshots/hints-01-income-no-accounts.png' });
});

test('income form "No bank accounts" hint has an "Add one in Accounts" link', async () => {
  const link = page.locator('[data-testid="modal-dialog"]').locator('a', { hasText: 'Add one in Accounts' });
  await expect(link).toBeVisible();
});

test('clicking income form "No bank accounts" link closes the modal and navigates to Accounts', async () => {
  const link = page.locator('[data-testid="modal-dialog"]').locator('a', { hasText: 'Add one in Accounts' });
  await link.click();
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible({ timeout: 4000 });
  await expect(page.locator('h1')).toContainText('Bank Accounts');
  await page.screenshot({ path: 'tests/screenshots/hints-02-income-link-navigated.png' });
});

// ── Expense form: no bank accounts ────────────────────────────────────────────

test('expense form shows "No bank accounts" hint when no accounts exist', async () => {
  // Need at least one category to open the expense form
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'Bills');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await expect(page.locator('[data-testid="ef-bank-account-select"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="modal-dialog"]')).toContainText('No bank accounts set up yet');
  await page.screenshot({ path: 'tests/screenshots/hints-03-expense-no-accounts.png' });
});

test('expense form "No bank accounts" hint has an "Add one in Accounts" link', async () => {
  // The modal from the previous test is still open (we didn't close it)
  const link = page.locator('[data-testid="modal-dialog"]').locator('a', { hasText: 'Add one in Accounts' });
  await expect(link).toBeVisible();
});

test('clicking expense form "No bank accounts" link closes the modal and navigates to Accounts', async () => {
  const link = page.locator('[data-testid="modal-dialog"]').locator('a', { hasText: 'Add one in Accounts' });
  await link.click();
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible({ timeout: 4000 });
  await expect(page.locator('h1')).toContainText('Bank Accounts');
  await page.screenshot({ path: 'tests/screenshots/hints-04-expense-acct-link-navigated.png' });
});

// ── Expense form: no credit cards ─────────────────────────────────────────────

test('expense form shows "No credit cards" hint when no card debt accounts exist', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // No card account → dropdown is absent, hint with nav link appears
  await expect(page.locator('[data-testid="ef-card-select"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="modal-dialog"]')).toContainText('No credit cards set up yet');
  await page.screenshot({ path: 'tests/screenshots/hints-05-expense-no-cards.png' });
});

test('expense form "No credit cards" hint has an "Add one in the Debt section" link', async () => {
  const link = page.locator('[data-testid="modal-dialog"]').locator('a', { hasText: 'Add one in the Debt section' });
  await expect(link).toBeVisible();
});

test('clicking expense form "No credit cards" link closes the modal and navigates to Debt', async () => {
  const link = page.locator('[data-testid="modal-dialog"]').locator('a', { hasText: 'Add one in the Debt section' });
  await link.click();
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible({ timeout: 4000 });
  await expect(page.locator('h1')).toContainText('Debt');
  await page.screenshot({ path: 'tests/screenshots/hints-06-expense-card-link-navigated.png' });
});
