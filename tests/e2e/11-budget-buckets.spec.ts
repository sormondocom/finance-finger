/**
 * Budget Buckets (envelope budgeting) E2E tests.
 *
 * Verifies: bucket grid appears after setting a monthly budget on a category,
 * fill percentage and "to assign" counter are correct, unbudgeted categories
 * show as dashed pills, clicking a bucket opens the budget editor, and setting
 * a budget via the unbudgeted pill converts it to a full bucket.
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

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

// ── Seed: income + categories + expenses ──────────────────────────────────────

test('adds monthly income of $4,000', async () => {
  await page.fill('[data-testid="add-member-input"]', 'Sam');
  await page.click('[data-testid="add-member-btn"]');
  await expect(page.locator('[data-testid="member-chip"]').filter({ hasText: 'Sam' })).toBeVisible();

  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#sf-name', 'Day Job');
  await page.fill('#sf-amount', '4000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Day Job' })).toBeVisible();
});

test('adds Groceries category with $600 monthly budget', async () => {
  await navigateTo(page, 'expenses');

  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'Groceries');
  await page.fill('#cat-budget', '600');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="category-pill"]').filter({ hasText: 'Groceries' })).toBeVisible();
});

test('adds an unbudgeted Entertainment category', async () => {
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'Entertainment');
  // Intentionally leave cat-budget blank
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="category-pill"]').filter({ hasText: 'Entertainment' })).toBeVisible();
});

test('adds a $300 recurring grocery expense', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#ef-desc', 'Weekly Groceries');
  await page.fill('#ef-amount', '300');
  await page.selectOption('#ef-cat', { label: 'Groceries' });
  await page.check('#ef-recurring');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Weekly Groceries' })).toBeVisible();
});

// ── Budget page — buckets section ─────────────────────────────────────────────

test('budget page shows the buckets section when a category has a budget', async () => {
  await navigateTo(page, 'budget');
  await expect(page.locator('[data-testid="buckets-section"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/buckets-01-section.png' });
});

test('buckets grid contains the Groceries bucket', async () => {
  const grid = page.locator('[data-testid="buckets-grid"]');
  await expect(grid).toBeVisible();
  const bucket = grid.locator('[data-testid="bucket-item"]').filter({ hasText: 'Groceries' });
  await expect(bucket).toBeVisible();
});

test('to-assign counter shows $4,000 minus $600 = $3,400', async () => {
  const counter = page.locator('[data-testid="buckets-unassigned-value"]');
  await expect(counter).toBeVisible();
  await expect(counter).toContainText('3,400');
});

test('Entertainment appears as an unbudgeted dashed pill', async () => {
  const pill = page.locator('[data-testid="unbudgeted-pill"]').filter({ hasText: 'Entertainment' });
  await expect(pill).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/buckets-02-unbudgeted-pill.png' });
});

test('clicking the Groceries bucket opens the budget editor modal', async () => {
  const bucket = page.locator('[data-testid="bucket-item"]').filter({ hasText: 'Groceries' });
  await bucket.click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/buckets-03-editor-modal.png' });
  // Close without saving
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('clicking the Entertainment pill opens the budget editor modal', async () => {
  const pill = page.locator('[data-testid="unbudgeted-pill"]').filter({ hasText: 'Entertainment' });
  await pill.click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
});

test('setting $200 budget on Entertainment converts it to a bucket', async () => {
  // Modal should already be open from previous test
  await page.fill('[data-testid="modal-dialog"] input[type="number"]', '200');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Entertainment should now appear as a bucket in the grid
  const grid = page.locator('[data-testid="buckets-grid"]');
  await expect(grid.locator('[data-testid="bucket-item"]').filter({ hasText: 'Entertainment' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/buckets-04-after-assign.png' });
});

test('to-assign counter decreases after setting Entertainment budget', async () => {
  // Was $3,400 — now $3,400 - $200 = $3,200
  const counter = page.locator('[data-testid="buckets-unassigned-value"]');
  await expect(counter).toContainText('3,200');
});

test('Entertainment no longer shows as an unbudgeted pill', async () => {
  const pill = page.locator('[data-testid="unbudgeted-pill"]').filter({ hasText: 'Entertainment' });
  await expect(pill).not.toBeVisible();
});

test('Groceries bucket reflects spending: 300 of 600 = 50%', async () => {
  // The bucket SVG fill is visual but we can verify the amounts text
  const bucket = page.locator('[data-testid="bucket-item"]').filter({ hasText: 'Groceries' });
  await expect(bucket).toContainText('300');
  await expect(bucket).toContainText('600');
});
