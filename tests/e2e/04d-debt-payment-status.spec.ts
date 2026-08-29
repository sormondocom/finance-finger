/**
 * Debt payment status E2E tests.
 *
 * Covers: payment status badges (paid, past-due, due-soon, partial),
 * debt row status border styling, payment history monthly chips,
 * and the dashboard payment reminders card.
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

// Compute due days relative to today so tests remain valid regardless of run date.
const today = new Date();
const dayOfMonth = today.getDate();
const thisYear = today.getFullYear();
const thisMonthPadded = String(today.getMonth() + 1).padStart(2, '0');
// 5 days before today (min day 1) — always a past-due date unless run on the 1st
const PAST_DUE_DAY = Math.max(1, dayOfMonth - 5);
// Tomorrow, checked against the actual days in this month.
// Only null on the last day of the month (no tomorrow exists this month).
const daysInMonth = new Date(thisYear, today.getMonth() + 1, 0).getDate();
const DUE_SOON_DAY: number | null = dayOfMonth + 1 <= daysInMonth ? dayOfMonth + 1 : null;

const thisMonthDate = (day: number): string =>
  `${thisYear}-${thisMonthPadded}-${String(day).padStart(2, '0')}`;

test.beforeAll(async () => {
  const ext = await launchExtensionContext();
  context = ext.context;
  cleanup = ext.cleanup;
  page = await context.newPage();
  await page.goto(ext.extUrl);
  await completeSetupWizard(page);
  await navigateTo(page, 'debt');
});

test.afterAll(async () => {
  await cleanup();
});

// ── Add accounts ─────────────────────────────────────────────────────────────

test('adds a credit card with a past-due date', async () => {
  await page.click('[data-testid="add-debt-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#da-name', 'Past Due Card');
  await page.fill('#da-balance', '2000');
  await page.fill('#da-apr', '22.99');
  await page.fill('#da-limit', '3000');
  await page.fill('#da-duedate', thisMonthDate(PAST_DUE_DAY));

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="debt-row"]').filter({ hasText: 'Past Due Card' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/debt-ps-01-past-due-added.png' });
});

test('sets minimum payment on past-due card via edit', async () => {
  const row = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Past Due Card' });
  await row.locator('[data-testid="debt-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.click('[name="da-min-type"][value="fixed"]');
  await page.fill('#da-min-value', '50');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('adds a credit card due within the week', async () => {
  test.skip(DUE_SOON_DAY === null, 'No valid due-soon day exists on the last day of the month');
  await page.click('[data-testid="add-debt-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#da-name', 'Due Soon Card');
  await page.fill('#da-balance', '1500');
  await page.fill('#da-apr', '19.99');
  await page.fill('#da-limit', '2000');
  await page.fill('#da-duedate', thisMonthDate(DUE_SOON_DAY));

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="debt-row"]').filter({ hasText: 'Due Soon Card' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/debt-ps-02-due-soon-added.png' });
});

test('sets minimum payment on due-soon card via edit', async () => {
  test.skip(DUE_SOON_DAY === null, 'No valid due-soon day exists on the last day of the month');
  const row = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Due Soon Card' });
  await row.locator('[data-testid="debt-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.click('[name="da-min-type"][value="fixed"]');
  await page.fill('#da-min-value', '30');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('adds a credit card with no due day for partial-payment testing', async () => {
  await page.click('[data-testid="add-debt-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#da-name', 'Partial Pay Card');
  await page.fill('#da-balance', '800');
  await page.fill('#da-apr', '15.99');
  await page.fill('#da-limit', '1000');
  // Intentionally leave #da-dueday empty — no due-day means partial never becomes past-due

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="debt-row"]').filter({ hasText: 'Partial Pay Card' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/debt-ps-03-partial-card-added.png' });
});

test('sets minimum payment on partial-pay card via edit', async () => {
  const row = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Partial Pay Card' });
  await row.locator('[data-testid="debt-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.click('[name="da-min-type"][value="fixed"]');
  await page.fill('#da-min-value', '40');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Payment status badges ─────────────────────────────────────────────────────

test('past-due card shows the past-due badge', async () => {
  const row = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Past Due Card' });
  await expect(row.locator('.debt-badge--past-due')).toBeVisible();
  await expect(row.locator('.debt-badge--past-due')).toContainText('Past Due');
  await page.screenshot({ path: 'tests/screenshots/debt-ps-04-past-due-badge.png' });
});

test('past-due card row has red left-border styling', async () => {
  const wrap = page.locator('.debt-account-wrap--past-due').filter({
    has: page.locator('[data-testid="debt-row"]').filter({ hasText: 'Past Due Card' }),
  });
  await expect(wrap).toBeVisible();
});

test('due-soon card shows the due-soon badge with clock icon', async () => {
  test.skip(DUE_SOON_DAY === null, 'No valid due-soon day exists on the last day of the month');
  const row = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Due Soon Card' });
  await expect(row.locator('.debt-badge--due-soon')).toBeVisible();
  await expect(row.locator('.debt-badge--due-soon')).toContainText('⏰');
  await page.screenshot({ path: 'tests/screenshots/debt-ps-05-due-soon-badge.png' });
});

test('due-soon card row has amber left-border styling', async () => {
  test.skip(DUE_SOON_DAY === null, 'No valid due-soon day exists on the last day of the month');
  const wrap = page.locator('.debt-account-wrap--due-soon').filter({
    has: page.locator('[data-testid="debt-row"]').filter({ hasText: 'Due Soon Card' }),
  });
  await expect(wrap).toBeVisible();
});

// ── Recording a qualifying payment ────────────────────────────────────────────

test('recording a payment at the minimum changes status to paid', async () => {
  test.skip(DUE_SOON_DAY === null, 'No valid due-soon day exists on the last day of the month');
  const row = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Due Soon Card' });
  await row.locator('[data-testid="debt-pay-btn"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // #pay-amount is pre-filled with the minimum ($30) — submit as-is
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  await expect(row.locator('.debt-badge--paid')).toBeVisible();
  await expect(row.locator('.debt-badge--paid')).toContainText('Paid');
  await page.screenshot({ path: 'tests/screenshots/debt-ps-06-paid-badge.png' });
});

test('paid card row has green left-border styling', async () => {
  test.skip(DUE_SOON_DAY === null, 'No valid due-soon day exists on the last day of the month');
  const wrap = page.locator('.debt-account-wrap--paid').filter({
    has: page.locator('[data-testid="debt-row"]').filter({ hasText: 'Due Soon Card' }),
  });
  await expect(wrap).toBeVisible();
});

test('payment history panel shows a paid chip for the current month', async () => {
  test.skip(DUE_SOON_DAY === null, 'No valid due-soon day exists on the last day of the month');
  const row = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Due Soon Card' });
  const histBtn = row.locator('[data-testid="payment-history-btn"]');
  await expect(histBtn).toBeVisible();
  await histBtn.click();

  // Panel is a sibling of the row inside the account wrap
  const wrap = page.locator('.debt-account-wrap').filter({ has: row });
  const panel = wrap.locator('[data-testid="payment-history-panel"]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.payment-month-chip--paid')).toBeVisible();
  await expect(panel.locator('[data-testid="payment-history-item"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/debt-ps-07-payment-history.png' });
});

// ── Partial payment ───────────────────────────────────────────────────────────

test('a payment below the minimum shows the partial badge', async () => {
  const row = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Partial Pay Card' });
  await row.locator('[data-testid="debt-pay-btn"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#pay-amount', '10'); // below $40 minimum
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  await expect(row.locator('.debt-badge--partial')).toBeVisible();
  await expect(row.locator('.debt-badge--partial')).toContainText('Partial');
  await page.screenshot({ path: 'tests/screenshots/debt-ps-08-partial-badge.png' });
});

// ── Dashboard payment reminders ───────────────────────────────────────────────

test('dashboard shows a payment reminders card when cards are past due', async () => {
  await navigateTo(page, 'dashboard');
  await expect(page.locator('[data-testid="payment-reminders-card"]')).toBeVisible();
  await expect(page.locator('[data-testid="payment-reminders-card"]')).toContainText('Past Due Card');
  await page.screenshot({ path: 'tests/screenshots/debt-ps-09-dashboard-reminders.png' });
});

test('past-due account row appears with past-due label in the reminders card', async () => {
  const remindersCard = page.locator('[data-testid="payment-reminders-card"]');
  await expect(remindersCard.locator('.payment-reminder-row--past-due')).toBeVisible();
  await expect(remindersCard.locator('.payment-reminder-label--past-due')).toBeVisible();
});
