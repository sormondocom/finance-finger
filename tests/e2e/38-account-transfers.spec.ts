/**
 * E2E tests for the Account Transfer feature.
 *
 * Verifies:
 *   - Transfer button appears when multiple accounts exist
 *   - Transfer modal opens with correct fields
 *   - Recording a transfer creates debit on source and credit on destination ledgers
 *   - Balance display reflects transfers in/out for the current month
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

test.describe.configure({ retries: 0 });

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;
let checkingId: string;
let cashId: string;

test.beforeAll(async () => {
  const ext = await launchExtensionContext();
  context = ext.context;
  cleanup = ext.cleanup;
  page = await context.newPage();
  await page.goto(ext.extUrl);
  await completeSetupWizard(page);

  // Add two bank accounts
  await navigateTo(page, 'accounts');
  await page.click('[data-testid="add-account-btn"]');
  await page.fill('#ba-name', 'Main Checking');
  await page.fill('#ba-balance', '2000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="account-row"]').filter({ hasText: 'Main Checking' })).toBeVisible({ timeout: 8_000 });

  await page.click('[data-testid="add-account-btn"]');
  await page.fill('#ba-name', 'Cash Fund');
  await page.fill('#ba-balance', '0');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="account-row"]').filter({ hasText: 'Cash Fund' })).toBeVisible({ timeout: 8_000 });

  // Capture account IDs for stable outer-panel locators
  checkingId = (await page.locator('[data-testid="account-row"]').filter({ hasText: 'Main Checking' }).getAttribute('data-account-id'))!;
  cashId = (await page.locator('[data-testid="account-row"]').filter({ hasText: 'Cash Fund' }).getAttribute('data-account-id'))!;
});

test.afterAll(async () => {
  await cleanup();
});

// ── Page state ────────────────────────────────────────────────────────────────

test('both accounts are visible', async () => {
  await expect(page.locator('[data-testid="account-row"]')).toHaveCount(2);
});

test('transfer button is visible on each account row (multiple accounts exist)', async () => {
  const rows = page.locator('[data-testid="account-row"]');
  await expect(rows.first().locator('[data-testid="account-transfer"]')).toBeVisible();
  await expect(rows.last().locator('[data-testid="account-transfer"]')).toBeVisible();
});

// ── Opening the modal ─────────────────────────────────────────────────────────

test('clicking transfer on Main Checking opens the Transfer Funds modal', async () => {
  const checkingRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Main Checking' });
  await checkingRow.locator('[data-testid="account-transfer"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('[data-testid="modal-dialog"]')).toContainText('Transfer Funds');
});

test('modal shows source account name and required fields', async () => {
  const modal = page.locator('[data-testid="modal-dialog"]');
  await expect(modal).toContainText('Main Checking');
  await expect(modal.locator('#tr-to-account')).toBeVisible();
  await expect(modal.locator('#tr-amount')).toBeVisible();
  await expect(modal.locator('#tr-date')).toBeVisible();
  await expect(modal.locator('#tr-note')).toBeVisible();
});

test('destination select contains Cash Fund', async () => {
  const toSel = page.locator('#tr-to-account');
  await expect(toSel).toContainText('Cash Fund');
});

// ── Recording a transfer ──────────────────────────────────────────────────────

test('filling and submitting the transfer records it', async () => {
  await page.fill('#tr-amount', '500');
  await page.fill('#tr-note', 'ATM withdrawal');
  // Date defaults to today — leave it as-is
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible({ timeout: 8_000 });
  // Page reloads — both accounts should still be visible
  await expect(page.locator('[data-testid="account-row"]')).toHaveCount(2, { timeout: 8_000 });
});

// ── Ledger: source account ────────────────────────────────────────────────────

test('Main Checking ledger shows the transfer as a debit', async () => {
  const checkingRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Main Checking' });
  const ledgerBtn = checkingRow.locator('[data-testid="account-ledger"]');
  await expect(ledgerBtn).toContainText('📋', { timeout: 6_000 });
  await ledgerBtn.click();

  // Use data-account-id on the outer to avoid matching transfers that reference the other account's name
  const panel = page.locator(`.account-item-outer[data-account-id="${checkingId}"] .account-ledger-panel`);
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Transfer to Cash Fund');
  await expect(panel).toContainText('ATM withdrawal');
  const amtEl = panel.locator('.account-ledger-amount--debit').filter({ hasText: '500' });
  await expect(amtEl).toBeVisible();
  await expect(amtEl).toContainText('−');
});

// ── Ledger: destination account ───────────────────────────────────────────────

test('Cash Fund ledger shows the transfer as a credit', async () => {
  const cashRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Cash Fund' });
  const ledgerBtn = cashRow.locator('[data-testid="account-ledger"]');
  await expect(ledgerBtn).toContainText('📋', { timeout: 6_000 });
  await ledgerBtn.click();

  const panel = page.locator(`.account-item-outer[data-account-id="${cashId}"] .account-ledger-panel`);
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Transfer from Main Checking');
  const amtEl = panel.locator('.account-ledger-amount--credit').filter({ hasText: '500' });
  await expect(amtEl).toBeVisible();
  await expect(amtEl).toContainText('+');
});

// ── Balance reflects transfers ─────────────────────────────────────────────────

test('Main Checking balance reflects the $500 transfer out', async () => {
  // Starting balance was $2,000; transferred $500 out → $1,500
  const checkingRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Main Checking' });
  await expect(checkingRow.locator('[data-testid="account-balance"]')).toContainText('1,500');
});

test('Cash Fund balance reflects the $500 transfer in', async () => {
  // Starting balance was $0; received $500 → $500
  const cashRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Cash Fund' });
  await expect(cashRow.locator('[data-testid="account-balance"]')).toContainText('500');
});

// ── Second transfer ───────────────────────────────────────────────────────────

test('a second transfer from Cash Fund back to Main Checking works', async () => {
  // Close ledger panels by navigating away and back
  await navigateTo(page, 'dashboard');
  await navigateTo(page, 'accounts');
  await expect(page.locator('[data-testid="account-row"]')).toHaveCount(2, { timeout: 8_000 });

  const cashRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Cash Fund' });
  await cashRow.locator('[data-testid="account-transfer"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('#tr-to-account')).toContainText('Main Checking');
  await page.fill('#tr-amount', '200');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible({ timeout: 8_000 });
  await expect(page.locator('[data-testid="account-row"]')).toHaveCount(2, { timeout: 8_000 });
});

test('after second transfer Cash Fund balance is $300', async () => {
  // $0 start + $500 in − $200 out = $300
  const cashRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Cash Fund' });
  await expect(cashRow.locator('[data-testid="account-balance"]')).toContainText('300');
});

test('after second transfer Main Checking balance is $1,700', async () => {
  // $2,000 start − $500 out + $200 in = $1,700
  const checkingRow = page.locator('[data-testid="account-row"]').filter({ hasText: 'Main Checking' });
  await expect(checkingRow.locator('[data-testid="account-balance"]')).toContainText('1,700');
});
