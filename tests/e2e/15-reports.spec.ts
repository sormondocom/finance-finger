/**
 * Reports page + Leaky Bucket chart E2E tests.
 *
 * State is built cumulatively within the single browser session:
 *   1. Setup wizard → dashboard
 *   2. Income page: add member + $3,000/month salary with a payday on the 15th
 *   3. Expenses page: add a category and two one-time expenses in the current month
 *      — $200 on the 5th, $500 on the 15th
 *   4. Navigate to Reports and verify structure + Leaky Bucket behavior
 *
 * The Leaky Bucket renders:
 *   - SVG bucket that drains as expenses accumulate through the month
 *   - A scrubber (range input #lb-scrub) to seek to any day
 *   - Prev (#lb-prev-btn) / Next (#lb-next-btn) step buttons for day-by-day navigation
 *   - Per-day info: label (#lb-day-lbl), expense/payday chips (#lb-chips)
 *   - Stats: budget (#lbs-budget), spent (#lbs-spent), remaining (#lbs-rem), % (#lbs-pct)
 *   - Timeline bars (#lb-bars) — one per day of the month
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

// Current-month date helpers — keep tests runnable in any month
const now    = new Date();
const YEAR   = now.getFullYear();
const MONTH  = String(now.getMonth() + 1).padStart(2, '0');
const DAY5   = `${YEAR}-${MONTH}-05`;   // expense #1: $200
const DAY15  = `${YEAR}-${MONTH}-15`;   // expense #2 + payday: $500
const DAYS_IN_MONTH = new Date(YEAR, now.getMonth() + 1, 0).getDate();

/** Sets a range-input value and dispatches the 'input' event our listeners use. */
async function setScrubber(p: Page, day: number): Promise<void> {
  await p.locator('#lb-scrub').evaluate((el: HTMLInputElement, val: string) => {
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, String(day));
}

/**
 * Navigate to reports and wait for the leaky bucket scrubber to be ready.
 * Called at the start of each scrubber interaction test group to ensure a
 * stable, freshly rendered leaky bucket regardless of prior page state.
 */
async function freshReports(p: Page): Promise<void> {
  await p.click('[data-testid="nav-reports"]');
  await p.locator('#lb-scrub').waitFor({ state: 'attached', timeout: 30_000 });
}

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

// ── Data setup ────────────────────────────────────────────────────────────────

test('set up: add a household member and $3,000/month salary with payday on the 15th', async () => {
  await navigateTo(page, 'income');

  // Member
  await page.fill('[data-testid="add-member-input"]', 'Alex');
  await page.click('[data-testid="add-member-btn"]');
  await expect(page.locator('[data-testid="member-chip"]').filter({ hasText: 'Alex' })).toBeVisible();

  // Income source
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#sf-name', 'Salary');
  await page.fill('#sf-amount', '3000');
  // Frequency defaults to monthly → payday row is visible
  await expect(page.locator('#sf-payday-row')).toBeVisible();
  await page.fill('#sf-payday', DAY15);

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Salary' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/reports-01-income-added.png' });
});

test('set up: add a category and two one-time expenses in the current month', async () => {
  await navigateTo(page, 'expenses');

  // Category
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'General');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="category-pill"]').filter({ hasText: 'General' })).toBeVisible();

  // Expense 1 — $200 on the 5th
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#ef-desc', 'Grocery Run');
  await page.fill('#ef-amount', '200');
  await page.selectOption('#ef-cat', { label: 'General' });
  await page.fill('#ef-date', DAY5);
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Grocery Run' })).toBeVisible();

  // Expense 2 — $500 on the 15th
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#ef-desc', 'Car Repair');
  await page.fill('#ef-amount', '500');
  await page.selectOption('#ef-cat', { label: 'General' });
  await page.fill('#ef-date', DAY15);
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Car Repair' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/reports-02-expenses-added.png' });
});

// ── Reports page structure ────────────────────────────────────────────────────

test('reports page loads with range picker and KPI cards', async () => {
  await navigateTo(page, 'reports');
  await expect(page.locator('.reports-presets')).toBeVisible();
  await expect(page.locator('.reports-kpis')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/reports-03-page-loaded.png' });
});

test('KPI total spending reflects the two added expenses', async () => {
  // Both expenses are one-time for the current month, which is the default range
  const kpi = page.locator('.reports-kpi').filter({ hasText: 'Total Spending' });
  await expect(kpi).toBeVisible();
  // $200 + $500 = $700
  await expect(kpi).toContainText('$700');
});

test('KPI total income shows monthly salary', async () => {
  const kpi = page.locator('.reports-kpi').filter({ hasText: 'Total Income' });
  await expect(kpi).toBeVisible();
  await expect(kpi).toContainText('$3,000');
});

// ── Leaky Bucket: structure ───────────────────────────────────────────────────

test('leaky bucket card is visible with title', async () => {
  await expect(page.locator('.lb-card')).toBeVisible();
  await expect(page.locator('.lb-title')).toContainText('Leaky Bucket');
});

test('bucket SVG is rendered', async () => {
  await expect(page.locator('#lb-svg')).toBeVisible();
});

test('mascot is visible inside the scene', async () => {
  await expect(page.locator('#lb-mascot')).toBeVisible();
  // Mascot SVG is injected as innerHTML — it should contain an <svg> element
  const hasSvg = await page.locator('#lb-mascot svg').count();
  expect(hasSvg).toBeGreaterThan(0);
});

test('month selector is present and defaults to the current month', async () => {
  const sel = page.locator('#lb-month-sel');
  await expect(sel).toBeVisible();
  const selectedLabel = await sel.locator('option:checked').innerText();
  // Should mention the current month name (e.g. "August 2026")
  const currentMonthName = new Date(YEAR, now.getMonth(), 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  expect(selectedLabel).toContain(currentMonthName);
});

test('prev and next step buttons are present; prev is disabled at day 0', async () => {
  await expect(page.locator('#lb-prev-btn')).toBeVisible();
  await expect(page.locator('#lb-next-btn')).toBeVisible();
  await expect(page.locator('#lb-prev-btn')).toBeDisabled();
  await expect(page.locator('#lb-next-btn')).toBeEnabled();
});

test('scrubber starts at 0', async () => {
  const val = await page.locator('#lb-scrub').inputValue();
  expect(val).toBe('0');
});

test('scrubber max equals the number of days in the current month', async () => {
  const max = await page.locator('#lb-scrub').getAttribute('max');
  expect(Number(max)).toBe(DAYS_IN_MONTH);
});

test('timeline has one bar per day of the month', async () => {
  const bars = await page.locator('#lb-bars .lb-bar').count();
  expect(bars).toBe(DAYS_IN_MONTH);
});

// ── Leaky Bucket: initial state (day 0) ──────────────────────────────────────

test('day 0 label says "Start of month"', async () => {
  await expect(page.locator('#lb-day-lbl')).toContainText('Start of month');
});

test('budget stat shows $3,000 at day 0', async () => {
  await expect(page.locator('#lbs-budget')).toContainText('$3,000');
});

test('spent stat shows $0 at day 0', async () => {
  await expect(page.locator('#lbs-spent')).toContainText('$0');
});

test('balance value shows full budget at day 0', async () => {
  await expect(page.locator('#lb-balance-val')).toContainText('$3,000');
});

test('percentage stat shows 0% at day 0', async () => {
  await expect(page.locator('#lbs-pct')).toContainText('0%');
});

// ── Leaky Bucket: scrubber — day 1 (no spending) ────────────────────────────
// These three tests run on the page already loaded from the structure tests
// above and only check the initial day-1 state (no pour triggered).

test('seeking to day 1 updates the day label', async () => {
  await setScrubber(page, 1);
  await expect(page.locator('#lb-day-lbl')).toContainText('Day 1');
  await page.screenshot({ path: 'tests/screenshots/reports-04-day1.png' });
});

test('day 1 shows a quiet chip when there is no spending', async () => {
  await expect(page.locator('#lb-chips .lb-chip--quiet')).toBeVisible();
  await expect(page.locator('#lb-chips .lb-chip--quiet')).toContainText('No spending today');
});

test('day 1 stats show no spending and full balance', async () => {
  await expect(page.locator('#lbs-spent')).toContainText('$0');
  await expect(page.locator('#lb-balance-val')).toContainText('$3,000');
});

// ── Leaky Bucket: day 5 (fresh navigation for every pour-triggered seek) ─────
// Each group below starts with freshReports() to guard against any async
// re-render that may have been triggered by the day-1 seek above.

test('seeking to day 5 shows the Grocery Run chip, $200 spent, and $2,800 balance', async () => {
  await freshReports(page);
  await setScrubber(page, 5);

  await expect(page.locator('#lb-day-lbl')).toContainText('Day 5');

  const expenseChip = page.locator('#lb-chips .lb-chip--expense');
  await expect(expenseChip).toBeVisible();
  await expect(expenseChip).toContainText('Grocery Run');
  await expect(expenseChip).toContainText('$200');

  await expect(page.locator('#lbs-spent')).toContainText('$200');
  await expect(page.locator('#lb-balance-val')).toContainText('$2,800');

  // 200/3000 = 6.6% → displayed as 7%
  const pctText = await page.locator('#lbs-pct').innerText();
  const pct = parseInt(pctText, 10);
  expect(pct).toBeGreaterThanOrEqual(6);
  expect(pct).toBeLessThanOrEqual(8);

  await page.screenshot({ path: 'tests/screenshots/reports-05-day5-expense.png' });
});

// ── Leaky Bucket: day 15 ──────────────────────────────────────────────────────

test('seeking to day 15 shows Car Repair, payday chip, $700 cumulative, and $2,300 balance', async () => {
  await freshReports(page);
  await setScrubber(page, 15);

  await expect(page.locator('#lb-day-lbl')).toContainText('Day 15');

  const paydayChip = page.locator('#lb-chips .lb-chip--payday');
  await expect(paydayChip).toBeVisible();
  await expect(paydayChip).toContainText('Payday');

  const expenseChip = page.locator('#lb-chips .lb-chip--expense');
  await expect(expenseChip).toBeVisible();
  await expect(expenseChip).toContainText('Car Repair');
  await expect(expenseChip).toContainText('$500');

  // Cumulative: $200 (day 5) + $500 (day 15) = $700
  await expect(page.locator('#lbs-spent')).toContainText('$700');
  await expect(page.locator('#lb-balance-val')).toContainText('$2,300');

  // Day-15 bar (index 14) is active and has the payday marker
  const bar15 = page.locator('#lb-bars .lb-bar').nth(14);
  await expect(bar15).toHaveClass(/lb-bar--active/);
  await expect(bar15).toHaveClass(/lb-bar--payday/);

  // Day 15 ($500) bar taller than day 5 ($200) bar
  const day5Height  = await page.locator('#lb-bars .lb-bar').nth(4).evaluate(el => parseFloat((el as HTMLElement).style.height));
  const day15Height = await page.locator('#lb-bars .lb-bar').nth(14).evaluate(el => parseFloat((el as HTMLElement).style.height));
  expect(day15Height).toBeGreaterThan(day5Height);

  await page.screenshot({ path: 'tests/screenshots/reports-06-day15-payday.png' });
});

// ── Leaky Bucket: water level accuracy ───────────────────────────────────────
//
// The bucket interior is trapezoidal (top 120px wide, bottom 92px wide, 137px
// tall). Water translateY is computed so that water AREA is proportional to
// remaining balance, using the quadratic area formula:
//   h = 137·(−92 + √(8464 + 5938·ratio)) / 28
//   ty = 137 − h
//
// Expected ty values for our test scenario ($3,000 budget):
//   day  0: ratio = 1.000 → ty ≈  0.0 px  (full bucket)
//   day  5: ratio = 0.933 → ty ≈  8.2 px  ($200 of $3000 drained)
//   day 15: ratio = 0.767 → ty ≈ 28.9 px  ($700 of $3000 drained)

function waterTy(ratio: number): number {
  const h = 137 * (-92 + Math.sqrt(8464 + 5938 * ratio)) / 28;
  return 137 - Math.max(0, Math.min(137, h));
}

async function getWaterTy(p: Page): Promise<number> {
  const transform = await p.locator('#lb-water').evaluate(
    el => (el as HTMLElement).style.transform,
  );
  const match = transform.match(/translateY\(([0-9.-]+)px\)/);
  return match ? parseFloat(match[1]!) : NaN;
}

test('water level is at the top (ty ≈ 0) at day 0 — full budget', async () => {
  await freshReports(page);
  await setScrubber(page, 0);
  const ty = await getWaterTy(page);
  expect(ty).toBeCloseTo(waterTy(1), 0);
});

test('water drops by the correct area-proportional amount after the day-5 expense', async () => {
  // $200 spent of $3,000 → ratio = 2800/3000
  await freshReports(page);
  await setScrubber(page, 5);
  const ty = await getWaterTy(page);
  const expected = waterTy(2800 / 3000);
  expect(ty).toBeCloseTo(expected, 0);
});

test('water drops further after day-15 expenses and ty is monotonically larger', async () => {
  // $700 spent of $3,000 → ratio = 2300/3000
  await freshReports(page);
  const ty0 = await getWaterTy(page); // still at day 5 from previous test? use freshReports + day 0
  await setScrubber(page, 0);
  const tyFull = await getWaterTy(page);

  await setScrubber(page, 5);
  const ty5 = await getWaterTy(page);

  await setScrubber(page, 15);
  const ty15 = await getWaterTy(page);

  // Water drops monotonically as spending accumulates
  expect(tyFull).toBeLessThan(ty5);
  expect(ty5).toBeLessThan(ty15);

  // Day-15 ty matches the area-proportional formula
  expect(ty15).toBeCloseTo(waterTy(2300 / 3000), 0);

  // Suppress unused var warning from ty0
  void ty0;
});

// ── Leaky Bucket: next / prev step buttons ────────────────────────────────────

test('clicking next advances the scrubber by one day; clicking prev steps back', async () => {
  await freshReports(page);
  await setScrubber(page, 0);

  // Next → day 1
  await page.click('#lb-next-btn');
  expect(await page.locator('#lb-scrub').inputValue()).toBe('1');
  await expect(page.locator('#lb-prev-btn')).toBeEnabled();
  await expect(page.locator('#lb-day-lbl')).toContainText('Day 1');

  // Next → day 2
  await page.click('#lb-next-btn');
  expect(await page.locator('#lb-scrub').inputValue()).toBe('2');
  await expect(page.locator('#lb-day-lbl')).toContainText('Day 2');

  // Prev → back to day 1
  await page.click('#lb-prev-btn');
  expect(await page.locator('#lb-scrub').inputValue()).toBe('1');
  await expect(page.locator('#lb-day-lbl')).toContainText('Day 1');

  // Prev → back to day 0; prev button becomes disabled again
  await page.click('#lb-prev-btn');
  expect(await page.locator('#lb-scrub').inputValue()).toBe('0');
  await expect(page.locator('#lb-prev-btn')).toBeDisabled();
});

// ── Leaky Bucket: bar click seeks to that day ─────────────────────────────────

test('clicking a timeline bar seeks the scrubber to that day', async () => {
  await freshReports(page);
  await page.locator('#lb-bars .lb-bar').nth(9).click();
  const val = await page.locator('#lb-scrub').inputValue();
  expect(val).toBe('10');
  await expect(page.locator('#lb-day-lbl')).toContainText('Day 10');
});

// ── Leaky Bucket: month selector ─────────────────────────────────────────────

test('switching to the previous month re-renders the timeline', async () => {
  await freshReports(page);

  const prevYear  = now.getMonth() === 0 ? YEAR - 1 : YEAR;
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const prevDays  = new Date(prevYear, prevMonth + 1, 0).getDate();
  const selVal    = `${prevYear}-${prevMonth}`;

  await page.selectOption('#lb-month-sel', selVal);
  await expect(page.locator('#lb-scrub')).toHaveAttribute('max', String(prevDays));
  const bars = await page.locator('#lb-bars .lb-bar').count();
  expect(bars).toBe(prevDays);
  await page.screenshot({ path: 'tests/screenshots/reports-07-prev-month.png' });
});

test('switching back to the current month restores the correct bar count', async () => {
  const selVal = `${YEAR}-${now.getMonth()}`;
  await page.selectOption('#lb-month-sel', selVal);
  const bars = await page.locator('#lb-bars .lb-bar').count();
  expect(bars).toBe(DAYS_IN_MONTH);
});

// ── Leaky Bucket: end-of-month stat + balance color ──────────────────────────

test('remaining stat is non-negative at end of month; balance shows no warning at day 0', async () => {
  await freshReports(page);

  await setScrubber(page, DAYS_IN_MONTH);
  const remText = await page.locator('#lbs-rem').innerText();
  const remValue = parseFloat(remText.replace(/[^0-9.-]/g, ''));
  expect(remValue).toBeGreaterThanOrEqual(0);

  // Back to day 0 (full bucket) — no danger/warning class
  await setScrubber(page, 0);
  const classes = await page.locator('#lb-balance-val').getAttribute('class');
  expect(classes).not.toContain('lb-danger');
  expect(classes).not.toContain('lb-warning');
});
