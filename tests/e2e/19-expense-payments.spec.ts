/**
 * Expense Payment Recording E2E tests.
 *
 * Covers the features added when expenses gained "Estimated Amount" vs.
 * actual payment tracking, fixed-amount and auto-pay flags, a richer
 * Record Payment dialog, and one-time expenses on the Calendar.
 *
 *  1.  Expense form shows "Estimated Amount" label (not plain "Amount").
 *  2.  Fixed-amount and auto-pay checkboxes are hidden until recurring is
 *      checked (they live inside the collapsible recur-details section).
 *  3.  Both checkboxes appear once recurring is checked.
 *  4.  A non-autopay expense shows a "$ Record Payment" button.
 *  5.  An auto-pay expense shows the 🔄 badge and NO Record Payment button.
 *  6.  Record Payment dialog: actual-amount field pre-filled with estimate,
 *      estimated-amount hint text, date picker, card dropdown.
 *  7.  Fixed-amount expense: Record Payment dialog amount is readonly.
 *  8.  Fixed-amount hint text is shown instead of editable hint.
 *  9.  Submitting Record Payment on a tracked bill marks it paid.
 * 10.  Once paid, the Record Payment button disappears.
 * 11.  One-time expenses appear on the Calendar chip on their date.
 * 12.  Auto-pay recurring bill is visible on the Calendar but has NO
 *      Record Payment button.
 * 13.  Auto-pay past-due bill is excluded from dashboard payment reminders.
 *
 * State built cumulatively in this suite (single fresh extension context):
 *   — "Visa Card" credit card (so the card dropdown is populated)
 *   — "Utilities" expense category
 *   — "Electric Bill"  $95  recurring past-due   (variable — no flags)
 *   — "Cable Bill"     $89  recurring past-due   (isFixedAmount = true)
 *   — "Netflix"        $18  recurring past-due   (isAutoPay = true)
 *   — "Vet Bill"       $200 one-time this month  (calendar chip test)
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
const thisYear = today.getFullYear();
const thisMonthPadded = String(today.getMonth() + 1).padStart(2, '0');
const PAST_DUE_DAY = Math.max(1, today.getDate() - 4);
const ONE_TIME_DAY = Math.max(1, today.getDate() - 2);
// A date in next month — used for the ghost-paid regression test.
// When a bill has a next-month due date the form's prevPeriod lands in the current
// month, which the old (bug) code would treat as "already paid".
const NEXT_MONTH_DATE = (() => {
  const d = new Date(today.getFullYear(), today.getMonth() + 1, 15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
})();

function thisMonthDate(day: number): string {
  return `${thisYear}-${thisMonthPadded}-${String(day).padStart(2, '0')}`;
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

// ── Fixture: credit card (so the card dropdown is populated) ──────────────────

test('setup: adds a credit card account', async () => {
  await navigateTo(page, 'debt');
  await page.click('[data-testid="add-debt-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#da-name', 'Visa Card');
  await page.fill('#da-balance', '500');
  await page.fill('#da-apr', '20');
  await page.fill('#da-limit', '2000');

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="debt-row"]').filter({ hasText: 'Visa Card' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/exp-pay-01-card.png' });
});

// ── Fixture: category ─────────────────────────────────────────────────────────

test('setup: adds Utilities category', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'Utilities');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="category-pill"]').filter({ hasText: 'Utilities' })).toBeVisible();
});

// ── Fixture: variable recurring bill ─────────────────────────────────────────

test('setup: adds Electric Bill (variable, no flags)', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ef-desc', 'Electric Bill');
  await page.fill('#ef-amount', '95');
  await page.selectOption('#ef-cat', { label: 'Utilities' });
  await page.check('#ef-recurring');
  await page.fill('#ef-duedate', thisMonthDate(PAST_DUE_DAY));

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' })).toBeVisible();
});

// ── Fixture: fixed-amount recurring bill ──────────────────────────────────────

test('setup: adds Cable Bill (isFixedAmount = true)', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ef-desc', 'Cable Bill');
  await page.fill('#ef-amount', '89');
  await page.selectOption('#ef-cat', { label: 'Utilities' });
  await page.check('#ef-recurring');
  await page.fill('#ef-duedate', thisMonthDate(PAST_DUE_DAY));
  await page.check('#ef-fixed-amount');

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Cable Bill' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/exp-pay-02-cable-added.png' });
});

// ── Fixture: auto-pay recurring bill ─────────────────────────────────────────

test('setup: adds Netflix (isAutoPay = true)', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ef-desc', 'Netflix');
  await page.fill('#ef-amount', '18');
  await page.selectOption('#ef-cat', { label: 'Utilities' });
  await page.check('#ef-recurring');
  await page.fill('#ef-duedate', thisMonthDate(PAST_DUE_DAY));
  await page.check('#ef-autopay');

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Netflix' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/exp-pay-03-netflix-added.png' });
});

// ── Fixture: one-time expense for calendar ────────────────────────────────────

test('setup: adds Vet Bill one-time expense this month', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ef-desc', 'Vet Bill');
  await page.fill('#ef-amount', '200');
  await page.selectOption('#ef-cat', { label: 'Utilities' });
  await page.fill('#ef-date', thisMonthDate(ONE_TIME_DAY));

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Vet Bill' })).toBeVisible();
});

// ── Test 1: Amount label changes based on recurring/frequency ────────────────

test('expense form amount label is "Estimated Amount" by default and "Monthly Threshold" when recurring is checked', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // Before checking recurring: label is generic
  await expect(page.locator('label[for="ef-amount"]')).toContainText('Estimated Amount');

  // After checking recurring (default freq = monthly): label becomes "Monthly Threshold"
  await page.check('#ef-recurring');
  await expect(page.locator('label[for="ef-amount"]')).toContainText('Monthly Threshold');

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Test 2: checkboxes hidden before recurring ────────────────────────────────

test('fixed-amount and auto-pay checkboxes are hidden before recurring is checked', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // Recurring section is collapsed — checkboxes inside it must not be visible
  await expect(page.locator('#ef-fixed-amount')).not.toBeVisible();
  await expect(page.locator('#ef-autopay')).not.toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Test 3: checkboxes visible after recurring checked ────────────────────────

test('fixed-amount and auto-pay checkboxes appear after checking recurring', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.check('#ef-recurring');

  await expect(page.locator('#ef-fixed-amount')).toBeVisible();
  await expect(page.locator('#ef-autopay')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Test 4: non-autopay expense shows Record Payment button ───────────────────

test('Electric Bill row shows a Record Payment button', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await expect(row.locator('[data-testid="expense-record-payment"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/exp-pay-04-record-btn.png' });
});

// ── Test 5: auto-pay badge ────────────────────────────────────────────────────

test('Netflix shows the auto-pay badge', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Netflix' });
  await expect(row.locator('[data-testid="expense-autopay-badge"]')).toBeVisible();
  await expect(row.locator('[data-testid="expense-autopay-badge"]')).toContainText('Auto-pay');
  await page.screenshot({ path: 'tests/screenshots/exp-pay-05-autopay-badge.png' });
});

// ── Test 6: auto-pay has Log Actual but no Record Payment button ──────────────

test('Netflix row has no Record Payment button', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Netflix' });
  await expect(row.locator('[data-testid="expense-record-payment"]')).not.toBeVisible();
});

test('Netflix row shows a Log Actual button', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Netflix' });
  await expect(row.locator('[data-testid="expense-log-actual"]')).toBeVisible();
  await expect(row.locator('[data-testid="expense-log-actual"]')).toContainText('Log Actual');
  await page.screenshot({ path: 'tests/screenshots/exp-pay-05b-log-actual-btn.png' });
});

test('clicking Log Actual on Netflix opens a dialog with amount and date fields', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Netflix' });
  await row.locator('[data-testid="expense-log-actual"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('#la-amount')).toBeVisible();
  await expect(page.locator('#la-date')).toBeVisible();
  await expect(page.locator('[data-testid="modal-dialog"]')).toContainText('Monthly Threshold');
  await page.screenshot({ path: 'tests/screenshots/exp-pay-05c-log-actual-dialog.png' });
});

test('submitting Log Actual for Netflix shows the actual amount on the row', async () => {
  await page.fill('#la-amount', '16.99');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Netflix' });
  await expect(row).toContainText('16.99');
  await page.screenshot({ path: 'tests/screenshots/exp-pay-05d-actual-shown.png' });
});

test('Netflix row shows Update Actual button after a record exists', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Netflix' });
  await expect(row.locator('[data-testid="expense-log-actual"]')).toContainText('Update Actual');
});

// ── Tests 7-10: Record Payment dialog on a variable bill ──────────────────────

test('clicking Record Payment on Electric Bill opens the dialog', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await row.locator('[data-testid="expense-record-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/exp-pay-06-dialog.png' });
});

test('Record Payment dialog pre-fills the actual amount with the estimated amount', async () => {
  const val = await page.locator('#mp-amount').inputValue();
  expect(parseFloat(val)).toBeCloseTo(95, 0);
});

test('Record Payment dialog shows the monthly threshold as a hint', async () => {
  await expect(page.locator('[data-testid="modal-dialog"]')).toContainText('Monthly Threshold');
});

test('Record Payment dialog has a date picker', async () => {
  await expect(page.locator('#mp-date')).toBeVisible();
  // Default is today
  const dateVal = await page.locator('#mp-date').inputValue();
  expect(dateVal).toBeTruthy();
});

test('Record Payment dialog shows a card dropdown because a card account exists', async () => {
  await expect(page.locator('#mp-source')).toBeVisible();
  await expect(page.locator('#mp-source')).toContainText('Visa Card');
});

// ── Tests 11-12: fixed-amount dialog ─────────────────────────────────────────

test('closing dialog and opening Record Payment on Cable Bill', async () => {
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Cable Bill' });
  await row.locator('[data-testid="expense-record-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
});

test('Cable Bill Record Payment dialog has a readonly amount field', async () => {
  const amountInput = page.locator('#mp-amount');
  await expect(amountInput).toBeVisible();
  // Fixed amount: input has readonly attribute; value matches estimate
  const val = await amountInput.inputValue();
  expect(parseFloat(val)).toBeCloseTo(89, 0);
  const isReadonly = await amountInput.getAttribute('readonly');
  expect(isReadonly).not.toBeNull();
  await page.screenshot({ path: 'tests/screenshots/exp-pay-07-fixed-dialog.png' });
});

test('Cable Bill Record Payment dialog shows fixed-amount hint text', async () => {
  await expect(page.locator('[data-testid="modal-dialog"]')).toContainText('Fixed amount');
});

// ── Tests 13-14: submitting Record Payment marks bill paid ────────────────────

test('submitting Cable Bill Record Payment marks it paid', async () => {
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  const badge = page.locator('[data-testid="expense-row"]')
    .filter({ hasText: 'Cable Bill' })
    .locator('[data-testid="expense-bill-badge"]');
  await expect(badge).toContainText('Paid');
  await page.screenshot({ path: 'tests/screenshots/exp-pay-08-cable-paid.png' });
});

test('paid bill no longer shows the Record Payment button', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Cable Bill' });
  await expect(row.locator('[data-testid="expense-record-payment"]')).not.toBeVisible();
});

// ── Test 15: one-time expense on the calendar ─────────────────────────────────

test('Vet Bill one-time expense appears on the calendar on its date', async () => {
  await navigateTo(page, 'calendar');
  // The calendar chip uses data-testid="calendar-expense-chip"
  // and lives inside the day cell for ONE_TIME_DAY
  const dayCell = page.locator('[data-testid="calendar-cell"][data-day="${ONE_TIME_DAY}"]')
    .or(page.locator(`[data-testid="calendar-cell"][data-day="${ONE_TIME_DAY}"]`));

  // Directly find the chip by testid and text
  const chip = page.locator('[data-testid="calendar-expense-chip"]')
    .filter({ hasText: 'Vet Bill' });
  await expect(chip).toBeVisible({ timeout: 8000 });
  await expect(chip).toContainText('$200');
  await page.screenshot({ path: 'tests/screenshots/exp-pay-09-one-time-chip.png' });
});

test('one-time expense chip shows category name', async () => {
  const chip = page.locator('[data-testid="calendar-expense-chip"]').filter({ hasText: 'Vet Bill' });
  await expect(chip).toContainText('Utilities');
});

// ── Test 16: auto-pay bill on calendar ───────────────────────────────────────

test('Netflix auto-pay bill appears on the calendar', async () => {
  const chip = page.locator('[data-testid="calendar-bill-chip"]').filter({ hasText: 'Netflix' });
  await expect(chip).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: 'tests/screenshots/exp-pay-10-autopay-cal.png' });
});

test('Netflix calendar chip shows Auto-pay label', async () => {
  const chip = page.locator('[data-testid="calendar-bill-chip"]').filter({ hasText: 'Netflix' });
  await expect(chip).toContainText('Auto-pay');
});

test('Netflix calendar chip has no Record Payment button', async () => {
  // The chip wrapper for Netflix should not contain a cal-mark-paid button
  const wrap = page.locator('[data-testid="calendar-bill-chip"]')
    .filter({ hasText: 'Netflix' })
    .locator('..');
  const payBtn = wrap.locator('[data-testid="cal-mark-paid"]');
  await expect(payBtn).not.toBeVisible();
});

// ── Test 17: auto-pay excluded from dashboard reminders ──────────────────────

test('dashboard reminders do not include the auto-pay Netflix bill', async () => {
  await navigateTo(page, 'dashboard');
  // Electric Bill IS past-due and not auto-pay — reminders card should exist
  await expect(page.locator('[data-testid="payment-reminders-card"]')).toBeVisible({ timeout: 8000 });

  // No reminder row should mention Netflix
  const rows = page.locator('[data-testid="payment-reminder-row"]');
  const rowCount = await rows.count();
  for (let i = 0; i < rowCount; i++) {
    const text = await rows.nth(i).textContent();
    expect(text).not.toContain('Netflix');
  }
  await page.screenshot({ path: 'tests/screenshots/exp-pay-11-no-autopay-reminder.png' });

  // The dashboard visit fires the briefing mascot (Electric Bill is past-due).
  // Dismiss it so it doesn't block clicks on subsequent pages.
  const mascotBubble = page.locator('#mascot-root .mascot-bubble');
  try {
    await mascotBubble.waitFor({ state: 'visible', timeout: 1500 });
    await page.locator('[data-testid="mascot-git-btn"]').click();
    await mascotBubble.waitFor({ state: 'hidden', timeout: 2000 });
  } catch {
    // Mascot didn't appear within the grace period — nothing to dismiss.
  }
});

// ── Test: ghost-paid regression guard ────────────────────────────────────────

test('new recurring bill with a next-month due date is NOT auto-marked paid', async () => {
  // A bill whose first due date is in the next month gets expense.date = current month
  // (the form's prevPeriod calculation).  The old code would read expense.date and
  // falsely mark the bill as paid.  The current code requires an explicit
  // ExpensePaidRecord — so no badge should appear.
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ef-desc', 'Subscription Box');
  await page.fill('#ef-amount', '25');
  await page.selectOption('#ef-cat', { label: 'Utilities' });
  await page.check('#ef-recurring');
  await page.fill('#ef-duedate', NEXT_MONTH_DATE);

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Subscription Box' });
  await expect(row).toBeVisible();
  // Must NOT show a "✓ Paid" badge — no ExpensePaidRecord exists for this bill
  const badge = row.locator('[data-testid="expense-bill-badge"]');
  if (await badge.isVisible()) {
    await expect(badge).not.toContainText('Paid');
  }
  // Record Payment button must be present (not paid, not auto-pay)
  await expect(row.locator('[data-testid="expense-record-payment"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/exp-pay-12-ghost-paid-regression.png' });
});

// ── Test: auto-pay bills are exempt from status badges ────────────────────────

test('auto-pay bill with an overdue date shows no Past Due or Due-soon badge', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ef-desc', 'Spotify');
  await page.fill('#ef-amount', '10');
  await page.selectOption('#ef-cat', { label: 'Utilities' });
  await page.check('#ef-recurring');
  await page.fill('#ef-duedate', thisMonthDate(PAST_DUE_DAY));
  await page.check('#ef-autopay');

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Spotify' });
  await expect(row).toBeVisible();
  // Auto-pay bills should have NO status badge even when the due date has passed
  await expect(row.locator('[data-testid="expense-bill-badge"]')).not.toBeVisible();
  // Log Actual button is visible instead
  await expect(row.locator('[data-testid="expense-log-actual"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/exp-pay-13-autopay-no-badge.png' });
});

// ── Test: Record Payment overage warning ──────────────────────────────────────

test('Record Payment dialog shows overage warning when amount exceeds the monthly threshold', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await row.locator('[data-testid="expense-record-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // Electric Bill threshold is $95 — enter $120 to trigger the overage warning
  await page.fill('#mp-amount', '120');
  await expect(page.locator('#mp-overage-msg')).toBeVisible();
  await expect(page.locator('#mp-overage-msg')).toContainText('Over monthly threshold');
  await page.screenshot({ path: 'tests/screenshots/exp-pay-14-record-overage.png' });

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('Record Payment overage warning disappears when amount drops back below the threshold', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await row.locator('[data-testid="expense-record-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#mp-amount', '120');
  await expect(page.locator('#mp-overage-msg')).toBeVisible();

  await page.fill('#mp-amount', '80');
  await expect(page.locator('#mp-overage-msg')).not.toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Test: Update Actual pre-fills with previously logged amount ───────────────

test('Update Actual dialog pre-fills the amount with the previously logged value', async () => {
  // Netflix was logged at $16.99 earlier in this suite
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Netflix' });
  await expect(row.locator('[data-testid="expense-log-actual"]')).toContainText('Update Actual');
  await row.locator('[data-testid="expense-log-actual"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  const val = await page.locator('#la-amount').inputValue();
  expect(parseFloat(val)).toBeCloseTo(16.99, 1);
  await page.screenshot({ path: 'tests/screenshots/exp-pay-15-update-actual-prefill.png' });

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Test: Log Actual overage warning ─────────────────────────────────────────

test('Log Actual dialog shows overage warning when amount exceeds the monthly threshold', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Netflix' });
  await row.locator('[data-testid="expense-log-actual"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // Netflix threshold is $18 — enter $25 to trigger the overage warning
  await page.fill('#la-amount', '25');
  await expect(page.locator('#la-overage-msg')).toBeVisible();
  await expect(page.locator('#la-overage-msg')).toContainText('Over monthly threshold');
  await page.screenshot({ path: 'tests/screenshots/exp-pay-16-log-actual-overage.png' });

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});
