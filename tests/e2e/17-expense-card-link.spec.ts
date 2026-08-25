/**
 * Expense → card-charge linking E2E tests.
 *
 * Covers the full lifecycle of the expense-to-card-charge feature:
 *
 *   1. Category "Default card" — dropdown is pre-selected in expense form.
 *   2. Logging an expense with a linked card auto-creates a charge on that card.
 *   3. The auto-charge shows the "Auto" badge in the charges panel.
 *   4. Editing the expense (amount change) updates the charge in place.
 *   5. Swapping the card on an existing expense moves the charge to the new card.
 *   6. Removing the card link from an expense deletes the auto-charge.
 *   7. Deleting an expense with a linked card also deletes the auto-charge.
 *   8. Expenses without a card link produce no auto-charges.
 *   9. The card badge appears on the expense row when a card is linked.
 *  10. Category-change in the expense form auto-updates the card select to the
 *      new category's default (unless the user has manually overridden it).
 *
 * Accounts / categories created during this suite (fresh extension context):
 *   Visa Card    – card-type debt account
 *   Mastercard   – card-type debt account
 *   Utilities    – expense category, default card = Visa Card
 *   Groceries    – expense category, no default card
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

const today = new Date().toISOString().split('T')[0]!;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function openChargesPanel(cardName: string): Promise<void> {
  await navigateTo(page, 'debt');
  const row = page.locator('[data-testid="debt-row"]').filter({ hasText: cardName });
  await row.locator('[data-testid="debt-charges-btn"]').click();
}

// ── Setup ─────────────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  const ext = await launchExtensionContext();
  context   = ext.context;
  cleanup   = ext.cleanup;
  page      = await context.newPage();
  await page.goto(ext.extUrl);
  await completeSetupWizard(page);
});

test.afterAll(async () => {
  await cleanup();
});

test('set up: add Visa Card debt account', async () => {
  await navigateTo(page, 'debt');
  await page.click('[data-testid="add-debt-btn"]');
  await page.fill('#da-name', 'Visa Card');
  await page.fill('#da-balance', '2000');
  await page.fill('#da-apr', '19.99');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="debt-row"]').filter({ hasText: 'Visa Card' })).toBeVisible();
});

test('set up: add Mastercard debt account', async () => {
  await page.click('[data-testid="add-debt-btn"]');
  await page.fill('#da-name', 'Mastercard');
  await page.fill('#da-balance', '500');
  await page.fill('#da-apr', '24.99');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="debt-row"]').filter({ hasText: 'Mastercard' })).toBeVisible();
});

test('set up: add Utilities category with Visa Card as default', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'Utilities');
  // Select Visa Card as the default card
  await page.selectOption('[data-testid="cat-card-select"]', { label: 'Visa Card' });
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(
    page.locator('[data-testid="category-pill"]').filter({ hasText: 'Utilities' }),
  ).toBeVisible();
});

test('set up: add Groceries category with no default card', async () => {
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'Groceries');
  // Leave card select at "— No default card —"
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(
    page.locator('[data-testid="category-pill"]').filter({ hasText: 'Groceries' }),
  ).toBeVisible();
});

// ── Test 1: category default pre-fills the card select ───────────────────────

test('opening expense form with Utilities category pre-selects Visa Card', async () => {
  await navigateTo(page, 'expenses');
  // Filter to Utilities category so the add button appears
  await page.locator('[data-testid="filter-category"]').filter({ hasText: 'Utilities' }).click();
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // Category is pre-set (filter chip selected it), card should pre-fill
  // The ef-cat select starts blank for a new expense, but the category chip
  // just filters the list — the form opens with no category pre-selected.
  // So select Utilities manually:
  await page.selectOption('#ef-cat', { label: 'Utilities' });
  // Card should now auto-update to Visa Card
  await expect(page.locator('[data-testid="ef-card-select"]')).toHaveValue(/.+/);
  const cardSel = page.locator('[data-testid="ef-card-select"]');
  const selectedText = await cardSel.locator('option:checked').textContent();
  expect(selectedText).toContain('Visa Card');

  await page.click('[data-testid="modal-cancel"]');
});

// ── Test 2 & 3: logging an expense auto-creates a charge with Auto badge ──────

test('logging an expense linked to Visa Card creates an auto-charge on the card', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ef-desc', 'Electric Bill');
  await page.fill('#ef-amount', '95');
  await page.fill('#ef-date', today);
  await page.selectOption('#ef-cat', { label: 'Utilities' });
  // After selecting Utilities, card should auto-update to Visa Card
  await page.selectOption('[data-testid="ef-card-select"]', { label: 'Visa Card' });
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('the auto-charge appears in Visa Card charges panel with the Auto badge', async () => {
  await openChargesPanel('Visa Card');
  const wrap = page.locator('.debt-account-wrap').filter({ hasText: 'Visa Card' });
  await expect(wrap.locator('.charges-panel')).toBeVisible();

  const charge = wrap.locator('.charges-item').filter({ hasText: 'Electric Bill' });
  await expect(charge).toBeVisible();
  await expect(charge.locator('[data-testid="charge-auto-badge"]')).toBeVisible();
  await expect(charge.locator('[data-testid="charge-auto-badge"]')).toContainText('Auto');
});

test('the expense row shows the card badge linking it to Visa Card', async () => {
  await navigateTo(page, 'expenses');
  const expRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await expect(expRow.locator('[data-testid="expense-card-badge"]')).toBeVisible();
  await expect(expRow.locator('[data-testid="expense-card-badge"]')).toContainText('Visa Card');
});

// ── Test 4: editing amount updates the charge in place ────────────────────────

test('editing the expense amount updates the auto-charge amount on Visa Card', async () => {
  await navigateTo(page, 'expenses');
  const expRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await expRow.locator('[data-testid="expense-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ef-amount', '112.50');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Verify the charge on Visa Card reflects the new amount
  await openChargesPanel('Visa Card');
  const wrap = page.locator('.debt-account-wrap').filter({ hasText: 'Visa Card' });
  const charge = wrap.locator('.charges-item').filter({ hasText: 'Electric Bill' });
  await expect(charge).toBeVisible();
  await expect(charge).toContainText('$112.50');
  // Still only one charge (updated in place, not a new one)
  await expect(wrap.locator('.charges-item').filter({ hasText: 'Electric Bill' })).toHaveCount(1);
});

// ── Test 5: swapping the card moves the charge ────────────────────────────────

test('swapping the card to Mastercard removes charge from Visa Card and creates it on Mastercard', async () => {
  await navigateTo(page, 'expenses');
  const expRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await expRow.locator('[data-testid="expense-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.selectOption('[data-testid="ef-card-select"]', { label: 'Mastercard' });
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Visa Card should have no charge for Electric Bill
  await openChargesPanel('Visa Card');
  const visaWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Visa Card' });
  await expect(visaWrap.locator('.charges-item').filter({ hasText: 'Electric Bill' })).toHaveCount(0);

  // Mastercard should now have the charge with Auto badge
  await openChargesPanel('Mastercard');
  const mcWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Mastercard' });
  const charge = mcWrap.locator('.charges-item').filter({ hasText: 'Electric Bill' });
  await expect(charge).toBeVisible();
  await expect(charge.locator('[data-testid="charge-auto-badge"]')).toBeVisible();
});

// ── Test 6: removing the card link deletes the auto-charge ────────────────────

test('removing the card link from an expense deletes the auto-charge from Mastercard', async () => {
  await navigateTo(page, 'expenses');
  const expRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await expRow.locator('[data-testid="expense-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.selectOption('[data-testid="ef-card-select"]', { value: '' }); // "— No card —"
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Mastercard charges panel should be empty for Electric Bill
  await openChargesPanel('Mastercard');
  const mcWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Mastercard' });
  await expect(mcWrap.locator('.charges-item').filter({ hasText: 'Electric Bill' })).toHaveCount(0);

  // Card badge should be gone from expense row
  await navigateTo(page, 'expenses');
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Electric Bill' });
  await expect(row.locator('[data-testid="expense-card-badge"]')).toHaveCount(0);
});

// ── Test 7: deleting an expense removes the auto-charge ───────────────────────

test('set up: add a second linked expense for deletion test', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-expense-btn"]');
  await page.fill('#ef-desc', 'Water Bill');
  await page.fill('#ef-amount', '45');
  await page.fill('#ef-date', today);
  await page.selectOption('#ef-cat', { label: 'Utilities' });
  await page.selectOption('[data-testid="ef-card-select"]', { label: 'Visa Card' });
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Confirm charge exists
  await openChargesPanel('Visa Card');
  const wrap = page.locator('.debt-account-wrap').filter({ hasText: 'Visa Card' });
  await expect(wrap.locator('.charges-item').filter({ hasText: 'Water Bill' })).toBeVisible();
});

test('deleting the expense also removes its auto-charge from Visa Card', async () => {
  await navigateTo(page, 'expenses');
  const expRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Water Bill' });
  page.once('dialog', (d) => d.accept());
  await expRow.locator('[data-testid="expense-delete"]').click();

  // Charge should be gone from Visa Card
  await openChargesPanel('Visa Card');
  const wrap = page.locator('.debt-account-wrap').filter({ hasText: 'Visa Card' });
  await expect(wrap.locator('.charges-item').filter({ hasText: 'Water Bill' })).toHaveCount(0);
});

// ── Test 8: expenses without a card link produce no charges ───────────────────

test('an expense in Groceries (no default card) with no card selected creates no charge', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-expense-btn"]');
  await page.fill('#ef-desc', 'Supermarket Run');
  await page.fill('#ef-amount', '78');
  await page.fill('#ef-date', today);
  await page.selectOption('#ef-cat', { label: 'Groceries' });
  // Leave card at "— No card —"
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Neither card should have a charge for Supermarket Run
  await openChargesPanel('Visa Card');
  const visaWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Visa Card' });
  await expect(visaWrap.locator('.charges-item').filter({ hasText: 'Supermarket Run' })).toHaveCount(0);

  await openChargesPanel('Mastercard');
  const mcWrap = page.locator('.debt-account-wrap').filter({ hasText: 'Mastercard' });
  await expect(mcWrap.locator('.charges-item').filter({ hasText: 'Supermarket Run' })).toHaveCount(0);
});

// ── Test 10: category-change auto-updates card only if not manually overridden ─

test('switching category updates card select to the new category default', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // Start with Groceries (no default card)
  await page.selectOption('#ef-cat', { label: 'Groceries' });
  const cardSel = page.locator('[data-testid="ef-card-select"]');
  await expect(cardSel).toHaveValue(''); // no default

  // Switch to Utilities (Visa Card default) — should auto-update
  await page.selectOption('#ef-cat', { label: 'Utilities' });
  const selectedText = await cardSel.locator('option:checked').textContent();
  expect(selectedText).toContain('Visa Card');

  await page.click('[data-testid="modal-cancel"]');
});

test('manually selecting a card prevents category-change from overriding it', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  const cardSel = page.locator('[data-testid="ef-card-select"]');

  // Select Utilities (auto-fills Visa Card)
  await page.selectOption('#ef-cat', { label: 'Utilities' });
  await expect(cardSel.locator('option:checked')).toContainText('Visa Card');

  // User manually overrides to Mastercard
  await page.selectOption('[data-testid="ef-card-select"]', { label: 'Mastercard' });

  // Switch category — card should NOT revert to Visa Card
  await page.selectOption('#ef-cat', { label: 'Groceries' });
  const selectedText = await cardSel.locator('option:checked').textContent();
  expect(selectedText).toContain('Mastercard');

  await page.click('[data-testid="modal-cancel"]');
});
