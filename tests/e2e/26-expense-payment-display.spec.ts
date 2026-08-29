/**
 * Expense payment display & edit E2E tests.
 *
 * Covers the features added when expenses gained a visible actual-vs-estimated
 * amount display, threshold-relative colour coding, and a post-payment edit
 * flow for non-auto-pay expenses.
 *
 *  1.  Unpaid expense shows only the estimated amount (no actual-amount element).
 *  2.  After recording a payment, the actual amount is shown with "est. $X" sub-label.
 *  3.  Actual amount under threshold → green colour.
 *  4.  Actual amount 1-10% over threshold → light red (#f87171).
 *  5.  Actual amount 10-25% over threshold → medium red (#ef4444).
 *  6.  Actual amount 25%+ over threshold → full danger red (var(--color-danger)).
 *  7.  After payment, "✎ Edit Payment" button appears on a non-auto-pay paid expense.
 *  8.  Before payment, the "Edit Payment" button is absent.
 *  9.  Auto-pay expense never shows the "Edit Payment" button.
 * 10.  Edit Payment dialog title reads "Edit Payment —…".
 * 11.  Edit Payment dialog pre-fills the previously recorded amount.
 * 12.  Edit Payment dialog pre-fills the previously recorded date.
 * 13.  Submitting Edit Payment updates the displayed actual amount.
 * 14.  Overage warning fires in the Edit Payment dialog when amount exceeds threshold.
 *
 * State built cumulatively (fresh extension context):
 *   - "Bills" category
 *   - "Power Bill"   $100  recurring, variable, non-auto-pay  ← primary fixture
 *   - "Broadband"    $60   recurring, auto-pay                ← auto-pay guard
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

// ── Date helpers ──────────────────────────────────────────────────────────────

const today = new Date();
const PAST_DUE_DAY = Math.max(1, today.getDate() - 3);
function thisMonthDate(day: number): string {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-${String(day).padStart(2, '0')}`;
}

// ── Suite lifecycle ───────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function powerBillRow() {
  return page.locator('[data-testid="expense-row"]').filter({ hasText: 'Power Bill' });
}

async function openEditPaymentDialog() {
  await powerBillRow().locator('[data-testid="expense-edit-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
}

async function submitAndWait() {
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
}

// ── Fixture setup ─────────────────────────────────────────────────────────────

test('setup: add Bills category', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'Bills');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="category-pill"]').filter({ hasText: 'Bills' })).toBeVisible();
});

test('setup: add Power Bill ($100, variable, non-auto-pay)', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ef-desc', 'Power Bill');
  await page.fill('#ef-amount', '100');
  await page.selectOption('#ef-cat', { label: 'Bills' });
  await page.check('#ef-recurring');
  await page.fill('#ef-duedate', thisMonthDate(PAST_DUE_DAY));
  // Leave fixed-amount and auto-pay unchecked

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(powerBillRow()).toBeVisible();
});

test('setup: add Broadband ($60, auto-pay)', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ef-desc', 'Broadband');
  await page.fill('#ef-amount', '60');
  await page.selectOption('#ef-cat', { label: 'Bills' });
  await page.check('#ef-recurring');
  await page.fill('#ef-duedate', thisMonthDate(PAST_DUE_DAY));
  await page.check('#ef-autopay');

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Broadband' })).toBeVisible();
});

// ── Test 1: unpaid expense has no actual-amount element ───────────────────────

test('unpaid expense does not show the actual-amount element', async () => {
  await expect(powerBillRow().locator('[data-testid="expense-actual-amount"]')).not.toBeVisible();
});

// ── Test 2-4: record payment under threshold → green amount + sub-label ───────

test('clicking Record Payment on Power Bill opens the dialog', async () => {
  await powerBillRow().locator('[data-testid="expense-record-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/pay-display-01-record-dialog.png' });
});

test('record payment of $80 (under $100 threshold) and submit', async () => {
  await page.fill('#mp-amount', '80');
  await submitAndWait();
  await page.screenshot({ path: 'tests/screenshots/pay-display-02-paid-row.png' });
});

test('after payment, actual amount element is visible on the row', async () => {
  await expect(powerBillRow().locator('[data-testid="expense-actual-amount"]')).toBeVisible();
  await expect(powerBillRow().locator('[data-testid="expense-actual-amount"]')).toContainText('80');
});

test('actual amount under threshold shows estimated sub-label with "est."', async () => {
  await expect(powerBillRow().locator('.expense-row-amount-sub')).toContainText('est.');
  await expect(powerBillRow().locator('.expense-row-amount-sub')).toContainText('100');
});

test('actual amount under threshold is coloured green', async () => {
  const style = await powerBillRow()
    .locator('[data-testid="expense-actual-amount"]')
    .getAttribute('style');
  expect(style).toContain('var(--ff-green)');
});

// ── Test 7-8: Edit Payment button ────────────────────────────────────────────

test('paid non-auto-pay expense shows an Edit Payment button', async () => {
  await expect(powerBillRow().locator('[data-testid="expense-edit-payment"]')).toBeVisible();
  await expect(powerBillRow().locator('[data-testid="expense-edit-payment"]')).toContainText('Edit Payment');
});

test('paid expense no longer shows the original Record Payment button', async () => {
  await expect(powerBillRow().locator('[data-testid="expense-record-payment"]')).not.toBeVisible();
});

// ── Test 9: auto-pay expense never gets Edit Payment button ──────────────────

test('auto-pay expense (Broadband) does not show an Edit Payment button', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Broadband' });
  await expect(row.locator('[data-testid="expense-edit-payment"]')).not.toBeVisible();
});

// ── Tests 10-12: Edit Payment dialog ─────────────────────────────────────────

test('Edit Payment dialog title reads "Edit Payment —…"', async () => {
  await openEditPaymentDialog();
  await expect(page.locator('[data-testid="modal-dialog"]')).toContainText('Edit Payment');
  await page.screenshot({ path: 'tests/screenshots/pay-display-03-edit-dialog.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('Edit Payment dialog pre-fills the previously recorded amount', async () => {
  await openEditPaymentDialog();
  const val = await page.locator('#mp-amount').inputValue();
  expect(parseFloat(val)).toBeCloseTo(80, 0);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('Edit Payment dialog pre-fills the previously recorded date', async () => {
  await openEditPaymentDialog();
  const dateVal = await page.locator('#mp-date').inputValue();
  expect(dateVal).toBeTruthy(); // non-empty date
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Test 14: overage warning in Edit Payment ──────────────────────────────────

test('overage warning fires in Edit Payment dialog when amount exceeds $100 threshold', async () => {
  await openEditPaymentDialog();
  await page.fill('#mp-amount', '120');
  await expect(page.locator('#mp-overage-msg')).toBeVisible();
  await expect(page.locator('#mp-overage-msg')).toContainText('Over monthly threshold');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Test 13 + colour degrees ──────────────────────────────────────────────────

test('edit payment to $105 (5% over) → amount updates and shows light red', async () => {
  await openEditPaymentDialog();
  await page.fill('#mp-amount', '105');
  await submitAndWait();

  await expect(powerBillRow().locator('[data-testid="expense-actual-amount"]')).toContainText('105');

  const style = await powerBillRow()
    .locator('[data-testid="expense-actual-amount"]')
    .getAttribute('style');
  expect(style).toContain('#f87171');
  await page.screenshot({ path: 'tests/screenshots/pay-display-04-light-red.png' });
});

test('edit payment to $115 (15% over) → amount shows medium red', async () => {
  await openEditPaymentDialog();
  await page.fill('#mp-amount', '115');
  await submitAndWait();

  const style = await powerBillRow()
    .locator('[data-testid="expense-actual-amount"]')
    .getAttribute('style');
  expect(style).toContain('#ef4444');
  await page.screenshot({ path: 'tests/screenshots/pay-display-05-medium-red.png' });
});

test('edit payment to $130 (30% over) → amount shows full danger red', async () => {
  await openEditPaymentDialog();
  await page.fill('#mp-amount', '130');
  await submitAndWait();

  const style = await powerBillRow()
    .locator('[data-testid="expense-actual-amount"]')
    .getAttribute('style');
  expect(style).toContain('var(--color-danger)');
  await page.screenshot({ path: 'tests/screenshots/pay-display-06-danger-red.png' });
});

test('edit payment back to $90 (under threshold) → amount returns to green', async () => {
  await openEditPaymentDialog();
  await page.fill('#mp-amount', '90');
  await submitAndWait();

  await expect(powerBillRow().locator('[data-testid="expense-actual-amount"]')).toContainText('90');

  const style = await powerBillRow()
    .locator('[data-testid="expense-actual-amount"]')
    .getAttribute('style');
  expect(style).toContain('var(--ff-green)');
  await page.screenshot({ path: 'tests/screenshots/pay-display-07-back-to-green.png' });
});
