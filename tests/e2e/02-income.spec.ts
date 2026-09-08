/**
 * Income page E2E tests.
 *
 * Covers: member management (add/remove), income source CRUD,
 * frequency selection, active/inactive toggle, monthly total,
 * month navigation, YTD/projected panel, and one-time source scoping.
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

// Dynamic date helpers — keeps tests valid regardless of what month they run in.
// One-time sources must be dated in the viewed month to appear in the source list.
const now = new Date();
const currentMonthDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
const currentMonthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const prevMonthLabel = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

test.beforeAll(async () => {
  const ext = await launchExtensionContext();
  context = ext.context;
  cleanup = ext.cleanup;
  page = await context.newPage();
  await page.goto(ext.extUrl);
  await completeSetupWizard(page);
  await navigateTo(page, 'income');
});

test.afterAll(async () => {
  await cleanup();
});

test('income page loads with household members card', async () => {
  await expect(page.locator('[data-testid="income-monthly-total"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/income-01-landing.png' });
});

test('adds a second household member', async () => {
  await page.fill('[data-testid="add-member-input"]', 'Jamie');
  await page.click('[data-testid="add-member-btn"]');
  await expect(page.locator('[data-testid="member-chip"][data-member-id]').filter({ hasText: 'Jamie' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/income-02-member-added.png' });
});

test('shows add-source button after members exist', async () => {
  await expect(page.locator('[data-testid="add-source-btn"]')).toBeVisible();
});

test('adds a monthly income source', async () => {
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // Pick the primary member (first in list)
  const memberSel = page.locator('#sf-member');
  await expect(memberSel).toBeVisible();

  await page.fill('#sf-name', 'Day Job');
  await page.fill('#sf-amount', '4999.50');
  // Frequency defaults to monthly — leave it

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  const sourceRow = page.locator('[data-testid="source-row"]').filter({ hasText: 'Day Job' });
  await expect(sourceRow).toBeVisible();
  // Source row displays the entered amount with full cents via fmtCents (trailing zero preserved)
  await expect(sourceRow).toContainText('$4,999.50');
  await page.screenshot({ path: 'tests/screenshots/income-03-source-added.png' });
});

test('monthly total updates after adding source', async () => {
  const total = await page.locator('[data-testid="income-monthly-total"]').innerText();
  // Monthly total uses fmt (rounds to whole dollars): $4,999.50 → $5,000
  expect(total).toMatch(/\$5,000/);
});

// ── Month navigation ──────────────────────────────────────────────────────────

test('month label shows current month and next button is disabled', async () => {
  await expect(page.locator('.income-month-label')).toContainText(currentMonthLabel);
  // Next (›) is disabled when already viewing the current month
  await expect(page.locator('[data-action="next"]')).toBeDisabled();
  await page.screenshot({ path: 'tests/screenshots/income-08-month-label.png' });
});

test('prev button navigates to previous month; YTD panel hidden on past months', async () => {
  // YTD panel is visible on the current month because we have an active recurring source
  await expect(page.locator('.income-ytd-bar')).toBeVisible();

  await page.click('[data-action="prev"]');
  await expect(page.locator('.income-month-label')).toContainText(prevMonthLabel);

  // YTD/Projected panel only appears on the current month view
  await expect(page.locator('.income-ytd-bar')).not.toBeVisible();

  // Next button re-enables once we're on a past month
  await expect(page.locator('[data-action="next"]')).not.toBeDisabled();

  // Navigate back to current month for subsequent tests
  await page.click('[data-action="next"]');
  await expect(page.locator('.income-month-label')).toContainText(currentMonthLabel);
  await page.screenshot({ path: 'tests/screenshots/income-09-month-nav.png' });
});

// ── One-time income source ────────────────────────────────────────────────────

test('adds a one-time income source', async () => {
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#sf-name', 'Tax Refund');
  // Select 'once' first so the amount field visibility matches what a real user sees
  await page.selectOption('#sf-freq', 'once');
  // Amount field must still be visible after switching to one-time
  await expect(page.locator('#sf-amount')).toBeVisible();
  await page.fill('#sf-amount', '1200');
  // Date must be in the current month so the source appears in the default (current-month) view
  await page.fill('#sf-date', currentMonthDate);

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Tax Refund' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/income-04-onetime-source.png' });
});

test('monthly total shows recurring and one-time breakdown when both are present', async () => {
  // When one-time income exists in the viewed month, the header switches from a single
  // value to a three-row breakdown: Recurring / + One-time / Total
  await expect(page.locator('.income-totals-label').filter({ hasText: 'Recurring' })).toBeVisible();
  await expect(page.locator('.income-totals-label').filter({ hasText: '+ One-time' })).toBeVisible();
  // Combined total: $4,999.50 (Day Job) + $1,200 (Tax Refund) = $6,199.50 → rounds to $6,200
  const total = await page.locator('[data-testid="income-monthly-total"]').innerText();
  expect(total).toMatch(/\$6,200/);
  await page.screenshot({ path: 'tests/screenshots/income-10-breakdown.png' });
});

test('one-time source is hidden when viewing a different month', async () => {
  // Confirm Tax Refund is visible on the current month
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Tax Refund' })).toBeVisible();

  // Navigate to previous month — Tax Refund is dated in the current month so it should vanish
  await page.click('[data-action="prev"]');
  await expect(page.locator('.income-month-label')).toContainText(prevMonthLabel);
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Tax Refund' })).not.toBeVisible();

  // Navigate back — Tax Refund should reappear
  await page.click('[data-action="next"]');
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Tax Refund' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/income-11-onetime-scoped.png' });
});

// ── CRUD continued ────────────────────────────────────────────────────────────

test('edits an income source', async () => {
  const row = page.locator('[data-testid="source-row"]').filter({ hasText: 'Day Job' });
  await row.locator('[data-testid="source-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#sf-name', 'Day Job (Updated)');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Day Job (Updated)' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/income-05-source-edited.png' });
});

test('toggles a source inactive', async () => {
  const row = page.locator('[data-testid="source-row"]').filter({ hasText: 'Day Job (Updated)' });
  await row.locator('[data-testid="source-toggle"]').click();
  await expect(row.locator('.inactive-badge')).toBeVisible();
});

test('deletes an income source', async () => {
  page.once('dialog', (d) => d.accept());
  const row = page.locator('[data-testid="source-row"]').filter({ hasText: 'Tax Refund' });
  await row.locator('[data-testid="source-delete"]').click();
  await expect(row).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/income-06-source-deleted.png' });
});

test('removes a household member', async () => {
  page.once('dialog', (d) => d.accept());
  const chip = page.locator('[data-testid="member-chip"]').filter({ hasText: 'Jamie' });
  await chip.locator('[data-testid="member-remove"]').click();
  await expect(chip).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/income-07-member-removed.png' });
});
