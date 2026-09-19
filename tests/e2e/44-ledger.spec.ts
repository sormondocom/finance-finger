/**
 * Ledger page E2E tests.
 *
 * Covers: navigation, empty state, entry display after debt account creation
 * (reconciliation entry), entry after a payment, filters (account, type, date),
 * and filter reset.
 *
 * Account created in beforeAll:
 *   Chase Freedom  — card  $3,200  22.99% APR  $5,000 limit
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

  // Add a debt account — this writes an opening reconciliation ledger entry.
  await navigateTo(page, 'debt');
  await page.click('[data-testid="add-debt-btn"]');
  await page.fill('#da-name', 'Chase Freedom');
  await page.fill('#da-balance', '3200');
  await page.fill('#da-apr', '22.99');
  await page.fill('#da-limit', '5000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test.afterAll(async () => {
  await cleanup();
});

// ── Navigation ────────────────────────────────────────────────────────────────

test('ledger nav link is visible and navigates to the page', async () => {
  await expect(page.locator('[data-testid="nav-ledger"]')).toBeVisible();
  await page.click('[data-testid="nav-ledger"]');
  await expect(page.locator('[data-testid="ledger-search"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/ledger-01-landing.png' });
});

// ── Entry display ─────────────────────────────────────────────────────────────

test('shows the opening reconciliation entry for the debt account', async () => {
  await navigateTo(page, 'ledger');
  const rows = page.locator('[data-testid="ledger-entry-row"]');
  await expect(rows).toHaveCount(1);

  const row = rows.first();
  // Reconciliation card: account name appears in .ledger-txn-desc
  await expect(row.locator('.ledger-txn-desc')).toContainText('Chase Freedom');
  // Note contains "Opening balance"
  await expect(row.locator('.ledger-txn-note')).toContainText('Opening balance');
  // Balance after reconciliation = $3,200.00
  await expect(row.locator('.ledger-recon-value')).toContainText('$3,200.00');
  await page.screenshot({ path: 'tests/screenshots/ledger-02-recon-entry.png' });
});

test('entry count reflects all entries', async () => {
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('1');
});

// ── Entry after a payment ─────────────────────────────────────────────────────

test('payment creates a new ledger entry', async () => {
  // Record a $150 payment via the Debt page
  await navigateTo(page, 'debt');
  const chaseRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Freedom' });
  await chaseRow.locator('[data-testid="debt-pay-btn"]').click();
  await page.fill('[data-testid="debt-pay-amount"]', '150');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Ledger now has 2 entries: opening recon + payment
  await navigateTo(page, 'ledger');
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('2');

  // Newest-first: first row is the payment (single-leg coin card)
  const firstRow = page.locator('[data-testid="ledger-entry-row"]').first();
  // Coin shows account name
  await expect(firstRow.locator('.ledger-coin-name')).toContainText('Chase Freedom');
  // Payment reduces balance: 3200 − 150 = 3050
  await expect(firstRow.locator('.ledger-coin-balance')).toContainText('$3,050.00');
  await page.screenshot({ path: 'tests/screenshots/ledger-03-after-payment.png' });
});

// ── Filters ───────────────────────────────────────────────────────────────────

test('type filter shows only reconciliation entries', async () => {
  await page.selectOption('[data-testid="ledger-filter-type"]', 'reconciliation');
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('1');
  const row = page.locator('[data-testid="ledger-entry-row"]').first();
  await expect(row.locator('.ledger-recon-value')).toContainText('$3,200.00');
  await page.screenshot({ path: 'tests/screenshots/ledger-04-filter-type.png' });
});

test('type filter shows only payment entries', async () => {
  await page.selectOption('[data-testid="ledger-filter-type"]', 'payment');
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('1');
  const row = page.locator('[data-testid="ledger-entry-row"]').first();
  await expect(row.locator('.ledger-coin-balance')).toContainText('$3,050.00');
});

test('filter reset restores all entries', async () => {
  await page.click('[data-testid="ledger-filter-reset"]');
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('2');
});

test('date filter by future date shows empty state', async () => {
  await page.fill('[data-testid="ledger-filter-from"]', '2099-01-01');
  await expect(page.locator('[data-testid="ledger-empty-title"]')).toBeVisible();
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('0');
  await page.fill('[data-testid="ledger-filter-from"]', '');
  await page.screenshot({ path: 'tests/screenshots/ledger-05-filter-empty.png' });
});

// ── Card charge creates a ledger entry ────────────────────────────────────────

test('adding a card charge creates a charge ledger entry', async () => {
  // Open the charges panel on the debt row and add a charge
  await navigateTo(page, 'debt');
  const chaseRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Freedom' });
  const chaseWrap = page.locator('[data-testid="debt-account-wrap"]').filter({ hasText: 'Chase Freedom' });

  await chaseRow.locator('[data-testid="debt-charges-btn"]').click();
  await expect(chaseWrap.locator('[data-testid="debt-charges-panel"]')).toBeVisible();
  await chaseWrap.locator('button', { hasText: '+ Add charge' }).click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  const today = new Date().toISOString().split('T')[0]!;
  await page.fill('[data-testid="debt-charge-merchant"]', 'Amazon');
  await page.fill('[data-testid="debt-charge-amount"]', '49.99');
  await page.fill('[data-testid="debt-charge-date"]', today);
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Ledger now has 3 entries
  await navigateTo(page, 'ledger');
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('3');

  // Newest-first: first row is the charge
  const firstRow = page.locator('[data-testid="ledger-entry-row"]').first();
  // Charge description in header
  await expect(firstRow.locator('.ledger-txn-desc')).toContainText('Amazon');
  // Balance: 3050 + 49.99 = 3099.99
  await expect(firstRow.locator('.ledger-coin-balance')).toContainText('$3,099.99');
  await page.screenshot({ path: 'tests/screenshots/ledger-06-charge-entry.png' });
});

// ── Charge void: deletion adds a reversal entry rather than removing ──────────
//
// deleteCharge uses a void+reversal pattern: the original charge entry is
// stamped voidedAt and a new reversal entry is written. Count goes UP by 1
// (3 → 4), but the running balance is restored to the pre-charge value.

test('deleting a card charge adds a void-reversal entry and restores the running balance', async () => {
  await navigateTo(page, 'debt');
  const chaseRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Freedom' });
  const chaseWrap = page.locator('[data-testid="debt-account-wrap"]').filter({ hasText: 'Chase Freedom' });

  await chaseRow.locator('[data-testid="debt-charges-btn"]').click();
  await expect(chaseWrap.locator('[data-testid="debt-charges-panel"]')).toBeVisible();

  const charge = chaseWrap.locator('[data-testid="debt-charge-item"]').filter({ hasText: 'Amazon' });
  await charge.locator('.icon-btn.danger').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.click('[data-testid="confirm-ok"]');
  await expect(charge).not.toBeVisible({ timeout: 5_000 });

  // Void+reversal: count goes 3 → 4 (original voided, reversal added)
  await navigateTo(page, 'ledger');
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('4');

  // The reversal is the newest entry — running balance is back to $3,050.00
  const firstRow = page.locator('[data-testid="ledger-entry-row"]').first();
  await expect(firstRow.locator('.ledger-coin-balance')).toContainText('$3,050.00');
  await page.screenshot({ path: 'tests/screenshots/ledger-07-charge-voided.png' });
});

// ── Same-day ordering: payment recorded before charge — charge must not be absorbed ──
//
// Regression guard for the createdAt guard in buildBillingCycles: a payment
// recorded BEFORE a charge on the same calendar day must NOT absorb that charge.
// The charge must appear as its own standalone ledger entry.

test('same-day ordering: charge added after a same-day payment is not absorbed by that payment', async () => {
  await navigateTo(page, 'debt');
  const chaseRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Freedom' });
  const chaseWrap = page.locator('[data-testid="debt-account-wrap"]').filter({ hasText: 'Chase Freedom' });

  await chaseRow.locator('[data-testid="debt-charges-btn"]').click();
  await expect(chaseWrap.locator('[data-testid="debt-charges-panel"]')).toBeVisible();
  await chaseWrap.locator('button', { hasText: '+ Add charge' }).click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  const today = new Date().toISOString().split('T')[0]!;
  await page.fill('[data-testid="debt-charge-merchant"]', 'Best Buy');
  await page.fill('[data-testid="debt-charge-amount"]', '29.99');
  await page.fill('[data-testid="debt-charge-date"]', today);
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  await navigateTo(page, 'ledger');
  // State after prior test: 4 entries (3 original + 1 void reversal for Amazon)
  // Adding Best Buy brings it to 5
  await expect(page.locator('[data-testid="ledger-entry-count"]')).toContainText('5');

  // The charge is newest — must appear as "Best Buy", not folded into "Regular payment"
  const firstRow = page.locator('[data-testid="ledger-entry-row"]').first();
  await expect(firstRow.locator('.ledger-txn-desc')).toContainText('Best Buy');
  // Balance: 3050 + 29.99 = 3079.99
  await expect(firstRow.locator('.ledger-coin-balance')).toContainText('$3,079.99');
  await page.screenshot({ path: 'tests/screenshots/ledger-08-same-day-charge.png' });
});
