/**
 * E2E tests for the "What If?" (Afford) page.
 *
 * Exercises the full scenario film lifecycle:
 *   - Reality panel shows real income/expense baseline
 *   - Creating, expanding, and populating scenario films
 *   - Activating a scenario shows the projection panel with a verdict
 *   - Deleting a scenario removes it
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

  // Add a household member and income source so the reality panel has real numbers
  await navigateTo(page, 'income');
  await page.fill('[data-testid="add-member-input"]', 'Alex');
  await page.click('[data-testid="add-member-btn"]');
  await page.click('[data-testid="add-source-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#sf-name', 'Day Job');
  await page.fill('#sf-amount', '5000');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  // Add a recurring expense so the reality panel shows expenses
  await navigateTo(page, 'expenses');
  await page.click('[data-testid="add-category-btn"]');
  await page.fill('#cat-name', 'Housing');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="category-pill"]').filter({ hasText: 'Housing' })).toBeVisible();
  await page.click('[data-testid="add-expense-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#ef-desc', 'Rent');
  await page.fill('#ef-amount', '1500');
  await page.selectOption('#ef-cat', { label: 'Housing' });
  await page.check('#ef-recurring');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();

  await navigateTo(page, 'afford');
});

test.afterAll(async () => {
  await cleanup();
});

// ── Page load ─────────────────────────────────────────────────────────────────

test('afford page loads with heading', async () => {
  await expect(page.locator('h1')).toContainText('Can I Afford This?');
});

test('reality panel shows baseline income and expenses', async () => {
  const panel = page.locator('[data-testid="reality-panel"]');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Monthly Income');
  await expect(panel).toContainText('5,000');
  await expect(panel).toContainText('Monthly Expenses');
  await expect(panel).toContainText('1,500');
  await expect(panel).toContainText('Surplus');
});

test('scenario shelf shows empty state with no films', async () => {
  await expect(page.locator('[data-testid="scenarios-empty"]')).toBeVisible();
  await expect(page.locator('[data-testid="scenarios-empty"]')).toContainText('No scenario films yet');
});

test('+ New Film button is visible', async () => {
  await expect(page.locator('[data-testid="new-film-btn"]')).toBeVisible();
});

// ── Creating a scenario ────────────────────────────────────────────────────────

test('clicking + New Film opens modal', async () => {
  await page.click('[data-testid="new-film-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await expect(page.locator('[data-testid="modal-dialog"]')).toContainText('New Scenario Film');
});

test('creating a scenario film adds it to the shelf', async () => {
  await page.fill('#ns-name', 'Buy a Car');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="scenario-card"]')).toBeVisible({ timeout: 6_000 });
  await expect(page.locator('[data-testid="scenario-card"]')).toContainText('Buy a Car');
});

test('empty state is gone after creating a film', async () => {
  await expect(page.locator('[data-testid="scenarios-empty"]')).not.toBeVisible();
});

// ── Expanding and populating ──────────────────────────────────────────────────

test('newly created scenario is expanded (shows Add Income / Expense buttons)', async () => {
  // After creation the card is expanded automatically
  await expect(page.locator('[data-testid="add-income-item-btn"]')).toBeVisible();
  await expect(page.locator('[data-testid="add-expense-item-btn"]')).toBeVisible();
});

test('clicking + Income opens the inline add-item form', async () => {
  await page.click('[data-testid="add-income-item-btn"]');
  await expect(page.locator('#aif-desc')).toBeVisible();
  await expect(page.locator('#aif-amount')).toBeVisible();
  await expect(page.locator('#aif-freq')).toBeVisible();
});

test('adding a monthly income item saves and shows in items list', async () => {
  await page.fill('#aif-desc', 'Freelance Gig');
  await page.fill('#aif-amount', '800');
  // Leave frequency as monthly (default)
  await page.click('#aif-add');
  await expect(page.locator('[data-testid="scenario-item-row"]')).toBeVisible({ timeout: 6_000 });
  await expect(page.locator('[data-testid="scenario-item-row"]')).toContainText('Freelance Gig');
  await expect(page.locator('[data-testid="scenario-item-row"]')).toContainText('+');
});

test('adding a monthly expense item saves and shows in items list', async () => {
  await page.click('[data-testid="add-expense-item-btn"]');
  await expect(page.locator('#aif-desc')).toBeVisible();
  await page.fill('#aif-desc', 'Car Payment');
  await page.fill('#aif-amount', '350');
  await page.click('#aif-add');
  // Both items should now be in the list
  await expect(page.locator('[data-testid="scenario-item-row"]')).toHaveCount(2, { timeout: 6_000 });
  await expect(page.locator('[data-testid="scenario-item-row"]').filter({ hasText: 'Car Payment' })).toContainText('-');
});

test('net effect row reflects combined items (income − expense = +$450/mo)', async () => {
  // $800 income − $350 expense = +$450 net
  await expect(page.locator('.scenario-net-row')).toContainText('+');
  await expect(page.locator('.scenario-net-row')).toContainText('450');
});

// ── Collapse and re-expand ────────────────────────────────────────────────────

test('clicking scenario header collapses the expanded card', async () => {
  await page.click('[data-testid="scenario-header"]');
  await expect(page.locator('[data-testid="add-income-item-btn"]')).not.toBeVisible();
});

test('clicking scenario header again re-expands it', async () => {
  await page.click('[data-testid="scenario-header"]');
  await expect(page.locator('[data-testid="add-income-item-btn"]')).toBeVisible({ timeout: 5_000 });
});

// ── Activation and projection ─────────────────────────────────────────────────

test('toggle activates the scenario and shows projection panel', async () => {
  const toggle = page.locator('[data-testid="scenario-toggle"]');
  await toggle.click();
  await expect(page.locator('[data-testid="projection-panel"]')).toBeVisible({ timeout: 8_000 });
});

test('projection panel shows adjusted income with scenario overlay', async () => {
  // Baseline $5,000/mo income + $800 from scenario = $5,800 adj income
  const panel = page.locator('[data-testid="projection-panel"]');
  await expect(panel).toContainText('Adj. Income');
  await expect(panel).toContainText('5,800');
});

test('projection panel shows adjusted expenses with scenario overlay', async () => {
  // Baseline $1,500 + $350 car payment = $1,850 adj expenses
  const panel = page.locator('[data-testid="projection-panel"]');
  await expect(panel).toContainText('Adj. Expenses');
  await expect(panel).toContainText('1,850');
});

test('projection panel shows a can-afford verdict (surplus ≥ $200)', async () => {
  // Adj surplus = $5,800 − $1,850 = $3,950 → well above $200 threshold
  const verdict = page.locator('.afford-verdict');
  await expect(verdict).toBeVisible();
  await expect(verdict).toContainText('Yes');
});

// ── Deactivation ──────────────────────────────────────────────────────────────

test('toggling the scenario off hides the projection panel', async () => {
  const toggle = page.locator('[data-testid="scenario-toggle"]');
  await toggle.click();
  await expect(page.locator('[data-testid="projection-panel"]')).not.toBeVisible({ timeout: 6_000 });
});

// ── Second scenario: "tight" verdict ──────────────────────────────────────────

test('create a second scenario with a large expense to hit tight verdict', async () => {
  await page.click('[data-testid="new-film-btn"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).toBeVisible();
  await page.fill('#ns-name', 'Expensive City Move');
  await page.click('[data-testid="modal-submit"]');
  await expect(page.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
  await expect(page.locator('[data-testid="scenario-card"]')).toHaveCount(2, { timeout: 6_000 });
});

test('add a large recurring expense to the second scenario', async () => {
  // The second film is auto-expanded
  const cards = page.locator('[data-testid="scenario-card"]');
  const secondCard = cards.nth(1);
  await secondCard.locator('[data-testid="add-expense-item-btn"]').click();
  await expect(page.locator('#aif-desc')).toBeVisible();
  await page.fill('#aif-desc', 'NYC Rent Hike');
  await page.fill('#aif-amount', '4800'); // baseline surplus = $3,500; $4,800 extra → shortfall
  await page.click('#aif-add');
  await expect(secondCard.locator('[data-testid="scenario-item-row"]')).toBeVisible({ timeout: 6_000 });
});

test('activating the high-expense scenario shows a cannot-afford verdict', async () => {
  const cards = page.locator('[data-testid="scenario-card"]');
  const secondCard = cards.nth(1);
  await secondCard.locator('[data-testid="scenario-toggle"]').click();
  await expect(page.locator('[data-testid="projection-panel"]')).toBeVisible({ timeout: 8_000 });
  // Adj surplus = $5,000 − ($1,500 + $4,800) = $5,000 − $6,300 = −$1,300 → cannot-afford
  await expect(page.locator('.afford-verdict')).toContainText('❌');
});

// ── Deletion ──────────────────────────────────────────────────────────────────

test('deleting the second scenario removes it from the shelf', async () => {
  const cards = page.locator('[data-testid="scenario-card"]');
  const secondCard = cards.nth(1);
  // Confirm dialog will fire — accept it
  page.once('dialog', (d) => d.accept());
  await secondCard.getByText('Delete film').click();
  await expect(page.locator('[data-testid="scenario-card"]')).toHaveCount(1, { timeout: 6_000 });
  // Projection panel should be gone (no active scenarios)
  await expect(page.locator('[data-testid="projection-panel"]')).not.toBeVisible();
});

test('deleting the only remaining scenario restores empty state', async () => {
  const card = page.locator('[data-testid="scenario-card"]');
  // Collapse first so the delete button is accessible (footer only shown when expanded)
  const isExpanded = await card.getAttribute('data-expanded');
  if (isExpanded !== 'true') {
    await card.locator('[data-testid="scenario-header"]').click();
    await expect(card.locator('[data-testid="add-income-item-btn"]')).toBeVisible({ timeout: 4_000 });
  }
  page.once('dialog', (d) => d.accept());
  await card.getByText('Delete film').click();
  await expect(page.locator('[data-testid="scenarios-empty"]')).toBeVisible({ timeout: 6_000 });
});
