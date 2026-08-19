/**
 * Dashboard E2E tests.
 *
 * Covers: summary cards, month navigation in header, one-time income/expense
 * logging and their effect on summary card breakdowns, custom date-range mode
 * (Period Report), month-row expansion, and returning to month mode via Clear.
 *
 * State is intentionally cumulative — each test builds on the previous one.
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

/** Returns today's date as YYYY-MM-DD in local time. */
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test.beforeAll(async () => {
  const ext = await launchExtensionContext();
  context = ext.context;
  cleanup = ext.cleanup;
  page = await context.newPage();
  await page.goto(ext.extUrl);
  await completeSetupWizard(page);
  // completeSetupWizard leaves us on the dashboard
});

test.afterAll(async () => {
  await cleanup();
});

// ── Summary cards ────────────────────────────────────────────────────────────

test('dashboard loads with four summary cards', async () => {
  await expect(page.locator('[data-testid="summary-card-income"]')).toBeVisible();
  await expect(page.locator('[data-testid="summary-card-expenses"]')).toBeVisible();
  await expect(page.locator('[data-testid="summary-card-surplus"]')).toBeVisible();
  await expect(page.locator('[data-testid="summary-card-debt"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/dash-01-loaded.png' });
});

test('summary cards show em-dash when no financial data exists', async () => {
  // Fresh context: no income sources, no expenses — income/expense/net show —
  await expect(page.locator('[data-testid="summary-value-income"]')).toHaveText('—');
  await expect(page.locator('[data-testid="summary-value-expenses"]')).toHaveText('—');
  await expect(page.locator('[data-testid="summary-value-surplus"]')).toHaveText('—');
  // Debt card shows — because debtCount is 0, value is —
  await expect(page.locator('[data-testid="summary-value-debt"]')).toHaveText('—');
});

// ── Month navigation ─────────────────────────────────────────────────────────

test('month nav is visible in the page header', async () => {
  await expect(page.locator('[data-testid="dash-month-label"]')).toBeVisible();
  await expect(page.locator('[data-testid="dash-prev"]')).toBeVisible();
  await expect(page.locator('[data-testid="dash-next"]')).toBeVisible();
  await expect(page.locator('[data-testid="custom-range-btn"]')).toBeVisible();
});

test('next-month button is disabled on the current month', async () => {
  await expect(page.locator('[data-testid="dash-next"]')).toBeDisabled();
});

test('navigates to previous month and back', async () => {
  const originalLabel = await page.locator('[data-testid="dash-month-label"]').innerText();

  await page.click('[data-testid="dash-prev"]');
  const prevLabel = await page.locator('[data-testid="dash-month-label"]').innerText();
  expect(prevLabel).not.toBe(originalLabel);

  // Next should now be enabled since we're in the past
  await expect(page.locator('[data-testid="dash-next"]')).toBeEnabled();

  await page.click('[data-testid="dash-next"]');
  await expect(page.locator('[data-testid="dash-month-label"]')).toHaveText(originalLabel);
  await expect(page.locator('[data-testid="dash-next"]')).toBeDisabled();
  await page.screenshot({ path: 'tests/screenshots/dash-02-month-nav.png' });
});

// ── Monthly Activity section ─────────────────────────────────────────────────

test('monthly activity section is visible with log buttons', async () => {
  await expect(page.locator('[data-testid="add-unexpected-income-btn"]')).toBeVisible();
  await expect(page.locator('[data-testid="add-surprise-expense-btn"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/dash-03-activity.png' });
});

// ── Log one-time income ──────────────────────────────────────────────────────

test('logs a one-time income item', async () => {
  await page.click('[data-testid="add-unexpected-income-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ui-name', 'Tax Refund');
  await page.fill('#ui-amount', '1500');
  // Date defaults to today — leave it

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="ma-row"]').filter({ hasText: 'Tax Refund' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/dash-04-income-logged.png' });
});

test('income summary card shows breakdown after one-time income is logged', async () => {
  await expect(page.locator('[data-testid="summary-breakdown-income"]')).toBeVisible();
  await expect(page.locator('[data-testid="summary-value-income"]')).toContainText('$1,500');
});

// ── Log one-time expense ─────────────────────────────────────────────────────

test('logs a one-time expense item', async () => {
  await page.click('[data-testid="add-surprise-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#se-desc', 'Car Repair');
  await page.fill('#se-amount', '650');
  // Date defaults to today — leave it

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="ma-row"]').filter({ hasText: 'Car Repair' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/dash-05-expense-logged.png' });
});

test('expense summary card shows breakdown after one-time expense is logged', async () => {
  await expect(page.locator('[data-testid="summary-breakdown-expenses"]')).toBeVisible();
  await expect(page.locator('[data-testid="summary-value-expenses"]')).toContainText('$650');
});

test('net cash flow card shows both components in breakdown', async () => {
  await expect(page.locator('[data-testid="summary-breakdown-net"]')).toBeVisible();
  // Net = $1500 income - $650 expense = +$850
  await expect(page.locator('[data-testid="summary-value-surplus"]')).toContainText('$850');
});

// ── Custom range mode ────────────────────────────────────────────────────────

test('clicking Custom Range replaces month nav with date inputs', async () => {
  await page.click('[data-testid="custom-range-btn"]');
  await expect(page.locator('[data-testid="range-start"]')).toBeVisible();
  await expect(page.locator('[data-testid="range-end"]')).toBeVisible();
  await expect(page.locator('[data-testid="range-apply"]')).toBeVisible();
  await expect(page.locator('[data-testid="range-clear"]')).toBeVisible();
  // Month nav buttons should be gone
  await expect(page.locator('[data-testid="dash-prev"]')).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/dash-06-range-inputs.png' });
});

test('applying a custom range shows the Period Report', async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  await page.fill('[data-testid="range-start"]', toISODate(startOfMonth));
  await page.fill('[data-testid="range-end"]', toISODate(now));
  await page.click('[data-testid="range-apply"]');

  await expect(page.locator('h2').filter({ hasText: 'Period Report' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/dash-07-period-report.png' });
});

test('period report shows at least one month row and a total row', async () => {
  const monthRows = page.locator('[data-testid="report-month-row"]');
  await expect(monthRows.first()).toBeVisible();
  await expect(page.locator('[data-testid="report-total-row"]')).toBeVisible();
});

test('summary cards show period totals in custom range mode', async () => {
  // Our logged income ($1500) and expense ($650) should still appear in range totals
  await expect(page.locator('[data-testid="summary-value-income"]')).toContainText('$1,500');
  await expect(page.locator('[data-testid="summary-value-expenses"]')).toContainText('$650');
});

test('expanding a month row with items reveals the detail panel', async () => {
  // The current month has our Tax Refund and Car Repair — its expand button should be active
  const expandBtn = page.locator('[data-testid="report-expand-btn"]:not(.report-expand-btn-empty)').first();
  await expect(expandBtn).toBeVisible();

  await expandBtn.click();

  const detail = page.locator('[data-testid="report-detail"]').first();
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('Tax Refund');
  await page.screenshot({ path: 'tests/screenshots/dash-08-expanded.png' });
});

test('collapsing the expanded month row hides the detail panel', async () => {
  const expandBtn = page.locator('[data-testid="report-expand-btn"]:not(.report-expand-btn-empty)').first();
  await expandBtn.click();
  const detail = page.locator('[data-testid="report-detail"]').first();
  await expect(detail).not.toBeVisible();
});

// ── Return to month mode ─────────────────────────────────────────────────────

test('clearing custom range returns to month navigation mode', async () => {
  await page.click('[data-testid="range-clear"]');
  await expect(page.locator('[data-testid="dash-prev"]')).toBeVisible();
  await expect(page.locator('[data-testid="dash-month-label"]')).toBeVisible();
  await expect(page.locator('[data-testid="custom-range-btn"]')).toBeVisible();
  // Monthly Activity heading should be back
  await expect(page.locator('h2').filter({ hasText: 'Monthly Activity' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/dash-09-cleared.png' });
});

test('one-time items are still visible after returning to month mode', async () => {
  await expect(page.locator('[data-testid="ma-row"]').filter({ hasText: 'Tax Refund' })).toBeVisible();
  await expect(page.locator('[data-testid="ma-row"]').filter({ hasText: 'Car Repair' })).toBeVisible();
});
