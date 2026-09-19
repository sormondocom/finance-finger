/**
 * Reconciliation section E2E tests (Settings page).
 *
 * Covers: section visibility, empty state, account row display,
 * setting a new balance and verifying it's reflected on the Debt page
 * and in the Ledger, and validation of bad input.
 *
 * Accounts created in beforeAll:
 *   Recon Card  — card  $2,500  19.99% APR  $5,000 limit
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

  // Add a debt account to reconcile against.
  await navigateTo(page, 'debt');
  await page.click('[data-testid="add-debt-btn"]');
  await page.fill('#da-name', 'Recon Card');
  await page.fill('#da-balance', '2500');
  await page.fill('#da-apr', '19.99');
  await page.fill('#da-limit', '5000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test.afterAll(async () => {
  await cleanup();
});

// ── Section visibility ────────────────────────────────────────────────────────

test('Reconciliation section is visible in Settings', async () => {
  await navigateTo(page, 'settings');
  await expect(page.locator('[data-testid="settings-recon-section"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/recon-01-section.png' });
});

test('Recon Card account row is visible with current balance', async () => {
  const row = page.locator('[data-testid="settings-recon-account-row"]').filter({
    hasText: 'Recon Card',
  });
  await expect(row).toBeVisible();
  await expect(row.locator('[data-testid="settings-recon-account-name"]')).toContainText('Recon Card');
  await expect(row.locator('[data-testid="settings-recon-current-balance"]')).toContainText('$2,500.00');
  await page.screenshot({ path: 'tests/screenshots/recon-02-account-row.png' });
});

// ── Set a new balance ─────────────────────────────────────────────────────────

test('clicking Set Balance without a memo shows a validation error', async () => {
  const row = page.locator('[data-testid="settings-recon-account-row"]').filter({
    hasText: 'Recon Card',
  });
  await row.locator('[data-testid="settings-recon-balance-input"]').fill('2100');
  // Intentionally leave memo blank
  await row.locator('[data-testid="settings-recon-set-btn"]').click();

  await expect(row.locator('[data-testid="settings-recon-error"]')).toBeVisible();
  await expect(row.locator('[data-testid="settings-recon-error"]')).toContainText('memo is required');
  // Balance should not have changed
  await expect(row.locator('[data-testid="settings-recon-current-balance"]')).toContainText('$2,500.00');
  await page.screenshot({ path: 'tests/screenshots/recon-03-memo-required.png' });
});

test('setting a new balance with a memo updates the displayed current balance', async () => {
  const row = page.locator('[data-testid="settings-recon-account-row"]').filter({
    hasText: 'Recon Card',
  });
  await row.locator('[data-testid="settings-recon-balance-input"]').fill('2100');
  await row.locator('[data-testid="settings-recon-memo-input"]').fill('Statement balance from bank portal');
  await row.locator('[data-testid="settings-recon-set-btn"]').click();

  // The displayed current balance in the row should update immediately
  await expect(row.locator('[data-testid="settings-recon-current-balance"]')).toContainText('$2,100.00', { timeout: 5000 });
  await page.screenshot({ path: 'tests/screenshots/recon-04-after-set.png' });
});

test('the Debt page reflects the new reconciled balance', async () => {
  await navigateTo(page, 'debt');
  const debtRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Recon Card' });
  await expect(debtRow.locator('[data-testid="debt-row-balance"]')).toContainText('$2,100.00');
  await page.screenshot({ path: 'tests/screenshots/recon-05-debt-reflects-balance.png' });
});

test('the Ledger shows the new reconciliation entry with memo as note', async () => {
  await navigateTo(page, 'ledger');

  // Filter to reconciliation type only to isolate our entries
  await page.selectOption('[data-testid="ledger-filter-type"]', 'reconciliation');

  // Should have 2 recon entries: opening balance ($2,500) + the manual one ($2,100)
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('2');

  // The most recent (top) reconciliation entry should show $2,100.00
  const firstRow = page.locator('[data-testid="ledger-entry-row"]').first();
  await expect(firstRow.locator('.ledger-recon-value')).toContainText('$2,100.00');
  // The memo should appear as the note on the ledger entry
  await expect(firstRow.locator('.ledger-txn-note')).toContainText('Statement balance from bank portal');
  await page.screenshot({ path: 'tests/screenshots/recon-06-ledger-entry.png' });
});

// ── Validation ────────────────────────────────────────────────────────────────

test('invalid (negative) input shows an error and does not save', async () => {
  await navigateTo(page, 'settings');
  const row = page.locator('[data-testid="settings-recon-account-row"]').filter({
    hasText: 'Recon Card',
  });

  await row.locator('[data-testid="settings-recon-balance-input"]').fill('-100');
  await row.locator('[data-testid="settings-recon-memo-input"]').fill('test');
  await row.locator('[data-testid="settings-recon-set-btn"]').click();

  await expect(row.locator('[data-testid="settings-recon-error"]')).toBeVisible();
  // Balance should not have changed — still $2,100 from previous test
  await expect(row.locator('[data-testid="settings-recon-current-balance"]')).toContainText('$2,100.00');
  await page.screenshot({ path: 'tests/screenshots/recon-07-validation.png' });
});

test('zero balance is valid and sets the account to paid-off', async () => {
  const row = page.locator('[data-testid="settings-recon-account-row"]').filter({
    hasText: 'Recon Card',
  });
  await row.locator('[data-testid="settings-recon-balance-input"]').fill('0');
  await row.locator('[data-testid="settings-recon-memo-input"]').fill('Paid in full');
  await row.locator('[data-testid="settings-recon-set-btn"]').click();

  await expect(row.locator('[data-testid="settings-recon-current-balance"]')).toContainText('$0.00', { timeout: 5000 });
  await page.screenshot({ path: 'tests/screenshots/recon-08-zero-balance.png' });
});

