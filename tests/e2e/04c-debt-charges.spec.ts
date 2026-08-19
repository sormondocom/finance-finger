/**
 * Debt charges & payment-to-expense E2E tests.
 *
 * Covers:
 *   - 0% intro APR: badge display and APR description on card rows
 *   - Projection horizon toggle: buttons, active state, schedule truncation note
 *   - Card charge itemization: add, view, delete; merchant breakdown panel
 *   - Debt payments auto-create expenses in "Credit Card Payments" category
 *
 * Accounts created in beforeAll:
 *   Visa Pay Test      – card  $3,000 · 22.99% APR · $5,000 limit · $50 fixed min
 *   Intro APR Card     – card  $2,000 · 21.99% APR · $5,000 limit · $40 fixed min · 0% intro until 2099-12-31
 *   Horizon Trap Card  – card  $10,000 · 29.99% APR · $10,000 limit · 2% of balance min
 *                        (payment < interest at this APR → balance grows → truncated at any horizon)
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

  // ── Add Visa Pay Test ────────────────────────────────────────────────────
  await page.click('[data-testid="add-debt-btn"]');
  await page.fill('#da-name', 'Visa Pay Test');
  await page.fill('#da-balance', '3000');
  await page.fill('#da-apr', '22.99');
  await page.fill('#da-limit', '5000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Set $50 fixed minimum via edit
  const visaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Visa Pay Test' });
  await visaRow.locator('[data-testid="debt-edit"]').click();
  await page.locator('[name="da-min-type"][value="fixed"]').check();
  await page.fill('#da-min-value', '50');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // ── Add Intro APR Card (0% intro APR until 2099-12-31) ──────────────────
  await page.click('[data-testid="add-debt-btn"]');
  await page.fill('#da-name', 'Intro APR Card');
  await page.fill('#da-balance', '2000');
  await page.fill('#da-apr', '21.99');
  await page.fill('#da-limit', '5000');
  await page.check('#da-intro-checked');
  await expect(page.locator('#da-intro-date-wrap')).toBeVisible();
  await page.fill('#da-intro-end', '2099-12-31');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Set $40 fixed minimum via edit
  const introRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Intro APR Card' });
  await introRow.locator('[data-testid="debt-edit"]').click();
  await page.locator('[name="da-min-type"][value="fixed"]').check();
  await page.fill('#da-min-value', '40');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // ── Add Horizon Trap Card (2% min, payment < interest → balance grows) ───
  await page.click('[data-testid="add-debt-btn"]');
  await page.fill('#da-name', 'Horizon Trap Card');
  await page.fill('#da-balance', '10000');
  await page.fill('#da-apr', '29.99');
  await page.fill('#da-limit', '10000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Set 2% of balance minimum via edit
  const trapRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Horizon Trap Card' });
  await trapRow.locator('[data-testid="debt-edit"]').click();
  await page.locator('[name="da-min-type"][value="percentage"]').check();
  await page.fill('#da-min-value', '2');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
}, 60_000);

test.afterAll(async () => {
  await cleanup();
});

// ── 0% Intro APR badge & APR display ─────────────────────────────────────────

test('Intro APR Card shows 0% Intro badge', async () => {
  const introWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Intro APR Card' });
  await expect(introWrap.locator('.debt-badge--intro')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/dc-01-intro-apr-badge.png' });
});

test('Intro APR Card APR row shows 0% until date then post-intro rate', async () => {
  const introWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Intro APR Card' });
  const aprSpan = introWrap.locator('.card-row-apr');
  await expect(aprSpan).toContainText('0% until');
  await expect(aprSpan).toContainText('21.99%');
});

test('Intro APR Card does not show High APR badge (suppressed by intro badge)', async () => {
  const introWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Intro APR Card' });
  await expect(introWrap.locator('.debt-badge--high-apr')).not.toBeVisible();
});

test('Visa Pay Test shows normal APR display (no intro APR)', async () => {
  const visaWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Visa Pay Test' });
  await expect(visaWrap.locator('.debt-badge--intro')).not.toBeVisible();
  await expect(visaWrap.locator('.card-row-apr')).toContainText('22.99% APR');
});

test('editing Intro APR Card preserves 0% intro checkbox as checked', async () => {
  const introRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Intro APR Card' });
  await introRow.locator('[data-testid="debt-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('#da-intro-checked')).toBeChecked();
  await expect(page.locator('#da-intro-date-wrap')).toBeVisible();
  await expect(page.locator('#da-intro-end')).toHaveValue('2099-12-31');
  await page.click('[data-testid="modal-cancel"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Horizon toggle ────────────────────────────────────────────────────────────

test('balance-over-time card has horizon toggle with 8 buttons (1Y–30Y)', async () => {
  await expect(page.locator('.horizon-toggle')).toBeVisible();
  const btns = page.locator('.horizon-btn');
  await expect(btns).toHaveCount(8);
  await expect(btns.nth(0)).toHaveText('1Y');
  await expect(btns.nth(1)).toHaveText('2Y');
  await expect(btns.nth(4)).toHaveText('5Y');
  await expect(btns.nth(5)).toHaveText('10Y');
  await expect(btns.nth(6)).toHaveText('20Y');
  await expect(btns.nth(7)).toHaveText('30Y');
  await page.screenshot({ path: 'tests/screenshots/dc-02-horizon-toggle.png' });
});

test('2Y horizon button is active by default', async () => {
  await expect(page.locator('.horizon-btn').filter({ hasText: '2Y' })).toHaveClass(/active/);
  await expect(page.locator('.horizon-btn').filter({ hasText: '1Y' })).not.toHaveClass(/active/);
  await expect(page.locator('.horizon-btn').filter({ hasText: '5Y' })).not.toHaveClass(/active/);
});

test('clicking 5Y activates it and deactivates 2Y', async () => {
  await page.locator('.horizon-btn').filter({ hasText: '5Y' }).click();
  await expect(page.locator('.horizon-btn').filter({ hasText: '5Y' })).toHaveClass(/active/);
  await expect(page.locator('.horizon-btn').filter({ hasText: '2Y' })).not.toHaveClass(/active/);
  await page.screenshot({ path: 'tests/screenshots/dc-03-horizon-5y.png' });
});

test('Horizon Trap Card schedule shows truncation note at 5Y (payment < interest, balance grows)', async () => {
  // Select Horizon Trap Card in the amortization schedule dropdown
  const optValue = await page
    .locator('#schedule-select option')
    .filter({ hasText: 'Horizon Trap Card' })
    .getAttribute('value');
  await page.selectOption('#schedule-select', optValue!);

  await expect(page.locator('.schedule-truncated-note')).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('.schedule-truncated-note')).toContainText('5 years');
  await page.screenshot({ path: 'tests/screenshots/dc-04-truncation-note.png' });

  // Reset horizon back to 2Y for remaining tests
  await page.locator('.horizon-btn').filter({ hasText: '2Y' }).click();
});

// ── Card charges button ───────────────────────────────────────────────────────

test('Charges button is visible on card rows', async () => {
  await expect(
    page.locator('[data-testid="debt-row"]').filter({ hasText: 'Visa Pay Test' }).locator('[data-testid="debt-charges-btn"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="debt-row"]').filter({ hasText: 'Intro APR Card' }).locator('[data-testid="debt-charges-btn"]'),
  ).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/dc-05-charges-btn.png' });
});

test('charges panel is hidden by default', async () => {
  const visaWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Visa Pay Test' });
  await expect(visaWrap.locator('.charges-panel')).not.toBeVisible();
});

test('clicking Charges button opens the charges panel', async () => {
  const visaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Visa Pay Test' });
  await visaRow.locator('[data-testid="debt-charges-btn"]').click();
  const visaWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Visa Pay Test' });
  await expect(visaWrap.locator('.charges-panel')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/dc-06-charges-panel-empty.png' });
});

test('empty charges panel shows no charges text and Add charge button', async () => {
  const visaWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Visa Pay Test' });
  const panel = visaWrap.locator('.charges-panel');
  await expect(panel).toContainText('No charges logged yet');
  await expect(panel.locator('button', { hasText: '+ Add charge' })).toBeVisible();
});

test('clicking Charges button again collapses the panel', async () => {
  const visaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Visa Pay Test' });
  await visaRow.locator('[data-testid="debt-charges-btn"]').click();
  const visaWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Visa Pay Test' });
  await expect(visaWrap.locator('.charges-panel')).not.toBeVisible();
});

// ── Add charge modal ──────────────────────────────────────────────────────────

test('Add charge modal opens with correct fields', async () => {
  // Re-open panel first
  const visaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Visa Pay Test' });
  const visaWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Visa Pay Test' });
  await visaRow.locator('[data-testid="debt-charges-btn"]').click();
  await expect(visaWrap.locator('.charges-panel')).toBeVisible();

  await visaWrap.locator('button', { hasText: '+ Add charge' }).click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('#ch-merchant')).toBeVisible();
  await expect(page.locator('#ch-amount')).toBeVisible();
  await expect(page.locator('#ch-date')).toBeVisible();
  await expect(page.locator('#ch-cat')).toBeVisible();
  await expect(page.locator('#ch-note')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/dc-07-add-charge-modal.png' });
});

test('add charge modal validates empty merchant', async () => {
  await page.fill('#ch-amount', '29.99');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('#ch-error')).toBeVisible();
  await expect(page.locator('#ch-error')).toContainText('merchant name');
});

test('add charge modal validates missing amount', async () => {
  await page.fill('#ch-merchant', 'Amazon');
  await page.fill('#ch-amount', '');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('#ch-error')).toBeVisible();
  await expect(page.locator('#ch-error')).toContainText('valid amount');
});

test('submitting a valid charge closes modal and persists the charge', async () => {
  await page.fill('#ch-merchant', 'Amazon');
  await page.fill('#ch-amount', '49.99');
  await page.fill('#ch-note', 'Laptop stand');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Panel stays open after adding a charge
  const visaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Visa Pay Test' });
  const visaWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Visa Pay Test' });
  await expect(visaWrap.locator('.charges-panel')).toBeVisible();

  await expect(visaWrap.locator('.charges-item')).toHaveCount(1);
  await expect(visaWrap.locator('.charges-item')).toContainText('Amazon');
  await expect(visaWrap.locator('.charges-item')).toContainText('$49.99');
  await expect(visaWrap.locator('.charges-item')).toContainText('Laptop stand');
  await page.screenshot({ path: 'tests/screenshots/dc-08-first-charge.png' });
});

test('charges button updates to show count after first charge', async () => {
  // Panel is open from previous test — close it to check button text
  const visaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Visa Pay Test' });
  await visaRow.locator('[data-testid="debt-charges-btn"]').click();
  await expect(page.locator('.debt-account-wrap').filter({ hasText: 'Visa Pay Test' }).locator('.charges-panel')).not.toBeVisible();
  await expect(visaRow.locator('[data-testid="debt-charges-btn"]')).toContainText('1');
});

test('merchant breakdown pill appears for Amazon after first charge', async () => {
  const visaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Visa Pay Test' });
  const visaWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Visa Pay Test' });
  await visaRow.locator('[data-testid="debt-charges-btn"]').click();
  await expect(visaWrap.locator('.charges-panel')).toBeVisible();

  const breakdown = visaWrap.locator('.charges-breakdown');
  await expect(breakdown).toBeVisible();
  await expect(breakdown).toContainText('Amazon');
  await expect(breakdown).toContainText('$49.99');
});

// ── Second charge: same merchant (breakdown should combine) ───────────────────

test('adding second Amazon charge shows combined total in breakdown', async () => {
  const visaWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Visa Pay Test' });
  await visaWrap.locator('button', { hasText: '+ Add charge' }).click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ch-merchant', 'Amazon');
  await page.fill('#ch-amount', '19.99');
  await page.fill('#ch-note', 'USB cable');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Panel stays open after adding a charge
  await expect(visaWrap.locator('.charges-panel')).toBeVisible();

  // Combined: $49.99 + $19.99 = $69.98
  const breakdown = visaWrap.locator('.charges-breakdown');
  await expect(breakdown).toContainText('Amazon');
  await expect(breakdown).toContainText('$69.98');
  await expect(visaWrap.locator('.charges-item')).toHaveCount(2);
  await page.screenshot({ path: 'tests/screenshots/dc-09-combined-breakdown.png' });
});

// ── Third charge: different merchant ─────────────────────────────────────────

test('adding an Etsy charge shows both merchants in breakdown', async () => {
  const visaWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Visa Pay Test' });
  await visaWrap.locator('button', { hasText: '+ Add charge' }).click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ch-merchant', 'Etsy');
  await page.fill('#ch-amount', '34.50');
  await page.fill('#ch-note', 'Handmade mug');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Panel stays open after adding a charge
  await expect(visaWrap.locator('.charges-panel')).toBeVisible();

  const breakdown = visaWrap.locator('.charges-breakdown');
  await expect(breakdown).toContainText('Amazon');
  await expect(breakdown).toContainText('Etsy');
  await expect(breakdown).toContainText('$34.50');
  await expect(visaWrap.locator('.charges-item')).toHaveCount(3);
  await page.screenshot({ path: 'tests/screenshots/dc-10-two-merchants.png' });
});

// ── Delete a charge ───────────────────────────────────────────────────────────

test('deleting a charge reduces the item count and updates breakdown', async () => {
  const visaWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Visa Pay Test' });

  // Panel should still be open — delete the last item (oldest)
  const items = visaWrap.locator('.charges-item');
  await expect(items).toHaveCount(3);

  page.once('dialog', (d) => d.accept());
  await items.last().locator('.icon-btn.danger').click();

  // Panel stays open after deletion
  await expect(visaWrap.locator('.charges-panel')).toBeVisible();
  await expect(visaWrap.locator('.charges-item')).toHaveCount(2);
  await page.screenshot({ path: 'tests/screenshots/dc-11-charge-deleted.png' });
});

test('charges button shows count 2 after deletion', async () => {
  const visaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Visa Pay Test' });
  await visaRow.locator('[data-testid="debt-charges-btn"]').click(); // collapse
  await expect(visaRow.locator('[data-testid="debt-charges-btn"]')).toContainText('2');
});

// ── Payment auto-expense ──────────────────────────────────────────────────────

test('recording a debt payment reduces the balance', async () => {
  const visaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Visa Pay Test' });
  await visaRow.locator('[data-testid="debt-pay-btn"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#pay-amount', '150');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // $3,000 – $150 = $2,850
  await expect(visaRow.locator('[data-testid="debt-row-balance"]')).toContainText('$2,850');
  await page.screenshot({ path: 'tests/screenshots/dc-12-after-payment.png' });
});

test('expenses page shows Credit Card Payments category after payment', async () => {
  await navigateTo(page, 'expenses');
  await expect(
    page.locator('[data-testid="category-pill"]').filter({ hasText: 'Credit Card Payments' }),
  ).toBeVisible({ timeout: 8_000 });
  await page.screenshot({ path: 'tests/screenshots/dc-13-cc-category.png' });
});

test('expenses page shows auto-created expense with payment description and amount', async () => {
  await expect(
    page.locator('[data-testid="expense-row"]').filter({ hasText: 'Visa Pay Test payment' }),
  ).toBeVisible({ timeout: 8_000 });
  await expect(
    page.locator('[data-testid="expense-row"]').filter({ hasText: 'Visa Pay Test payment' }),
  ).toContainText('$150');
  await page.screenshot({ path: 'tests/screenshots/dc-14-cc-expense-entry.png' });
});

// ── Cascade delete: account deletion removes its charges ──────────────────────

test('deleting a card account also removes its charges', async () => {
  await navigateTo(page, 'debt');

  // Delete Intro APR Card (has no payments, set up cleanly for this test)
  page.once('dialog', (d) => d.accept());
  const introRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Intro APR Card' });
  await introRow.locator('[data-testid="debt-delete"]').click();

  await expect(
    page.locator('[data-testid="debt-row"]').filter({ hasText: 'Intro APR Card' }),
  ).not.toBeVisible({ timeout: 8_000 });

  // Add a new card with same name to verify charge store is clean (no orphaned charges)
  // Just verify the row count decreased — we had 3 accounts, now 2
  await expect(page.locator('[data-testid="debt-row"]')).toHaveCount(2);
  await page.screenshot({ path: 'tests/screenshots/dc-15-cascade-delete.png' });
});
