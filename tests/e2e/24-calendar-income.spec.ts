/**
 * Calendar: one-time income chips and semimonthly unequal paycheck amounts.
 *
 * Covers:
 *  1. One-time income sources (frequency === 'once') appear on the calendar as
 *     💵 chips on the day their date falls in the current month.
 *  2. Semimonthly sources using the "1st and 15th" structured schedule produce
 *     two chips per month — one on day 1 and one on day 15.
 *  3. When a semimonthly source has two different paycheck amounts (amount and
 *     amount2), the chip on the first payday shows amount and the chip on the
 *     second payday shows amount2 — not both showing the same value.
 *
 * State built in this suite (single fresh extension context):
 *   — Household member "Casey"
 *   — "Bonus Payout" one-time income on day 5 of the current month → $2,500
 *   — "Contract" semimonthly income, "1-15" schedule, unequal: $3,000 / $2,400
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

const now = new Date();
const YEAR = now.getFullYear();
const MONTH = String(now.getMonth() + 1).padStart(2, '0');

// Day 5 of the current month — safely in range for all months and easily
// distinguishable from payday-reference dates used in other calendar tests.
const ONE_TIME_DATE = `${YEAR}-${MONTH}-05`;

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

// ── Setup ─────────────────────────────────────────────────────────────────────

test('setup: add member Casey', async () => {
  await navigateTo(page, 'income');
  await page.fill('[data-testid="add-member-input"]', 'Casey');
  await page.click('[data-testid="add-member-btn"]');
  await expect(page.locator('[data-testid="member-chip"]').filter({ hasText: 'Casey' })).toBeVisible();
});

test('setup: add one-time income "Bonus Payout" of $2,500 on the 5th of this month', async () => {
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#sf-name', 'Bonus Payout');
  await page.fill('#sf-amount', '2500');
  await page.selectOption('#sf-freq', 'once');
  await page.fill('#sf-date', ONE_TIME_DATE);

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Bonus Payout' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/cal-income-01-one-time-added.png' });
});

// ── One-time income on the calendar ──────────────────────────────────────────

test('calendar shows a 💵 chip on day 5 for the one-time income', async () => {
  await navigateTo(page, 'calendar');
  await expect(page.locator('.calendar-grid')).toBeVisible();

  const dayCell = page.locator('.calendar-cell[data-day="5"]');
  await expect(dayCell).toBeVisible();

  const chip = dayCell.locator('[data-testid="calendar-one-time-income-chip"]');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('💵');
  await page.screenshot({ path: 'tests/screenshots/cal-income-02-one-time-chip.png' });
});

test('one-time chip contains the source name', async () => {
  const chip = page.locator('.calendar-cell[data-day="5"] [data-testid="calendar-one-time-income-chip"]');
  await expect(chip).toContainText('Bonus Payout');
});

test('one-time chip contains the income amount', async () => {
  const chip = page.locator('.calendar-cell[data-day="5"] [data-testid="calendar-one-time-income-chip"]');
  await expect(chip).toContainText('2,500');
});

test('day 5 does not have a regular payday chip for the one-time source', async () => {
  // One-time sources should use the 💵 chip, not the 💰 payday chip
  const paydayChip = page.locator(
    '.calendar-cell[data-day="5"] [data-testid="calendar-payday-chip"]',
  ).filter({ hasText: 'Bonus Payout' });
  await expect(paydayChip).not.toBeVisible();
});

// ── Semimonthly: unequal paychecks show correct amounts on each chip ──────────

test('setup: add semimonthly income with unequal paychecks ($3,000 / $2,400)', async () => {
  await navigateTo(page, 'income');

  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#sf-name', 'Contract');
  await page.selectOption('#sf-freq', 'semimonthly');
  await page.selectOption('#sf-semi-schedule', '1-15');

  // First paycheck amount
  await page.fill('#sf-amount', '3000');

  // Enable unequal paychecks and set the second amount
  await page.check('#sf-unequal');
  await expect(page.locator('#sf-amount2')).toBeVisible();
  await page.fill('#sf-amount2', '2400');

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Contract' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/cal-income-03-semi-unequal-added.png' });
});

test('calendar shows a payday chip on day 1 for the 1-15 semimonthly source', async () => {
  await navigateTo(page, 'calendar');
  await expect(page.locator('.calendar-grid')).toBeVisible();

  const chip = page.locator('.calendar-cell[data-day="1"] [data-testid="calendar-payday-chip"]')
    .filter({ hasText: 'Contract' });
  await expect(chip).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/cal-income-04-semi-chip-day1.png' });
});

test('day 1 chip (first payday) shows the first amount $3,000', async () => {
  const chip = page.locator('.calendar-cell[data-day="1"] [data-testid="calendar-payday-chip"]')
    .filter({ hasText: 'Contract' });
  await expect(chip).toContainText('3,000');
});

test('calendar shows a payday chip on day 15 for the 1-15 semimonthly source', async () => {
  const chip = page.locator('.calendar-cell[data-day="15"] [data-testid="calendar-payday-chip"]')
    .filter({ hasText: 'Contract' });
  await expect(chip).toBeVisible();
});

test('day 15 chip (second payday) shows amount2 $2,400, not the first amount', async () => {
  const chip = page.locator('.calendar-cell[data-day="15"] [data-testid="calendar-payday-chip"]')
    .filter({ hasText: 'Contract' });
  // Must contain amount2
  await expect(chip).toContainText('2,400');
  // Must NOT contain the first amount (3,000) — both chips would otherwise look identical
  await expect(chip).not.toContainText('3,000');
  await page.screenshot({ path: 'tests/screenshots/cal-income-05-semi-chip-day15-amount2.png' });
});
