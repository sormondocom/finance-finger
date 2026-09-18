/**
 * Ledger flow-view E2E tests.
 *
 * Correlated entry pairs (transfer-out + transfer-in) collapse into a single
 * flow card showing FROM → TO with amounts and balances on each side.  The
 * entry *count* still reflects the number of individual ledger entries that
 * match the filter; the *display* always shows the full flow context.
 *
 * Accounts created in beforeAll:
 *   Checking Plus   — bank  $3,000
 *   Savings Pot     — bank  $500
 * Transfer: $750 from Checking Plus → Savings Pot
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;
let checkingId: string;

test.beforeAll(async () => {
  const ext = await launchExtensionContext();
  context = ext.context;
  cleanup = ext.cleanup;
  page = await context.newPage();
  await page.goto(ext.extUrl);
  await completeSetupWizard(page);

  // Add two bank accounts
  await navigateTo(page, 'accounts');

  await page.click('[data-testid="add-account-btn"]');
  await page.fill('#ba-name', 'Checking Plus');
  await page.fill('#ba-balance', '3000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  await page.click('[data-testid="add-account-btn"]');
  await page.fill('#ba-name', 'Savings Pot');
  await page.fill('#ba-balance', '500');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Capture Checking Plus account ID for filter tests
  checkingId = (await page.locator('[data-testid="account-row"]')
    .filter({ hasText: 'Checking Plus' })
    .getAttribute('data-account-id'))!;

  // Record a transfer of $750 from Checking Plus → Savings Pot
  const checkingRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Checking Plus' });
  await checkingRow.locator('[data-testid="account-transfer"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#tr-amount', '750');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible({ timeout: 8000 });
});

test.afterAll(async () => {
  await cleanup();
});

// ── Flow card rendering ────────────────────────────────────────────────────────

test('transfer renders as a single flow card', async () => {
  await navigateTo(page, 'ledger');
  await page.click('[data-testid="ledger-filter-reset"]');
  // Transfer pair collapses into one .ledger-txn--flow card
  await expect(page.locator('.ledger-txn--flow')).toHaveCount(1);
  await page.screenshot({ path: 'tests/screenshots/ledger-group-01-both-visible.png' });
});

test('flow card shows Checking Plus as FROM account', async () => {
  const card = page.locator('.ledger-txn--flow');
  await expect(card.locator('[data-testid="ledger-flow-from-account"]')).toContainText('Checking Plus');
});

test('flow card shows Savings Pot as TO account', async () => {
  const card = page.locator('.ledger-txn--flow');
  await expect(card.locator('[data-testid="ledger-flow-to-account"]')).toContainText('Savings Pot');
});

// ── Entry count reflects the filter (individual ledger entries) ────────────────

test('filter by transfer-out shows 1 entry, flow card still visible', async () => {
  await page.selectOption('[data-testid="ledger-filter-type"]', 'transfer-out');
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('1');
  await expect(page.locator('.ledger-txn--flow')).toHaveCount(1);
});

test('filter by transfer-in shows 1 entry, flow card still visible', async () => {
  await page.selectOption('[data-testid="ledger-filter-type"]', 'transfer-in');
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('1');
  await expect(page.locator('.ledger-txn--flow')).toHaveCount(1);
  await page.click('[data-testid="ledger-filter-reset"]');
  await page.screenshot({ path: 'tests/screenshots/ledger-group-02-one-leg.png' });
});

// ── Account filter — full flow context always shown ────────────────────────────

test('filtering to Checking Plus shows 2 entries (reconciliation + transfer-out), full flow card with both accounts', async () => {
  await page.selectOption('[data-testid="ledger-filter-account"]', checkingId);
  // Reconciliation entry (opening balance) + transfer-out both belong to Checking Plus
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('2');
  // The flow card still shows both sides for full context
  const card = page.locator('.ledger-txn--flow');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-testid="ledger-flow-from-account"]')).toContainText('Checking Plus');
  await expect(card.locator('[data-testid="ledger-flow-to-account"]')).toContainText('Savings Pot');
});

test('clearing the account filter restores the full flow card', async () => {
  await page.click('[data-testid="ledger-filter-reset"]');
  await expect(page.locator('.ledger-txn--flow')).toHaveCount(1);
  await page.screenshot({ path: 'tests/screenshots/ledger-group-03-restored.png' });
});
