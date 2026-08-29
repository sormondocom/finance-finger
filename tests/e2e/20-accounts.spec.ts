/**
 * Bank Accounts E2E tests.
 *
 * Covers the full Accounts feature and its integration points across the app:
 *
 * Accounts page CRUD
 *  1.  Nav link "Accounts" exists between Income and Expenses.
 *  2.  Accounts page loads with an empty state.
 *  3.  Add account form opens.
 *  4.  Adds a "Chase Checking" household account (checking, household).
 *  5.  Account row shows name, type badge, and ownership badge.
 *  6.  Account form contains a chart color picker.
 *  7.  Individual ownership reveals a member dropdown.
 *  8.  Adds a "Savings Fund" individual account assigned to a member.
 *  9.  Savings Fund row shows the member name as the owner badge.
 * 10.  Edit account updates the name; row reflects the change.
 * 11.  Delete account removes it from the list.
 * 12.  Billing portal ↗ link appears when URL is saved.
 *
 * Deposits chart
 * 13.  No chart is shown when no income is linked to any account.
 *
 * Income integration
 * 14.  Income source form shows a "Deposit to account" dropdown after an account exists.
 * 15.  Dropdown contains the account name.
 * 16.  Income source can be linked to an account and saved successfully.
 * 17.  Income source form shows a "No bank accounts" hint before any accounts exist
 *      (covered implicitly by test order — no hint now, dropdown shows).
 *
 * Expense integration
 * 18.  Expense form shows a "Pay from account" dropdown after an account exists.
 * 19.  Expense "Pay from account" dropdown contains the account name.
 * 20.  Expense can be linked to an account and saved successfully.
 *
 * Dashboard: Income by Account card
 * 21.  Dashboard shows "Income by Account" card when income is linked to an account.
 * 22.  Card has a row for the linked account showing monthly income.
 * 23.  "Manage →" link in the card navigates to Accounts page.
 *
 * Deposits chart (with data)
 * 24.  Deposits chart appears on the Accounts page after income is linked.
 * 25.  Chart subtitle mentions when sources were added (not retroactive projection).
 *
 * State built cumulatively (single fresh extension context):
 *   — "Alex" household member (for individual-ownership test)
 *   — "Chase Checking" checking / household account
 *   — "Savings Fund"   savings  / individual (Alex) account  (deleted later)
 *   — "Day Job" income source ($4,000 / month) → Chase Checking
 *   — "Internet" expense ($60 / month)         → Chase Checking
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
});

test.afterAll(async () => {
  await cleanup();
});

// ── Fixture: household member (needed for individual ownership test) ───────────

test('fixture: adds household member Alex', async () => {
  await navigateTo(page, 'income');
  await page.fill('[data-testid="add-member-input"]', 'Alex');
  await page.click('[data-testid="add-member-btn"]');
  await expect(page.locator('[data-testid="member-chip"]').filter({ hasText: 'Alex' })).toBeVisible();
});

// ── Test 1: nav link ──────────────────────────────────────────────────────────

test('Accounts nav link exists in the sidebar', async () => {
  await expect(page.locator('[data-testid="nav-accounts"]')).toBeVisible();
});

test('Accounts nav link is positioned between Income and Expenses', async () => {
  const navLinks = page.locator('.nav-links [data-testid]');
  const testIds = await navLinks.evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).dataset['testid'] ?? ''),
  );
  const incomeIdx = testIds.indexOf('nav-income');
  const accountsIdx = testIds.indexOf('nav-accounts');
  const expensesIdx = testIds.indexOf('nav-expenses');
  expect(incomeIdx).toBeGreaterThanOrEqual(0);
  expect(accountsIdx).toBeGreaterThan(incomeIdx);
  expect(expensesIdx).toBeGreaterThan(accountsIdx);
});

// ── Test 2: empty state ───────────────────────────────────────────────────────

test('Accounts page loads with empty state', async () => {
  await navigateTo(page, 'accounts');
  await expect(page.locator('h1')).toContainText('Bank Accounts');
  await expect(page.locator('.empty-state')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/accounts-01-empty.png' });
});

// ── Test 3: add account form opens ───────────────────────────────────────────

test('clicking Add account opens the form modal', async () => {
  await page.click('[data-testid="add-account-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('[data-testid="modal-dialog"]')).toContainText('Add Bank Account');
  await page.screenshot({ path: 'tests/screenshots/accounts-02-form.png' });
});

// ── Test 6 (early): color picker in form ─────────────────────────────────────

test('account form has a chart color picker', async () => {
  await expect(page.locator('#ba-color')).toBeVisible();
  const type = await page.locator('#ba-color').getAttribute('type');
  expect(type).toBe('color');
});

// ── Test 7: individual ownership shows member dropdown ────────────────────────

test('selecting Individual ownership reveals a member dropdown', async () => {
  await expect(page.locator('#ba-member-row')).not.toBeVisible();
  await page.selectOption('#ba-ownership', 'individual');
  await expect(page.locator('#ba-member-row')).toBeVisible();
  // Reset to household for the first account we're creating
  await page.selectOption('#ba-ownership', 'household');
  await expect(page.locator('#ba-member-row')).not.toBeVisible();
});

// ── Test 4: add Chase Checking ───────────────────────────────────────────────

test('adds Chase Checking as a household checking account', async () => {
  await page.fill('#ba-name', 'Chase Checking');
  await page.selectOption('#ba-type', 'checking');
  await page.fill('#ba-balance', '3200');
  // ownership already household (reset above)
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="account-row"]').filter({ hasText: 'Chase Checking' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/accounts-03-added.png' });
});

// ── Test 5: badges on account row ────────────────────────────────────────────

test('Chase Checking row shows "Checking" type badge', async () => {
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'Chase Checking' });
  await expect(row.locator('.account-type-badge')).toContainText('Checking');
});

test('Chase Checking row shows "Household" ownership badge', async () => {
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'Chase Checking' });
  await expect(row.locator('.account-ownership-badge')).toContainText('Household');
});

test('Chase Checking row shows the balance before the action buttons', async () => {
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'Chase Checking' });
  const balance = row.locator('[data-testid="account-balance"]');
  await expect(balance).toBeVisible();
  await expect(balance).toContainText('3,200');
});

test('Chase Checking row shows a color swatch dot', async () => {
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'Chase Checking' });
  await expect(row.locator('.account-color-swatch')).toBeVisible();
});

// ── Test 8: adds individual account ──────────────────────────────────────────

test('adds Savings Fund as an individual account for Alex', async () => {
  await page.click('[data-testid="add-account-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ba-name', 'Savings Fund');
  await page.selectOption('#ba-type', 'savings');
  await page.selectOption('#ba-ownership', 'individual');
  await expect(page.locator('#ba-member-row')).toBeVisible();
  await page.selectOption('#ba-member', { label: 'Alex' });

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="account-row"]').filter({ hasText: 'Savings Fund' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/accounts-04-savings.png' });
});

// ── Test 9: individual owner badge shows member name ─────────────────────────

test('Savings Fund row shows Alex as the owner badge', async () => {
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'Savings Fund' });
  await expect(row.locator('.account-ownership-badge')).toContainText('Alex');
});

// ── Test 10: edit account ─────────────────────────────────────────────────────

test('editing Chase Checking renames it to Main Checking', async () => {
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'Chase Checking' });
  await row.locator('[data-testid="account-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ba-name', 'Main Checking');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="account-row"]').filter({ hasText: 'Main Checking' })).toBeVisible();
  await expect(page.locator('[data-testid="account-row"]').filter({ hasText: 'Chase Checking' })).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/accounts-05-renamed.png' });
});

// ── Test 12: billing portal link ─────────────────────────────────────────────

test('editing Main Checking to add a URL shows a portal link', async () => {
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'Main Checking' });
  await row.locator('[data-testid="account-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ba-url', 'https://chase.com');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  const updatedRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Main Checking' });
  const portalLink = updatedRow.locator('a[title="Open banking portal"]');
  await expect(portalLink).toBeVisible();
  await expect(portalLink).toHaveAttribute('href', 'https://chase.com');
  await page.screenshot({ path: 'tests/screenshots/accounts-06-portal-link.png' });
});

// ── Test 11: delete account ───────────────────────────────────────────────────

test('deleting Savings Fund removes it from the list', async () => {
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'Savings Fund' });
  page.once('dialog', (d) => d.accept());
  await row.locator('[data-testid="account-delete"]').click();
  await expect(page.locator('[data-testid="account-row"]').filter({ hasText: 'Savings Fund' })).not.toBeVisible();
  await expect(page.locator('[data-testid="account-row"]').filter({ hasText: 'Main Checking' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/accounts-07-deleted.png' });
});

// ── Test 13: no chart without linked income ───────────────────────────────────

test('no deposits chart shown when no income is linked to any account', async () => {
  // Chart is only rendered when assignedSources.length > 0
  await expect(page.locator('canvas')).not.toBeVisible();
});

// ── Income integration ────────────────────────────────────────────────────────

test('income source form shows Deposit to account dropdown after accounts exist', async () => {
  await navigateTo(page, 'income');
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('[data-testid="sf-account-select"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/accounts-08-income-dropdown.png' });
});

test('Deposit to account dropdown contains Main Checking', async () => {
  await expect(page.locator('[data-testid="sf-account-select"]')).toContainText('Main Checking');
});

test('income source can be linked to Main Checking and saved', async () => {
  await page.fill('#sf-name', 'Day Job');
  await page.fill('#sf-amount', '4000');
  // frequency defaults to monthly
  await page.selectOption('[data-testid="sf-account-select"]', { label: 'Main Checking' });

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Day Job' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/accounts-09-income-linked.png' });
});

// ── Expense integration ───────────────────────────────────────────────────────

test('expense form shows Pay from account dropdown after accounts exist', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('[data-testid="ef-bank-account-select"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/accounts-10-expense-dropdown.png' });
});

test('Pay from account dropdown contains Main Checking', async () => {
  await expect(page.locator('[data-testid="ef-bank-account-select"]')).toContainText('Main Checking');
});

test('expense can be linked to Main Checking and saved', async () => {
  await page.fill('#ef-desc', 'Internet');
  await page.fill('#ef-amount', '60');
  await page.fill('#ef-date', new Date().toISOString().split('T')[0]!);
  await page.selectOption('[data-testid="ef-bank-account-select"]', { label: 'Main Checking' });

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Internet' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/accounts-11-expense-linked.png' });
});

// ── Dashboard: Income by Account card ────────────────────────────────────────

test('dashboard shows Income by Account card after income is linked to an account', async () => {
  await navigateTo(page, 'dashboard');
  await expect(page.locator('[data-testid="income-by-account-card"]')).toBeVisible({ timeout: 8000 });
  await page.screenshot({ path: 'tests/screenshots/accounts-12-dash-card.png' });
});

test('Income by Account card has a row for Main Checking', async () => {
  const card = page.locator('[data-testid="income-by-account-card"]');
  const row = card.locator('[data-testid="income-by-account-row"]').filter({ hasText: 'Main Checking' });
  await expect(row).toBeVisible();
});

test('Income by Account row shows the monthly income amount', async () => {
  const card = page.locator('[data-testid="income-by-account-card"]');
  const row = card.locator('[data-testid="income-by-account-row"]').filter({ hasText: 'Main Checking' });
  // Day Job is $4,000/month
  await expect(row).toContainText('4,000');
});

test('Income by Account card has a Manage link that navigates to Accounts', async () => {
  const manageLink = page.locator('[data-testid="income-by-account-card"]').locator('a', { hasText: 'Manage' });
  await expect(manageLink).toBeVisible();
  await manageLink.click();
  await expect(page.locator('h1')).toContainText('Bank Accounts');
});

// ── Deposits chart with data ──────────────────────────────────────────────────

test('deposits chart is visible on Accounts page after income is linked', async () => {
  // Already on accounts page from previous test's Manage → click
  await expect(page.locator('canvas')).toBeVisible({ timeout: 6000 });
  await page.screenshot({ path: 'tests/screenshots/accounts-13-chart.png' });
});

test('deposits chart subtitle says "as of when they were added" (no retroactive projection)', async () => {
  const chartCard = page.locator('.card').filter({ hasText: 'Monthly Deposits' });
  await expect(chartCard).toContainText('as of when they were added');
});

test('Main Checking row shows current balance before the action buttons', async () => {
  await navigateTo(page, 'accounts');
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'Main Checking' });
  const balance = row.locator('[data-testid="account-balance"]');
  await expect(balance).toBeVisible();
  // startingBalance($3,200) + Day Job recurring income($4,000/mo) = $7,200
  // Internet expense is non-recurring so it is not subtracted
  await expect(balance).toContainText('7,200');
});

test('Main Checking row shows monthly deposit income below the balance', async () => {
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'Main Checking' });
  const income = row.locator('[data-testid="account-monthly-income"]');
  await expect(income).toBeVisible();
  await expect(income).toContainText('4,000');
});

// ── Account without balance shows no balance element ──────────────────────────

test('account added without a balance shows no balance figure in the row', async () => {
  // Already on the Accounts page from the Manage → link click above
  await page.click('[data-testid="add-account-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ba-name', 'Emergency Fund');
  await page.selectOption('#ba-type', 'savings');
  // Leave the balance field empty

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'Emergency Fund' });
  await expect(row).toBeVisible();
  // No balance was entered so the balance element should be absent
  await expect(row.locator('[data-testid="account-balance"]')).not.toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/accounts-15-no-balance.png' });
});

// ── Custom account color is saved and pre-fills the edit form ─────────────────

test('saving a custom account color is persisted and shown in the edit form', async () => {
  const row = page.locator('[data-testid="account-row"]').filter({ hasText: 'Emergency Fund' });
  await row.locator('[data-testid="account-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.locator('#ba-color').fill('#cc3399');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Re-open the edit form to verify the color was persisted
  const updatedRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Emergency Fund' });
  await updatedRow.locator('[data-testid="account-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  const savedColor = await page.locator('#ba-color').inputValue();
  expect(savedColor.toLowerCase()).toBe('#cc3399');
  await page.screenshot({ path: 'tests/screenshots/accounts-16-custom-color-persisted.png' });

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── No-accounts hint in forms (inverse test) ──────────────────────────────────
//
// These are covered by 21-no-accounts-hints.spec.ts which uses a fresh context
// with no accounts set up. Here (with accounts present) we only verify the
// dropdown appears — which is already tested above.
