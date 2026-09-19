/**
 * Account ledger panel E2E tests.
 *
 * Verifies that the ledger button on each account row toggles a panel
 * showing bank-credit entries (one-time income deposits), expense
 * bank-debit entries, and debt payment bank-debit entries linked to
 * that account.
 *
 * Each of those three flows creates a LedgerEntry in the accounting
 * service — monthly income sources do NOT create LedgerEntries; only
 * one-time income sources linked to a bank account do.
 *
 * Accounts created:
 *   Test Checking  — bank account (no opening balance)
 *   Test Card      — debt card   $1,500  19.99% APR
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

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

// ── Setup: one-time income linked to account ───────────────────────────────────

test('setup: add one-time income "Bonus Pay" linked to Test Checking', async () => {
  await navigateTo(page, 'income');
  // Add a household member so the income form renders
  await page.fill('[data-testid="income-add-member-input"]', 'Sam');
  await page.click('[data-testid="income-add-member-btn"]');

  await page.click('[data-testid="income-add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#sf-name', 'Bonus Pay');
  // Switch to one-time — this reveals the date field and creates a bank-credit LedgerEntry
  await page.selectOption('#sf-freq', 'once');
  await page.fill('#sf-amount', '4000.90');
  await page.fill('#sf-date', todayStr);

  const bankSelect = page.locator('[data-testid="income-sf-account-select"]');
  await expect(bankSelect).toBeVisible({ timeout: 8_000 });
  await bankSelect.selectOption({ label: 'Test Checking' });

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(
    page.locator('[data-testid="income-source-row"]').filter({ hasText: 'Bonus Pay' }),
  ).toBeVisible({ timeout: 8_000 });
  await page.screenshot({ path: 'tests/screenshots/30-00-income-setup.png' });
});

// ── Setup: expense paid from account ──────────────────────────────────────────

test('setup: add expense category', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-category-btn"]');
  await page.fill('#cat-name', 'Bills');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="category-pill"]').filter({ hasText: 'Bills' })).toBeVisible();
});

test('setup: add Electric Bill expense and mark it paid from Test Checking', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#ef-desc', 'Electric Bill');
  await page.fill('#ef-amount', '120');
  await page.selectOption('#ef-cat', { label: 'Bills' });
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  const expRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await expect(expRow).toBeVisible();
  await expRow.locator('[data-action="record-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  const srcSel = page.locator('#pay-src');
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

  const debtRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Test Card' });
  await debtRow.locator('[data-testid="debt-pay-btn"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('[data-testid="debt-pay-amount"]', '149.90');
  const bankSel = page.locator('[data-testid="debt-pay-bank-select"]');
  if (await bankSel.isVisible()) {
    await bankSel.selectOption({ label: 'Test Checking' });
  }
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/30-02-debt-paid.png' });
});

// ── Ledger button ──────────────────────────────────────────────────────────────

test('account row has a ledger button', async () => {
  await navigateTo(page, 'accounts');
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  await expect(acctRow).toBeVisible();
  await expect(acctRow.locator('[data-testid="account-ledger"]')).toBeVisible();
});

test('ledger button shows count = 3 (one-time income + expense payment + debt payment)', async () => {
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  const ledgerBtn = acctRow.locator('[data-testid="account-ledger"]');
  const btnText = await ledgerBtn.textContent();
  // 1 bank-credit (Bonus Pay) + 1 bank-debit (Electric Bill) + 1 bank-debit (debt payment) = 3
  expect(btnText).toMatch(/📋\s*3/);
});

test('clicking ledger button opens the transaction panel', async () => {
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  await acctRow.locator('[data-testid="account-ledger"]').click();
  await expect(page.locator('.account-ledger-panel')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/30-03-ledger-open.png' });
});

// ── Ledger panel content ───────────────────────────────────────────────────────

test('ledger panel shows income deposit entry with + prefix and correct amount', async () => {
  await navigateTo(page, 'accounts');
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  await expect(acctRow).toBeVisible({ timeout: 8_000 });
  const panel = page.locator('.account-ledger-panel');
  if (!(await panel.isVisible())) {
    await acctRow.locator('[data-testid="account-ledger"]').click();
    await expect(panel).toBeVisible({ timeout: 5_000 });
  }

  // One-time income "Bonus Pay" should appear as a bank-credit in the ledger
  await expect(panel).toContainText('Bonus Pay', { timeout: 10_000 });
  const creditAmts = panel.locator('.account-ledger-amount--credit');
  await expect(creditAmts.first()).toContainText('+');
  await expect(creditAmts.first()).toContainText('$4,000.90');
  await page.screenshot({ path: 'tests/screenshots/30-04-income-entry.png' });
});

test('ledger panel shows expense payment entry with − prefix', async () => {
  await navigateTo(page, 'accounts');
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  await expect(acctRow).toBeVisible({ timeout: 8_000 });
  const panel = page.locator('.account-ledger-panel');
  if (!(await panel.isVisible())) {
    await acctRow.locator('[data-testid="account-ledger"]').click();
    await expect(panel).toBeVisible({ timeout: 5_000 });
  }
  await expect(panel).toContainText('Electric Bill');
  await expect(panel.locator('.account-ledger-amount--debit').first()).toContainText('−');
});

test('ledger panel shows debt payment entry with amount', async () => {
  await navigateTo(page, 'accounts');
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  await expect(acctRow).toBeVisible({ timeout: 8_000 });
  const panel = page.locator('.account-ledger-panel');
  if (!(await panel.isVisible())) {
    await acctRow.locator('[data-testid="account-ledger"]').click();
    await expect(panel).toBeVisible({ timeout: 5_000 });
  }
  // bank-debit description format: "Regular payment — Test Card"
  await expect(panel).toContainText('Regular payment');
  await expect(panel).toContainText('Test Card');
  await expect(panel).toContainText('$149.90');
});

test('clicking ledger button again closes the panel', async () => {
  await navigateTo(page, 'accounts');
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  await expect(acctRow).toBeVisible({ timeout: 8_000 });
  const panel = page.locator('.account-ledger-panel');
  if (!(await panel.isVisible())) {
    await acctRow.locator('[data-testid="account-ledger"]').click();
    await expect(panel).toBeVisible({ timeout: 5_000 });
  }
  await acctRow.locator('[data-testid="account-ledger"]').click();
  await expect(page.locator('.account-ledger-panel')).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/30-06-ledger-closed.png' });
});
