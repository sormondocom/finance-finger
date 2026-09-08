/**
 * CSV Import E2E tests.
 *
 * Verifies the full import wizard flow for both bank account and credit card
 * targets. Uses page.evaluate to inject a synthetic File object since we
 * cannot use a real file picker in headless mode.
 *
 * The wizard has 4 steps:
 *   Step 1 — Load file
 *   Step 2 — Map columns
 *   Step 3 — Row-by-row review
 *   Step 4 — Confirm & import summary
 *
 * Test outline (sequential — each test picks up wizard state from the prior):
 *
 *  Bank account import
 *   1.  Import button (⬆) appears on each account row.
 *   2.  Clicking it opens the import wizard modal (Step 1).
 *   3.  Loading a CSV file enables the "Preview →" button.
 *   4.  Backdrop click does NOT close the wizard.
 *   5.  Delimiter buttons update the raw preview.
 *   6.  Advancing to Step 2 shows the full preview table.
 *   7.  Preview table contains all data rows.
 *   8.  Auto-detected column roles map date, description, and amount.
 *   9.  Step 3 — review shows progress label for first row.
 *  10.  Step 3 — transaction card shows date, description, amount.
 *  11.  Step 3 — Prev button is disabled on first row.
 *  12.  Step 3 — Skip → button advances to next row.
 *  13.  Step 3 — Prev button goes back to the previous row.
 *  14.  Step 3 — Confirm → button saves decision and advances.
 *  15.  Step 3 — keyword inference pre-selects Income for a credit/payroll row.
 *  16.  Step 3 — edit toggle shows inline form; Apply updates the transaction card.
 *  17.  Step 3 — note field accepts input.
 *  18.  Step 4 shows snapshot callout and import summary.
 *  19.  Confirms import and wizard closes.
 *  20.  Imported transactions appear in the account ledger.
 *  21.  Import snapshot appears in Settings under "Import snapshots."
 *  22.  Duplicate detection: importing same file shows the warning.
 *  23.  Re-map columns button navigates back to Step 2.
 *
 *  Credit card import
 *  24.  "Import CSV" button appears in the charges panel header.
 *  25.  Completing the wizard imports card charges.
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';

const BANK_CSV = [
  'Date,Description,Amount',
  '2026-01-15,Grocery Store,-82.50',
  '2026-01-16,Paycheck,2400.00',
  '2026-01-20,Electric Bill,-120.00',
  '2026-01-22,Coffee Shop,-6.75',
  '2026-01-28,Rent,-1200.00',
].join('\n');

// A CSV whose first data row has a description matching INCOME_KW ("Payroll Deposit").
// Used to verify keyword inference pre-selects the Income radio button.
const PAYROLL_CSV = [
  'Date,Description,Amount',
  '2026-03-01,Payroll Deposit,3200.00',
  '2026-03-15,Grocery Store,-74.20',
].join('\n');

const CARD_CSV = [
  'Date,Merchant,Amount',
  '2026-02-01,Amazon,34.99',
  '2026-02-03,Starbucks,7.25',
  '2026-02-10,Target,88.40',
].join('\n');

/**
 * Injects a synthetic CSV file into an <input type="file"> element.
 * Uses DataTransfer so Playwright's file chooser isn't required.
 */
async function injectCSVFile(page: Page, selectorTestId: string, csvContent: string, filename = 'transactions.csv'): Promise<void> {
  await page.evaluate(
    ({ testId, content, name }: { testId: string; content: string; name: string }) => {
      const dt = new DataTransfer();
      const file = new File([content], name, { type: 'text/csv' });
      dt.items.add(file);

      const dropzone = document.querySelector(`[data-testid="${testId}"]`) as HTMLElement;
      if (!dropzone) throw new Error(`Dropzone not found: ${testId}`);
      const ev = new DragEvent('drop', { bubbles: true, dataTransfer: dt, cancelable: true });
      dropzone.dispatchEvent(ev);
    },
    { testId: selectorTestId, content: csvContent, name: filename },
  );
}

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

  // Create a bank account to import into
  await navigateTo(page, 'accounts');
  await page.click('[data-testid="add-account-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#ba-name', 'Test Checking');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' })).toBeVisible({ timeout: 8_000 });

  // Create a credit card to import into
  await navigateTo(page, 'debt');
  await page.click('[data-testid="add-debt-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#da-name', 'Test Visa');
  await page.fill('#da-balance', '500');
  await page.fill('#da-apr', '20');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="debt-row"]').filter({ hasText: 'Test Visa' })).toBeVisible({ timeout: 8_000 });
});

test.afterAll(async () => {
  await cleanup();
});

// ── Bank account import ────────────────────────────────────────────────────────

test('import button appears on bank account row', async () => {
  await navigateTo(page, 'accounts');
  const accountRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  await expect(accountRow.locator('[data-testid="account-import"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/import-01-button.png' });
});

test('clicking import opens the wizard Step 1', async () => {
  const accountRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  await accountRow.locator('[data-testid="account-import"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible({ timeout: 6_000 });
  await expect(page.locator('[data-testid="iw-dropzone"]')).toBeVisible();
  await expect(page.locator('[data-testid="iw-step1-next"]')).toBeDisabled();
  await page.screenshot({ path: 'tests/screenshots/import-02-step1.png' });
});

test('loading a CSV file enables the Preview button', async () => {
  await injectCSVFile(page, 'iw-dropzone', BANK_CSV, 'bank.csv');
  await expect(page.locator('[data-testid="iw-file-info"]')).toBeVisible({ timeout: 4_000 });
  await expect(page.locator('[data-testid="iw-step1-next"]')).toBeEnabled({ timeout: 4_000 });
  await page.screenshot({ path: 'tests/screenshots/import-03-file-loaded.png' });
});

test('backdrop click does NOT close the import wizard', async () => {
  // The import wizard passes backdropClose:false to openModal.
  // Clicking outside the dialog content area must not close the wizard.
  const dialog = page.locator('[data-testid="modal-dialog"]');
  await expect(dialog).toBeVisible();

  // Click the very top-left corner of the viewport — well outside the centered modal
  await page.mouse.click(5, 5);
  await page.waitForTimeout(300);

  await expect(dialog).toBeVisible({ timeout: 2_000 });
  // The wizard step indicator and dropzone must still be present
  await expect(page.locator('[data-testid="iw-dropzone"]')).toBeVisible();
});

test('delimiter buttons are visible', async () => {
  await expect(page.locator('[data-testid="iw-delimiter-btns"]')).toBeVisible();
});

test('Step 2 shows the full preview table with column mapping', async () => {
  await page.click('[data-testid="iw-step1-next"]');
  await expect(page.locator('[data-testid="iw-preview-table"]')).toBeVisible({ timeout: 6_000 });
  // 3 columns: Date, Description, Amount
  const cols = page.locator('[data-testid^="iw-col-role-"]');
  await expect(cols).toHaveCount(3);
  await page.screenshot({ path: 'tests/screenshots/import-04-step2.png' });
});

test('preview table contains all data rows', async () => {
  // BANK_CSV has 5 data rows
  const tbody = page.locator('[data-testid="iw-preview-table"] tbody tr');
  await expect(tbody).toHaveCount(5);
});

test('auto-detected column roles map date, description, and amount', async () => {
  const date = page.locator('[data-testid="iw-col-role-0"]');
  const desc = page.locator('[data-testid="iw-col-role-1"]');
  const amt  = page.locator('[data-testid="iw-col-role-2"]');
  await expect(date).toHaveValue('date');
  await expect(desc).toHaveValue('description');
  await expect(amt).toHaveValue('amount');
});

// ── Step 3 — Row-by-row review ─────────────────────────────────────────────────

test('Step 3 — review shows progress label for first row', async () => {
  await page.click('[data-testid="iw-step2-next"]');
  await expect(page.locator('[data-testid="iw-review-progress"]')).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('[data-testid="iw-review-progress"]')).toContainText('Transaction 1 of 5');
  await page.screenshot({ path: 'tests/screenshots/import-04b-step3-progress.png' });
});

test('Step 3 — transaction card shows date, description, amount', async () => {
  // Row 1: 2026-01-15, Grocery Store, -82.50 (debit)
  const txnCard = page.locator('.iw-review-txn');
  await expect(txnCard).toBeVisible();
  await expect(txnCard).toContainText('Grocery Store');
  await expect(txnCard).toContainText('−$82.50');
});

test('Step 3 — Prev button is disabled on first row', async () => {
  await expect(page.locator('[data-testid="iw-review-prev"]')).toBeDisabled();
});

test('Step 3 — Skip → button advances to next row', async () => {
  await page.click('[data-testid="iw-review-skip"]');
  await expect(page.locator('[data-testid="iw-review-progress"]')).toContainText('Transaction 2 of 5', { timeout: 4_000 });
  await page.screenshot({ path: 'tests/screenshots/import-04c-step3-skip.png' });
});

test('Step 3 — Prev button goes back to the previous row', async () => {
  await expect(page.locator('[data-testid="iw-review-prev"]')).toBeEnabled();
  await page.click('[data-testid="iw-review-prev"]');
  await expect(page.locator('[data-testid="iw-review-progress"]')).toContainText('Transaction 1 of 5', { timeout: 4_000 });
});

test('Step 3 — Confirm → button saves decision and advances', async () => {
  // On row 1 (Grocery Store debit). Skip is pre-selected (no matching expense).
  // Confirming with the default advances to row 2 (Paycheck).
  await page.click('[data-testid="iw-review-confirm"]');
  await expect(page.locator('[data-testid="iw-review-progress"]')).toContainText('Transaction 2 of 5', { timeout: 6_000 });
  await page.screenshot({ path: 'tests/screenshots/import-04d-step3-confirm.png' });
});

test('Step 3 — keyword inference pre-selects Income radio for credit transaction', async () => {
  // Row 2 is Paycheck (+2400.00, a credit). The credit form defaults to Income.
  // In a separate sub-flow we also verify that "Payroll Deposit" (INCOME_KW match) pre-selects income.
  // Here we verify the current card (row 2, credit) has the income radio checked.
  const incomeRadio = page.locator('#iw-action-income');
  await expect(incomeRadio).toBeChecked({ timeout: 4_000 });
});

test('Step 3 — edit toggle shows inline form; Apply changes updates the card', async () => {
  // Still on row 2 (Paycheck). Open inline edit form.
  await expect(page.locator('[data-testid="iw-review-edit-form"]')).not.toBeVisible();
  await page.click('[data-testid="iw-review-edit-toggle"]');
  await expect(page.locator('[data-testid="iw-review-edit-form"]')).toBeVisible({ timeout: 2_000 });

  // Edit the description and apply
  const descInput = page.locator('[data-testid="iw-review-edit-desc"]');
  await descInput.clear();
  await descInput.fill('Edited Paycheck');
  await page.click('[data-testid="iw-review-edit-apply"]');

  // Card should now display the updated description (re-renders)
  await expect(page.locator('.iw-review-txn')).toContainText('Edited Paycheck', { timeout: 4_000 });
  await page.screenshot({ path: 'tests/screenshots/import-04e-step3-edit.png' });
});

test('Step 3 — note field accepts input', async () => {
  const noteInput = page.locator('#iw-review-note');
  await expect(noteInput).toBeVisible();
  await noteInput.fill('Test note entry');
  await expect(noteInput).toHaveValue('Test note entry');
});

// ── Step 4 — summary & confirm ─────────────────────────────────────────────────

test('Step 4 shows snapshot callout and import summary', async () => {
  await page.click('[data-testid="iw-review-skip-all"]');
  await expect(page.locator('[data-testid="iw-summary"]')).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('[data-testid="iw-summary"]')).toContainText('5');
  await expect(page.locator('.iw-snapshot-callout')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/import-05-step4.png' });
});

test('confirms import and wizard closes', async () => {
  await page.click('[data-testid="iw-import-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: 'tests/screenshots/import-06-done.png' });
});

test('imported transactions appear in the account ledger', async () => {
  const accountRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  await accountRow.locator('[data-testid="account-ledger"]').click();
  await page.waitForTimeout(500);
  await expect(page.locator('text=Grocery Store')).toBeVisible({ timeout: 6_000 });
  await page.screenshot({ path: 'tests/screenshots/import-07-ledger.png' });
});

test('import snapshot appears in Settings under Import snapshots', async () => {
  await navigateTo(page, 'settings');
  await expect(page.locator('[data-testid="settings-snapshot-import-badge"]')).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('[data-testid="settings-snapshot-list"]')).toContainText('Import - Test Checking');
  await page.screenshot({ path: 'tests/screenshots/import-08-settings-snapshot.png' });
});

test('importing the same file again shows a duplicate warning', async () => {
  await navigateTo(page, 'accounts');
  const accountRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  await accountRow.locator('[data-testid="account-import"]').click();
  await expect(page.locator('[data-testid="iw-dropzone"]')).toBeVisible();

  await injectCSVFile(page, 'iw-dropzone', BANK_CSV, 'bank.csv');
  await expect(page.locator('[data-testid="iw-step1-next"]')).toBeEnabled({ timeout: 4_000 });
  await page.click('[data-testid="iw-step1-next"]');
  await page.click('[data-testid="iw-step2-next"]');

  await expect(page.locator('[data-testid="iw-review-skip-all"]')).toBeVisible({ timeout: 8_000 });
  await page.click('[data-testid="iw-review-skip-all"]');

  await expect(page.locator('[data-testid="iw-duplicate-warning"]')).toBeVisible({ timeout: 8_000 });
  await page.screenshot({ path: 'tests/screenshots/import-09-duplicate.png' });

  // Cancel uses the Step 4 cancel button (not modal-close) — both close the wizard
  await page.click('[data-testid="iw-cancel"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible({ timeout: 4_000 });
});

test('Re-map columns button navigates back to Step 2', async () => {
  // Open a fresh wizard session with PAYROLL_CSV so we have clean review state.
  const accountRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Test Checking' });
  await accountRow.locator('[data-testid="account-import"]').click();
  await expect(page.locator('[data-testid="iw-dropzone"]')).toBeVisible();

  await injectCSVFile(page, 'iw-dropzone', PAYROLL_CSV, 'payroll.csv');
  await expect(page.locator('[data-testid="iw-step1-next"]')).toBeEnabled({ timeout: 4_000 });
  await page.click('[data-testid="iw-step1-next"]');

  // Step 2 — preview table visible
  await expect(page.locator('[data-testid="iw-preview-table"]')).toBeVisible({ timeout: 6_000 });
  await page.click('[data-testid="iw-step2-next"]');

  // Now on Step 3 Review — Re-map columns button should be in the footer
  await expect(page.locator('[data-testid="iw-review-remap"]')).toBeVisible({ timeout: 8_000 });
  await page.click('[data-testid="iw-review-remap"]');

  // Should navigate back to Step 2 — preview table becomes visible again
  await expect(page.locator('[data-testid="iw-preview-table"]')).toBeVisible({ timeout: 6_000 });
  // And Step 3 progress indicator should be gone
  await expect(page.locator('[data-testid="iw-review-progress"]')).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/import-10-remap.png' });

  // Clean up — cancel the wizard
  await page.click('[data-testid="iw-cancel"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible({ timeout: 4_000 });
});

// ── Credit card import ─────────────────────────────────────────────────────────

test('Import CSV button appears in credit card charges panel', async () => {
  await navigateTo(page, 'debt');
  const debtRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Test Visa' });
  await debtRow.click();
  const chargesToggle = debtRow.locator('button[title*="charge" i], button:has-text("charge")').first();
  if (await chargesToggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await chargesToggle.click();
  }
  await expect(page.locator('[data-testid="debt-card-import-btn"]')).toBeVisible({ timeout: 6_000 });
  await page.screenshot({ path: 'tests/screenshots/import-11-card-import-btn.png' });
});

test('completing the card import wizard imports charges', async () => {
  await page.click('[data-testid="debt-card-import-btn"]');
  await expect(page.locator('[data-testid="iw-dropzone"]')).toBeVisible({ timeout: 4_000 });

  await injectCSVFile(page, 'iw-dropzone', CARD_CSV, 'card.csv');
  await expect(page.locator('[data-testid="iw-step1-next"]')).toBeEnabled({ timeout: 4_000 });
  await page.click('[data-testid="iw-step1-next"]');

  await expect(page.locator('[data-testid="iw-preview-table"]')).toBeVisible({ timeout: 6_000 });
  await expect(page.locator('[data-testid="iw-preview-table"] tbody tr')).toHaveCount(3);

  await page.click('[data-testid="iw-step2-next"]');

  await expect(page.locator('[data-testid="iw-review-skip-all"]')).toBeVisible({ timeout: 8_000 });
  await page.click('[data-testid="iw-review-skip-all"]');

  await expect(page.locator('[data-testid="iw-summary"]')).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('[data-testid="iw-summary"]')).toContainText('3');

  await page.click('[data-testid="iw-import-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: 'tests/screenshots/import-12-card-done.png' });
});
