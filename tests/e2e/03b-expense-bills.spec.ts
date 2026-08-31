/**
 * Expense bill-tracking E2E tests.
 *
 * Covers: adding recurring expenses with due days, payment status badges
 * (past-due, due-soon, paid), the Mark Paid button, date label update,
 * and the dashboard bill-reminders card.
 *
 * Bill paid status is driven exclusively by ExpensePaidRecord (not expense.date),
 * so newly-created bills will never be auto-marked paid without an explicit
 * Record Payment action.
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

// Date helpers ----------------------------------------------------------------
const today       = new Date();
const dayOfMonth  = today.getDate();
const thisYear    = today.getFullYear();
const thisMonthPadded = String(today.getMonth() + 1).padStart(2, '0');

// Past-due: 5 days before today (min day 1)
const PAST_DUE_DAY = Math.max(1, dayOfMonth - 5);
// Due-soon: tomorrow if it still falls in this month; otherwise today (daysUntilDue=0 is ≤7).
const daysInMonth = new Date(thisYear, today.getMonth() + 1, 0).getDate();
const DUE_SOON_DAY: number = dayOfMonth < daysInMonth ? dayOfMonth + 1 : dayOfMonth;

// Build a YYYY-MM-DD string for the given day in the current month.
// The form's "First due date" picker extracts dueDay + auto-sets expense.date
// to one period prior, so no separate PREV_MONTH_DATE seed is needed.
const thisMonthDate = (day: number): string =>
  `${thisYear}-${thisMonthPadded}-${String(day).padStart(2, '0')}`;

// -----------------------------------------------------------------------------

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

// ── Category setup ───────────────────────────────────────────────────────────

test('adds a Utilities category for bill testing', async () => {
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'Utilities');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="category-pill"]').filter({ hasText: 'Utilities' })).toBeVisible();
});

// ── Adding bills with due days ────────────────────────────────────────────────

test('due-day field appears when recurring is checked', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // Due date picker should be hidden before checking recurring
  await expect(page.locator('#ef-duedate')).not.toBeVisible();

  await page.check('#ef-recurring');
  await expect(page.locator('#ef-duedate')).toBeVisible();

  // Close without saving
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('adds a past-due recurring bill (Electric Bill)', async () => {
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
  await page.screenshot({ path: 'tests/screenshots/bills-01-electric-added.png' });
});

test('adds a due-soon recurring bill (Water Bill)', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ef-desc', 'Water Bill');
  await page.fill('#ef-amount', '55');
  await page.selectOption('#ef-cat', { label: 'Utilities' });

  await page.check('#ef-recurring');
  await page.fill('#ef-duedate', thisMonthDate(DUE_SOON_DAY));

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Water Bill' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bills-02-water-added.png' });
});

// ── Past-due badge and border ─────────────────────────────────────────────────

test('past-due bill shows the past-due badge', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await expect(row.locator('[data-testid="expense-bill-badge"]')).toBeVisible();
  await expect(row.locator('[data-testid="expense-bill-badge"]')).toContainText('Past Due');
  await page.screenshot({ path: 'tests/screenshots/bills-03-past-due-badge.png' });
});

test('past-due bill row has red left-border styling', async () => {
  const wrap = page.locator('.expense-bill-wrap--past-due').filter({
    has: page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' }),
  });
  await expect(wrap).toBeVisible();
});

test('past-due bill shows the Mark Paid button', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await expect(row.locator('[data-testid="expense-record-payment"]')).toBeVisible();
});

// ── Due-soon badge and border ─────────────────────────────────────────────────

test('due-soon bill shows the due-soon badge with clock icon', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Water Bill' });
  await expect(row.locator('[data-testid="expense-bill-badge"]')).toBeVisible();
  await expect(row.locator('[data-testid="expense-bill-badge"]')).toContainText('⏰');
  await page.screenshot({ path: 'tests/screenshots/bills-04-due-soon-badge.png' });
});

test('due-soon bill row has amber left-border styling', async () => {
  const wrap = page.locator('.expense-bill-wrap--due-soon').filter({
    has: page.locator('[data-testid="expense-row"]').filter({ hasText: 'Water Bill' }),
  });
  await expect(wrap).toBeVisible();
});

test('due-soon bill shows the Mark Paid button', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Water Bill' });
  await expect(row.locator('[data-testid="expense-record-payment"]')).toBeVisible();
});

// ── Mark Paid ─────────────────────────────────────────────────────────────────

test('clicking Mark Paid opens an amount dialog', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Water Bill' });
  await row.locator('[data-testid="expense-record-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('#mp-amount')).toBeVisible();
  // pre-filled with the expense's usual amount ($55)
  const val = await page.locator('#mp-amount').inputValue();
  expect(parseFloat(val)).toBeCloseTo(55, 0);
  await page.screenshot({ path: 'tests/screenshots/bills-05a-mark-paid-modal.png' });
});

test('submitting the mark-paid dialog marks the Water Bill as paid', async () => {
  // Submit with the pre-filled default amount
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  await expect(
    page.locator('[data-testid="expense-row"]')
      .filter({ hasText: 'Water Bill' })
      .locator('[data-testid="expense-bill-badge"]'),
  ).toContainText('Paid');
  await page.screenshot({ path: 'tests/screenshots/bills-05b-marked-paid.png' });
});

test('paid bill row has green left-border styling', async () => {
  const wrap = page.locator('.expense-bill-wrap--paid').filter({
    has: page.locator('[data-testid="expense-row"]').filter({ hasText: 'Water Bill' }),
  });
  await expect(wrap).toBeVisible();
});

test('Mark Paid button is gone after the bill is paid', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Water Bill' });
  await expect(row.locator('[data-testid="expense-record-payment"]')).not.toBeVisible();
});

test('paid bill date label starts with Paid', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Water Bill' });
  await expect(row.locator('.expense-row-date')).toContainText('Paid');
});

// ── Recur chip shows due-day info ─────────────────────────────────────────────

test('recurring badge on a bill shows the next due date', async () => {
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  // e.g. "↻ Monthly · Due Aug 26"
  await expect(row.locator('.expense-row-recur')).toContainText('Due ');
});

// ── Dashboard bill reminders ──────────────────────────────────────────────────

test('dashboard shows a payment reminders card for past-due bills', async () => {
  await navigateTo(page, 'dashboard');
  await expect(page.locator('[data-testid="payment-reminders-card"]')).toBeVisible();
  await expect(page.locator('[data-testid="payment-reminders-card"]')).toContainText('Electric Bill');
  await page.screenshot({ path: 'tests/screenshots/bills-06-dashboard-reminders.png' });
});

test('paid bill does not appear in the dashboard reminders card', async () => {
  const card = page.locator('[data-testid="payment-reminders-card"]');
  await expect(card).not.toContainText('Water Bill');
});

test('reminders card shows a past-due label for the Electric Bill', async () => {
  const card = page.locator('[data-testid="payment-reminders-card"]');
  await expect(card.locator('.payment-reminder-row--past-due')).toBeVisible();
  await expect(card.locator('.payment-reminder-label--past-due')).toBeVisible();
});

test('reminders card manage link says View bills when no debt alerts exist', async () => {
  const card = page.locator('[data-testid="payment-reminders-card"]');
  await expect(card.locator('.payment-reminders-link')).toContainText('View bills');
});
