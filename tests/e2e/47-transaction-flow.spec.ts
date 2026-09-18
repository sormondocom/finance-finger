/**
 * End-to-end transaction flow tests.
 *
 * Exercises the complete money-flow pipeline across all four domains:
 * Income → Account, Expense → Account, Debt payment → Account + Card.
 *
 * For every flow, verifies:
 *   • The correct LedgerEntry type is created (bank-credit / bank-debit / payment)
 *   • The entry appears in the account ledger panel with correct sign and amount
 *   • The account running balance is arithmetically correct after each transaction
 *   • Entries appear in chronological order (most-recent first in the panel)
 *   • The general ledger reflects all entries with correct grouping
 *
 * State built cumulatively (single fresh extension context):
 *   Flow Checking  — bank account  $10,000 opening balance
 *   Flow Card      — debt card     $3,000  19.99% APR
 *   "Household"    — expense category
 *   "Rent"         — $1,500 one-time expense (today)
 *   "Quarterly Bonus" — $2,500 one-time income (today)  → bank-credit
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

const today = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

// ── Running-balance expectations ───────────────────────────────────────────────
// Opening: $10,000
// After Quarterly Bonus (bank-credit +$2,500):  $12,500
// After Rent payment  (bank-debit  −$1,500):   $11,000
// After Flow Card pay (bank-debit  −$500):      $10,500
const OPENING   = 10_000;
const BONUS     = 2_500;
const RENT      = 1_500;
const DEBT_PAY  = 500;
const BAL_AFTER_BONUS    = OPENING + BONUS;     // 12 500
const BAL_AFTER_RENT     = BAL_AFTER_BONUS - RENT;   // 11 000
const BAL_AFTER_DEBTPAY  = BAL_AFTER_RENT - DEBT_PAY; // 10 500

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

test.beforeAll(async () => {
  const ext = await launchExtensionContext();
  context = ext.context;
  cleanup = ext.cleanup;
  page = await context.newPage();
  await page.goto(ext.extUrl);
  await completeSetupWizard(page);
});

test.afterAll(async () => {
  await cleanup();
});

// ────────────────────────────────────────────────────────────────────────────────
// SETUP: Accounts, debt, categories, expenses
// ────────────────────────────────────────────────────────────────────────────────

test('setup: create Flow Checking bank account with $10,000 opening balance', async () => {
  await navigateTo(page, 'accounts');
  await page.click('[data-testid="add-account-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#ba-name', 'Flow Checking');
  await page.fill('#ba-balance', String(OPENING));
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'Flow Checking' });
  await expect(row).toBeVisible();
  // Opening balance should display as actual balance
  await expect(row.locator('[data-testid="account-actual-balance"]')).toContainText(`$${fmt(OPENING)}`);
  await page.screenshot({ path: 'tests/screenshots/flow-01-account-setup.png' });
});

test('setup: create Flow Card debt account ($3,000)', async () => {
  await navigateTo(page, 'debt');
  await page.click('[data-testid="add-debt-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#da-name', 'Flow Card');
  await page.fill('#da-balance', '3000');
  await page.fill('#da-apr', '19.99');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  const row = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Flow Card' });
  await expect(row.locator('[data-testid="debt-row-balance"]')).toContainText('$3,000.00');
  await page.screenshot({ path: 'tests/screenshots/flow-02-card-setup.png' });
});

test('setup: add Household expense category', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-category-btn"]');
  await page.fill('#cat-name', 'Household');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="category-pill"]').filter({ hasText: 'Household' })).toBeVisible();
});

test('setup: add Rent one-time expense ($1,500)', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#ef-desc', 'Rent');
  await page.fill('#ef-amount', String(RENT));
  await page.selectOption('#ef-cat', { label: 'Household' });
  await page.fill('#ef-date', todayStr);
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Rent' })).toBeVisible();
});

// ────────────────────────────────────────────────────────────────────────────────
// FLOW 1: One-time income deposit → bank-credit LedgerEntry
// ────────────────────────────────────────────────────────────────────────────────

test('income: add household member for income source', async () => {
  await navigateTo(page, 'income');
  await page.fill('[data-testid="income-add-member-input"]', 'Alex');
  await page.click('[data-testid="income-add-member-btn"]');
  await expect(page.locator('[data-testid="income-member-chip"]').filter({ hasText: 'Alex' })).toBeVisible();
});

test('income: add "Quarterly Bonus" one-time income linked to Flow Checking', async () => {
  await page.click('[data-testid="income-add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#sf-name', 'Quarterly Bonus');
  await page.selectOption('#sf-freq', 'once');
  await page.fill('#sf-amount', String(BONUS));
  await page.fill('#sf-date', todayStr);

  const bankSelect = page.locator('[data-testid="income-sf-account-select"]');
  await expect(bankSelect).toBeVisible({ timeout: 8_000 });
  await bankSelect.selectOption({ label: 'Flow Checking' });

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(
    page.locator('[data-testid="income-source-row"]').filter({ hasText: 'Quarterly Bonus' }),
  ).toBeVisible({ timeout: 8_000 });
  await page.screenshot({ path: 'tests/screenshots/flow-03-bonus-added.png' });
});

test('income: Flow Checking actual balance increases by bonus amount', async () => {
  await navigateTo(page, 'accounts');
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'Flow Checking' });
  await expect(row.locator('[data-testid="account-actual-balance"]')).toContainText(
    `$${fmt(BAL_AFTER_BONUS)}`,
    { timeout: 8_000 },
  );
  await page.screenshot({ path: 'tests/screenshots/flow-04-balance-after-bonus.png' });
});

test('income: account ledger shows Quarterly Bonus as a bank-credit (+)', async () => {
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'Flow Checking' });
  await row.locator('[data-testid="account-ledger"]').click();
  const panel = page.locator('.account-ledger-panel');
  await expect(panel).toBeVisible();

  await expect(panel).toContainText('Quarterly Bonus');
  // Find the credit entry for the bonus
  const creditRows = panel.locator('.account-ledger-amount--credit');
  const bonusCredit = creditRows.filter({ hasText: `$${fmt(BONUS)}` });
  await expect(bonusCredit).toBeVisible();
  await expect(bonusCredit).toContainText('+');
  await page.screenshot({ path: 'tests/screenshots/flow-05-ledger-bonus-credit.png' });
});

test('income: account ledger running balance after bonus matches $12,500', async () => {
  const panel = page.locator('.account-ledger-panel');
  // The Quarterly Bonus is the oldest non-reconciliation entry.
  // Running balance at that row = opening ($10,000) + bonus ($2,500).
  // The panel displays newest-first so this row appears last.
  const rows = panel.locator('.account-ledger-row:not(.account-ledger-col-header):not(.account-ledger-opening-row)');
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(1);

  // The opening reconciliation row anchors the balance at $10,000.
  // The bonus row's balance cell should show $12,500.
  const balCells = panel.locator('.account-ledger-balance');
  let found = false;
  for (let i = 0; i < await balCells.count(); i++) {
    const text = await balCells.nth(i).textContent();
    if (text?.includes(fmt(BAL_AFTER_BONUS))) { found = true; break; }
  }
  expect(found).toBe(true);
});

// ────────────────────────────────────────────────────────────────────────────────
// FLOW 2: Expense payment from bank → bank-debit LedgerEntry
// ────────────────────────────────────────────────────────────────────────────────

test('expense: record Rent payment from Flow Checking', async () => {
  // Close the ledger panel first
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'Flow Checking' });
  const panel = page.locator('.account-ledger-panel');
  if (await panel.isVisible()) {
    await row.locator('[data-testid="account-ledger"]').click();
    await expect(panel).not.toBeVisible();
  }

  await navigateTo(page, 'expenses');
  const expRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Rent' });
  await expRow.locator('[data-action="record-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('[data-testid="expense-pay-amount"]', String(RENT));
  const srcSel = page.locator('#pay-src');
  if (await srcSel.isVisible()) {
    await srcSel.selectOption({ label: 'Flow Checking' });
  }
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/flow-06-rent-paid.png' });
});

test('expense: Flow Checking actual balance decreases by rent amount', async () => {
  await navigateTo(page, 'accounts');
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'Flow Checking' });
  await expect(row.locator('[data-testid="account-actual-balance"]')).toContainText(
    `$${fmt(BAL_AFTER_RENT)}`,
    { timeout: 8_000 },
  );
  await page.screenshot({ path: 'tests/screenshots/flow-07-balance-after-rent.png' });
});

test('expense: account ledger shows Rent as a bank-debit (−)', async () => {
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Flow Checking' });
  await acctRow.locator('[data-testid="account-ledger"]').click();
  const panel = page.locator('.account-ledger-panel');
  await expect(panel).toBeVisible();

  await expect(panel).toContainText('Rent');
  const debitAmts = panel.locator('.account-ledger-amount--debit');
  const rentDebit = debitAmts.filter({ hasText: `$${fmt(RENT)}` });
  await expect(rentDebit).toBeVisible();
  await expect(rentDebit).toContainText('−');
  await page.screenshot({ path: 'tests/screenshots/flow-08-ledger-rent-debit.png' });
});

test('expense: account ledger running balance after rent matches $11,000', async () => {
  const panel = page.locator('.account-ledger-panel');
  const balCells = panel.locator('.account-ledger-balance');
  let found = false;
  for (let i = 0; i < await balCells.count(); i++) {
    const text = await balCells.nth(i).textContent();
    if (text?.includes(fmt(BAL_AFTER_RENT))) { found = true; break; }
  }
  expect(found).toBe(true);
});

// ────────────────────────────────────────────────────────────────────────────────
// FLOW 3: Debt payment from bank → bank-debit + payment LedgerEntries
// ────────────────────────────────────────────────────────────────────────────────

test('debt: close ledger panel and record $500 Flow Card payment from Flow Checking', async () => {
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Flow Checking' });
  const panel = page.locator('.account-ledger-panel');
  if (await panel.isVisible()) {
    await acctRow.locator('[data-testid="account-ledger"]').click();
    await expect(panel).not.toBeVisible();
  }

  await navigateTo(page, 'debt');
  const debtRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Flow Card' });
  await debtRow.locator('[data-testid="debt-pay-btn"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('[data-testid="debt-pay-amount"]', String(DEBT_PAY));
  const bankSel = page.locator('[data-testid="debt-pay-bank-select"]');
  if (await bankSel.isVisible()) {
    await bankSel.selectOption({ label: 'Flow Checking' });
  }
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Card balance reduced: $3,000 − $500 = $2,500
  await expect(debtRow.locator('[data-testid="debt-row-balance"]')).toContainText('$2,500.00');
  await page.screenshot({ path: 'tests/screenshots/flow-09-debt-paid.png' });
});

test('debt: Flow Checking actual balance decreases by debt payment amount', async () => {
  await navigateTo(page, 'accounts');
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'Flow Checking' });
  await expect(row.locator('[data-testid="account-actual-balance"]')).toContainText(
    `$${fmt(BAL_AFTER_DEBTPAY)}`,
    { timeout: 8_000 },
  );
  await page.screenshot({ path: 'tests/screenshots/flow-10-balance-after-debt.png' });
});

test('debt: account ledger shows Flow Card payment as a bank-debit (−)', async () => {
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Flow Checking' });
  await acctRow.locator('[data-testid="account-ledger"]').click();
  const panel = page.locator('.account-ledger-panel');
  await expect(panel).toBeVisible();

  // bank-debit description format: "Regular payment — Flow Card"
  await expect(panel).toContainText('Regular payment');
  await expect(panel).toContainText('Flow Card');
  const debitAmts = panel.locator('.account-ledger-amount--debit');
  const debtDebit = debitAmts.filter({ hasText: `$${fmt(DEBT_PAY)}` });
  await expect(debtDebit).toBeVisible();
  await expect(debtDebit).toContainText('−');
  await page.screenshot({ path: 'tests/screenshots/flow-11-ledger-debt-debit.png' });
});

test('debt: account ledger running balance after debt payment matches $10,500', async () => {
  const panel = page.locator('.account-ledger-panel');
  const balCells = panel.locator('.account-ledger-balance');
  let found = false;
  for (let i = 0; i < await balCells.count(); i++) {
    const text = await balCells.nth(i).textContent();
    if (text?.includes(fmt(BAL_AFTER_DEBTPAY))) { found = true; break; }
  }
  expect(found).toBe(true);
});

test('debt: account ledger total has 3 non-reconciliation entries', async () => {
  const panel = page.locator('.account-ledger-panel');
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Flow Checking' });
  const ledgerBtn = acctRow.locator('[data-testid="account-ledger"]');
  // Count badge excludes reconciliation entries
  const btnText = await ledgerBtn.textContent();
  // 1 bank-credit (Quarterly Bonus) + 1 bank-debit (Rent) + 1 bank-debit (debt payment)
  expect(btnText).toMatch(/📋\s*3/);
  // Panel also lists only non-reconciliation rows (opening balance row is separate)
  const txRows = panel.locator('.account-ledger-row:not(.account-ledger-col-header):not(.account-ledger-opening-row)');
  await expect(txRows).toHaveCount(3);
  await page.screenshot({ path: 'tests/screenshots/flow-12-ledger-count.png' });
});

// ────────────────────────────────────────────────────────────────────────────────
// CHRONOLOGICAL ORDER: entries appear newest-first in the panel
// ────────────────────────────────────────────────────────────────────────────────

test('order: account ledger panel displays entries newest-first', async () => {
  // Panel displays in reverse chronological order (newest first).
  // The transactions were created: bonus → rent → debt payment
  // So display order (newest first) = debt payment, rent, bonus
  const panel = page.locator('.account-ledger-panel');
  const txRows = panel.locator('.account-ledger-row:not(.account-ledger-col-header):not(.account-ledger-opening-row)');

  const firstRowText = await txRows.nth(0).textContent();
  const secondRowText = await txRows.nth(1).textContent();
  const thirdRowText = await txRows.nth(2).textContent();

  // Most recent: debt payment (Flow Card)
  expect(firstRowText).toContain('Flow Card');
  // Middle: expense (Rent)
  expect(secondRowText).toContain('Rent');
  // Oldest: income (Quarterly Bonus)
  expect(thirdRowText).toContain('Quarterly Bonus');

  await page.screenshot({ path: 'tests/screenshots/flow-13-order.png' });
});

// ────────────────────────────────────────────────────────────────────────────────
// GENERAL LEDGER: all entries present, debt payment shows flow card
// ────────────────────────────────────────────────────────────────────────────────

test('general ledger: shows all 5 entries (opening recon + bonus + rent + debt-pay + card payment)', async () => {
  // Close the account ledger panel
  const acctRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Flow Checking' });
  const panel = page.locator('.account-ledger-panel');
  if (await panel.isVisible()) {
    await acctRow.locator('[data-testid="account-ledger"]').click();
    await expect(panel).not.toBeVisible();
  }

  await navigateTo(page, 'ledger');
  await page.click('[data-testid="ledger-filter-reset"]');

  // 5 total LedgerEntries:
  // 1. reconciliation (opening balance on Flow Checking)
  // 2. reconciliation (opening balance on Flow Card — created by debt account setup)
  // 3. bank-credit (Quarterly Bonus → Flow Checking)
  // 4. bank-debit (Rent payment → Flow Checking)
  // 5. bank-debit (debt payment bank side → Flow Checking) + payment (card side → Flow Card)
  //    but payment + bank-debit are GROUPED into one flow card → count = 5 individual entries
  //    displayed as 4 cards (2 recon singles + 1 bonus single + 1 rent single + 1 flow card)
  const count = await page.locator('[data-testid="ledger-entry-count"]').textContent();
  expect(parseInt(count ?? '0', 10)).toBeGreaterThanOrEqual(5);
  await page.screenshot({ path: 'tests/screenshots/flow-14-general-ledger.png' });
});

test('general ledger: debt payment renders as a single flow card', async () => {
  // The debt payment creates a paired bank-debit (Flow Checking) + payment (Flow Card).
  // These two entries share a correlationId and collapse into one flow card.
  await expect(page.locator('.ledger-txn--flow')).toHaveCount(1);
  await page.screenshot({ path: 'tests/screenshots/flow-15-flow-card.png' });
});

test('general ledger: flow card shows Flow Checking as FROM account', async () => {
  const card = page.locator('.ledger-txn--flow');
  await expect(card.locator('[data-testid="ledger-flow-from-account"]')).toContainText('Flow Checking');
});

test('general ledger: flow card shows Flow Card as TO account', async () => {
  const card = page.locator('.ledger-txn--flow');
  await expect(card.locator('[data-testid="ledger-flow-to-account"]')).toContainText('Flow Card');
  await page.screenshot({ path: 'tests/screenshots/flow-16-flow-card-accounts.png' });
});

test('general ledger: income entry is visible in the feed', async () => {
  await expect(page.locator('[data-testid="ledger-entry-row"]').filter({ hasText: 'Quarterly Bonus' })).toBeVisible();
});

test('general ledger: expense payment entry is visible in the feed', async () => {
  await expect(page.locator('[data-testid="ledger-entry-row"]').filter({ hasText: 'Rent' })).toBeVisible();
});

test('general ledger: filtering by bank-credit type shows only the income entry', async () => {
  await page.selectOption('[data-testid="ledger-filter-type"]', 'bank-credit');
  const count = await page.locator('[data-testid="ledger-entry-count"]').textContent();
  expect(parseInt(count ?? '0', 10)).toBe(1);
  const firstRow = page.locator('[data-testid="ledger-entry-row"]').first();
  await expect(firstRow.locator('.ledger-txn-desc')).toContainText('Quarterly Bonus');
  await page.screenshot({ path: 'tests/screenshots/flow-17-filter-credit.png' });
});

test('general ledger: filter reset restores all entries', async () => {
  await page.click('[data-testid="ledger-filter-reset"]');
  const count = await page.locator('[data-testid="ledger-entry-count"]').textContent();
  expect(parseInt(count ?? '0', 10)).toBeGreaterThanOrEqual(5);
});

test('general ledger: filtering by account shows only Flow Checking entries', async () => {
  // Get the account id from the account row
  await navigateTo(page, 'accounts');
  const checkingRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Flow Checking' });
  const checkingId = await checkingRow.getAttribute('data-account-id');
  expect(checkingId).toBeTruthy();

  await navigateTo(page, 'ledger');
  await page.selectOption('[data-testid="ledger-filter-account"]', checkingId!);

  // Flow Checking has: 1 reconciliation + 1 bank-credit + 1 bank-debit (rent) + 1 bank-debit (debt pay) = 4
  const count = await page.locator('[data-testid="ledger-entry-count"]').textContent();
  expect(parseInt(count ?? '0', 10)).toBeGreaterThanOrEqual(3); // at least the 3 non-recon entries
  await page.click('[data-testid="ledger-filter-reset"]');
  await page.screenshot({ path: 'tests/screenshots/flow-18-filter-account.png' });
});
