/**
 * Calendar Memos (sticky notes) E2E tests.
 *
 * Covers: adding a memo to a day, paging through multiple memos on the same
 * day, deleting a memo, and verifying the sticky-note widget updates correctly.
 * Month navigation is also checked to ensure memos load per-month.
 *
 * Strategy:
 *   - Day 15 of the current month is used throughout (always a valid day).
 *   - The memo `+` button is hidden at opacity:0 until the cell is hovered;
 *     we hover the cell first, then click the button.
 *   - Tests are cumulative: each one leaves state the next builds on.
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

const MEMO_DAY = 15;

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

/** Returns the calendar cell for the given day number. */
function dayCell(day: number) {
  return page.locator(`[data-testid="calendar-cell"][data-day="${day}"]`);
}

/** Hover the cell to reveal the empty memo button, then click it. */
async function openMemoModalForDay(day: number): Promise<void> {
  const cell = dayCell(day);
  await cell.hover();
  await cell.locator('[data-testid="cal-memo-btn"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
}

// ── Navigate to Calendar ──────────────────────────────────────────────────────

test('calendar page loads with the grid', async () => {
  await navigateTo(page, 'calendar');
  await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/memo-01-calendar-loaded.png' });
});

test('day 15 cell is present', async () => {
  await expect(dayCell(MEMO_DAY)).toBeVisible();
});

// ── Add first memo ────────────────────────────────────────────────────────────

test('hovering a day cell reveals the memo + button', async () => {
  const cell = dayCell(MEMO_DAY);
  const memoBtn = cell.locator('[data-testid="cal-memo-btn"]');
  // Before hover the button is opacity:0 (not "visible" in Playwright terms)
  await cell.hover();
  // After hover it should be revealed
  await expect(memoBtn).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/memo-02-btn-revealed.png' });
});

test('clicking the + button opens the memo modal', async () => {
  await openMemoModalForDay(MEMO_DAY);
  // No existing notes — pager is hidden, add section is visible
  await expect(page.locator('[data-testid="cal-memo-note-card"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="cal-memo-textarea"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/memo-03-modal-empty.png' });
});

test('typing a note and clicking Add Note saves it', async () => {
  await page.fill('[data-testid="cal-memo-textarea"]', 'Paid the electric bill today!');
  await page.click('[data-testid="cal-memo-add-btn"]');
  // Pager now visible with Note 1 of 1
  await expect(page.locator('[data-testid="cal-memo-pager-label"]')).toContainText('Note 1 of 1');
  await expect(page.locator('[data-testid="cal-memo-note-text"]')).toContainText('Paid the electric bill today!');
  // Textarea cleared for next entry
  await expect(page.locator('[data-testid="cal-memo-textarea"]')).toHaveValue('');
  await page.screenshot({ path: 'tests/screenshots/memo-04-first-note-added.png' });
});

test('closing the modal shows the pencil icon on day 15', async () => {
  await page.locator('[data-testid="modal-close"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  // Button should now show the pencil (not the + empty state)
  const memoBtn = dayCell(MEMO_DAY).locator('[data-testid="cal-memo-btn"]');
  await expect(memoBtn).not.toHaveClass(/cal-memo-btn--empty/);
  await expect(memoBtn).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/memo-05-pencil-shown.png' });
});

// ── Add second memo ───────────────────────────────────────────────────────────

test('clicking the pencil opens the viewer showing Note 1 of 1', async () => {
  await dayCell(MEMO_DAY).locator('[data-testid="cal-memo-btn"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('[data-testid="cal-memo-pager-label"]')).toContainText('Note 1 of 1');
  await page.screenshot({ path: 'tests/screenshots/memo-06-reopen-viewer.png' });
});

test('adding a second note updates the pager to Note 2 of 2', async () => {
  await page.fill('[data-testid="cal-memo-textarea"]', 'Car oil change — 3,000 miles from now');
  await page.click('[data-testid="cal-memo-add-btn"]');
  await expect(page.locator('[data-testid="cal-memo-pager-label"]')).toContainText('Note 2 of 2');
  await expect(page.locator('[data-testid="cal-memo-note-text"]')).toContainText('Car oil change');
  await page.screenshot({ path: 'tests/screenshots/memo-07-second-note.png' });
});

test('prev button navigates to Note 1 of 2', async () => {
  await page.click('[data-testid="cal-memo-prev"]');
  await expect(page.locator('[data-testid="cal-memo-pager-label"]')).toContainText('Note 1 of 2');
  await expect(page.locator('[data-testid="cal-memo-note-text"]')).toContainText('Paid the electric bill today!');
  await page.screenshot({ path: 'tests/screenshots/memo-08-paging-prev.png' });
});

test('next button navigates back to Note 2 of 2', async () => {
  await page.click('[data-testid="cal-memo-next"]');
  await expect(page.locator('[data-testid="cal-memo-pager-label"]')).toContainText('Note 2 of 2');
});

test('prev button is disabled at note 1 and next is disabled at note 2', async () => {
  // Currently on note 2 of 2 — next should be disabled
  await expect(page.locator('[data-testid="cal-memo-next"]')).toBeDisabled();
  // Navigate to note 1 — prev should be disabled
  await page.click('[data-testid="cal-memo-prev"]');
  await expect(page.locator('[data-testid="cal-memo-prev"]')).toBeDisabled();
  await page.screenshot({ path: 'tests/screenshots/memo-09-nav-disabled.png' });
});

// ── Stacked widget appearance ─────────────────────────────────────────────────

test('closing modal shows stacked sticky note widget with data-stacked="2"', async () => {
  await page.locator('[data-testid="modal-close"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  const memoBtn = dayCell(MEMO_DAY).locator('[data-testid="cal-memo-btn"]');
  await expect(memoBtn).toHaveAttribute('data-stacked', '2');
  await page.screenshot({ path: 'tests/screenshots/memo-10-stacked-widget.png' });
});

// ── Delete a memo ─────────────────────────────────────────────────────────────

test('deleting the current note reduces the count', async () => {
  // Reopen — will show note 1 of 2
  await dayCell(MEMO_DAY).locator('[data-testid="cal-memo-btn"]').click();
  await expect(page.locator('[data-testid="cal-memo-pager-label"]')).toContainText('Note 1 of 2');
  await page.click('[data-testid="cal-memo-delete-btn"]');
  // Now shows Note 1 of 1 with the remaining note
  await expect(page.locator('[data-testid="cal-memo-pager-label"]')).toContainText('Note 1 of 1');
  await expect(page.locator('[data-testid="cal-memo-note-text"]')).toContainText('Car oil change');
  await page.screenshot({ path: 'tests/screenshots/memo-11-after-delete.png' });
});

test('deleting the last note hides the pager and resets to write state', async () => {
  await page.click('[data-testid="cal-memo-delete-btn"]');
  // Pager gone, textarea visible again
  await expect(page.locator('[data-testid="cal-memo-note-card"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="cal-memo-textarea"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/memo-12-last-deleted.png' });
});

test('closing modal after all notes deleted restores the + empty button', async () => {
  await page.locator('[data-testid="modal-close"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  const memoBtn = dayCell(MEMO_DAY).locator('[data-testid="cal-memo-btn"]');
  await expect(memoBtn).toHaveClass(/cal-memo-btn--empty/);
  await page.screenshot({ path: 'tests/screenshots/memo-13-restored-empty.png' });
});

// ── Month navigation ──────────────────────────────────────────────────────────

test('adding a memo then navigating to next month shows no memo widget on that day', async () => {
  // Add a memo back on day 15 of current month
  await openMemoModalForDay(MEMO_DAY);
  await page.fill('[data-testid="cal-memo-textarea"]', 'Current month note');
  await page.click('[data-testid="cal-memo-add-btn"]');
  await page.locator('[data-testid="modal-close"]').click();

  // Confirm sticky note widget visible
  const memoBtn = dayCell(MEMO_DAY).locator('[data-testid="cal-memo-btn"]');
  await expect(memoBtn).not.toHaveClass(/cal-memo-btn--empty/);

  // Go to next month
  await page.click('[data-testid="cal-next"]');
  await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible();

  // Day 15 in next month should have the empty memo button (no notes there)
  const nextMonthCell = dayCell(MEMO_DAY);
  if (await nextMonthCell.isVisible()) {
    await nextMonthCell.hover();
    const nextBtn = nextMonthCell.locator('[data-testid="cal-memo-btn"]');
    await expect(nextBtn).toHaveClass(/cal-memo-btn--empty/);
  }
  await page.screenshot({ path: 'tests/screenshots/memo-14-next-month-empty.png' });
});

test('navigating back to current month restores the memo widget', async () => {
  await page.click('[data-testid="cal-prev"]');
  await expect(page.locator('[data-testid="calendar-grid"]')).toBeVisible();
  const memoBtn = dayCell(MEMO_DAY).locator('[data-testid="cal-memo-btn"]');
  await expect(memoBtn).not.toHaveClass(/cal-memo-btn--empty/);
  await page.screenshot({ path: 'tests/screenshots/memo-15-back-to-current.png' });
});
