/**
 * Expense threshold tracking & mascot trend alert E2E tests.
 *
 * Covers:
 *  - Setting a monthly cost threshold on a recurring expense
 *  - Threshold field visibility (hidden until recurring is checked)
 *  - Threshold badge (⚡ $X) displayed on the expense row
 *  - Threshold value round-tripping through the edit form
 *  - Mark Paid modal: pre-fill, threshold hint, inline overage warning
 *  - Overage warning fires when entered amount > threshold
 *  - Paid record is saved on submit; bill shows "Paid" badge
 *  - Mascot 'expense-trend' alert fires on the second consecutive
 *    over-threshold payment (overCount ≥ 2)
 *  - Mascot bubble mentions the bill name and can be dismissed
 *
 * Mascot trigger strategy:
 *   Pay the bill over threshold once → no mascot (overCount = 1 < 2).
 *   Reset the bill date to last month via the edit form so the Mark Paid
 *   button reappears, then pay over threshold again → mascot fires
 *   (overCount = 2 ≥ 2).
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

const today = new Date();
const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 15);
const PREV_MONTH_DATE = [
  prevMonth.getFullYear(),
  String(prevMonth.getMonth() + 1).padStart(2, '0'),
  '15',
].join('-');

// Use a day that is already past for this month so the bill shows as past-due
const PAST_DUE_DAY = Math.max(1, today.getDate() - 3);

const thisYear = today.getFullYear();
const thisMonthPadded = String(today.getMonth() + 1).padStart(2, '0');
const thisMonthDate = (day: number): string =>
  `${thisYear}-${thisMonthPadded}-${String(day).padStart(2, '0')}`;

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

// ── Category setup ────────────────────────────────────────────────────────────

test('adds a Utilities category for threshold tests', async () => {
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'Utilities');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="category-pill"]').filter({ hasText: 'Utilities' })).toBeVisible();
});

// ── Threshold field visibility ─────────────────────────────────────────────────

test('threshold field is hidden before recurring is checked', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('#ef-threshold')).not.toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('threshold field appears after checking recurring', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.check('#ef-recurring');
  await expect(page.locator('#ef-threshold')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Adding a bill with a threshold ────────────────────────────────────────────

test('can add a recurring bill with a monthly threshold', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ef-desc', 'Electric Bill');
  await page.fill('#ef-amount', '95');
  await page.selectOption('#ef-cat', { label: 'Utilities' });

  await page.check('#ef-recurring');
  await page.fill('#ef-duedate', thisMonthDate(PAST_DUE_DAY));
  await page.fill('#ef-threshold', '120');

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/threshold-01-bill-added.png' });
});

// ── Threshold badge on the expense row ───────────────────────────────────────

test('expense row shows a threshold badge', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await expect(row.locator('[data-testid="expense-threshold-badge"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/threshold-02-badge.png' });
});

test('threshold badge displays the correct target amount', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await expect(row.locator('[data-testid="expense-threshold-badge"]')).toContainText('$120');
});

// ── Threshold persists through the edit form ──────────────────────────────────

test('threshold value is preserved when reopening the edit form', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await row.locator('[data-testid="expense-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await expect(page.locator('#ef-threshold')).toBeVisible();
  const val = await page.locator('#ef-threshold').inputValue();
  expect(parseFloat(val)).toBeCloseTo(120, 0);

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Mark Paid modal ───────────────────────────────────────────────────────────

test('clicking Mark Paid opens an amount dialog instead of immediately saving', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await row.locator('[data-testid="expense-mark-paid"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('#mp-amount')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/threshold-03-mark-paid-modal.png' });
});

test('mark-paid modal pre-fills the usual expense amount', async () => {
  const val = await page.locator('#mp-amount').inputValue();
  expect(parseFloat(val)).toBeCloseTo(95, 0);
});

test('mark-paid modal shows the threshold as a hint', async () => {
  await expect(page.locator('[data-testid="modal-dialog"]')).toContainText('$120');
});

test('entering an amount over the threshold shows an inline overage warning', async () => {
  await page.fill('#mp-amount', '145');
  await expect(page.locator('[data-testid="modal-dialog"]')).toContainText('Over target by');
  await page.screenshot({ path: 'tests/screenshots/threshold-04-overage-warning.png' });
});

test('overage warning disappears when amount is back within threshold', async () => {
  await page.fill('#mp-amount', '100');
  // The overage message should be hidden (empty or not shown)
  const overageMsg = page.locator('#mp-overage-msg');
  const isVisible = await overageMsg.isVisible();
  if (isVisible) {
    // If visible, must not contain overage text
    await expect(overageMsg).not.toContainText('Over target');
  }
});

test('submitting mark-paid with an over-threshold amount marks the bill paid', async () => {
  // Set back to an over-threshold amount for this first payment
  await page.fill('#mp-amount', '145');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  await expect(
    page.locator('[data-testid="expense-row"]')
      .filter({ hasText: 'Electric Bill' })
      .locator('[data-testid="expense-bill-badge"]'),
  ).toContainText('Paid');
  await page.screenshot({ path: 'tests/screenshots/threshold-05-paid-first.png' });
});

test('Mark Paid button is gone after the first payment', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await expect(row.locator('[data-testid="expense-mark-paid"]')).not.toBeVisible();
});

// ── Mascot trend alert after repeated overages ────────────────────────────────
// Strategy: reset the bill date to last month via the edit form so the
// Mark Paid button reappears, then pay over threshold a second time.
// The second over-threshold payment produces overCount = 2 ≥ 2, firing the mascot.

test('resetting bill date to last month via edit makes Mark Paid reappear', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await row.locator('[data-testid="expense-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#ef-date', PREV_MONTH_DATE);
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  await expect(
    page.locator('[data-testid="expense-row"]')
      .filter({ hasText: 'Electric Bill' })
      .locator('[data-testid="expense-mark-paid"]'),
  ).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/threshold-06-date-reset.png' });
});

test('second over-threshold payment triggers the mascot expense-trend alert', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await row.locator('[data-testid="expense-mark-paid"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#mp-amount', '158');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Mascot fires with a 600 ms delay — wait up to 4 s
  await expect(page.locator('#mascot-root .mascot-bubble')).toBeVisible({ timeout: 4000 });
  await page.screenshot({ path: 'tests/screenshots/threshold-07-mascot-trend.png' });
});

test('mascot trend bubble mentions "Electric Bill"', async () => {
  await expect(page.locator('#mascot-root .mascot-bubble')).toContainText('Electric Bill');
});

test('mascot trend bubble references the threshold or going over budget', async () => {
  const text = (await page.locator('#mascot-root .mascot-bubble').innerText()).toLowerCase();
  expect(text).toMatch(/target|over|adjust|expect/);
});

test('mascot trend bubble can be dismissed with the Git button', async () => {
  await page.locator('[data-testid="mascot-git-btn"]').click();
  await expect(page.locator('#mascot-root .mascot-bubble')).not.toBeVisible({ timeout: 2000 });
  await page.screenshot({ path: 'tests/screenshots/threshold-08-mascot-dismissed.png' });
});
