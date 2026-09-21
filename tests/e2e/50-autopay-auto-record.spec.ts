/**
 * Auto-pay auto-record E2E tests.
 *
 * Verifies that autoRecordAutoPay() (called on every launchApp) silently
 * records fixed-amount auto-pay bills that are past due, updates the
 * associated bank/card balances, and does NOT double-record on subsequent
 * opens.  Also verifies that variable-amount auto-pay bills are NOT
 * auto-recorded and still show the "Log Actual" button.
 *
 * Accounts / expenses created in beforeAll:
 *   Checking  — bank  $5,000
 *   Auto Card — debt  $0 balance  18.99% APR  $2,000 limit
 *
 * The reload-unlock pattern mirrors 49-snapshot-ledger.spec.ts: after
 * creating the expense data in one session, the page is reloaded which
 * clears the vault key, requiring the test to re-enter credentials.  The
 * unlock triggers launchApp() → autoRecordAutoPay() fires.
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo, TEST_PASSPHRASE } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;
let privateKey: string;

// Format numbers with US commas+decimals so assertions match Intl.NumberFormat display.
const numFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// dueDay that is reliably past-due in the current month:
// use (today - 3), clamped to a minimum of 1.  The expense's own date is set
// to Dec 1 of the prior year so it falls well outside any billing cycle window.
const today = new Date();
const pastDueDay = Math.max(1, today.getDate() - 3);
const priorYearDate = `${today.getFullYear() - 1}-12-01`;
// Full date for the #ef-duedate field — same month/year as today but pastDueDay day.
const dueDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(pastDueDay).padStart(2, '0')}`;
const EXPENSE_AMOUNT = 29.99;

test.beforeAll(async () => {
  const ext = await launchExtensionContext();
  context = ext.context;
  cleanup = ext.cleanup;
  page = await context.newPage();
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('[autoRecordAutoPay]')) console.log('BROWSER:', t);
  });
  await page.goto(ext.extUrl);
  const result = await completeSetupWizard(page);
  privateKey = result.privateKey;
});

test.afterAll(async () => {
  await cleanup();
});

// ── Data setup ────────────────────────────────────────────────────────────────

test('setup: add Checking bank account ($5,000)', async () => {
  await navigateTo(page, 'accounts');
  await page.click('[data-testid="add-account-btn"]');
  await page.fill('#ba-name', 'Checking');
  await page.fill('#ba-balance', '5000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="account-row"]').filter({ hasText: 'Checking' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/autopay-01-bank-added.png' });
});

test('setup: add Auto Card debt account ($0 balance)', async () => {
  await navigateTo(page, 'debt');
  await page.click('[data-testid="add-debt-btn"]');
  await page.fill('#da-name', 'Auto Card');
  await page.fill('#da-balance', '0');
  await page.fill('#da-apr', '18.99');
  await page.fill('#da-limit', '2000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/autopay-02-card-added.png' });
});

test('setup: add Subscriptions category', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-category-btn"]');
  await page.fill('#cat-name', 'Subscriptions');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('setup: add fixed-amount auto-pay expense linked to bank (past-due)', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-expense-btn"]');

  await page.fill('#ef-desc', 'Streaming Service');
  await page.fill('#ef-amount', String(EXPENSE_AMOUNT));
  // Set the expense date to well before the current billing cycle window
  await page.fill('#ef-date', priorYearDate);

  // Enable recurring + set due day to a past day this month
  await page.check('#ef-recurring');
  await page.fill('#ef-duedate', dueDateStr);

  // Mark fixed amount + auto-pay
  await page.check('#ef-fixed-amount');
  await page.check('#ef-autopay');

  // Link to the Checking bank account
  await page.selectOption('#ef-bank-account', { label: 'Checking' });

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // The row should show the 🔄 Auto-pay badge, not a past-due badge
  const expenseRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Streaming Service' });
  await expect(expenseRow).toBeVisible();
  await expect(expenseRow.locator('[data-testid="expense-autopay-badge"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/autopay-03-expense-added.png' });
});

// ── Reload + unlock triggers autoRecordAutoPay ────────────────────────────────

test('reload the page — vault clears, unlock screen appears', async () => {
  await page.reload();
  await expect(page.locator('[data-testid="unlock-key-textarea"]')).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: 'tests/screenshots/autopay-04-unlock.png' });
});

test('unlock vault — launchApp fires autoRecordAutoPay for Streaming Service', async () => {
  await page.fill('[data-testid="unlock-key-textarea"]', privateKey);
  await page.fill('#unlock-pass', TEST_PASSPHRASE);
  await page.click('#unlock-btn');
  await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible({ timeout: 20_000 });
  // Give the async auto-record a moment to complete before navigating away
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/screenshots/autopay-05-after-unlock.png' });
});

// ── Verify auto-record results ────────────────────────────────────────────────

test('Streaming Service expense now shows as Paid (not past-due)', async () => {
  await navigateTo(page, 'expenses');
  const expenseRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Streaming Service' });
  // The paid badge should appear; the past-due badge should not
  await expect(expenseRow.locator('[data-testid="expense-bill-badge"]')).toContainText('✓ Paid', { timeout: 5000 });
  await page.screenshot({ path: 'tests/screenshots/autopay-06-expense-paid.png' });
});

test('Checking bank account balance decreased by the expense amount', async () => {
  await navigateTo(page, 'accounts');
  const accountRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Checking' });
  // Balance started at $5,000 and was debited by EXPENSE_AMOUNT
  const expectedBalance = numFmt.format(5000 - EXPENSE_AMOUNT);
  await expect(accountRow.locator('[data-testid="account-actual-balance"]')).toContainText(expectedBalance, { timeout: 5000 });
  await page.screenshot({ path: 'tests/screenshots/autopay-07-bank-balance.png' });
});

test('Ledger shows bank-debit entry for the auto-recorded charge', async () => {
  await navigateTo(page, 'ledger');
  await page.selectOption('[data-testid="ledger-filter-type"]', 'bank-debit');
  const firstRow = page.locator('[data-testid="ledger-entry-row"]').first();
  await expect(firstRow).toContainText('Streaming Service');
  await page.screenshot({ path: 'tests/screenshots/autopay-08-ledger.png' });
});

// ── No double-record on re-open ───────────────────────────────────────────────

test('reload again — second unlock does NOT double-record the expense', async () => {
  await page.reload();
  await expect(page.locator('[data-testid="unlock-key-textarea"]')).toBeVisible({ timeout: 20_000 });
  await page.fill('[data-testid="unlock-key-textarea"]', privateKey);
  await page.fill('#unlock-pass', TEST_PASSPHRASE);
  await page.click('#unlock-btn');
  await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);

  // Bank balance must remain the same — no second debit
  await navigateTo(page, 'accounts');
  const accountRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Checking' });
  const expectedBalance = numFmt.format(5000 - EXPENSE_AMOUNT);
  await expect(accountRow.locator('[data-testid="account-actual-balance"]')).toContainText(expectedBalance);
  await page.screenshot({ path: 'tests/screenshots/autopay-09-no-double-record.png' });
});

// ── Variable-amount auto-pay is NOT auto-recorded ─────────────────────────────

test('setup: add variable-amount auto-pay expense (no isFixedAmount)', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-expense-btn"]');

  await page.fill('#ef-desc', 'Electric Bill');
  await page.fill('#ef-amount', '120');
  await page.fill('#ef-date', priorYearDate);

  await page.check('#ef-recurring');
  await page.fill('#ef-duedate', dueDateStr);
  // Do NOT check isFixedAmount — variable amount
  await page.check('#ef-autopay');
  await page.selectOption('#ef-bank-account', { label: 'Checking' });

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/autopay-10-variable-expense.png' });
});

test('reload + unlock — variable-amount bill is NOT auto-recorded', async () => {
  await page.reload();
  await expect(page.locator('[data-testid="unlock-key-textarea"]')).toBeVisible({ timeout: 20_000 });
  await page.fill('[data-testid="unlock-key-textarea"]', privateKey);
  await page.fill('#unlock-pass', TEST_PASSPHRASE);
  await page.click('#unlock-btn');
  await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);

  // Electric Bill should still show Log Actual (not ✓ Paid) since it is variable-amount
  await navigateTo(page, 'expenses');
  const expenseRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await expect(expenseRow.locator('[data-testid="expense-log-actual"]')).toBeVisible();
  // Bank balance should NOT have changed further (Electric Bill was not debited)
  await navigateTo(page, 'accounts');
  const accountRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Checking' });
  const expectedBalance = numFmt.format(5000 - EXPENSE_AMOUNT);
  await expect(accountRow.locator('[data-testid="account-actual-balance"]')).toContainText(expectedBalance);
  await page.screenshot({ path: 'tests/screenshots/autopay-11-variable-not-recorded.png' });
});

// ── Settings: auto-pay prompt window ─────────────────────────────────────────

test('Settings shows auto-pay prompt window field with default of 7 days', async () => {
  await navigateTo(page, 'settings');
  await expect(page.locator('[data-testid="settings-autopay-prompt-row"]')).toBeVisible();
  const input = page.locator('[data-testid="settings-autopay-prompt-input"]');
  await expect(input).toHaveValue('7');
  await page.screenshot({ path: 'tests/screenshots/autopay-12-settings.png' });
});

test('can change auto-pay prompt window and save', async () => {
  const input = page.locator('[data-testid="settings-autopay-prompt-input"]');
  await input.fill('14');
  await page.click('[data-testid="settings-autopay-prompt-save"]');
  await expect(input).toHaveValue('14');
  await page.screenshot({ path: 'tests/screenshots/autopay-13-settings-saved.png' });
});
