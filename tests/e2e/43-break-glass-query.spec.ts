/**
 * Break Glass — Query tab E2E tests.
 *
 * Tests the cross-store search feature: text search by name/payee/description,
 * amount search by dollar value, the no-match empty state, result grouping by
 * store, and "View in Browser →" navigation from a query result into the Data
 * Browser with the correct record pre-selected.
 *
 * Also validates the UUID search use case: searching for a member's ID string
 * surfaces all income sources that reference that member, which is the primary
 * diagnostic scenario this feature was built for.
 *
 * Data seeded:
 *   - Member "BQ Member" (added via Settings)
 *   - Income source "BQ Income" at $2,750 linked to BQ Member
 *
 * Tests are cumulative — each builds on state left by the previous.
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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function dismissWarning(): Promise<void> {
  const input = page.locator('[data-testid="bg-warning-confirm-input"]');
  const confirm = page.locator('[data-testid="bg-warning-confirm"]');
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.fill('break glass');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(confirm).not.toBeVisible();
}

async function openBreakGlass(): Promise<void> {
  await navigateTo(page, 'settings');
  await page.click('[data-testid="bg-open-btn"]');
  await dismissWarning();
  await expect(page.locator('.bg-page-title')).toBeVisible();
}

async function openQueryTab(): Promise<void> {
  await page.click('[data-testid="bg-tab-query"]');
  await expect(page.locator('[data-testid="bg-query-results"]')).toBeVisible();
}

async function runQuery(opts: { text?: string; amount?: string; tolerance?: string }): Promise<void> {
  if (opts.text !== undefined) await page.fill('[data-testid="bg-query-text-input"]', opts.text);
  if (opts.amount !== undefined) await page.fill('[data-testid="bg-query-amount-input"]', opts.amount);
  // Always reset tolerance to 0 unless explicitly provided so tests stay independent
  await page.fill('[data-testid="bg-query-amount-tolerance-input"]', opts.tolerance ?? '0');
  await page.click('[data-testid="bg-query-search-btn"]');
}

// ── Fixture: seed data ────────────────────────────────────────────────────────

test('fixture: add BQ Member via Settings', async () => {
  await navigateTo(page, 'settings');
  await page.click('[data-testid="settings-add-member-btn"]');
  await page.fill('[data-testid="settings-member-name-input"]', 'BQ Member');
  await page.click('[data-testid="settings-member-confirm"]');
  await expect(
    page.locator('[data-testid="settings-member-row"]').filter({ hasText: 'BQ Member' }),
  ).toBeVisible();
});

test('fixture: add BQ Income source at $2,750 linked to BQ Member', async () => {
  await navigateTo(page, 'income');
  await page.click('[data-testid="income-add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#sf-name', 'BQ Income');
  await page.fill('#sf-amount', '2750');
  await page.selectOption('#sf-member', { label: 'BQ Member' });
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(
    page.locator('[data-testid="income-source-row"]').filter({ hasText: 'BQ Income' }),
  ).toBeVisible();
});

// ── Query tab: presence and structure ────────────────────────────────────────

test('Query tab is visible alongside Data Browser and Orphan Scanner', async () => {
  await openBreakGlass();
  await expect(page.locator('[data-testid="bg-tab-browser"]')).toBeVisible();
  await expect(page.locator('[data-testid="bg-tab-scanner"]')).toBeVisible();
  await expect(page.locator('[data-testid="bg-tab-query"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bg-query-01-tabs.png' });
});

test('clicking Query tab makes it active and shows search form', async () => {
  await openQueryTab();
  await expect(page.locator('[data-testid="bg-tab-query"]')).toHaveClass(/bg-tab-btn--active/);
  await expect(page.locator('[data-testid="bg-tab-browser"]')).not.toHaveClass(/bg-tab-btn--active/);
  await expect(page.locator('[data-testid="bg-query-text-input"]')).toBeVisible();
  await expect(page.locator('[data-testid="bg-query-amount-input"]')).toBeVisible();
  await expect(page.locator('[data-testid="bg-query-amount-tolerance-input"]')).toBeVisible();
  await expect(page.locator('[data-testid="bg-query-search-btn"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bg-query-02-form.png' });
});

// ── Validation ────────────────────────────────────────────────────────────────

test('submitting with both inputs empty shows a validation message', async () => {
  await page.fill('[data-testid="bg-query-text-input"]', '');
  await page.fill('[data-testid="bg-query-amount-input"]', '');
  await page.click('[data-testid="bg-query-search-btn"]');
  await expect(page.locator('[data-testid="bg-query-status"]')).toContainText('at least one');
  // Results area should not change from the initial hint
  await expect(page.locator('[data-testid="bg-query-results"]')).toBeVisible();
});

// ── Text search ───────────────────────────────────────────────────────────────

test('text search "BQ Member" finds exactly the member record', async () => {
  await runQuery({ text: 'BQ Member', amount: '' });
  // Status should show 1 match in 1 store
  await expect(page.locator('[data-testid="bg-query-status"]')).toContainText('1 match', { timeout: 15_000 });
  await expect(page.locator('[data-testid="bg-query-status"]')).toContainText('1 store');
  // Result group for Members is present
  await expect(page.locator('.bg-scanner-group')).toBeVisible();
  await expect(page.locator('.bg-scanner-group-store').filter({ hasText: 'Members' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bg-query-03-text-member.png' });
});

test('result row shows matched field label', async () => {
  await expect(page.locator('.bg-query-match-fields').filter({ hasText: 'Name' })).toBeVisible();
});

test('text search "BQ" finds records in both Members and Income Sources', async () => {
  await runQuery({ text: 'BQ', amount: '' });
  await expect(page.locator('[data-testid="bg-query-status"]')).toContainText('match', { timeout: 15_000 });
  await expect(page.locator('[data-testid="bg-query-status"]')).toContainText('2 store');
  // Both store group headers should appear
  await expect(page.locator('.bg-scanner-group-store').filter({ hasText: 'Members' })).toBeVisible();
  await expect(page.locator('.bg-scanner-group-store').filter({ hasText: 'Income Sources' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bg-query-04-text-multi-store.png' });
});

test('BQ Income record appears in the Income Sources group', async () => {
  const incomeGroup = page.locator('.bg-scanner-group').filter({
    has: page.locator('.bg-scanner-group-store', { hasText: 'Income Sources' }),
  });
  await expect(incomeGroup.locator('.bg-issue-desc').filter({ hasText: 'BQ Income' })).toBeVisible();
});

// ── Amount search ─────────────────────────────────────────────────────────────

test('amount search $2750 finds BQ Income in Income Sources', async () => {
  await runQuery({ text: '', amount: '2750' });
  await expect(page.locator('[data-testid="bg-query-status"]')).toContainText('match', { timeout: 15_000 });
  await expect(page.locator('.bg-scanner-group-store').filter({ hasText: 'Income Sources' })).toBeVisible();
  const incomeGroup = page.locator('.bg-scanner-group').filter({
    has: page.locator('.bg-scanner-group-store', { hasText: 'Income Sources' }),
  });
  await expect(incomeGroup.locator('.bg-issue-desc').filter({ hasText: 'BQ Income' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bg-query-05-amount-search.png' });
});

test('amount result row shows the matched numeric field (Amount)', async () => {
  const incomeGroup = page.locator('.bg-scanner-group').filter({
    has: page.locator('.bg-scanner-group-store', { hasText: 'Income Sources' }),
  });
  await expect(incomeGroup.locator('.bg-query-match-fields').filter({ hasText: 'Amount' })).toBeVisible();
});

// ── No-match state ────────────────────────────────────────────────────────────

test('searching for a non-existent string shows the no-results state', async () => {
  await runQuery({ text: 'zzznomatch999', amount: '' });
  await expect(page.locator('[data-testid="bg-query-status"]')).toContainText('No results', { timeout: 15_000 });
  await expect(page.locator('.bg-scanner-clean')).toBeVisible();
  await expect(page.locator('.bg-scanner-clean')).toContainText('No matching records');
  await page.screenshot({ path: 'tests/screenshots/bg-query-06-no-results.png' });
});

test('searching for an amount that no record has also shows no-results state', async () => {
  await runQuery({ text: '', amount: '999999.99' });
  await expect(page.locator('[data-testid="bg-query-status"]')).toContainText('No results', { timeout: 15_000 });
  await expect(page.locator('.bg-scanner-clean')).toBeVisible();
});

// ── Tolerance / wiggle-room search ────────────────────────────────────────────

test('amount search ±$15 wiggle room finds BQ Income when searching $2740 (10 away)', async () => {
  // BQ Income is $2750. Searching $2740 with ±$15 tolerance means $2725–$2755 range,
  // so $2750 should match (|2750 - 2740| = 10 ≤ 15).
  await runQuery({ text: '', amount: '2740', tolerance: '15' });
  await expect(page.locator('[data-testid="bg-query-status"]')).toContainText('match', { timeout: 15_000 });
  await expect(page.locator('.bg-scanner-group-store').filter({ hasText: 'Income Sources' })).toBeVisible();
  const incomeGroup = page.locator('.bg-scanner-group').filter({
    has: page.locator('.bg-scanner-group-store', { hasText: 'Income Sources' }),
  });
  await expect(incomeGroup.locator('.bg-issue-desc').filter({ hasText: 'BQ Income' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bg-query-09-tolerance-match.png' });
});

test('tight tolerance ±$5 does not find BQ Income when searching $2740 (10 away)', async () => {
  // |2750 - 2740| = 10, which exceeds the ±$5 tolerance, so no match.
  await runQuery({ text: '', amount: '2740', tolerance: '5' });
  await expect(page.locator('[data-testid="bg-query-status"]')).toContainText('No results', { timeout: 15_000 });
  await expect(page.locator('.bg-scanner-clean')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bg-query-10-tolerance-no-match.png' });
});

// ── View in Browser navigation ────────────────────────────────────────────────

test('setup: run text search to get results before testing navigation', async () => {
  await runQuery({ text: 'BQ Income', amount: '' });
  await expect(page.locator('[data-testid="bg-query-status"]')).toContainText('match', { timeout: 15_000 });
  await expect(page.locator('.bg-scanner-group')).toBeVisible();
});

test('"View in Browser →" switches to Data Browser with the record open', async () => {
  await page.locator('.bg-issue-view-btn').first().click();
  // Data Browser tab should now be active
  await expect(page.locator('[data-testid="bg-tab-browser"]')).toHaveClass(/bg-tab-btn--active/);
  // Store should be income_sources
  await expect(page.locator('[data-testid="bg-store-select"]')).toHaveValue('income_sources');
  // Record detail should be open and show BQ Income
  await expect(page.locator('[data-testid="bg-edit-btn"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid="bg-detail"]')).toContainText('BQ Income');
  await page.screenshot({ path: 'tests/screenshots/bg-query-07-view-in-browser.png' });
});

// ── UUID search (primary diagnostic use case) ─────────────────────────────────

test('setup: capture BQ Member UUID from Data Browser', async () => {
  // We are already in the Data Browser. Switch to Members to get the member ID.
  await page.selectOption('[data-testid="bg-store-select"]', 'members');
  await expect(page.locator('[data-testid="bg-record-count"]')).not.toHaveText('');
  await page.locator('.bg-list-item').filter({ hasText: 'BQ Member' }).click();
  await expect(page.locator('[data-testid="bg-edit-btn"]')).toBeVisible();

  // Read the ID field value — will be used in the next test
  const idRow = page.locator('.bg-field-row').filter({
    has: page.locator('.bg-field-label', { hasText: /^ID$/ }),
  });
  const memberUuid = await idRow.locator('.bg-field-value').innerText();

  // Store it in page localStorage so the next test can read it (Playwright doesn't
  // share JS scope between test closures directly)
  await page.evaluate((uuid) => { sessionStorage.setItem('bq-member-uuid', uuid.trim()); }, memberUuid);
});

test('searching the member UUID finds the income source that references it', async () => {
  const memberUuid = await page.evaluate(() => sessionStorage.getItem('bq-member-uuid') ?? '');
  expect(memberUuid).toMatch(/^[0-9a-f-]{36}$/i);

  // Switch to Query tab and search by UUID
  await openQueryTab();
  await runQuery({ text: memberUuid, amount: '' });

  await expect(page.locator('[data-testid="bg-query-status"]')).toContainText('match', { timeout: 15_000 });

  // Income Sources should appear — it has memberId = that UUID
  await expect(page.locator('.bg-scanner-group-store').filter({ hasText: 'Income Sources' })).toBeVisible();
  const incomeGroup = page.locator('.bg-scanner-group').filter({
    has: page.locator('.bg-scanner-group-store', { hasText: 'Income Sources' }),
  });
  await expect(incomeGroup.locator('.bg-issue-desc').filter({ hasText: 'BQ Income' })).toBeVisible();

  // Members store should also appear (the member record itself has its own ID in the id field)
  await expect(page.locator('.bg-scanner-group-store').filter({ hasText: 'Members' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bg-query-08-uuid-search.png' });
});
