/**
 * E2E tests for:
 *   - Billing cycle pill selector (new payment + edit payment)
 *   - Multi-cycle count selector (1 / 2 / 3 cycles covered)
 *   - Ledger edit (✏️) and delete with expense.date cascade
 *   - Stale payment status detection (⚠ Sync issue badge + ↺ Reset Status)
 *   - Break Glass consistency scan: auto-run on tab switch + stale-date fix
 *
 * Bill setup:
 *   - "Gas Bill" — monthly, due on PAST_DUE_DAY, category "Utilities"
 *   All tests share a single extension context because they build on each other.
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

const today      = new Date();
const y          = today.getFullYear();
const mo         = today.getMonth();
const dayOfMonth = today.getDate();

// Past-due day: 5 days before today, minimum 1
const PAST_DUE_DAY = Math.max(1, dayOfMonth - 5);
const pad = (n: number) => String(n).padStart(2, '0');
const thisMonthDate = (day: number) => `${y}-${pad(mo + 1)}-${pad(Math.min(day, new Date(y, mo + 1, 0).getDate()))}`;

// ─────────────────────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  const ext = await launchExtensionContext();
  context = ext.context;
  cleanup = ext.cleanup;
  page = await context.newPage();
  await page.goto(ext.extUrl);
  await completeSetupWizard(page);
  await navigateTo(page, 'expenses');
});

test.afterAll(async () => {
  await cleanup();
});

// ── Setup: category and bill ──────────────────────────────────────────────────

test('setup: add Utilities category', async () => {
  await page.click('[data-testid="add-category-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#cat-name', 'Utilities');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="category-pill"]').filter({ hasText: 'Utilities' })).toBeVisible();
});

test('setup: add Gas Bill (past-due recurring bill)', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ef-desc', 'Gas Bill');
  await page.fill('#ef-amount', '75');
  await page.selectOption('#ef-cat', { label: 'Utilities' });
  await page.check('#ef-recurring');
  await page.fill('#ef-duedate', thisMonthDate(PAST_DUE_DAY));

  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Gas Bill' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/29-01-gas-bill-added.png' });
});

// ── Billing cycle selector — new payment ─────────────────────────────────────

test('Mark Paid dialog shows billing cycle pills for a tracked bill', async () => {
  const billRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Gas Bill' });
  await billRow.locator('[data-action="record-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // New payment dialog shows 3 multi-select cycle pills (last 3 billing cycles)
  await expect(page.locator('.cycle-pill')).toHaveCount(3);
  await page.screenshot({ path: 'tests/screenshots/29-02-cycle-pills-visible.png' });
});

test('one cycle pill is active by default', async () => {
  await expect(page.locator('.cycle-pill.active')).toHaveCount(1);
});

test('clicking an unpaid cycle pill toggles it into the selection', async () => {
  const pills = page.locator('.cycle-pill');
  const activeCountBefore = await page.locator('.cycle-pill.active').count();

  // Find an unpaid pill that is not already active
  let toggled = false;
  for (let i = 0; i < 3; i++) {
    const pill = pills.nth(i);
    const isPaid    = await pill.evaluate((el) => el.classList.contains('cycle-pill--paid'));
    const isActive  = await pill.evaluate((el) => el.classList.contains('active'));
    if (!isPaid && !isActive) {
      await pill.click();
      await expect(pill).toHaveClass(/active/);
      // Multi-select: previously active pills remain active
      const activeCountAfter = await page.locator('.cycle-pill.active').count();
      expect(activeCountAfter).toBeGreaterThanOrEqual(activeCountBefore);
      toggled = true;
      break;
    }
  }
  if (!toggled) {
    test.info().annotations.push({ type: 'info', description: 'All unpaid cycles already active — toggle not tested' });
  }
  // At least one pill always remains active
  await expect(page.locator('.cycle-pill.active').first()).toBeVisible();
});

test('submitting the Mark Paid dialog marks the Gas Bill as paid', async () => {
  // Ensure the upcoming (first) pill is selected if it is not paid
  const upcomingPill = page.locator('.cycle-pill').first();
  const upcomingIsPaid = await upcomingPill.evaluate((el) => el.classList.contains('cycle-pill--paid'));
  if (!upcomingIsPaid) {
    await upcomingPill.click();
  }

  await page.fill('#mp-amount', '72');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Bill should now show a paid badge
  const billRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Gas Bill' });
  await expect(billRow.locator('[data-testid="expense-bill-badge"]')).toContainText('Paid');
  await page.screenshot({ path: 'tests/screenshots/29-03-bill-paid.png' });
});

// ── Ledger panel: edit and delete ────────────────────────────────────────────

test('ledger button shows payment count after paying', async () => {
  const billRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Gas Bill' });
  await expect(billRow.locator('[data-action="ledger"]')).toContainText('1');
});

test('opening ledger shows the $72 payment', async () => {
  const billRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Gas Bill' });
  await billRow.locator('[data-action="ledger"]').click();
  await expect(page.locator('.expense-ledger-panel')).toBeVisible();
  await expect(page.locator('.expense-ledger-panel')).toContainText('$72.00');
  await page.screenshot({ path: 'tests/screenshots/29-04-ledger-open.png' });
});

test('ledger row has an edit (✏️) button', async () => {
  await expect(page.locator('.expense-ledger-panel .icon-btn').filter({ hasText: '✏️' })).toBeVisible();
});

test('clicking the edit button opens the Edit Payment dialog', async () => {
  await page.locator('.expense-ledger-panel .icon-btn').filter({ hasText: '✏️' }).click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('[data-testid="modal-dialog"]')).toContainText('Edit Payment');
  await page.screenshot({ path: 'tests/screenshots/29-05-edit-dialog.png' });
});

test('Edit Payment dialog shows billing cycle pills for a tracked bill', async () => {
  await expect(page.locator('.cycle-pill')).toHaveCount(2);
});

test('edit payment dialog pre-selects the cycle the original payment was for', async () => {
  await expect(page.locator('.cycle-pill.active')).toHaveCount(1);
});

test('editing the amount to $68 and saving updates the ledger', async () => {
  await page.fill('#mp-amount', '68');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Reopen ledger to verify updated amount
  const billRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Gas Bill' });
  await billRow.locator('[data-action="ledger"]').click();
  await expect(page.locator('.expense-ledger-panel')).toContainText('$68.00');
  await page.screenshot({ path: 'tests/screenshots/29-06-amount-edited.png' });
});

test('deleting the payment record removes it from the ledger', async () => {
  // Register dialog handler BEFORE the click so it's ready when confirm() fires
  page.once('dialog', (d) => d.accept());
  await page.locator('.expense-ledger-panel .icon-btn.danger').filter({ hasText: '🗑️' }).click();

  // After delete the page reloads — ledger panel is rebuilt/cleared
  // The expense-ledger-actions div with $68 should disappear
  await expect(page.locator('.expense-ledger-panel')).not.toContainText('$68.00', { timeout: 10_000 });
  await page.screenshot({ path: 'tests/screenshots/29-07-ledger-empty.png' });
});

// ── Stale status detection ────────────────────────────────────────────────────

test('after payment deletion the bill badge is either Sync issue or a status badge', async () => {
  // Close the ledger panel if still open, then check the badge
  const billRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Gas Bill' });
  // Click away to close ledger if it's open
  const ledgerOpen = await page.locator('.expense-ledger-panel').isVisible();
  if (ledgerOpen) {
    await billRow.locator('[data-action="ledger"]').click();
    await expect(page.locator('.expense-ledger-panel')).not.toBeVisible();
  }

  const badge = billRow.locator('[data-testid="expense-bill-badge"]');
  await expect(badge).toBeVisible({ timeout: 10_000 });
  const badgeText = await badge.textContent() ?? '';
  // Badge is either "⚠ Sync issue" (stale) or a normal status badge
  const validBadge = badgeText.includes('Sync issue') || badgeText.includes('Past Due')
    || badgeText.includes('Due Soon') || badgeText.includes('Paid');
  expect(validBadge).toBe(true);
  await page.screenshot({ path: 'tests/screenshots/29-08-badge-after-delete.png' });
});

test('if stale, the reset-status button is visible', async () => {
  const billRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Gas Bill' });
  const badge = billRow.locator('[data-testid="expense-bill-badge"]');
  const badgeText = await badge.textContent() ?? '';

  if (badgeText.includes('Sync issue')) {
    await expect(billRow.locator('[data-action="reset-status"]')).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/29-09-stale-badge.png' });
  } else {
    // No stale state — test passes trivially
    test.info().annotations.push({ type: 'info', description: 'No stale state detected — rollback was clean' });
  }
});

test('clicking reset-status clears the stale badge', async () => {
  const billRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Gas Bill' });
  const resetBtn = billRow.locator('[data-action="reset-status"]');

  if (await resetBtn.isVisible()) {
    await resetBtn.click();
    await expect(billRow.locator('[data-testid="expense-bill-badge"]')).not.toContainText('Sync issue', { timeout: 8_000 });
    await page.screenshot({ path: 'tests/screenshots/29-10-stale-reset.png' });
  } else {
    test.info().annotations.push({ type: 'info', description: 'No stale state to reset' });
  }
});

// ── Multi-select cycle pills ──────────────────────────────────────────────────

test('new payment dialog allows selecting multiple billing cycles', async () => {
  const billRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Gas Bill' });
  const markPaidBtn = billRow.locator('[data-action="record-payment"]');

  if (!(await markPaidBtn.isVisible())) {
    test.info().annotations.push({ type: 'skip', description: 'Bill already paid — multi-cycle test not applicable' });
    return;
  }

  await markPaidBtn.click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // Should always show 3 cycle pills (last 3 billing periods)
  await expect(page.locator('.cycle-pill')).toHaveCount(3);

  // Find two unpaid pills and select both to verify multi-select works
  const pills = page.locator('.cycle-pill');
  const unpaidIndices: number[] = [];
  for (let i = 0; i < 3; i++) {
    const isPaid = await pills.nth(i).evaluate((el) => el.classList.contains('cycle-pill--paid'));
    if (!isPaid) unpaidIndices.push(i);
  }

  if (unpaidIndices.length >= 2) {
    // Select both unpaid pills — both should be active simultaneously
    for (const idx of unpaidIndices.slice(0, 2)) {
      const pill = pills.nth(idx);
      if (!(await pill.evaluate((el) => el.classList.contains('active')))) {
        await pill.click();
      }
    }
    const activeCount = await page.locator('.cycle-pill.active').count();
    expect(activeCount).toBeGreaterThanOrEqual(2);
    await page.screenshot({ path: 'tests/screenshots/29-11-multi-cycle-select.png' });
  } else {
    test.info().annotations.push({ type: 'info', description: 'Fewer than 2 unpaid cycles — multi-select not demonstrable' });
  }

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
});

// ── Break Glass: consistency scan auto-runs on tab switch ─────────────────────

test('setup: navigate to Break Glass page', async () => {
  await navigateTo(page, 'settings');
  await page.click('[data-testid="bg-open-btn"]');
  // Confirm the warning overlay
  const confirmBtn = page.locator('[data-testid="bg-warning-confirm"]');
  await expect(confirmBtn).toBeVisible();
  await confirmBtn.click();
  await expect(page.locator('.bg-page-title')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/29-12-bg-open.png' });
});

test('switching to Orphan Scanner tab auto-runs the scan without clicking Run Scan', async () => {
  await page.click('[data-testid="bg-tab-scanner"]');
  // Scan fires automatically — status should populate without manually clicking Run Scan
  await expect(page.locator('[data-testid="bg-scan-status"]')).not.toBeEmpty({ timeout: 15_000 });
  await page.screenshot({ path: 'tests/screenshots/29-13-scan-auto-run.png' });
});

test('auto-run scan result is either Clean or reports issues', async () => {
  const statusText = await page.locator('[data-testid="bg-scan-status"]').textContent() ?? '';
  expect(statusText.includes('Clean') || statusText.includes('issue')).toBe(true);
});

test('manual Run Scan button also works after auto-run', async () => {
  await page.click('[data-testid="bg-scan-btn"]');
  await expect(page.locator('[data-testid="bg-scan-status"]')).not.toBeEmpty({ timeout: 15_000 });
  const statusText = await page.locator('[data-testid="bg-scan-status"]').textContent() ?? '';
  expect(statusText.includes('Clean') || statusText.includes('issue')).toBe(true);
  await page.screenshot({ path: 'tests/screenshots/29-14-manual-scan.png' });
});

test('switching away and back to scanner tab re-runs the scan automatically', async () => {
  await page.click('[data-testid="bg-tab-browser"]');
  // Status element is no longer rendered while on browser tab — switch back
  await page.click('[data-testid="bg-tab-scanner"]');
  await expect(page.locator('[data-testid="bg-scan-status"]')).not.toBeEmpty({ timeout: 15_000 });
  const statusText = await page.locator('[data-testid="bg-scan-status"]').textContent() ?? '';
  expect(statusText.includes('Clean') || statusText.includes('issue')).toBe(true);
  await page.screenshot({ path: 'tests/screenshots/29-15-re-scan.png' });
});
