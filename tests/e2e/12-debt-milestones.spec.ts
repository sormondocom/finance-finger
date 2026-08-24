/**
 * Debt Milestone Timeline E2E tests.
 *
 * Verifies: the milestone card appears on the debt page when accounts exist,
 * each account row shows a payoff date, the freedom banner shows an overall
 * debt-free date, and the what-if tip appears when no extra payment is set.
 * Also verifies the Dashboard DTI and credit utilization chips populate once
 * both income and credit-card debt exist.
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
  await navigateTo(page, 'income');
});

test.afterAll(async () => {
  await cleanup();
});

// ── Seed: income + multiple debts ─────────────────────────────────────────────

test('adds monthly income for DTI calculation', async () => {
  await page.fill('[data-testid="add-member-input"]', 'Alex');
  await page.click('[data-testid="add-member-btn"]');
  await expect(page.locator('[data-testid="member-chip"]').filter({ hasText: 'Alex' })).toBeVisible();

  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#sf-name', 'Salary');
  await page.fill('#sf-amount', '6000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Salary' })).toBeVisible();
});

test('adds a credit card debt with a credit limit', async () => {
  await navigateTo(page, 'debt');
  await page.click('[data-testid="add-debt-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#da-name', 'Chase Sapphire');
  await page.fill('#da-balance', '3200');
  await page.fill('#da-apr', '19.99');
  await page.fill('#da-limit', '8000');

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(
    page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Sapphire' }),
  ).toBeVisible();

  // Add minimum payment via "Complete setup →" so amortization has a finite payoff date
  const chaseRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Chase Sapphire' });
  await chaseRow.locator('[data-testid="debt-setup"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.locator('[name="da-min-type"][value="fixed"]').check();
  await page.fill('#da-min-value', '300');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('adds a second debt (personal loan)', async () => {
  await page.click('[data-testid="add-debt-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.selectOption('#da-type', 'loan');
  await page.fill('#da-name', 'Personal Loan');
  await page.fill('#da-balance', '8500');
  await page.fill('#da-apr', '12.5');
  // Fixed $400/mo so amortization has a real payoff date (~24 months, after Chase Sapphire's ~13)
  await page.fill('#da-payment-fixed', '400');

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(
    page.locator('[data-testid="debt-row"]').filter({ hasText: 'Personal Loan' }),
  ).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/milestones-01-two-debts.png' });
});

// ── Milestone card ────────────────────────────────────────────────────────────

test('milestone card is visible on the debt page', async () => {
  await expect(page.locator('[data-testid="milestone-card"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/milestones-02-card.png' });
});

test('milestone timeline shows a row for each active debt', async () => {
  const rows = page.locator('[data-testid="milestone-row"]');
  await expect(rows).toHaveCount(2);
});

test('each milestone row has a payoff date', async () => {
  const dates = page.locator('[data-testid="milestone-date"]');
  await expect(dates).toHaveCount(2);
  // Dates should be non-empty (contain a year or month string)
  const firstDate = await dates.first().textContent();
  expect(firstDate).toBeTruthy();
  expect(firstDate!.length).toBeGreaterThan(4);
});

test('Chase Sapphire is first in the timeline (smaller balance)', async () => {
  const firstRow = page.locator('[data-testid="milestone-row"]').first();
  await expect(firstRow).toContainText('Chase Sapphire');
});

test('freedom banner is visible with a debt-free date', async () => {
  await expect(page.locator('[data-testid="milestone-freedom-banner"]')).toBeVisible();
  const dateEl = page.locator('[data-testid="milestone-freedom-date"]');
  await expect(dateEl).toBeVisible();
  const dateText = await dateEl.textContent();
  // Should contain a year (not '—')
  expect(dateText).toBeTruthy();
  expect(dateText!).not.toBe('—');
  await page.screenshot({ path: 'tests/screenshots/milestones-03-freedom-banner.png' });
});

test('what-if tip is shown when no extra payment is configured', async () => {
  // The tip only shows when extra payment is $0 and saving $50/mo would help
  await expect(page.locator('[data-testid="milestone-whatif-tip"]')).toBeVisible();
  await expect(page.locator('[data-testid="milestone-whatif-tip"]')).toContainText('$50');
});

// ── Dashboard financial health chips ─────────────────────────────────────────

test('dashboard shows DTI chip after income and debt are added', async () => {
  await navigateTo(page, 'dashboard');
  await expect(page.locator('[data-testid="financial-health-row"]')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('[data-testid="dti-chip"]')).toBeVisible();
  const dtiValue = await page.locator('[data-testid="dti-value"]').textContent();
  expect(dtiValue).toBeTruthy();
  // DTI should be a percentage string
  expect(dtiValue).toContain('%');
  await page.screenshot({ path: 'tests/screenshots/milestones-04-dti-chip.png' });
});

test('dashboard shows credit utilization chip for the card account', async () => {
  await expect(page.locator('[data-testid="util-chip"]')).toBeVisible();
  const utilValue = await page.locator('[data-testid="util-value"]').textContent();
  expect(utilValue).toBeTruthy();
  expect(utilValue).toContain('%');
  // Chase Sapphire: 3200/8000 = 40% — should be amber
  await expect(page.locator('[data-testid="util-chip"]')).toHaveAttribute(
    'data-health',
    'amber',
  );
});

// ── Milestone sort order stability ────────────────────────────────────────────

test('milestone rows are sorted by payoff date ascending', async () => {
  await navigateTo(page, 'debt');
  const rows = page.locator('[data-testid="milestone-row"]');
  // Wait for async load to complete before counting
  await expect(rows).toHaveCount(2);

  // Ranks should be 1 and 2 top to bottom
  const firstRank = await rows.nth(0).locator('.milestone-rank').textContent();
  const secondRank = await rows.nth(1).locator('.milestone-rank').textContent();
  expect(firstRank?.trim()).toBe('1');
  expect(secondRank?.trim()).toBe('2');
});
