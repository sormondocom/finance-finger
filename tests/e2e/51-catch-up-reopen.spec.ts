/**
 * Reopen catch-up E2E test.
 *
 * Verifies that reopening the extension after a simulated gap surfaces a
 * single, unified mascot queue covering a missed payday, a lapsed debt
 * payment, and a lapsed recurring bill — in that order — and that:
 *   - confirming the payday records it directly (no modal)
 *   - confirming the debt cycle opens openDebtPaymentModal pre-filled with
 *     the cycle's due date, and submitting it records a real payment
 *   - declining the bill cycle persists (storage: catchUpDeclinedCycles) so
 *     it does not resurface on a second simulated gap
 *
 * The gap is simulated by writing `lastOpenedAt` directly into
 * chrome.storage.local via page.evaluate (extension pages have `chrome.*`
 * as a true global, unlike the webextension-polyfill import used in source,
 * which is module-scoped) — there is no way to fast-forward the real system
 * clock for a built extension running in a real browser.
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo, TEST_PASSPHRASE } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;
let privateKey: string;

const numFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// A day 8 days ago — recent enough to land inside a 10-day simulated gap, far
// enough that it's never "today" (which would hit the silent same-day/auto-pay
// paths instead of the catch-up checklist).
const today = new Date();
const eightDaysAgo = new Date(today);
eightDaysAgo.setDate(today.getDate() - 8);
const eightDaysAgoStr = `${eightDaysAgo.getFullYear()}-${String(eightDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(eightDaysAgo.getDate()).padStart(2, '0')}`;
const aYearAgoStr = `${today.getFullYear() - 1}-01-15`;

async function seedLastOpenedAtDaysAgo(days: number): Promise<void> {
  const ts = Date.now() - days * 86_400_000;
  await page.evaluate((value) => {
    return new Promise<void>((resolve) => {
      chrome.storage.local.set({ lastOpenedAt: value }, () => resolve());
    });
  }, ts);
}

test.beforeAll(async () => {
  const ext = await launchExtensionContext();
  context = ext.context;
  cleanup = ext.cleanup;
  page = await context.newPage();
  await page.goto(ext.extUrl);
  const result = await completeSetupWizard(page);
  privateKey = result.privateKey;
});

test.afterAll(async () => {
  await cleanup();
});

async function reloadAndUnlock(): Promise<void> {
  await page.reload();
  await expect(page.locator('[data-testid="unlock-key-textarea"]')).toBeVisible({ timeout: 20_000 });
  await page.fill('[data-testid="unlock-key-textarea"]', privateKey);
  await page.fill('#unlock-pass', TEST_PASSPHRASE);
  await page.click('#unlock-btn');
  await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible({ timeout: 20_000 });
}

// ── Data setup ────────────────────────────────────────────────────────────────

test('setup: add Checking bank account ($1,000)', async () => {
  await navigateTo(page, 'accounts');
  await page.click('[data-testid="add-account-btn"]');
  await page.fill('#ba-name', 'Checking');
  await page.fill('#ba-balance', '1000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('setup: add income source with payday 8 days ago', async () => {
  await navigateTo(page, 'income');
  await page.click('[data-testid="income-add-source-btn"]');
  await page.fill('#sf-name', 'Paycheck');
  await page.fill('#sf-amount', '2000');
  await page.selectOption('#sf-account', { label: 'Checking' });
  await page.fill('#sf-payday', eightDaysAgoStr);
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('setup: add debt account with a cycle due 8 days ago', async () => {
  await navigateTo(page, 'debt');
  await page.click('[data-testid="add-debt-btn"]');
  await page.fill('#da-name', 'Catch-up Card');
  await page.fill('#da-balance', '500');
  await page.fill('#da-apr', '20');
  await page.fill('#da-limit', '2000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Quick-add hides cycle/due-date/min-payment fields — "Complete setup" opens
  // the full edit form where they're available.
  const row = page.locator('[data-testid="debt-account-wrap"]').filter({ hasText: 'Catch-up Card' });
  await row.locator('[data-testid="debt-setup"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#da-duedate', eightDaysAgoStr);
  await page.check('input[name="da-min-type"][value="fixed"]');
  await page.fill('#da-min-value', '50');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('setup: add a recurring bill due 8 days ago', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-expense-btn"]');
  await page.fill('#ef-desc', 'Catch-up Bill');
  await page.fill('#ef-amount', '75');
  await page.fill('#ef-date', aYearAgoStr); // billing anchor far in the past
  await page.check('#ef-recurring');
  await page.fill('#ef-duedate', eightDaysAgoStr);
  // Not fixed-amount, not auto-pay — a plain manually-paid recurring bill.
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Simulate an 10-day gap and reopen ─────────────────────────────────────────

test('simulate a 10-day gap and reopen — unified catch-up queue appears', async () => {
  await seedLastOpenedAtDaysAgo(10);
  await reloadAndUnlock();

  // Each kind gets its own locator — the generic toast selector always matches
  // *something* while the queue is running (one toast immediately replaces the
  // last), so sequencing must wait for the NEXT kind to appear, not for the
  // generic selector to become absent.
  const paydayToast = page.locator('[data-testid="catchup-toast"][data-catchup-kind="payday"]');
  const debtToast = page.locator('[data-testid="catchup-toast"][data-catchup-kind="debt-cycle"]');
  const expenseToast = page.locator('[data-testid="catchup-toast"][data-catchup-kind="expense-cycle"]');

  // 1) Payday — confirmed directly, no modal.
  await expect(paydayToast).toBeVisible({ timeout: 20_000 });
  await paydayToast.locator('[data-testid="catchup-toast-yes"]').click();

  // 2) Debt cycle — confirming opens the real payment modal, pre-filled with
  //    the lapsed cycle's due date, not today.
  await expect(debtToast).toBeVisible({ timeout: 10_000 });
  await debtToast.locator('[data-testid="catchup-toast-yes"]').click();

  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('[data-testid="debt-pay-date"]')).toHaveValue(eightDaysAgoStr);
  await expect(page.locator('[data-testid="debt-pay-amount"]')).toHaveValue('50.00');
  await page.selectOption('[data-testid="debt-pay-bank-select"]', { label: 'Checking' });
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // 3) Expense cycle — decline it this time.
  await expect(expenseToast).toBeVisible({ timeout: 10_000 });
  await expenseToast.locator('[data-testid="catchup-toast-no"]').click();

  // Queue is empty — no more prompts.
  await expect(page.locator('[data-testid="catchup-toast"]')).toHaveCount(0, { timeout: 10_000 });
});

test('the payday and debt payment were actually recorded', async () => {
  await navigateTo(page, 'accounts');
  const accountRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Checking' });
  // $1,000 + $2,000 payday − $50 debt payment = $2,950
  await expect(accountRow.locator('[data-testid="account-actual-balance"]')).toContainText(numFmt.format(2950));

  // Check the ledger directly rather than the derived debt balance display —
  // the account's own opening-balance reconciliation is dated "today" (it was
  // just created in this test run), which predates the catch-up payment's
  // backdated due date; that reconciliation-vs-backdate ordering interaction
  // is a separate, pre-existing property of how balances are derived from the
  // ledger and isn't what this test is verifying. A real debt account's last
  // reconciliation point would normally predate any realistic catch-up gap.
  await navigateTo(page, 'ledger');
  await page.selectOption('[data-testid="ledger-filter-type"]', 'payment');
  const paymentRow = page.locator('[data-testid="ledger-entry-row"]').filter({ hasText: 'Catch-up Card' }).first();
  await expect(paymentRow).toContainText(numFmt.format(50));
});

// ── A second simulated gap: nothing resurfaces ────────────────────────────────

test('a second simulated gap does not re-surface recorded or declined items', async () => {
  await seedLastOpenedAtDaysAgo(10);
  await reloadAndUnlock();

  // Give the async catch-up a moment to run, then confirm nothing appears:
  // payday and debt were recorded (dedup via ledger correlationId / payment
  // history), and the bill cycle was declined (persisted in
  // catchUpDeclinedCycles), so none of them should prompt again.
  await page.waitForTimeout(2000);
  await expect(page.locator('[data-testid="catchup-toast"]')).toHaveCount(0);
});
