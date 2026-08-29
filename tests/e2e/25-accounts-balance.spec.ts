/**
 * Bank Accounts: balance display, starting balance, month navigation, and
 * one-time income integration.
 *
 * The displayed "Current Balance" is computed as:
 *
 *   (startingBalance ?? 0) + monthlyRecurringIncome + oneTimeIncomeThisMonth
 *                          − monthlyRecurringExpenses
 *
 * When no starting balance, income, or expenses are linked the row shows a
 * placeholder hint instead of a zero.
 *
 * Month navigation (‹ / ›) lets users look at prior months; one-time deposits
 * only appear in the month they fall in.
 *
 * Tests build state cumulatively (single fresh extension context):
 *   — "River Bank" account (no starting balance, nothing linked)
 *   — Member "Taylor" + "$3,000/mo" income source linked to River Bank
 *   — River Bank starting balance updated to $5,000
 *   — One-time income "$1,000" dated today, linked to River Bank
 *
 * Balance expectations by scenario:
 *   No linked data                  → placeholder hint, no number
 *   $3,000/mo income, no start bal  → $3,000.00
 *   $3,000/mo income + $5k start    → $8,000.00
 *   + $1,000 one-time this month    → $9,000.00
 *   Previous month (no one-time)    → $8,000.00
 *   Current month (back via ›)      → $9,000.00
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

const now = new Date();
const TODAY = now.toISOString().split('T')[0]!;
const CURRENT_MONTH_LABEL = now.toLocaleString('default', { month: 'long', year: 'numeric' });
const PREV_MONTH = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const PREV_MONTH_LABEL = PREV_MONTH.toLocaleString('default', { month: 'long', year: 'numeric' });

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

// ── Starting balance form label ───────────────────────────────────────────────

test('account form labels the balance field "Starting balance"', async () => {
  await navigateTo(page, 'accounts');
  await page.click('[data-testid="add-account-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // The label text must say "Starting balance", not "Current balance"
  const label = page.locator('label[for="ba-balance"]');
  await expect(label).toContainText('Starting balance');
  await expect(label).not.toContainText('Current balance');

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/accounts-bal-01-label.png' });
});

// ── No-data placeholder ───────────────────────────────────────────────────────

test('adds River Bank with no starting balance and no linked income', async () => {
  await page.click('[data-testid="add-account-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ba-name', 'River Bank');
  await page.selectOption('#ba-type', 'checking');
  // Leave balance blank

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="account-row"]').filter({ hasText: 'River Bank' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/accounts-bal-02-no-data.png' });
});

test('account with no data shows a placeholder hint, not a number', async () => {
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'River Bank' });
  await expect(row.locator('[data-testid="account-balance-hint"]')).toBeVisible();
  await expect(row.locator('[data-testid="account-balance-hint"]')).toContainText('Link income or expenses');
  await expect(row.locator('[data-testid="account-balance"]')).not.toBeVisible();
});

// ── Balance derived from linked recurring income ──────────────────────────────

test('setup: add member Taylor with $3,000/mo income linked to River Bank', async () => {
  await navigateTo(page, 'income');
  await page.fill('[data-testid="add-member-input"]', 'Taylor');
  await page.click('[data-testid="add-member-btn"]');
  await expect(page.locator('[data-testid="member-chip"]').filter({ hasText: 'Taylor' })).toBeVisible();

  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#sf-name', 'Main Job');
  await page.fill('#sf-amount', '3000');
  // Frequency defaults to monthly
  await page.selectOption('[data-testid="sf-account-select"]', { label: 'River Bank' });

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Main Job' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/accounts-bal-03-income-linked.png' });
});

test('River Bank balance is $3,000 when no starting balance and $3,000/mo income', async () => {
  await navigateTo(page, 'accounts');
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'River Bank' });
  const balance = row.locator('[data-testid="account-balance"]');
  await expect(balance).toBeVisible();
  // (null ?? 0) + 3000 = 3,000.00
  await expect(balance).toContainText('3,000');
  // Hint should no longer be visible now that there is linked data
  await expect(row.locator('[data-testid="account-balance-hint"]')).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/accounts-bal-04-derived-balance.png' });
});

// ── Starting balance seeds the formula ───────────────────────────────────────

test('setting a starting balance of $5,000 updates the displayed balance to $8,000', async () => {
  // Already on accounts page
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'River Bank' });
  await row.locator('[data-testid="account-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ba-balance', '5000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  const balance = row.locator('[data-testid="account-balance"]');
  // 5000 + 3000 = 8,000.00
  await expect(balance).toContainText('8,000');
  await page.screenshot({ path: 'tests/screenshots/accounts-bal-05-starting-balance.png' });
});

// ── Month navigation ──────────────────────────────────────────────────────────

test('month navigation shows the current month label', async () => {
  const label = page.locator('.month-nav-label');
  await expect(label).toBeVisible();
  await expect(label).toContainText(CURRENT_MONTH_LABEL);
  await page.screenshot({ path: 'tests/screenshots/accounts-bal-06-month-nav.png' });
});

test('next month button is disabled when viewing the current month', async () => {
  const nextBtn = page.locator('.month-nav-btn[aria-label="Next month"]');
  await expect(nextBtn).toBeDisabled();
});

test('clicking previous month changes the label to the prior month', async () => {
  await page.click('.month-nav-btn[aria-label="Previous month"]');
  const label = page.locator('.month-nav-label');
  await expect(label).toContainText(PREV_MONTH_LABEL);
  await page.screenshot({ path: 'tests/screenshots/accounts-bal-07-prev-month.png' });
});

test('clicking next month returns the label to the current month', async () => {
  await page.click('.month-nav-btn[aria-label="Next month"]');
  const label = page.locator('.month-nav-label');
  await expect(label).toContainText(CURRENT_MONTH_LABEL);
});

// ── One-time income only shows in its month ───────────────────────────────────

test('setup: add one-time income $1,000 for today linked to River Bank', async () => {
  await navigateTo(page, 'income');

  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#sf-name', 'Client Payout');
  await page.fill('#sf-amount', '1000');
  await page.selectOption('#sf-freq', 'once');
  await page.fill('#sf-date', TODAY);
  await page.selectOption('[data-testid="sf-account-select"]', { label: 'River Bank' });

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Client Payout' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/accounts-bal-08-onetime-added.png' });
});

test('current month balance includes the one-time income ($9,000)', async () => {
  await navigateTo(page, 'accounts');
  // Month nav resets to current month on page load
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'River Bank' });
  const balance = row.locator('[data-testid="account-balance"]');
  // 5000 + 3000 + 1000 = 9,000.00
  await expect(balance).toContainText('9,000');
  await page.screenshot({ path: 'tests/screenshots/accounts-bal-09-onetime-current.png' });
});

test('previous month balance excludes the one-time income (back to $8,000)', async () => {
  await page.click('.month-nav-btn[aria-label="Previous month"]');

  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'River Bank' });
  const balance = row.locator('[data-testid="account-balance"]');
  // One-time income is dated this month, so previous month gets 5000 + 3000 + 0 = 8,000
  await expect(balance).toContainText('8,000');
  await expect(balance).not.toContainText('9,000');
  await page.screenshot({ path: 'tests/screenshots/accounts-bal-10-onetime-prev-month.png' });
});

test('navigating back to current month restores the one-time income in the balance', async () => {
  await page.click('.month-nav-btn[aria-label="Next month"]');

  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'River Bank' });
  const balance = row.locator('[data-testid="account-balance"]');
  await expect(balance).toContainText('9,000');
  await page.screenshot({ path: 'tests/screenshots/accounts-bal-11-back-to-current.png' });
});
