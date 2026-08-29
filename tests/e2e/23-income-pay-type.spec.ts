/**
 * Income: Pay type and semimonthly schedule E2E tests.
 *
 * Covers the salary/hourly pay type distinction and the structured
 * semimonthly payday schedule, both added in this session.
 *
 * Pay type — salary vs hourly
 *  1.  Pay type row is hidden when frequency is "once".
 *  2.  Pay type row appears for recurring frequencies.
 *  3.  Salary radio (default) → salary amount row visible; hourly row hidden.
 *  4.  Switching to Hourly → hourly row visible; salary row hidden.
 *  5.  Filling rate + hours shows a computed per-period preview.
 *  6.  Saving an hourly source stores rate/hours; list row shows "$X/hr · Yh/wk".
 *  7.  Editing an hourly source pre-fills the rate and hours fields.
 *
 * Semimonthly schedule
 *  8.  Selecting semimonthly frequency shows the payday schedule dropdown.
 *  9.  Payday reference date row is hidden for semimonthly (schedule replaces it).
 * 10.  Schedule dropdown offers "1st and 15th" and "15th and last day" options.
 * 11.  Salary semimonthly: unequal paychecks checkbox is visible.
 * 12.  Hourly semimonthly: unequal paychecks checkbox is hidden.
 * 13.  Checking "Paychecks are different amounts" reveals the 2nd paycheck field.
 * 14.  Saving salary semimonthly with unequal amounts shows both amounts in the row.
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

  // Add a household member so the income source form is available
  await page.fill('[data-testid="add-member-input"]', 'Robin');
  await page.click('[data-testid="add-member-btn"]');
  await expect(page.locator('[data-testid="member-chip"]').filter({ hasText: 'Robin' })).toBeVisible();
});

test.afterAll(async () => {
  await cleanup();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function openAddSourceForm() {
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#sf-name', 'Test Source');
}

async function closeModal() {
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
}

// ── Pay type: visibility rules ────────────────────────────────────────────────

test('pay type row is hidden when frequency is once', async () => {
  await openAddSourceForm();
  await page.selectOption('#sf-freq', 'once');
  await expect(page.locator('#sf-paytype-row')).not.toBeVisible();
  await closeModal();
  await page.screenshot({ path: 'tests/screenshots/income-paytype-01-hidden-once.png' });
});

test('pay type row is visible for monthly frequency', async () => {
  await openAddSourceForm();
  await page.selectOption('#sf-freq', 'monthly');
  await expect(page.locator('#sf-paytype-row')).toBeVisible();
  await closeModal();
});

test('salary radio (default) shows salary row and hides hourly row', async () => {
  await openAddSourceForm();
  await page.selectOption('#sf-freq', 'monthly');

  // Salary should be checked by default
  const salaryRadio = page.locator('input[name="sf-paytype"][value="salary"]');
  await expect(salaryRadio).toBeChecked();

  await expect(page.locator('#sf-salary-row')).toBeVisible();
  await expect(page.locator('#sf-hourly-row')).not.toBeVisible();
  await closeModal();
  await page.screenshot({ path: 'tests/screenshots/income-paytype-02-salary-default.png' });
});

test('switching to hourly hides salary row and shows hourly row', async () => {
  await openAddSourceForm();
  await page.selectOption('#sf-freq', 'monthly');
  await page.check('input[name="sf-paytype"][value="hourly"]');

  await expect(page.locator('#sf-hourly-row')).toBeVisible();
  await expect(page.locator('#sf-salary-row')).not.toBeVisible();
  await closeModal();
  await page.screenshot({ path: 'tests/screenshots/income-paytype-03-hourly-selected.png' });
});

// ── Pay type: hourly preview ──────────────────────────────────────────────────

test('filling rate and hours shows a computed per-period preview', async () => {
  await openAddSourceForm();
  await page.selectOption('#sf-freq', 'monthly');
  await page.check('input[name="sf-paytype"][value="hourly"]');

  // $20/hr × 40h/wk → monthly: (20 × 40 × 52 / 12) / 1 ≈ $3,466.67
  await page.fill('#sf-hourly-rate', '20');
  await page.fill('#sf-hours-week', '40');

  await expect(page.locator('#sf-hourly-preview')).toContainText('3,466.67');
  await expect(page.locator('#sf-hourly-preview')).toContainText('per pay period');
  await closeModal();
  await page.screenshot({ path: 'tests/screenshots/income-paytype-04-hourly-preview.png' });
});

// ── Pay type: saving and displaying an hourly source ─────────────────────────

test('saves an hourly source and list row shows rate · hours format', async () => {
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#sf-name', 'Hourly Gig');
  await page.selectOption('#sf-freq', 'monthly');
  await page.check('input[name="sf-paytype"][value="hourly"]');
  await page.fill('#sf-hourly-rate', '25');
  await page.fill('#sf-hours-week', '32');

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  const row = page.locator('[data-testid="source-row"]').filter({ hasText: 'Hourly Gig' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('$25.00/hr');
  await expect(row).toContainText('32h/wk');
  await page.screenshot({ path: 'tests/screenshots/income-paytype-05-hourly-saved.png' });
});

test('editing an hourly source pre-fills rate and hours fields', async () => {
  const row = page.locator('[data-testid="source-row"]').filter({ hasText: 'Hourly Gig' });
  await row.locator('[data-testid="source-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await expect(page.locator('#sf-hourly-rate')).toHaveValue('25');
  await expect(page.locator('#sf-hours-week')).toHaveValue('32');

  await closeModal();
  await page.screenshot({ path: 'tests/screenshots/income-paytype-06-hourly-edit-prefilled.png' });
});

// ── Semimonthly schedule ──────────────────────────────────────────────────────

test('semimonthly frequency shows the payday schedule dropdown', async () => {
  await openAddSourceForm();
  await page.selectOption('#sf-freq', 'semimonthly');
  await expect(page.locator('#sf-semi-schedule')).toBeVisible();
  await closeModal();
});

test('payday reference date row is hidden for semimonthly', async () => {
  await openAddSourceForm();
  await page.selectOption('#sf-freq', 'semimonthly');
  await expect(page.locator('#sf-payday-row')).not.toBeVisible();
  await closeModal();
});

test('schedule dropdown has both "1st and 15th" and "15th and last day" options', async () => {
  await openAddSourceForm();
  await page.selectOption('#sf-freq', 'semimonthly');

  const opts = await page.locator('#sf-semi-schedule option').allTextContents();
  expect(opts.some((o) => o.includes('1st and 15th'))).toBe(true);
  expect(opts.some((o) => o.includes('15th and last day'))).toBe(true);
  await closeModal();
  await page.screenshot({ path: 'tests/screenshots/income-paytype-07-semi-schedule.png' });
});

test('salary semimonthly shows the unequal paychecks checkbox', async () => {
  await openAddSourceForm();
  await page.selectOption('#sf-freq', 'semimonthly');
  // Salary is default
  await expect(page.locator('#sf-unequal')).toBeVisible();
  await closeModal();
});

test('hourly semimonthly hides the unequal paychecks checkbox', async () => {
  await openAddSourceForm();
  await page.selectOption('#sf-freq', 'semimonthly');
  await page.check('input[name="sf-paytype"][value="hourly"]');
  await expect(page.locator('#sf-unequal')).not.toBeVisible();
  await closeModal();
  await page.screenshot({ path: 'tests/screenshots/income-paytype-08-hourly-semi-no-unequal.png' });
});

test('checking "Paychecks are different amounts" reveals the 2nd paycheck field', async () => {
  await openAddSourceForm();
  await page.selectOption('#sf-freq', 'semimonthly');
  // Salary is default; unequal row visible
  await expect(page.locator('#sf-amount2')).not.toBeVisible();
  await page.check('#sf-unequal');
  await expect(page.locator('#sf-amount2')).toBeVisible();
  await closeModal();
  await page.screenshot({ path: 'tests/screenshots/income-paytype-09-amount2-revealed.png' });
});

test('saves semimonthly with unequal paychecks; row shows both amounts', async () => {
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#sf-name', 'Biweekly Pay');
  await page.selectOption('#sf-freq', 'semimonthly');
  // Default schedule is "1st and 15th"
  await page.fill('#sf-amount', '1500');
  await page.check('#sf-unequal');
  await page.fill('#sf-amount2', '1200');

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  const row = page.locator('[data-testid="source-row"]').filter({ hasText: 'Biweekly Pay' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('1,500');
  await expect(row).toContainText('1,200');
  await page.screenshot({ path: 'tests/screenshots/income-paytype-10-unequal-saved.png' });
});
