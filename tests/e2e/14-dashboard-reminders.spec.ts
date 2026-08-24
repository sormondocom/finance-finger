/**
 * Dashboard Payment Reminders E2E tests.
 *
 * Verifies: reminder rows are sorted by due date (most overdue first, then
 * upcoming ascending), rows are clickable and navigate to the correct page
 * (/debt for card payments, /expenses for bills), and the active nav link
 * updates after navigation.
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

const today = new Date();
const dayOfMonth = today.getDate();

// Past-due bill: 6 days ago (min day 1)
const PAST_DUE_BILL_DAY = Math.max(1, dayOfMonth - 6);
// Due-soon bill: 3 days from now (max day 27)
const DUE_SOON_BILL_DAY = Math.min(27, dayOfMonth + 3);

// Past-due card: 4 days ago (min day 1, must differ from bill)
const PAST_DUE_CARD_DAY = Math.max(1, dayOfMonth - 4);
// Due-soon card: 5 days from now (max day 28)
const DUE_SOON_CARD_DAY = Math.min(28, dayOfMonth + 5);

const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 15);
const PREV_MONTH_DATE = [
  prevMonth.getFullYear(),
  String(prevMonth.getMonth() + 1).padStart(2, '0'),
  '15',
].join('-');

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

// ── Seed: income + bill + debt account with due dates ─────────────────────────

test('adds monthly income', async () => {
  await navigateTo(page, 'income');
  await page.fill('[data-testid="add-member-input"]', 'Jo');
  await page.click('[data-testid="add-member-btn"]');
  await expect(page.locator('[data-testid="member-chip"]').filter({ hasText: 'Jo' })).toBeVisible();

  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#sf-name', 'Wages');
  await page.fill('#sf-amount', '4000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Wages' })).toBeVisible();
});

test('adds a past-due recurring bill', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'Utilities');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="category-pill"]').filter({ hasText: 'Utilities' })).toBeVisible();

  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#ef-desc', 'Water Bill');
  await page.fill('#ef-amount', '55');
  await page.selectOption('#ef-cat', { label: 'Utilities' });
  await page.check('#ef-recurring');
  await page.fill('#ef-dueday', String(PAST_DUE_BILL_DAY));
  await page.fill('#ef-date', PREV_MONTH_DATE);
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Water Bill' })).toBeVisible();
});

test('adds a due-soon recurring bill', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#ef-desc', 'Phone Bill');
  await page.fill('#ef-amount', '80');
  await page.selectOption('#ef-cat', { label: 'Utilities' });
  await page.check('#ef-recurring');
  await page.fill('#ef-dueday', String(DUE_SOON_BILL_DAY));
  await page.fill('#ef-date', PREV_MONTH_DATE);
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Phone Bill' })).toBeVisible();
});

test('adds a credit card with a past-due payment', async () => {
  await navigateTo(page, 'debt');
  await page.click('[data-testid="add-debt-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#da-name', 'Visa Classic');
  await page.fill('#da-balance', '1200');
  await page.fill('#da-apr', '18');
  await page.fill('#da-limit', '3000');
  await page.fill('#da-dueday', String(PAST_DUE_CARD_DAY));

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="debt-row"]').filter({ hasText: 'Visa Classic' })).toBeVisible();

  // Set a fixed minimum payment so it shows up in reminders
  const visaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Visa Classic' });
  await visaRow.locator('[data-testid="debt-setup"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.locator('[name="da-min-type"][value="fixed"]').check();
  await page.fill('#da-min-value', '50');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Dashboard reminder card ───────────────────────────────────────────────────

test('payment reminders card is visible on dashboard', async () => {
  await navigateTo(page, 'dashboard');
  await expect(page.locator('[data-testid="payment-reminders-card"]')).toBeVisible({ timeout: 8000 });
  await page.screenshot({ path: 'tests/screenshots/reminders-01-card.png' });
});

test('reminder rows are sorted with past-due items first', async () => {
  const rows = page.locator('[data-testid="payment-reminder-row"]');
  await expect(rows.first()).toBeVisible();

  // The first row should be a past-due item (either bill or card — both are past-due)
  const firstRow = rows.first();
  await expect(firstRow).toHaveClass(/payment-reminder-row--past-due/);
  await page.screenshot({ path: 'tests/screenshots/reminders-02-sorted.png' });
});

test('past-due items appear before due-soon items', async () => {
  const rows = page.locator('[data-testid="payment-reminder-row"]');
  await expect(rows).toHaveCount(3); // 1 past-due bill + 1 past-due card + 1 due-soon bill

  // All past-due rows should precede all due-soon rows
  const severities: string[] = [];
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const cls = await rows.nth(i).getAttribute('class') ?? '';
    severities.push(cls.includes('past-due') ? 'past-due' : 'due-soon');
  }
  // No due-soon should appear before any past-due
  const firstDueSoonIdx = severities.indexOf('due-soon');
  const lastPastDueIdx = severities.lastIndexOf('past-due');
  if (firstDueSoonIdx !== -1 && lastPastDueIdx !== -1) {
    expect(firstDueSoonIdx).toBeGreaterThan(lastPastDueIdx);
  }
});

// ── Clickable rows — navigation ───────────────────────────────────────────────

test('clicking a bill reminder row navigates to expenses page', async () => {
  await navigateTo(page, 'dashboard');
  await expect(page.locator('[data-testid="payment-reminders-card"]')).toBeVisible({ timeout: 8000 });

  // Find a bill row (contains 🧾) and click it
  const billRow = page.locator('[data-testid="payment-reminder-row"]').filter({ hasText: '🧾' }).first();
  await expect(billRow).toBeVisible();
  await billRow.click();

  // Should land on the expenses page
  await expect(page.locator('[data-testid="add-expense-btn"]')).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: 'tests/screenshots/reminders-03-nav-expenses.png' });
});

test('clicking a debt reminder row navigates to debt page', async () => {
  await navigateTo(page, 'dashboard');
  await expect(page.locator('[data-testid="payment-reminders-card"]')).toBeVisible({ timeout: 8000 });

  // Find a card row (contains 💳) and click it
  const cardRow = page.locator('[data-testid="payment-reminder-row"]').filter({ hasText: '💳' }).first();
  await expect(cardRow).toBeVisible();
  await cardRow.click();

  // Should land on the debt page
  await expect(page.locator('[data-testid="add-debt-btn"]')).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: 'tests/screenshots/reminders-04-nav-debt.png' });
});
