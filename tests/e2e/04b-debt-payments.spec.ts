/**
 * Debt payment E2E tests.
 *
 * Covers: per-card regular and extra (out-of-cycle) payment recording,
 * payment history expand/collapse, payment deletion with balance restoration,
 * ⚡ Priority / High APR / Pay-first badges, and amount validation.
 *
 * Accounts created in beforeAll:
 *   Chase Freedom  – card  $6,500 · 24.99% APR · $8,000 limit · $50 min fixed  → ⚡ Priority + Pay first
 *   Discover Card  – card  $1,800 · 21.99% APR · $3,000 limit                  → High APR (not Priority)
 *   Student Loan   – loan  $12,000 · 6.80% APR                                 → no badge
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
  await navigateTo(page, 'debt');

  // ── Add Chase Freedom (high-APR, high-balance → ⚡ Priority) ────────
  await page.click('[data-testid="add-debt-btn"]');
  await page.fill('#da-name', 'Chase Freedom');
  await page.fill('#da-balance', '6500');
  await page.fill('#da-apr', '24.99');
  await page.fill('#da-limit', '8000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Set $50 fixed minimum via edit (min payment only exposed on edit)
  const chaseRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Freedom' });
  await chaseRow.locator('[data-testid="debt-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.locator('[name="da-min-type"][value="fixed"]').check();
  await page.fill('#da-min-value', '50');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // ── Add Discover Card (high-APR, low balance → High APR only) ────────
  await page.click('[data-testid="add-debt-btn"]');
  await page.fill('#da-name', 'Discover Card');
  await page.fill('#da-balance', '1800');
  await page.fill('#da-apr', '21.99');
  await page.fill('#da-limit', '3000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // ── Add Student Loan (low APR → no badge) ─────────────────────────────
  await page.click('[data-testid="add-debt-btn"]');
  await page.selectOption('#da-type', 'loan');
  await page.fill('#da-name', 'Student Loan');
  await page.fill('#da-balance', '12000');
  await page.fill('#da-apr', '6.80');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test.afterAll(async () => {
  await cleanup();
});

// ── Priority / APR badges ─────────────────────────────────────────────────────

test('Chase Freedom shows ⚡ Priority badge (APR ≥ 20% and balance ≥ $5k)', async () => {
  const chaseWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Chase Freedom' });
  await expect(chaseWrap.locator('.debt-badge--priority')).toBeVisible();
  // When Priority badge is shown, High APR badge should NOT also appear
  await expect(chaseWrap.locator('.debt-badge--high-apr')).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/dp-01-priority-badge.png' });
});

test('Chase Freedom shows Pay first badge as highest-APR account', async () => {
  const chaseWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Chase Freedom' });
  await expect(chaseWrap.locator('.debt-badge--focus')).toBeVisible();
});

test('Discover Card shows High APR badge but not Priority (balance under $5k)', async () => {
  const discoverWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Discover Card' });
  await expect(discoverWrap.locator('.debt-badge--high-apr')).toBeVisible();
  await expect(discoverWrap.locator('.debt-badge--priority')).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/dp-02-high-apr-badge.png' });
});

test('Discover Card does not show Pay first badge (not highest APR)', async () => {
  const discoverWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Discover Card' });
  await expect(discoverWrap.locator('.debt-badge--focus')).not.toBeVisible();
});

test('Student Loan shows no APR or priority badges (6.80% APR)', async () => {
  const loanWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Student Loan' });
  await expect(loanWrap.locator('.debt-badge--priority')).not.toBeVisible();
  await expect(loanWrap.locator('.debt-badge--high-apr')).not.toBeVisible();
  await expect(loanWrap.locator('.debt-badge--focus')).not.toBeVisible();
});

// ── Pay button ────────────────────────────────────────────────────────────────

test('Pay button is visible on every debt row', async () => {
  await expect(page.locator('[data-testid="debt-pay-btn"]')).toHaveCount(3);
  await page.screenshot({ path: 'tests/screenshots/dp-03-pay-buttons.png' });
});

// ── Payment modal ─────────────────────────────────────────────────────────────

test('Pay modal opens with amount, date, type, and note fields', async () => {
  const chaseRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Freedom' });
  await chaseRow.locator('[data-testid="debt-pay-btn"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await expect(page.locator('#pay-amount')).toBeVisible();
  await expect(page.locator('#pay-date')).toBeVisible();
  await expect(page.locator('[name="pay-type"][value="regular"]')).toBeChecked();
  await expect(page.locator('[name="pay-type"][value="extra"]')).not.toBeChecked();
  await expect(page.locator('#pay-note')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/dp-04-pay-modal.png' });
});

test('Pay modal pre-fills minimum when configured ($50 fixed on Chase Freedom)', async () => {
  await expect(page.locator('#pay-amount')).toHaveValue('50.00');
  await page.click('[data-testid="modal-cancel"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Regular payment ───────────────────────────────────────────────────────────

test('records a regular payment and reduces the balance', async () => {
  const chaseRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Freedom' });
  await chaseRow.locator('[data-testid="debt-pay-btn"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#pay-amount', '200');
  await page.fill('#pay-note', 'March statement');
  // Type defaults to "regular" — no change needed
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // $6,500 – $200 = $6,300
  await expect(chaseRow.locator('[data-testid="debt-row-balance"]')).toContainText('$6,300');
  await page.screenshot({ path: 'tests/screenshots/dp-05-after-regular-payment.png' });
});

test('history toggle appears showing 1 after the regular payment', async () => {
  const chaseRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Freedom' });
  const histBtn = chaseRow.locator('[data-testid="payment-history-btn"]');
  await expect(histBtn).toBeVisible();
  await expect(histBtn).toHaveText('↓ 1');
});

// ── Payment history panel ─────────────────────────────────────────────────────

test('expanding history shows the regular payment entry', async () => {
  const chaseRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Freedom' });
  const chaseWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Chase Freedom' });

  await chaseRow.locator('[data-testid="payment-history-btn"]').click();
  const panel = chaseWrap.locator('[data-testid="payment-history-panel"]');
  await expect(panel).toBeVisible();

  const items = panel.locator('[data-testid="payment-history-item"]');
  await expect(items).toHaveCount(1);

  const first = items.first();
  await expect(first).toContainText('$200.00');
  await expect(first.locator('.payment-history-type--regular')).toBeVisible();
  await expect(first).toContainText('March statement');
  await page.screenshot({ path: 'tests/screenshots/dp-06-history-expanded.png' });
});

test('toggle shows ↑ while history is open', async () => {
  const chaseRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Freedom' });
  await expect(chaseRow.locator('[data-testid="payment-history-btn"]')).toHaveText('↑ 1');
});

test('history panel collapses on second toggle click', async () => {
  const chaseRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Freedom' });
  const chaseWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Chase Freedom' });

  await chaseRow.locator('[data-testid="payment-history-btn"]').click();
  await expect(chaseWrap.locator('[data-testid="payment-history-panel"]')).not.toBeVisible();
  await expect(chaseRow.locator('[data-testid="payment-history-btn"]')).toHaveText('↓ 1');
});

// ── Extra (out-of-cycle) payment ──────────────────────────────────────────────

test('records an extra payment and reduces balance further', async () => {
  const chaseRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Freedom' });
  await chaseRow.locator('[data-testid="debt-pay-btn"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#pay-amount', '350');
  await page.locator('[name="pay-type"][value="extra"]').check();
  await page.fill('#pay-note', 'Tax refund windfall');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // $6,300 – $350 = $5,950
  await expect(chaseRow.locator('[data-testid="debt-row-balance"]')).toContainText('$5,950');
  await page.screenshot({ path: 'tests/screenshots/dp-07-after-extra-payment.png' });
});

test('history toggle shows 2 after extra payment', async () => {
  const chaseRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Freedom' });
  await expect(chaseRow.locator('[data-testid="payment-history-btn"]')).toHaveText('↓ 2');
});

test('history lists extra payment first (newest-first) with correct badge', async () => {
  const chaseRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Freedom' });
  const chaseWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Chase Freedom' });

  await chaseRow.locator('[data-testid="payment-history-btn"]').click();
  const panel = chaseWrap.locator('[data-testid="payment-history-panel"]');
  await expect(panel).toBeVisible();

  const items = panel.locator('[data-testid="payment-history-item"]');
  await expect(items).toHaveCount(2);

  // First (newest): extra $350
  await expect(items.nth(0)).toContainText('$350.00');
  await expect(items.nth(0).locator('.payment-history-type--extra')).toBeVisible();
  await expect(items.nth(0)).toContainText('Tax refund windfall');

  // Second (older): regular $200
  await expect(items.nth(1)).toContainText('$200.00');
  await expect(items.nth(1).locator('.payment-history-type--regular')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/dp-08-history-two-payments.png' });
});

// ── Payment deletion (balance restoration) ────────────────────────────────────

test('deleting extra payment restores balance', async () => {
  const chaseRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Freedom' });
  const chaseWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Chase Freedom' });

  // Panel is still open from previous test
  const panel = chaseWrap.locator('[data-testid="payment-history-panel"]');
  await expect(panel).toBeVisible();

  const items = panel.locator('[data-testid="payment-history-item"]');
  // Delete the first item (extra $350 — newest)
  page.once('dialog', (d) => d.accept());
  await items.first().locator('[data-testid="payment-history-delete"]').click();

  // $5,950 + $350 restored = $6,300
  await expect(chaseRow.locator('[data-testid="debt-row-balance"]')).toContainText('$6,300');
  await page.screenshot({ path: 'tests/screenshots/dp-09-payment-deleted.png' });
});

test('history toggle drops back to 1 after deletion', async () => {
  const chaseRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Freedom' });
  await expect(chaseRow.locator('[data-testid="payment-history-btn"]')).toHaveText('↓ 1');
});

// ── Payment on account without minimum (no pre-fill) ─────────────────────────

test('Pay modal for Discover Card has empty amount (no minimum set)', async () => {
  const discoverRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Discover Card' });
  await discoverRow.locator('[data-testid="debt-pay-btn"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('#pay-amount')).toHaveValue('');
});

// ── Validation ────────────────────────────────────────────────────────────────

test('submitting with empty amount shows validation error', async () => {
  // Amount is already empty (Discover Card, no minimum)
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('#pay-error')).toBeVisible();
  await expect(page.locator('#pay-error')).toContainText('Payment amount');
  await page.screenshot({ path: 'tests/screenshots/dp-10-validation-empty.png' });
});

test('submitting with zero amount shows validation error', async () => {
  await page.fill('#pay-amount', '0');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('#pay-error')).toBeVisible();
  await expect(page.locator('#pay-error')).toContainText('Payment amount');
});

test('cancelling payment modal leaves balance unchanged', async () => {
  await page.click('[data-testid="modal-cancel"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  const discoverRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Discover Card' });
  await expect(discoverRow.locator('[data-testid="debt-row-balance"]')).toContainText('$1,800');
});

// ── Debt total reflects payments ──────────────────────────────────────────────

test('debt total is correct after payment activity', async () => {
  // Chase: $6,300 (regular $200 paid; extra $350 paid then deleted)
  // Discover: $1,800 (unchanged)
  // Student Loan: $12,000 (unchanged)
  // Total: $20,100
  const total = await page.locator('[data-testid="debt-total-value"]').innerText();
  expect(total).toMatch(/\$20,100/);
  await page.screenshot({ path: 'tests/screenshots/dp-11-total.png' });
});

// ── Delete cascade: account deletion removes its payments ─────────────────────

test('deleting a debt account with payments removes cleanly', async () => {
  // The Chase Freedom has 1 recorded payment; delete the account
  page.once('dialog', (d) => d.accept());
  const chaseRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Freedom' });
  await chaseRow.locator('[data-testid="debt-delete"]').click();

  // Row should be gone
  await expect(
    page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Freedom' }),
  ).not.toBeVisible();

  // Total: $1,800 + $12,000 = $13,800
  const total = await page.locator('[data-testid="debt-total-value"]').innerText();
  expect(total).toMatch(/\$13,800/);
  await page.screenshot({ path: 'tests/screenshots/dp-12-cascade-delete.png' });
});
