/**
 * Calendar payday chip E2E tests.
 *
 * The income source form has an optional "Payday" date field (#sf-payday).
 * When a reference payday is saved, the calendar renders gold 💰 chips on
 * the days that income is expected for each month (computed from frequency
 * and the saved reference date).
 *
 * State built in this suite:
 *   1. Setup wizard → dashboard
 *   2. Add member + biweekly income source with payday on the 2nd of current month
 *   3. Navigate to Calendar and verify payday chips appear
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

const now   = new Date();
const YEAR  = now.getFullYear();
const MONTH = String(now.getMonth() + 1).padStart(2, '0');
// Use the 7th as the payday reference — safe for all months and easily verifiable
const PAYDAY_REF = `${YEAR}-${MONTH}-07`;

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

// ── Setup ─────────────────────────────────────────────────────────────────────

test('set up: add a member and a monthly income source with payday on the 7th', async () => {
  await navigateTo(page, 'income');

  await page.fill('[data-testid="add-member-input"]', 'Morgan');
  await page.click('[data-testid="add-member-btn"]');
  await expect(page.locator('[data-testid="member-chip"]').filter({ hasText: 'Morgan' })).toBeVisible();

  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#sf-name', 'Monthly Pay');
  await page.fill('#sf-amount', '2000');
  // Frequency defaults to monthly — payday row should be visible
  await expect(page.locator('#sf-payday-row')).toBeVisible();
  await page.fill('#sf-payday', PAYDAY_REF);

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Monthly Pay' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/calendar-payday-01-income-added.png' });
});

// ── Income form: payday field behavior ────────────────────────────────────────

test('payday row is hidden when frequency is set to once', async () => {
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#sf-name', 'Bonus');
  await page.fill('#sf-amount', '500');
  await page.selectOption('#sf-freq', 'once');

  // Payday row should be hidden for one-time sources
  await expect(page.locator('#sf-payday-row')).not.toBeVisible();

  // Close without saving
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('payday row reappears when frequency switches back to monthly', async () => {
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#sf-name', 'Test');
  await page.fill('#sf-amount', '100');
  await page.selectOption('#sf-freq', 'once');
  await expect(page.locator('#sf-payday-row')).not.toBeVisible();

  await page.selectOption('#sf-freq', 'monthly');
  await expect(page.locator('#sf-payday-row')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

test('payday field is pre-filled when editing a source that has a payday', async () => {
  const row = page.locator('[data-testid="source-row"]').filter({ hasText: 'Monthly Pay' });
  await row.locator('[data-testid="source-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  const paydayVal = await page.locator('#sf-payday').inputValue();
  expect(paydayVal).toBe(PAYDAY_REF);

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Calendar: payday chips appear on the correct day ─────────────────────────

test('calendar page loads and shows the current month', async () => {
  await navigateTo(page, 'calendar');
  await expect(page.locator('.calendar-grid')).toBeVisible();
  const monthLabel = await page.locator('.calendar-month-label').innerText();
  const expected = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  expect(monthLabel).toContain(expected);
  await page.screenshot({ path: 'tests/screenshots/calendar-payday-02-calendar-loaded.png' });
});

test('a payday chip appears on day 7 of the current month', async () => {
  // Use the data-day attribute that CalendarPage sets on each day cell — avoids
  // substring ambiguity (hasText '7' would also match day 17 and 27).
  const dayCell = page.locator('.calendar-cell[data-day="7"]');
  await expect(dayCell).toBeVisible();

  const paydayChip = dayCell.locator('[data-testid="calendar-payday-chip"]');
  await expect(paydayChip).toBeVisible();
  await expect(paydayChip).toContainText('Monthly Pay');
  await page.screenshot({ path: 'tests/screenshots/calendar-payday-03-chip-visible.png' });
});

test('payday chip has the 💰 icon', async () => {
  const chip = page.locator('.calendar-cell[data-day="7"] [data-testid="calendar-payday-chip"]');
  await expect(chip).toContainText('💰');
});

test('payday legend entry is shown in the calendar header', async () => {
  // The legend is always rendered; its Payday entry is hardcoded in CalendarPage.paint()
  await expect(page.locator('.calendar-legend')).toBeVisible();
  await expect(page.locator('.calendar-legend')).toContainText('Payday');
});

test('non-payday cells do not show a payday chip', async () => {
  // Day 8 is not a payday for a monthly-on-the-7th source
  const count = await page.locator('.calendar-cell[data-day="8"] [data-testid="calendar-payday-chip"]').count();
  expect(count).toBe(0);
});

// ── Calendar: semimonthly source has two payday chips per month ───────────────

test('set up: add a semimonthly income source with payday reference', async () => {
  await navigateTo(page, 'income');

  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#sf-name', 'Freelance');
  await page.fill('#sf-amount', '1000');
  await page.selectOption('#sf-freq', 'semimonthly');
  await expect(page.locator('#sf-payday-row')).toBeVisible();
  // Reference on the 3rd → semimonthly gives chips on 3rd and 18th
  await page.fill('#sf-payday', `${YEAR}-${MONTH}-03`);

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Freelance' })).toBeVisible();
});

test('semimonthly source shows payday chips on both the 3rd and the 18th', async () => {
  await navigateTo(page, 'calendar');

  await expect(page.locator('.calendar-cell[data-day="3"] [data-testid="calendar-payday-chip"]').filter({ hasText: 'Freelance' })).toBeVisible();
  await expect(page.locator('.calendar-cell[data-day="18"] [data-testid="calendar-payday-chip"]').filter({ hasText: 'Freelance' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/calendar-payday-04-semimonthly.png' });
});
