/**
 * Break Glass tool E2E tests.
 *
 * Covers: warning overlay, data browser (view/edit/delete/store switching),
 * FK navigation links, and orphan scanner (clean pass + dangling FK detection).
 *
 * Data seeding strategy:
 *   - A household member "BG Member" is added via Settings before the first
 *     Break Glass test so the Members store is non-empty.
 *   - An income source "BG Salary" is added via the Income page so that a
 *     uuid-ref FK link (memberId → Members) exists in the detail view.
 *   - An orphan is created by editing the income source's memberId to a
 *     non-existent UUID via the Break Glass editor, then fixed at the end.
 *
 * Tests are cumulative — each test leaves state that the next one builds on.
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

const FAKE_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

let context: BrowserContext;
let page: Page;
let extUrl: string;
let cleanup: () => Promise<void>;

test.beforeAll(async () => {
  const ext = await launchExtensionContext();
  context = ext.context;
  extUrl = ext.extUrl;
  cleanup = ext.cleanup;
  page = await context.newPage();
  await page.goto(extUrl);
  await completeSetupWizard(page);
});

test.afterAll(async () => {
  await cleanup();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Dismiss the Break Glass warning overlay by clicking the confirm button. */
async function dismissWarning(): Promise<void> {
  const confirm = page.locator('[data-testid="bg-warning-confirm"]');
  await expect(confirm).toBeVisible({ timeout: 5_000 });
  await confirm.click();
  await expect(confirm).not.toBeVisible();
}

/** Navigate to the Break Glass page from Settings via the Open button. */
async function openBreakGlass(): Promise<void> {
  await navigateTo(page, 'settings');
  await page.click('[data-testid="bg-open-btn"]');
  await dismissWarning();
  await expect(page.locator('.bg-page-title')).toBeVisible();
}

/** Select a store and wait for the record list to update. */
async function selectStore(storeKey: string): Promise<void> {
  await page.selectOption('[data-testid="bg-store-select"]', storeKey);
  // Wait for the count label to appear (signals list has loaded)
  await expect(page.locator('[data-testid="bg-record-count"]')).not.toHaveText('');
}

/** Click a record in the list by its display name text. */
async function clickRecord(name: string): Promise<void> {
  await page.locator('.bg-list-item').filter({ hasText: name }).click();
  await expect(page.locator('[data-testid="bg-edit-btn"]')).toBeVisible();
}

// ── Fixture: seed data ────────────────────────────────────────────────────────

test('fixture: add BG Member via Settings', async () => {
  await navigateTo(page, 'settings');
  await page.click('[data-testid="settings-add-member-btn"]');
  await page.fill('[data-testid="settings-member-name-input"]', 'BG Member');
  await page.click('[data-testid="settings-member-confirm"]');
  await expect(
    page.locator('[data-testid="settings-member-row"]').filter({ hasText: 'BG Member' }),
  ).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bg-00-member-seeded.png' });
});

test('fixture: add BG Salary income source', async () => {
  await navigateTo(page, 'income');
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#sf-name', 'BG Salary');
  await page.fill('#sf-amount', '3500');
  await page.selectOption('#sf-member', { label: 'BG Member' });
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'BG Salary' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bg-01-income-seeded.png' });
});

// ── Warning overlay ───────────────────────────────────────────────────────────

test('Open Break Glass button is visible in Settings', async () => {
  await navigateTo(page, 'settings');
  await expect(page.locator('[data-testid="bg-open-btn"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bg-02-settings-entry.png' });
});

test('clicking Open Break Glass shows the warning overlay', async () => {
  await page.click('[data-testid="bg-open-btn"]');
  await expect(page.locator('.bg-warning-card')).toBeVisible();
  await expect(page.locator('.bg-warning-title')).toContainText('Hold on there');
  await page.screenshot({ path: 'tests/screenshots/bg-03-warning-overlay.png' });
});

test('clicking outside the warning card does not dismiss it', async () => {
  // Click the overlay backdrop (top-left corner, outside the card)
  await page.locator('.bg-overlay').click({ position: { x: 5, y: 5 }, force: true });
  await expect(page.locator('.bg-warning-card')).toBeVisible();
});

test('confirming the warning navigates to the Break Glass page', async () => {
  await dismissWarning();
  await expect(page.locator('.bg-page-title')).toContainText('Break Glass');
  await page.screenshot({ path: 'tests/screenshots/bg-04-page-loaded.png' });
});

// ── Page structure ────────────────────────────────────────────────────────────

test('Data Browser and Orphan Scanner tabs are both visible', async () => {
  await expect(page.locator('[data-testid="bg-tab-browser"]')).toBeVisible();
  await expect(page.locator('[data-testid="bg-tab-scanner"]')).toBeVisible();
});

test('Data Browser tab is active by default', async () => {
  await expect(page.locator('[data-testid="bg-tab-browser"]')).toHaveClass(/bg-tab-btn--active/);
  await expect(page.locator('[data-testid="bg-tab-scanner"]')).not.toHaveClass(/bg-tab-btn--active/);
});

test('store dropdown and record list are visible', async () => {
  await expect(page.locator('[data-testid="bg-store-select"]')).toBeVisible();
  await expect(page.locator('[data-testid="bg-record-list"]')).toBeVisible();
});

test('back button returns to Settings', async () => {
  await page.click('[data-testid="bg-back-btn"]');
  await expect(page.locator('h1')).toContainText('Settings');
});

// ── Data Browser: Members store ───────────────────────────────────────────────

test('Members store lists the seeded member', async () => {
  await openBreakGlass();
  // Members is the default store
  await expect(page.locator('[data-testid="bg-store-select"]')).toHaveValue('members');
  await expect(page.locator('[data-testid="bg-record-count"]')).toContainText('record');
  await expect(page.locator('.bg-list-item').filter({ hasText: 'BG Member' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bg-05-members-list.png' });
});

test('clicking BG Member opens the columnar detail view', async () => {
  await clickRecord('BG Member');
  await expect(page.locator('[data-testid="bg-detail"]')).toBeVisible();
  await expect(page.locator('[data-testid="bg-edit-btn"]')).toBeVisible();
  await expect(page.locator('[data-testid="bg-edit-raw-btn"]')).toBeVisible();
  await expect(page.locator('[data-testid="bg-delete-btn"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bg-06-member-detail.png' });
});

test('detail view shows field labels in human-readable form', async () => {
  const detail = page.locator('[data-testid="bg-detail"]');
  await expect(detail.locator('.bg-field-label').filter({ hasText: 'Name' })).toBeVisible();
  await expect(detail.locator('.bg-field-label').filter({ hasText: 'ID' })).toBeVisible();
  await expect(detail.locator('.bg-field-label').filter({ hasText: 'Created At' })).toBeVisible();
});

test('Created At field shows a formatted date, not a raw epoch number', async () => {
  // Find the Created At field value — it should contain a month name, not a 13-digit number
  const detail = page.locator('[data-testid="bg-detail"]');
  const createdRow = detail.locator('.bg-field-row').filter({ has: page.locator('.bg-field-label', { hasText: 'Created At' }) });
  const valueText = await createdRow.locator('.bg-field-value').innerText();
  // Should contain something like "Aug", "Jan", etc. — not a 13-digit timestamp
  expect(valueText).toMatch(/[A-Z][a-z]{2}/);
  expect(valueText).not.toMatch(/^\d{13}$/);
});

// ── Edit: field editor ────────────────────────────────────────────────────────

test('clicking Edit shows the field editor', async () => {
  await page.click('[data-testid="bg-edit-btn"]');
  await expect(page.locator('[data-testid="bg-save-btn"]')).toBeVisible();
  await expect(page.locator('[data-testid="bg-cancel-btn"]')).toBeVisible();
  await expect(page.locator('[data-testid="bg-mode-toggle"]')).toBeVisible();
  await expect(page.locator('.bg-field-table--edit')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bg-07-field-editor.png' });
});

test('name input in field editor is pre-filled with current value', async () => {
  const nameRow = page.locator('.bg-field-row').filter({
    has: page.locator('.bg-field-label', { hasText: 'Name' }),
  });
  const input = nameRow.locator('input[type="text"]');
  await expect(input).toHaveValue('BG Member');
});

test('can change the name and save', async () => {
  const nameRow = page.locator('.bg-field-row').filter({
    has: page.locator('.bg-field-label', { hasText: 'Name' }),
  });
  await nameRow.locator('input[type="text"]').fill('BG Member Updated');
  await page.click('[data-testid="bg-save-btn"]');
  // Returns to view mode
  await expect(page.locator('[data-testid="bg-edit-btn"]')).toBeVisible();
  // List and detail both reflect the new name
  await expect(page.locator('.bg-list-item').filter({ hasText: 'BG Member Updated' })).toBeVisible();
  await expect(page.locator('[data-testid="bg-detail"]')).toContainText('BG Member Updated');
  await page.screenshot({ path: 'tests/screenshots/bg-08-name-saved.png' });
});

test('Cancel discards changes and returns to view mode', async () => {
  await page.click('[data-testid="bg-edit-btn"]');
  const nameRow = page.locator('.bg-field-row').filter({
    has: page.locator('.bg-field-label', { hasText: 'Name' }),
  });
  await nameRow.locator('input[type="text"]').fill('Should Not Save');
  await page.click('[data-testid="bg-cancel-btn"]');
  await expect(page.locator('[data-testid="bg-edit-btn"]')).toBeVisible();
  await expect(page.locator('[data-testid="bg-detail"]')).toContainText('BG Member Updated');
  await expect(page.locator('[data-testid="bg-detail"]')).not.toContainText('Should Not Save');
});

// ── Edit: raw JSON mode ───────────────────────────────────────────────────────

test('Edit Raw JSON button shows a textarea with JSON content', async () => {
  await page.click('[data-testid="bg-edit-raw-btn"]');
  const textarea = page.locator('textarea.bg-edit-area');
  await expect(textarea).toBeVisible();
  const content = await textarea.inputValue();
  expect(() => JSON.parse(content)).not.toThrow();
  const parsed = JSON.parse(content) as { name?: string };
  expect(parsed.name).toBe('BG Member Updated');
  await page.screenshot({ path: 'tests/screenshots/bg-09-raw-json-editor.png' });
});

test('mode toggle switches from raw JSON back to field editor', async () => {
  await page.click('[data-testid="bg-mode-toggle"]');
  await expect(page.locator('.bg-field-table--edit')).toBeVisible();
  // Cancel to return to view mode
  await page.click('[data-testid="bg-cancel-btn"]');
  await expect(page.locator('[data-testid="bg-edit-btn"]')).toBeVisible();
});

// ── Store switching ───────────────────────────────────────────────────────────

test('switching store to Expenses shows empty list (no expenses seeded)', async () => {
  await selectStore('expenses');
  await expect(page.locator('[data-testid="bg-record-count"]')).toContainText('0 records');
  await expect(page.locator('.bg-list-empty')).toBeVisible();
});

test('switching back to Members shows the record again', async () => {
  await selectStore('members');
  await expect(page.locator('.bg-list-item').filter({ hasText: 'BG Member Updated' })).toBeVisible();
});

// ── FK navigation ─────────────────────────────────────────────────────────────

test('Income Sources store shows the seeded BG Salary record', async () => {
  await selectStore('income_sources');
  await expect(page.locator('.bg-list-item').filter({ hasText: 'BG Salary' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bg-10-income-list.png' });
});

test('BG Salary detail shows a clickable FK link for Member', async () => {
  await clickRecord('BG Salary');
  const memberRow = page.locator('.bg-field-row').filter({
    has: page.locator('.bg-field-label', { hasText: 'Member ID' }),
  });
  await expect(memberRow.locator('.bg-fk-link')).toBeVisible();
  await expect(memberRow.locator('.bg-fk-badge')).toContainText('Members');
  await page.screenshot({ path: 'tests/screenshots/bg-11-fk-link.png' });
});

test('clicking the Member FK link navigates to the referenced member record', async () => {
  const memberRow = page.locator('.bg-field-row').filter({
    has: page.locator('.bg-field-label', { hasText: 'Member ID' }),
  });
  await memberRow.locator('.bg-fk-link').click();
  // Store should switch to members and the member should be selected
  await expect(page.locator('[data-testid="bg-store-select"]')).toHaveValue('members');
  await expect(page.locator('[data-testid="bg-edit-btn"]')).toBeVisible();
  await expect(page.locator('[data-testid="bg-detail"]')).toContainText('BG Member Updated');
  await page.screenshot({ path: 'tests/screenshots/bg-12-fk-navigate.png' });
});

// ── Orphan Scanner: clean data ────────────────────────────────────────────────

test('Orphan Scanner tab switches view and shows Run Scan button', async () => {
  await page.click('[data-testid="bg-tab-scanner"]');
  await expect(page.locator('[data-testid="bg-tab-scanner"]')).toHaveClass(/bg-tab-btn--active/);
  await expect(page.locator('[data-testid="bg-scan-btn"]')).toBeVisible();
  await expect(page.locator('[data-testid="bg-scan-results"]')).toBeVisible();
});

test('Run Scan on clean data reports no orphans', async () => {
  await page.click('[data-testid="bg-scan-btn"]');
  await expect(page.locator('[data-testid="bg-scan-status"]')).toContainText('Clean', { timeout: 15_000 });
  await expect(page.locator('.bg-scanner-clean')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bg-13-scan-clean.png' });
});

// ── Orphan Scanner: inject a dangling FK and detect it ───────────────────────

test('fixture: corrupt BG Salary memberId to create a dangling FK', async () => {
  // Navigate to income sources in the data browser
  await page.click('[data-testid="bg-tab-browser"]');
  await selectStore('income_sources');
  await clickRecord('BG Salary');

  // Open the field editor and change memberId to a fake UUID
  await page.click('[data-testid="bg-edit-btn"]');
  const memberIdRow = page.locator('.bg-field-row').filter({
    has: page.locator('.bg-field-label', { hasText: 'Member ID' }),
  });
  await memberIdRow.locator('input[type="text"]').fill(FAKE_UUID);
  await page.click('[data-testid="bg-save-btn"]');
  await expect(page.locator('[data-testid="bg-edit-btn"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bg-14-orphan-created.png' });
});

test('Run Scan detects the dangling FK on BG Salary', async () => {
  await page.click('[data-testid="bg-tab-scanner"]');
  await page.click('[data-testid="bg-scan-btn"]');
  await expect(page.locator('[data-testid="bg-scan-status"]')).toContainText('issue', { timeout: 15_000 });
  await expect(page.locator('.bg-issue-badge--dangling')).toBeVisible();
  // The issue should name the Member relationship
  await expect(page.locator('.bg-issue-desc').filter({ hasText: 'Member' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/bg-15-orphan-detected.png' });
});

test('issue row shows the orphaned record name', async () => {
  await expect(page.locator('.bg-issue-record').filter({ hasText: 'BG Salary' })).toBeVisible();
});

test('View in Browser button jumps to the orphaned income source record', async () => {
  await page.locator('.bg-issue-view-btn').first().click();
  // Tab should switch to Data Browser
  await expect(page.locator('[data-testid="bg-tab-browser"]')).toHaveClass(/bg-tab-btn--active/);
  // Store should be income_sources
  await expect(page.locator('[data-testid="bg-store-select"]')).toHaveValue('income_sources');
  // The record detail should be open showing BG Salary
  await expect(page.locator('[data-testid="bg-detail"]')).toContainText('BG Salary');
  await page.screenshot({ path: 'tests/screenshots/bg-16-view-in-browser.png' });
});

// ── Cleanup: restore the dangling FK so data stays valid ─────────────────────

test('fixture: restore BG Salary memberId to a valid member', async () => {
  // The income source detail is already open from the previous test
  await page.click('[data-testid="bg-edit-btn"]');
  // Switch to raw JSON to set the memberId back to the real member's ID
  // We can find the member ID by navigating to Members and reading it
  // Easier: use Edit Raw JSON, grab the id from the Members store first
  await page.click('[data-testid="bg-cancel-btn"]');

  // Go to Members, grab the real member ID from the FK label in income_sources
  await selectStore('members');
  await clickRecord('BG Member Updated');
  const idRow = page.locator('.bg-field-row').filter({
    has: page.locator('.bg-field-label', { hasText: /^ID$/ }),
  });
  const realMemberId = await idRow.locator('.bg-field-value').innerText();

  // Go back to income_sources, edit memberId back
  await selectStore('income_sources');
  await clickRecord('BG Salary');
  await page.click('[data-testid="bg-edit-btn"]');
  const memberIdRow = page.locator('.bg-field-row').filter({
    has: page.locator('.bg-field-label', { hasText: 'Member ID' }),
  });
  await memberIdRow.locator('input[type="text"]').fill(realMemberId.trim());
  await page.click('[data-testid="bg-save-btn"]');
  await expect(page.locator('[data-testid="bg-edit-btn"]')).toBeVisible();

  // Re-run the scan — should be clean again
  await page.click('[data-testid="bg-tab-scanner"]');
  await page.click('[data-testid="bg-scan-btn"]');
  await expect(page.locator('[data-testid="bg-scan-status"]')).toContainText('Clean', { timeout: 15_000 });
  await page.screenshot({ path: 'tests/screenshots/bg-17-scan-clean-again.png' });
});

// ── Delete a record ───────────────────────────────────────────────────────────

test('fixture: add a throwaway member to test deletion', async () => {
  await page.click('[data-testid="bg-tab-browser"]');
  // Add via Settings so we have a clean record with no FK relationships
  await navigateTo(page, 'settings');
  await page.click('[data-testid="settings-add-member-btn"]');
  await page.fill('[data-testid="settings-member-name-input"]', 'Delete Me');
  await page.click('[data-testid="settings-member-confirm"]');
  await expect(
    page.locator('[data-testid="settings-member-row"]').filter({ hasText: 'Delete Me' }),
  ).toBeVisible();
});

test('Delete button with confirmation removes the record from the list', async () => {
  await openBreakGlass();
  await selectStore('members');
  await clickRecord('Delete Me');

  page.once('dialog', (d) => d.accept());
  await page.click('[data-testid="bg-delete-btn"]');

  // Record gone from list
  await expect(page.locator('.bg-list-item').filter({ hasText: 'Delete Me' })).not.toBeVisible();
  // Detail pane shows the "select a record" hint again
  await expect(page.locator('[data-testid="bg-detail"]')).toContainText('Select a record');
  await page.screenshot({ path: 'tests/screenshots/bg-18-record-deleted.png' });
});

// ── Refresh button ────────────────────────────────────────────────────────────

test('refresh button reloads the current store records', async () => {
  const countBefore = await page.locator('[data-testid="bg-record-count"]').innerText();
  await page.click('[data-testid="bg-refresh-btn"]');
  // Count should reload and still show (same value since we haven't changed anything)
  await expect(page.locator('[data-testid="bg-record-count"]')).toContainText('record');
  const countAfter = await page.locator('[data-testid="bg-record-count"]').innerText();
  expect(countAfter).toBe(countBefore);
});
