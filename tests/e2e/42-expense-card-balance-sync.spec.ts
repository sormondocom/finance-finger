/**
 * Expense → debt-card balance synchronization E2E tests.
 *
 * These tests guard against the class of bug where CardCharge records are
 * created or deleted without updating the linked DebtAccount.balance, leading
 * to stale balances and orphaned paid-status on expenses.
 *
 * Flows covered (each maps to a previously-broken call site):
 *
 *   1. Recording an expense payment against a card → balance increases.
 *   2. Editing the payment amount → the delta is applied to the balance.
 *   3. Switching the payment to a different card → old card decrements,
 *      new card increments.
 *   4. Clearing the card from a payment → balance decrements.
 *   5. Deleting a paid record from the expense ledger → balance decrements
 *      and the expense becomes unpaid.
 *   6. Deleting the entire expense while it has a linked charge → balance
 *      decrements on the affected card.
 *   7. Deleting an auto-created charge from the debt page → balance
 *      decrements and the linked expense reverts to unpaid.
 *
 * Accounts / expenses created during this suite (fresh extension context):
 *   Card Alpha   – $1,000 starting balance
 *   Card Beta    – $500  starting balance
 *   "Internet Service"  – $80 recurring bill (primary test fixture)
 *   "Phone Bill"        – $60 recurring bill (delete-expense scenario)
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

let context: BrowserContext;
let page: Page;
let cleanup: () => Promise<void>;

// ── Date helpers ──────────────────────────────────────────────────────────────

const today = new Date();
const PAST_DUE_DAY = Math.max(1, today.getDate() - 3);

function thisMonthDate(day: number): string {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-${String(day).padStart(2, '0')}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function cardBalance(cardName: string): Promise<string> {
  await navigateTo(page, 'debt');
  const row = page.locator('[data-testid="debt-row"]').filter({ hasText: cardName });
  return row.locator('[data-testid="debt-row-balance"]').textContent() as Promise<string>;
}

async function openChargesPanel(cardName: string): Promise<void> {
  await navigateTo(page, 'debt');
  const row = page.locator('[data-testid="debt-row"]').filter({ hasText: cardName });
  const wrap = page.locator('[data-testid="debt-account-wrap"]').filter({ hasText: cardName });
  const panel = wrap.locator('[data-testid="debt-charges-panel"]');
  const isVisible = await panel.isVisible();
  if (!isVisible) await row.locator('[data-testid="debt-charges-btn"]').click();
  await expect(panel).toBeVisible();
}

// ── Suite lifecycle ───────────────────────────────────────────────────────────

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

// ── Setup: two card accounts ──────────────────────────────────────────────────

test('setup: add Card Alpha ($1,000)', async () => {
  await navigateTo(page, 'debt');
  await page.click('[data-testid="add-debt-btn"]');
  await page.fill('#da-name', 'Card Alpha');
  await page.fill('#da-balance', '1000');
  await page.fill('#da-apr', '19.99');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  const row = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Card Alpha' });
  await expect(row.locator('[data-testid="debt-row-balance"]')).toContainText('$1,000.00');
  await page.screenshot({ path: 'tests/screenshots/ebs-01-card-alpha-setup.png' });
});

test('setup: add Card Beta ($500)', async () => {
  await page.click('[data-testid="add-debt-btn"]');
  await page.fill('#da-name', 'Card Beta');
  await page.fill('#da-balance', '500');
  await page.fill('#da-apr', '24.99');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  const row = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Card Beta' });
  await expect(row.locator('[data-testid="debt-row-balance"]')).toContainText('$500.00');
});

test('setup: add Bills category', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-category-btn"]');
  await page.fill('#cat-name', 'Bills');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="category-pill"]').filter({ hasText: 'Bills' })).toBeVisible();
});

test('setup: add Internet Service ($80, recurring, past-due)', async () => {
  await page.click('[data-testid="add-expense-btn"]');
  await page.fill('#ef-desc', 'Internet Service');
  await page.fill('#ef-amount', '80');
  await page.selectOption('#ef-cat', { label: 'Bills' });
  await page.check('#ef-recurring');
  await page.fill('#ef-duedate', thisMonthDate(PAST_DUE_DAY));
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Internet Service' })).toBeVisible();
});

// ── Flow 1: Recording a payment to a card increases the card balance ──────────

test('recording a payment to Card Alpha increases its balance by the payment amount', async () => {
  await navigateTo(page, 'expenses');
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Internet Service' });
  await row.locator('[data-testid="expense-record-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('[data-testid="expense-pay-amount"]', '80');
  await page.selectOption('#mp-source', { label: 'Card Alpha' });
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // $1,000 + $80 = $1,080
  await navigateTo(page, 'debt');
  const alphaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Card Alpha' });
  await expect(alphaRow.locator('[data-testid="debt-row-balance"]')).toContainText('$1,080.00');
  await page.screenshot({ path: 'tests/screenshots/ebs-02-payment-increases-balance.png' });
});

test('the auto-created charge appears on Card Alpha with the Auto badge', async () => {
  await openChargesPanel('Card Alpha');
  const wrap = page.locator('[data-testid="debt-account-wrap"]').filter({ hasText: 'Card Alpha' });
  const charge = wrap.locator('[data-testid="debt-charge-item"]').filter({ hasText: 'Internet Service' });
  await expect(charge).toBeVisible();
  await expect(charge.locator('[data-testid="charge-auto-badge"]')).toBeVisible();
  await expect(charge).toContainText('$80.00');
  await page.screenshot({ path: 'tests/screenshots/ebs-03-auto-charge-badge.png' });
});

// ── Flow 2: Editing the payment amount applies the delta to the balance ────────

test('editing the payment amount from $80 to $100 applies the $20 delta to Card Alpha', async () => {
  await navigateTo(page, 'expenses');
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Internet Service' });
  await row.locator('[data-testid="expense-edit-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('[data-testid="expense-pay-amount"]', '100');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // $1,080 + $20 delta = $1,100
  await navigateTo(page, 'debt');
  const alphaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Card Alpha' });
  await expect(alphaRow.locator('[data-testid="debt-row-balance"]')).toContainText('$1,100.00');
  await page.screenshot({ path: 'tests/screenshots/ebs-04-edit-amount-delta.png' });
});

test('the auto-charge on Card Alpha updates to $100 after edit', async () => {
  await openChargesPanel('Card Alpha');
  const wrap = page.locator('[data-testid="debt-account-wrap"]').filter({ hasText: 'Card Alpha' });
  await expect(wrap.locator('[data-testid="debt-charge-item"]').filter({ hasText: 'Internet Service' })).toContainText('$100.00');
});

// ── Flow 3: Switching card removes charge from old card, adds to new card ─────

test('switching payment from Card Alpha to Card Beta decrements Alpha and increments Beta', async () => {
  await navigateTo(page, 'expenses');
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Internet Service' });
  await row.locator('[data-testid="expense-edit-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.selectOption('#mp-source', { label: 'Card Beta' });
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  await navigateTo(page, 'debt');

  // Card Alpha: $1,100 − $100 = $1,000 (back to starting balance)
  const alphaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Card Alpha' });
  await expect(alphaRow.locator('[data-testid="debt-row-balance"]')).toContainText('$1,000.00');

  // Card Beta: $500 + $100 = $600
  const betaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Card Beta' });
  await expect(betaRow.locator('[data-testid="debt-row-balance"]')).toContainText('$600.00');
  await page.screenshot({ path: 'tests/screenshots/ebs-05-switch-card.png' });
});

test('auto-charge moved from Card Alpha to Card Beta after card switch', async () => {
  await openChargesPanel('Card Alpha');
  const alphaWrap = page.locator('[data-testid="debt-account-wrap"]').filter({ hasText: 'Card Alpha' });
  await expect(alphaWrap.locator('[data-testid="debt-charge-item"]').filter({ hasText: 'Internet Service' })).toHaveCount(0);

  await openChargesPanel('Card Beta');
  const betaWrap = page.locator('[data-testid="debt-account-wrap"]').filter({ hasText: 'Card Beta' });
  await expect(betaWrap.locator('[data-testid="debt-charge-item"]').filter({ hasText: 'Internet Service' })).toBeVisible();
  await expect(betaWrap.locator('[data-testid="debt-charge-item"]').filter({ hasText: 'Internet Service' }).locator('[data-testid="charge-auto-badge"]')).toBeVisible();
});

// ── Flow 4: Clearing the card from a payment decrements the balance ───────────

test('clearing the card from the payment decrements Card Beta back to $500', async () => {
  await navigateTo(page, 'expenses');
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Internet Service' });
  await row.locator('[data-testid="expense-edit-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // Select "Not specified" to clear the card
  await page.selectOption('#mp-source', { value: '' });
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Card Beta: $600 − $100 = $500 (back to starting balance)
  await navigateTo(page, 'debt');
  const betaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Card Beta' });
  await expect(betaRow.locator('[data-testid="debt-row-balance"]')).toContainText('$500.00');
  await page.screenshot({ path: 'tests/screenshots/ebs-06-clear-card.png' });
});

test('charge removed from Card Beta after clearing card on payment', async () => {
  await openChargesPanel('Card Beta');
  const betaWrap = page.locator('[data-testid="debt-account-wrap"]').filter({ hasText: 'Card Beta' });
  await expect(betaWrap.locator('[data-testid="debt-charge-item"]').filter({ hasText: 'Internet Service' })).toHaveCount(0);
});

// ── Flow 5: Delete paid record from ledger decrements balance, expense unpaid ─

test('setup for ledger delete: re-record Internet Service payment ($80) to Card Alpha', async () => {
  await navigateTo(page, 'expenses');
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Internet Service' });
  await row.locator('[data-testid="expense-edit-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('[data-testid="expense-pay-amount"]', '80');
  await page.selectOption('#mp-source', { label: 'Card Alpha' });
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Confirm balance: $1,000 + $80 = $1,080
  await navigateTo(page, 'debt');
  const alphaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Card Alpha' });
  await expect(alphaRow.locator('[data-testid="debt-row-balance"]')).toContainText('$1,080.00');
});

test('deleting the paid record from the ledger decrements Card Alpha back to $1,000', async () => {
  await navigateTo(page, 'expenses');
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Internet Service' });

  // Open the ledger panel
  await row.locator('[data-testid="expense-ledger-btn"]').click();
  const ledger = page.locator('.expense-ledger-panel');
  await expect(ledger).toBeVisible();

  // Delete the paid record
  page.once('dialog', (d) => d.accept());
  await ledger.locator('[data-testid="expense-ledger-del"]').first().click();

  // Balance: $1,080 − $80 = $1,000
  await navigateTo(page, 'debt');
  const alphaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Card Alpha' });
  await expect(alphaRow.locator('[data-testid="debt-row-balance"]')).toContainText('$1,000.00');
  await page.screenshot({ path: 'tests/screenshots/ebs-07-ledger-del-balance.png' });
});

test('after ledger delete, Internet Service reverts to unpaid (Record Payment button visible)', async () => {
  await navigateTo(page, 'expenses');
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Internet Service' });
  await expect(row.locator('[data-testid="expense-record-payment"]')).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/ebs-08-reverts-to-unpaid.png' });
});

// ── Flow 6: Deleting the expense removes its linked charge and decrements ─────

test('setup: add Phone Bill ($60, recurring) and pay it to Card Beta', async () => {
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-expense-btn"]');
  await page.fill('#ef-desc', 'Phone Bill');
  await page.fill('#ef-amount', '60');
  await page.selectOption('#ef-cat', { label: 'Bills' });
  await page.check('#ef-recurring');
  await page.fill('#ef-duedate', thisMonthDate(PAST_DUE_DAY));
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  const phoneRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Phone Bill' });
  await phoneRow.locator('[data-testid="expense-record-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('[data-testid="expense-pay-amount"]', '60');
  await page.selectOption('#mp-source', { label: 'Card Beta' });
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Card Beta: $500 + $60 = $560
  await navigateTo(page, 'debt');
  const betaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Card Beta' });
  await expect(betaRow.locator('[data-testid="debt-row-balance"]')).toContainText('$560.00');
});

test('deleting Phone Bill (with linked charge) decrements Card Beta back to $500', async () => {
  await navigateTo(page, 'expenses');
  const phoneRow = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Phone Bill' });
  page.once('dialog', (d) => d.accept());
  await phoneRow.locator('[data-testid="expense-delete"]').click();

  await expect(
    page.locator('[data-testid="expense-row"]').filter({ hasText: 'Phone Bill' }),
  ).not.toBeVisible({ timeout: 6_000 });

  // Card Beta: $560 − $60 = $500
  await navigateTo(page, 'debt');
  const betaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Card Beta' });
  await expect(betaRow.locator('[data-testid="debt-row-balance"]')).toContainText('$500.00');
  await page.screenshot({ path: 'tests/screenshots/ebs-09-delete-expense-balance.png' });
});

// ── Flow 7: Delete auto-charge from debt page → balance + expense unpaid ──────

test('setup: re-record Internet Service payment ($80) to Card Alpha for debt-side delete test', async () => {
  await navigateTo(page, 'expenses');
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Internet Service' });
  await row.locator('[data-testid="expense-record-payment"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('[data-testid="expense-pay-amount"]', '80');
  await page.selectOption('#mp-source', { label: 'Card Alpha' });
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Confirm: $1,000 + $80 = $1,080
  await navigateTo(page, 'debt');
  const alphaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Card Alpha' });
  await expect(alphaRow.locator('[data-testid="debt-row-balance"]')).toContainText('$1,080.00');
});

test('deleting the Auto charge from the debt page decrements Card Alpha back to $1,000', async () => {
  await openChargesPanel('Card Alpha');
  const alphaWrap = page.locator('[data-testid="debt-account-wrap"]').filter({ hasText: 'Card Alpha' });

  const charge = alphaWrap.locator('[data-testid="debt-charge-item"]').filter({ hasText: 'Internet Service' });
  await expect(charge).toBeVisible();
  await expect(charge.locator('[data-testid="charge-auto-badge"]')).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await charge.locator('.icon-btn.danger').click();

  // Panel updates — charge gone
  await expect(alphaWrap.locator('[data-testid="debt-charge-item"]').filter({ hasText: 'Internet Service' })).toHaveCount(0);

  // Balance: $1,080 − $80 = $1,000
  const alphaRow = page.locator('[data-testid="debt-row"]').filter({ hasText: 'Card Alpha' });
  await expect(alphaRow.locator('[data-testid="debt-row-balance"]')).toContainText('$1,000.00');
  await page.screenshot({ path: 'tests/screenshots/ebs-10-debt-del-balance.png' });
});

test('after debt-side charge delete, Internet Service reverts to unpaid on the expenses page', async () => {
  await navigateTo(page, 'expenses');
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Internet Service' });
  // Expense should show Record Payment button — no longer paid
  await expect(row.locator('[data-testid="expense-record-payment"]')).toBeVisible({ timeout: 6_000 });
  await page.screenshot({ path: 'tests/screenshots/ebs-11-debt-del-unpaid.png' });
});
