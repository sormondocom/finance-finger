/**
 * Expense payment → general ledger lifecycle E2E tests.
 *
 * Guards the full create/edit/delete cycle for the bank-debit LedgerEntry
 * that is written when an expense is paid from a bank account:
 *
 *   record payment → bank-debit entry appears in general ledger
 *   edit amount    → running balance in ledger updates
 *   delete payment → void-reversal entry added; running balance restored
 *
 * Setup: "Ledger Bank" ($5,000 opening balance) creates an opening
 * reconciliation entry. All payment entries stack on top of it.
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

  // Bank account with opening balance — creates an opening reconciliation entry.
  await navigateTo(page, 'accounts');
  await page.click('[data-testid="add-account-btn"]');
  await page.fill('#ba-name', 'Ledger Bank');
  await page.fill('#ba-balance', '5000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="account-row"]').filter({ hasText: 'Ledger Bank' })).toBeVisible();

  // Expense category and a recurring expense to pay.
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-category-btn"]');
  await page.fill('#cat-name', 'Utilities');
  await page.click('[data-testid="modal-submit"]');

  await page.click('[data-testid="add-expense-btn"]');
  await page.fill('#ef-desc', 'Gas Bill');
  await page.fill('#ef-amount', '100');
  await page.selectOption('#ef-cat', { label: 'Utilities' });
  await page.check('#ef-recurring');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Gas Bill' })).toBeVisible();
});

test.afterAll(async () => {
  await cleanup();
});

// ── Create ────────────────────────────────────────────────────────────────────

test('recording an expense payment from a bank account creates a bank-debit entry in the general ledger', async () => {
  await navigateTo(page, 'expenses');
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Gas Bill' });
  await row.locator('[data-testid="expense-record-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('[data-testid="expense-pay-amount"]', '100');
  const srcSel = page.locator('#pay-src');
  if (await srcSel.isVisible()) {
    await srcSel.selectOption({ label: 'Ledger Bank' });
  }
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  await navigateTo(page, 'ledger');
  // Opening recon + bank-debit = 2
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('2');

  // Newest entry is the bank-debit — shows expense name and updated running balance
  const firstRow = page.locator('[data-testid="ledger-entry-row"]').first();
  await expect(firstRow.locator('.ledger-txn-desc')).toContainText('Gas Bill');
  // 5000 − 100 = 4900
  await expect(firstRow.locator('.ledger-coin-balance')).toContainText('$4,900.00');
  await page.screenshot({ path: 'tests/screenshots/epl-01-payment-entry.png' });
});

// ── Edit ──────────────────────────────────────────────────────────────────────

test('editing the payment amount updates the bank-debit running balance in the general ledger', async () => {
  await navigateTo(page, 'expenses');
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Gas Bill' });
  await row.locator('[data-testid="expense-edit-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('[data-testid="expense-pay-amount"]', '150');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  await navigateTo(page, 'ledger');
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('2');

  const firstRow = page.locator('[data-testid="ledger-entry-row"]').first();
  await expect(firstRow.locator('.ledger-txn-desc')).toContainText('Gas Bill');
  // 5000 − 150 = 4850
  await expect(firstRow.locator('.ledger-coin-balance')).toContainText('$4,850.00');
  await page.screenshot({ path: 'tests/screenshots/epl-02-edited-entry.png' });
});

// ── Delete ────────────────────────────────────────────────────────────────────
//
// deleteExpensePayment uses a void+reversal pattern: the original bank-debit
// entry is stamped voidedAt and a new bank-credit reversal is written.
// Count goes 2 → 3, but the running balance is restored to $5,000.00.

test('deleting the expense payment adds a void-reversal entry and restores the running balance', async () => {
  await navigateTo(page, 'expenses');
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Gas Bill' });
  await row.locator('[data-testid="expense-ledger-btn"]').click();
  const ledgerPanel = page.locator('.expense-ledger-panel');
  await expect(ledgerPanel).toBeVisible();
  await ledgerPanel.locator('[data-testid="expense-ledger-del"]').first().click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.click('[data-testid="confirm-ok"]');

  await navigateTo(page, 'ledger');
  // Void+reversal: count goes 2 → 3 (original voided, bank-credit reversal added)
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('3');
  // The reversal is the newest entry — running balance is back to $5,000.00
  const firstRow = page.locator('[data-testid="ledger-entry-row"]').first();
  await expect(firstRow.locator('.ledger-coin-balance')).toContainText('$5,000.00');
  await page.screenshot({ path: 'tests/screenshots/epl-03-voided-entry.png' });
});
