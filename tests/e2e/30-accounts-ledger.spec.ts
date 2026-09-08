/**
 * E2E tests for the Accounts page transaction ledger.
 *
 * Verifies that the ledger button on each account row toggles a panel
 * showing income deposits, expense paid records, and debt payments
 * linked to that account.
 *
 * Flow: create account → link income + expense + debt payment → open ledger → verify entries
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

// Retries disabled: cascade failures in tests 175+ are caused by test 157 retrying
// and leaving the accounts page in a corrupted state.
test.describe.configure({ retries: 0 });

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

const today = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

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

// ── Setup: bank account ────────────────────────────────────────────────────────

test('setup: add Test Checking bank account', async () => {
  await navigateTo(page, 'accounts');
  await page.click('[data-testid="add-account-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#ba-name', 'Test Checking');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' })).toBeVisible();
});

// ── Setup: income linked to account ───────────────────────────────────────────

test('setup: add monthly income source linked to Test Checking', async () => {
  await navigateTo(page, 'income');
  // Need a household member first
  await page.fill('[data-testid="add-member-input"]', 'Sam');
  await page.click('[data-testid="add-member-btn"]');

  // Add income source
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#sf-name', 'Monthly Salary');
  await page.fill('#sf-amount', '4000.90');
  // Explicitly set payday to local today (avoids UTC/local mismatch in Income.ts default)
  await page.fill('#sf-payday', todayStr);
  // Bank account select — assert it's visible (only renders when bank accounts are loaded)
  const bankSelect = page.locator('[data-testid="sf-account-select"]');
  await expect(bankSelect).toBeVisible({ timeout: 8_000 });
  await bankSelect.selectOption({ label: 'Test Checking' });
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Monthly Salary' })).toBeVisible({ timeout: 8_000 });
});

// ── Setup: expense paid from account ──────────────────────────────────────────

test('setup: add expense category', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-category-btn"]');
  await page.fill('#cat-name', 'Bills');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="category-pill"]').filter({ hasText: 'Bills' })).toBeVisible();
});

test('setup: add Electric Bill expense (one-time) and mark it paid from Test Checking', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#ef-desc', 'Electric Bill');
  await page.fill('#ef-amount', '120');
  await page.selectOption('#ef-cat', { label: 'Bills' });
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Mark the expense as paid from Test Checking
  const expRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await expect(expRow).toBeVisible();
  await expRow.locator('[data-action="record-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // Select "Test Checking" as the payment source
  const srcSel = page.locator('#mp-source');
  if (await srcSel.isVisible()) {
    await srcSel.selectOption({ label: 'Test Checking' });
  }
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/30-01-expense-paid.png' });
});

// ── Setup: debt payment from account ──────────────────────────────────────────

test('setup: add a credit card debt and record a payment from Test Checking', async () => {
  await navigateTo(page, 'debt');
  await page.click('[data-testid="add-debt-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#da-name', 'Test Card');
  await page.fill('#da-balance', '1500');
  await page.fill('#da-apr', '19.99');
  await page.fill('#da-duedate', todayStr);
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Record a payment from Test Checking
  const debtRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Test Card' });
  await debtRow.locator('[data-testid="debt-pay-btn"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#pay-amount', '149.90');
  const bankSel = page.locator('#pay-bank');
  if (await bankSel.isVisible()) {
    await bankSel.selectOption({ label: 'Test Checking' });
  }
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/30-02-debt-paid.png' });
});

// ── Ledger panel ───────────────────────────────────────────────────────────────

test('account row has a ledger button', async () => {
  await navigateTo(page, 'accounts');
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  await expect(acctRow).toBeVisible();
  await expect(acctRow.locator('[data-testid="account-ledger"]')).toBeVisible();
});

test('ledger button shows a count badge when transactions exist', async () => {
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  const ledgerBtn = acctRow.locator('[data-testid="account-ledger"]');
  const btnText = await ledgerBtn.textContent();
  // Count = 1 paid expense + 1 debt payment + 1 income source = 3
  expect(btnText).toMatch(/📋\s*3/);
});

test('clicking ledger button opens the transaction panel', async () => {
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  await acctRow.locator('[data-testid="account-ledger"]').click();
  await expect(page.locator('.account-ledger-panel')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/30-03-ledger-open.png' });
});

test('ledger panel shows income deposit entry with + prefix', async () => {
  // Navigate fresh so the accounts page re-reads the income source with bankAccountId
  await navigateTo(page, 'accounts');
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  await expect(acctRow).toBeVisible({ timeout: 8_000 });
  const panel = page.locator('.account-ledger-panel');
  if (!(await panel.isVisible())) {
    await acctRow.locator('[data-testid="account-ledger"]').click();
    await expect(panel).toBeVisible({ timeout: 5_000 });
  }
  // Monthly Salary should appear as a deposit
  await expect(panel).toContainText('Monthly Salary', { timeout: 10_000 });
  // Deposit amounts are prefixed with +; verify full cents (trailing zero preserved)
  const incomeAmt = panel.locator('.account-ledger-amount--credit').first();
  await expect(incomeAmt).toContainText('+');
  await expect(incomeAmt).toContainText('$4,000.90');
});

test('ledger panel shows expense payment entry with − prefix', async () => {
  // Ensure we're on the accounts page with the panel open (guards against drift from test 157 retries)
  await navigateTo(page, 'accounts');
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  await expect(acctRow).toBeVisible({ timeout: 8_000 });
  const panel = page.locator('.account-ledger-panel');
  if (!(await panel.isVisible())) {
    await acctRow.locator('[data-testid="account-ledger"]').click();
    await expect(panel).toBeVisible({ timeout: 5_000 });
  }
  await expect(panel).toContainText('Electric Bill');
  const debitAmts = panel.locator('.account-ledger-amount--debit');
  // At least one debit (the expense payment)
  await expect(debitAmts.first()).toContainText('−');
});

test('ledger panel shows debt payment entry', async () => {
  await navigateTo(page, 'accounts');
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  await expect(acctRow).toBeVisible({ timeout: 8_000 });
  const panel = page.locator('.account-ledger-panel');
  if (!(await panel.isVisible())) {
    await acctRow.locator('[data-testid="account-ledger"]').click();
    await expect(panel).toBeVisible({ timeout: 5_000 });
  }
  await expect(panel).toContainText('Test Card payment');
  // Trailing zero preserved: $149.90 not $149.9
  await expect(panel).toContainText('$149.90');
});

test('ledger entries include a Date column', async () => {
  await navigateTo(page, 'accounts');
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  await expect(acctRow).toBeVisible({ timeout: 8_000 });
  const panel = page.locator('.account-ledger-panel');
  if (!(await panel.isVisible())) {
    await acctRow.locator('[data-testid="account-ledger"]').click();
    await expect(panel).toBeVisible({ timeout: 5_000 });
  }
  await expect(panel.locator('.account-ledger-col-header')).toContainText('Date');
});

test('clicking ledger button again closes the panel', async () => {
  await navigateTo(page, 'accounts');
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  await expect(acctRow).toBeVisible({ timeout: 8_000 });
  const panel = page.locator('.account-ledger-panel');
  // Ensure panel is open before we close it
  if (!(await panel.isVisible())) {
    await acctRow.locator('[data-testid="account-ledger"]').click();
    await expect(panel).toBeVisible({ timeout: 5_000 });
  }
  await acctRow.locator('[data-testid="account-ledger"]').click();
  await expect(page.locator('.account-ledger-panel')).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/30-04-ledger-closed.png' });
});
