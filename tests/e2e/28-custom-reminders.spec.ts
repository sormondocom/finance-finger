/**
 * Custom Reminders E2E tests.
 *
 * Covers: Reminders section appearing in both create and edit forms for
 * Income, Expenses, Debt, and Accounts. Verifies that reminders added
 * during item creation are persisted after save and appear in Settings → Reminders.
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
});

test.afterAll(async () => {
  await cleanup();
});

// ── Seed: add a household member so add-source-btn appears ───────────────────

test('setup: add household member for income tests', async () => {
  await navigateTo(page, 'income');
  await page.fill('[data-testid="add-member-input"]', 'Alex');
  await page.click('[data-testid="add-member-btn"]');
  await expect(page.locator('[data-testid="member-chip"]').filter({ hasText: 'Alex' })).toBeVisible();
});

// ── Income: create form ───────────────────────────────────────────────────────

test('income create form shows Reminders section', async () => {
  await navigateTo(page, 'income');
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('.linked-reminders-section')).toBeVisible();
  await expect(page.locator('.linked-reminders-section button', { hasText: '+ Add reminder' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/reminders-28-income-create-section.png' });
  await page.keyboard.press('Escape');
});

test('income create form: add reminder then save source — reminder persists in Settings', async () => {
  await navigateTo(page, 'income');
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  // Fill the income form
  await page.fill('#sf-name', 'Freelance Work');
  await page.fill('#sf-amount', '1500');

  // Add a reminder before saving
  await page.locator('.linked-reminders-section button', { hasText: '+ Add reminder' }).click();
  await expect(page.locator('[data-testid="modal-dialog"]').last()).toBeVisible();
  await expect(page.locator('[data-testid="modal-dialog"]').last().locator('h2, [role="heading"]')).toContainText('Add Reminder');

  // Fill the reminder form (label pre-filled from income name)
  await page.locator('[data-testid="modal-dialog"]').last().locator('input[type="text"]').first().fill('Freelance payday');
  // Leave trigger as monthly-day (default)
  await page.locator('[data-testid="modal-dialog"]').last().locator('[data-testid="modal-submit"]').click();

  // Reminder should appear in the section list
  await expect(page.locator('.linked-reminders-section')).toContainText('Freelance payday');
  await page.screenshot({ path: 'tests/screenshots/reminders-28-income-reminder-in-list.png' });

  // Submit the income form
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="source-row"]').filter({ hasText: 'Freelance Work' })).toBeVisible();

  // Verify the reminder appears in Settings → Reminders
  await navigateTo(page, 'settings');
  await expect(page.locator('.notif-card-label', { hasText: 'Freelance payday' })).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: 'tests/screenshots/reminders-28-income-reminder-in-settings.png' });
});

// ── Expenses: create form ─────────────────────────────────────────────────────

test('expenses create form shows Reminders section', async () => {
  await navigateTo(page, 'expenses');

  // Add a category if none exist yet
  const noCategoryPills = await page.locator('[data-testid="category-pill"]').count();
  if (noCategoryPills === 0) {
    await page.click('[data-testid="add-category-btn"]');
    await page.fill('#cat-name', 'Housing');
    await page.click('[data-testid="modal-submit"]');
  }

  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('.linked-reminders-section')).toBeVisible();
  await expect(page.locator('.linked-reminders-section button', { hasText: '+ Add reminder' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/reminders-28-expense-create-section.png' });
  await page.keyboard.press('Escape');
});

test('expenses create form: add reminder then save expense — reminder persists in Settings', async () => {
  await navigateTo(page, 'expenses');

  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ef-desc', 'Monthly Rent');
  await page.fill('#ef-amount', '1200');
  const firstCat = page.locator('#ef-cat option').nth(1);
  const catVal = await firstCat.getAttribute('value');
  if (catVal) await page.selectOption('#ef-cat', catVal);

  // Add a reminder
  await page.locator('.linked-reminders-section button', { hasText: '+ Add reminder' }).click();
  await expect(page.locator('[data-testid="modal-dialog"]').last().locator('[data-testid="modal-submit"]')).toBeVisible();
  await page.locator('[data-testid="modal-dialog"]').last().locator('input[type="text"]').first().fill('Rent reminder');
  await page.locator('[data-testid="modal-dialog"]').last().locator('[data-testid="modal-submit"]').click();

  await expect(page.locator('.linked-reminders-section')).toContainText('Rent reminder');

  // Save the expense
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="expense-row"]').filter({ hasText: 'Monthly Rent' })).toBeVisible();

  // Verify in Settings
  await navigateTo(page, 'settings');
  await expect(page.locator('.notif-card-label', { hasText: 'Rent reminder' })).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: 'tests/screenshots/reminders-28-expense-reminder-in-settings.png' });
});

// ── Debt: create form ─────────────────────────────────────────────────────────

test('debt create form shows Reminders section', async () => {
  await navigateTo(page, 'debt');
  await page.click('[data-testid="add-debt-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('.linked-reminders-section')).toBeVisible();
  await expect(page.locator('.linked-reminders-section button', { hasText: '+ Add reminder' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/reminders-28-debt-create-section.png' });
  await page.keyboard.press('Escape');
});

test('debt create form: add reminder then save — reminder persists in Settings', async () => {
  await navigateTo(page, 'debt');
  await page.click('[data-testid="add-debt-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#da-name', 'Car Loan');
  await page.fill('#da-balance', '12000');
  await page.fill('#da-apr', '5.9');

  // Add a reminder
  await page.locator('.linked-reminders-section button', { hasText: '+ Add reminder' }).click();
  await expect(page.locator('[data-testid="modal-dialog"]').last().locator('[data-testid="modal-submit"]')).toBeVisible();
  await page.locator('[data-testid="modal-dialog"]').last().locator('input[type="text"]').first().fill('Car payment due');
  await page.locator('[data-testid="modal-dialog"]').last().locator('[data-testid="modal-submit"]').click();

  await expect(page.locator('.linked-reminders-section')).toContainText('Car payment due');

  // Save the debt
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="debt-row"]').filter({ hasText: 'Car Loan' })).toBeVisible();

  // Verify in Settings
  await navigateTo(page, 'settings');
  await expect(page.locator('.notif-card-label', { hasText: 'Car payment due' })).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: 'tests/screenshots/reminders-28-debt-reminder-in-settings.png' });
});

// ── Accounts: create form ─────────────────────────────────────────────────────

test('accounts create form shows Reminders section', async () => {
  await navigateTo(page, 'accounts');
  await expect(page.locator('[data-testid="add-account-btn"]')).toBeVisible();
  await page.click('[data-testid="add-account-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('.linked-reminders-section')).toBeVisible();
  await expect(page.locator('.linked-reminders-section button', { hasText: '+ Add reminder' })).toBeVisible();
  await page.screenshot({ path: 'tests/screenshots/reminders-28-account-create-section.png' });
  await page.keyboard.press('Escape');
});

test('accounts create form: add reminder then save — reminder persists in Settings', async () => {
  await navigateTo(page, 'accounts');
  await page.click('[data-testid="add-account-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();

  await page.fill('#ba-name', 'Savings Account');
  await page.selectOption('#ba-type', 'savings');

  // Add a reminder
  await page.locator('.linked-reminders-section button', { hasText: '+ Add reminder' }).click();
  await expect(page.locator('[data-testid="modal-dialog"]').last().locator('[data-testid="modal-submit"]')).toBeVisible();
  await page.locator('[data-testid="modal-dialog"]').last().locator('input[type="text"]').first().fill('Monthly savings transfer');
  await page.locator('[data-testid="modal-dialog"]').last().locator('[data-testid="modal-submit"]').click();

  await expect(page.locator('.linked-reminders-section')).toContainText('Monthly savings transfer');

  // Save the account
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="account-row"]').filter({ hasText: 'Savings Account' })).toBeVisible();

  // Verify in Settings
  await navigateTo(page, 'settings');
  await expect(page.locator('.notif-card-label', { hasText: 'Monthly savings transfer' })).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: 'tests/screenshots/reminders-28-account-reminder-in-settings.png' });
});

// ── Edit forms: Reminders section shows linked reminders ─────────────────────

test('income edit form shows Reminders section with linked reminder', async () => {
  await navigateTo(page, 'income');
  const row = page.locator('[data-testid="source-row"]').filter({ hasText: 'Freelance Work' });
  await row.locator('[data-testid="source-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('.linked-reminders-section')).toBeVisible();
  // The reminder we created during the create form should appear
  await expect(page.locator('.linked-reminders-section')).toContainText('Freelance payday');
  await page.screenshot({ path: 'tests/screenshots/reminders-28-income-edit-linked.png' });
  await page.keyboard.press('Escape');
});

test('expense edit form shows Reminders section with linked reminder', async () => {
  await navigateTo(page, 'expenses');
  const row = page.locator('[data-testid="expense-row"]').filter({ hasText: 'Monthly Rent' });
  await row.locator('[data-testid="expense-edit"]').click();
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('.linked-reminders-section')).toBeVisible();
  await expect(page.locator('.linked-reminders-section')).toContainText('Rent reminder');
  await page.screenshot({ path: 'tests/screenshots/reminders-28-expense-edit-linked.png' });
  await page.keyboard.press('Escape');
});
