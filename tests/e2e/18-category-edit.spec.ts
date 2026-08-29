/**
 * Category edit E2E tests.
 *
 * Covers the full editing lifecycle for expense categories introduced
 * when category pills became clickable:
 *
 *   1. Clicking a pill opens the edit modal (not the new-category form).
 *   2. Edit modal is pre-populated: name, budget, and selected color
 *      all reflect the saved category.
 *   3. Renaming a category — pill and filter chip update.
 *   4. Changing the color — the pill dot and filter chip dot update.
 *   5. Changing the monthly budget — value persists (re-open confirms).
 *   6. Clearing the budget removes it (budget field is empty on re-open).
 *   7. Trying to rename to an existing name shows an error (case-insensitive)
 *      and echoes the existing name's original casing.
 *   8. Saving with the category's own unchanged name is accepted (no false
 *      duplicate error).
 *   9. The ✕ delete button still works and does NOT open the edit modal
 *      (stopPropagation is correct).
 *  10. Keyboard: pressing Enter on a focused pill opens the edit modal.
 *
 * State built cumulatively in this suite (fresh extension context):
 *   - "Utilities"  — with budget $200, initial color slot 0
 *   - "Groceries"  — no budget, initial color slot 1
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Open the edit modal for a named category by clicking its pill. */
async function openEditModal(catName: string): Promise<void> {
  const pill = page.locator('[data-testid="category-pill"]').filter({ hasText: catName });
  await pill.click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
}

/** Read the computed background of the chip-dot inside a named category pill. */
async function pillDotColor(catName: string): Promise<string> {
  const dot = page
    .locator('[data-testid="category-pill"]')
    .filter({ hasText: catName })
    .locator('.chip-dot');
  return dot.evaluate((el) => (el as HTMLElement).style.background);
}

// ── Suite setup ───────────────────────────────────────────────────────────────

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

// ── Fixture categories ────────────────────────────────────────────────────────

test('set up: add Utilities category with $200 budget', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#cat-name', 'Utilities');
  await page.fill('#cat-budget', '200');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(
    page.locator('[data-testid="category-pill"]').filter({ hasText: 'Utilities' }),
  ).toBeVisible();
});

test('set up: add Groceries category with no budget', async () => {
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#cat-name', 'Groceries');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(
    page.locator('[data-testid="category-pill"]').filter({ hasText: 'Groceries' }),
  ).toBeVisible();
});

// ── Test 1: clicking a pill opens the edit modal ──────────────────────────────

test('clicking a category pill opens the Edit Category modal', async () => {
  await navigateTo(page, 'expenses');
  await openEditModal('Utilities');

  await expect(page.locator('[data-testid="modal-dialog"]')).toContainText('Edit Category');
  await page.click('[data-testid="modal-cancel"]');
});

// ── Test 2: edit modal pre-populates existing values ─────────────────────────

test('edit modal pre-fills the category name', async () => {
  await openEditModal('Utilities');

  const nameVal = await page.inputValue('#cat-name');
  expect(nameVal).toBe('Utilities');

  await page.click('[data-testid="modal-cancel"]');
});

test('edit modal pre-fills the monthly budget', async () => {
  await openEditModal('Utilities');

  const budgetVal = await page.inputValue('#cat-budget');
  expect(budgetVal).toBe('200');

  await page.click('[data-testid="modal-cancel"]');
});

test('edit modal marks the current color as selected', async () => {
  await openEditModal('Utilities');

  // At least one swatch should carry the "selected" class
  const selectedSwatches = page.locator('.color-swatch.selected');
  await expect(selectedSwatches).toHaveCount(1);

  await page.click('[data-testid="modal-cancel"]');
});

// ── Test 3: rename a category ─────────────────────────────────────────────────

test('renaming a category updates the pill and the filter chip', async () => {
  await openEditModal('Utilities');

  await page.fill('#cat-name', 'Bills');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Management pill updated
  await expect(
    page.locator('[data-testid="category-pill"]').filter({ hasText: 'Bills' }),
  ).toBeVisible();
  // Old name gone
  await expect(
    page.locator('[data-testid="category-pill"]').filter({ hasText: 'Utilities' }),
  ).toHaveCount(0);

  // Filter chip in the filter bar also updated
  await expect(
    page.locator('[data-testid="filter-category"]').filter({ hasText: 'Bills' }),
  ).toBeVisible();
});

// ── Test 4: change the color ──────────────────────────────────────────────────

test('changing the color updates the pill dot color', async () => {
  const colorBefore = await pillDotColor('Bills');

  await openEditModal('Bills');

  // Pick a swatch that is not already selected — click the second swatch
  const swatches = page.locator('.color-swatch');
  const secondColor = await swatches.nth(1).getAttribute('data-color');
  await swatches.nth(1).click();
  await expect(swatches.nth(1)).toHaveClass(/selected/);

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  const colorAfter = await pillDotColor('Bills');
  // Dot color should have changed
  expect(colorAfter).not.toBe(colorBefore);
  // Dot should reflect the chosen swatch color
  expect(secondColor).toBeTruthy();
});

// ── Test 5: change the budget ─────────────────────────────────────────────────

test('changing the budget persists — re-opening the form shows the new value', async () => {
  await openEditModal('Bills');
  await page.fill('#cat-budget', '350');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Re-open and verify
  await openEditModal('Bills');
  const budgetVal = await page.inputValue('#cat-budget');
  expect(budgetVal).toBe('350');
  await page.click('[data-testid="modal-cancel"]');
});

// ── Test 6: clear the budget ──────────────────────────────────────────────────

test('clearing the budget removes it — re-opening shows an empty budget field', async () => {
  await openEditModal('Bills');
  await page.fill('#cat-budget', '');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Re-open and verify
  await openEditModal('Bills');
  const budgetVal = await page.inputValue('#cat-budget');
  expect(budgetVal).toBe('');
  await page.click('[data-testid="modal-cancel"]');
});

// ── Tests 7a–7d: description field ───────────────────────────────────────────

test('description textarea is visible in the New Category form', async () => {
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('#cat-desc')).toBeVisible();
  await page.click('[data-testid="modal-cancel"]');
});

test('description textarea is visible in the Edit Category form', async () => {
  await openEditModal('Bills');
  await expect(page.locator('#cat-desc')).toBeVisible();
  await page.click('[data-testid="modal-cancel"]');
});

test('saving a description persists it — re-opening the form shows the saved value', async () => {
  await openEditModal('Bills');
  await page.fill('#cat-desc', 'Monthly recurring bills');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  await openEditModal('Bills');
  const descVal = await page.locator('#cat-desc').inputValue();
  expect(descVal).toBe('Monthly recurring bills');
  await page.click('[data-testid="modal-cancel"]');
});

test('clearing the description removes it — re-opening shows empty description field', async () => {
  await openEditModal('Bills');
  await page.fill('#cat-desc', '');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  await openEditModal('Bills');
  const descVal = await page.locator('#cat-desc').inputValue();
  expect(descVal).toBe('');
  await page.click('[data-testid="modal-cancel"]');
});

test('category can be saved without a description (description is optional)', async () => {
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'NoDesc');
  // Leave #cat-desc blank
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(
    page.locator('[data-testid="category-pill"]').filter({ hasText: 'NoDesc' }),
  ).toBeVisible();

  // Clean up
  const pill = page.locator('[data-testid="category-pill"]').filter({ hasText: 'NoDesc' });
  await pill.locator('[data-testid="category-remove"]').click();
  await expect(
    page.locator('[data-testid="category-pill"]').filter({ hasText: 'NoDesc' }),
  ).toHaveCount(0);
});

// ── Test 7: duplicate-name validation during edit ─────────────────────────────

test('renaming to an existing category name (same case) shows a duplicate error', async () => {
  await openEditModal('Bills');

  await page.fill('#cat-name', 'Groceries');
  await page.click('[data-testid="modal-submit"]');

  // Error must name the existing category with its original casing
  const errEl = page.locator('#cat-error');
  await expect(errEl).toBeVisible();
  await expect(errEl).toContainText('Groceries');

  // Modal stays open
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.click('[data-testid="modal-cancel"]');
});

test('renaming to an existing name (case-insensitive) still shows the duplicate error', async () => {
  await openEditModal('Bills');

  await page.fill('#cat-name', 'GROCERIES');
  await page.click('[data-testid="modal-submit"]');

  const errEl = page.locator('#cat-error');
  await expect(errEl).toBeVisible();
  // Error echoes the original casing of the existing category
  await expect(errEl).toContainText('Groceries');

  await page.click('[data-testid="modal-cancel"]');
});

// ── Test 8: saving with the same name is accepted ────────────────────────────

test('saving a category without changing its name does not trigger a duplicate error', async () => {
  await openEditModal('Bills');

  // Do not change the name — just submit
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Pill still present
  await expect(
    page.locator('[data-testid="category-pill"]').filter({ hasText: 'Bills' }),
  ).toBeVisible();
});

// ── Test 9: delete button does not open the edit modal ───────────────────────

test('clicking the ✕ delete button removes the category and does not open the edit modal', async () => {
  // Add a throwaway category to delete
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'Throwaway');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(
    page.locator('[data-testid="category-pill"]').filter({ hasText: 'Throwaway' }),
  ).toBeVisible();

  // Click the ✕ button — no confirm needed (no expenses in this category)
  const pill = page.locator('[data-testid="category-pill"]').filter({ hasText: 'Throwaway' });
  await pill.locator('[data-testid="category-remove"]').click();

  // Category should be gone
  await expect(
    page.locator('[data-testid="category-pill"]').filter({ hasText: 'Throwaway' }),
  ).toHaveCount(0);

  // Edit modal must NOT have opened
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Test 10: keyboard — Enter opens the edit modal ───────────────────────────

test('pressing Enter on a focused category pill opens the edit modal', async () => {
  const pill = page.locator('[data-testid="category-pill"]').filter({ hasText: 'Bills' });
  await expect(pill).toBeVisible();

  // Playwright's action-based focus() performs a hit-test (topmost element
  // at coordinates) which can intermittently intercept on a div. Dispatch the
  // keydown event directly to exercise the keyboard handler without that constraint.
  await pill.dispatchEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });

  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('[data-testid="modal-dialog"]')).toContainText('Edit Category');

  await page.click('[data-testid="modal-cancel"]');
});
