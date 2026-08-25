/**
 * Form validation + keyboard-submit E2E tests.
 *
 * Covers three cross-cutting behaviors added across all modal forms:
 *
 *   1. Enter on the LAST visible text/number field submits the form.
 *      — Category: last field is the budget number input.
 *      — Expense:  last visible text/number is the amount field.
 *      — Income:   last visible text/number is the amount field.
 *
 *   2. Enter on a NON-last field does NOT submit (modal stays open).
 *      — Category name (text) is followed by budget (number), so Enter
 *        there should be a no-op.
 *
 *   3. Submitting with multiple required fields missing lists every
 *      missing field name in a single error message.
 *
 *   4. Category names are unique case-insensitively; the error echoes
 *      back the existing entry's casing.
 *
 * State built cumulatively in this suite:
 *   1. Setup wizard → dashboard
 *   2. Income page: add member 'Jordan'
 *   3. Expenses page: add category 'Baseline' (needed so the expense
 *      form can be opened — it only shows when ≥1 category exists)
 *   4. Debt page: add card account 'Test Card' (needed for charge-form
 *      multi-field test)
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

const today = new Date().toISOString().split('T')[0]!;

test.beforeAll(async () => {
  const ext = await launchExtensionContext();
  context   = ext.context;
  cleanup   = ext.cleanup;
  page      = await context.newPage();
  await page.goto(ext.extUrl);
  await completeSetupWizard(page);
});

test.afterAll(async () => {
  await cleanup();
});

// ── Setup ─────────────────────────────────────────────────────────────────────

test('set up: add household member for income form tests', async () => {
  await navigateTo(page, 'income');
  await page.fill('[data-testid="add-member-input"]', 'Jordan');
  await page.click('[data-testid="add-member-btn"]');
  await expect(
    page.locator('[data-testid="member-chip"]').filter({ hasText: 'Jordan' }),
  ).toBeVisible();
});

test('set up: add Baseline category so the expense form button appears', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'Baseline');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(
    page.locator('[data-testid="category-pill"]').filter({ hasText: 'Baseline' }),
  ).toBeVisible();
});

test('set up: add Test Card debt account for charge-form tests', async () => {
  await navigateTo(page, 'debt');
  await page.click('[data-testid="add-debt-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#da-name', 'Test Card');
  await page.fill('#da-balance', '1000');
  await page.fill('#da-apr', '19.99');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(
    page.locator('[data-testid="debt-row"]').filter({ hasText: 'Test Card' }),
  ).toBeVisible();
});

// ── Enter key: category form ──────────────────────────────────────────────────

test('Enter on category name (not last field) does NOT submit — budget input follows it', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#cat-name', 'Keyboard Escape');
  await page.press('#cat-name', 'Enter');

  // Budget number field follows name, so Enter on name is a no-op
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.click('[data-testid="modal-cancel"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('Enter on category budget (last field) submits the form', async () => {
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#cat-name', 'Budget Enter');
  await page.fill('#cat-budget', '200');
  await page.press('#cat-budget', 'Enter');

  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(
    page.locator('[data-testid="category-pill"]').filter({ hasText: 'Budget Enter' }),
  ).toBeVisible();
});

// ── Enter key: expense form ───────────────────────────────────────────────────

test('Enter on expense amount (last visible text/number field) submits the form', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ef-desc', 'Keyboard Expense');
  await page.fill('#ef-amount', '42');
  await page.fill('#ef-date', today);
  // ef-amount is the last visible text/number input (date/select/checkbox follow)
  await page.press('#ef-amount', 'Enter');

  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Enter key: income source form ─────────────────────────────────────────────

test('Enter on income amount (last visible text/number field) submits the form', async () => {
  await navigateTo(page, 'income');
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#sf-name', 'Keyboard Income');
  await page.fill('#sf-amount', '2500');
  // sf-amount is the last visible text/number input for monthly frequency;
  // sf-payday (date) and sf-active (checkbox) follow but are not in TEXT_TYPES
  await page.press('#sf-amount', 'Enter');

  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(
    page.locator('[data-testid="source-row"]').filter({ hasText: 'Keyboard Income' }),
  ).toBeVisible();
});

// ── Multi-field validation: all missing fields listed together ────────────────

test('category form: single missing field shows a singular required message', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.click('[data-testid="modal-submit"]'); // name is empty
  await expect(page.locator('#cat-error')).toBeVisible();
  await expect(page.locator('#cat-error')).toContainText('Category name is required.');

  await page.click('[data-testid="modal-cancel"]');
});

test('income source form: two missing required fields are both named in the error', async () => {
  await navigateTo(page, 'income');
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // Leave name and amount blank
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('#sf-error')).toBeVisible();
  await expect(page.locator('#sf-error')).toContainText('Source name');
  await expect(page.locator('#sf-error')).toContainText('Amount');

  await page.click('[data-testid="modal-cancel"]');
});

test('expense form: three missing required fields are all named in the error', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // ef-date defaults to today, so clear it to make all three fields missing
  await page.fill('#ef-date', '');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('#ef-error')).toBeVisible();
  await expect(page.locator('#ef-error')).toContainText('Description');
  await expect(page.locator('#ef-error')).toContainText('Amount');
  await expect(page.locator('#ef-error')).toContainText('Date');

  await page.click('[data-testid="modal-cancel"]');
});

test('debt charge form: three missing required fields are all named in the error', async () => {
  await navigateTo(page, 'debt');
  const cardRow  = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Test Card' });
  const cardWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Test Card' });

  // Open charges panel
  await cardRow.locator('[data-testid="debt-charges-btn"]').click();
  await expect(cardWrap.locator('.charges-panel')).toBeVisible();

  // Open add-charge modal
  await cardWrap.locator('button', { hasText: '+ Add charge' }).click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // Clear the pre-filled date so all three fields are missing
  await page.fill('#ch-date', '');
  await page.click('[data-testid="modal-submit"]');

  await expect(page.locator('#ch-error')).toBeVisible();
  await expect(page.locator('#ch-error')).toContainText('Merchant / Vendor');
  await expect(page.locator('#ch-error')).toContainText('Amount');
  await expect(page.locator('#ch-error')).toContainText('Date');

  await page.click('[data-testid="modal-cancel"]');
});

// ── Duplicate category name (case-insensitive) ────────────────────────────────

test('set up: add Groceries category for duplicate-name tests', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'Groceries');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(
    page.locator('[data-testid="category-pill"]').filter({ hasText: 'Groceries' }),
  ).toBeVisible();
});

test('duplicate category name (same case) is rejected with a clear error', async () => {
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#cat-name', 'Groceries');
  await page.click('[data-testid="modal-submit"]');

  await expect(page.locator('#cat-error')).toBeVisible();
  await expect(page.locator('#cat-error')).toContainText('Groceries');
  await expect(page.locator('#cat-error')).toContainText('already exists');

  await page.click('[data-testid="modal-cancel"]');
});

test('duplicate category name (all lowercase) is rejected — error echoes original casing', async () => {
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#cat-name', 'groceries');
  await page.click('[data-testid="modal-submit"]');

  await expect(page.locator('#cat-error')).toBeVisible();
  // Error should echo the existing name's casing ("Groceries"), not the typed casing
  await expect(page.locator('#cat-error')).toContainText('Groceries');
  await expect(page.locator('#cat-error')).toContainText('already exists');

  await page.click('[data-testid="modal-cancel"]');
});

test('duplicate category name (all uppercase) is rejected — error echoes original casing', async () => {
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#cat-name', 'GROCERIES');
  await page.click('[data-testid="modal-submit"]');

  await expect(page.locator('#cat-error')).toBeVisible();
  await expect(page.locator('#cat-error')).toContainText('Groceries');
  await expect(page.locator('#cat-error')).toContainText('already exists');

  await page.click('[data-testid="modal-cancel"]');
});

test('a genuinely new category name is accepted after duplicates were rejected', async () => {
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#cat-name', 'Produce'); // different from Groceries
  await page.click('[data-testid="modal-submit"]');

  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(
    page.locator('[data-testid="category-pill"]').filter({ hasText: 'Produce' }),
  ).toBeVisible();
});
