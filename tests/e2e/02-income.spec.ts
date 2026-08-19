/**
 * Income page E2E tests.
 *
 * Covers: member management (add/remove), income source CRUD,
 * frequency selection, active/inactive toggle, monthly total.
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
  await page.fill('#sf-amount', '5000');
  // Frequency defaults to monthly — leave it

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Day Job' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/income-03-source-added.png' });
});

test('monthly total updates after adding source', async () => {
  const total = await page.locator('[data-testid="income-monthly-total"]').innerText();
  expect(total).toMatch(/\$5,000/);
});

test('adds a one-time income source', async () => {
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#sf-name', 'Tax Refund');
  await page.fill('#sf-amount', '1200');
  await page.selectOption('#sf-freq', 'once');
  // Date row should appear — fill it
  await page.fill('#sf-date', '2026-04-15');

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Tax Refund' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/income-04-onetime-source.png' });
});

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
