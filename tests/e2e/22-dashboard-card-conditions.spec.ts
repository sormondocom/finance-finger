/**
 * Dashboard "Income by Account" card conditional-rendering tests.
 *
 * Uses two independent fresh extension contexts to prove the card only
 * appears when at least one account has active income linked to it:
 *
 *   Suite A — no accounts at all → card is absent
 *   Suite B — account exists but no income source is linked → card is absent
 *
 * (The positive case — card IS present — is covered by 20-accounts.spec.ts.)
 */
import { test, expect } from '@playwright/test';
import { launchExtensionContext } from '../helpers/extension';
import { completeSetupWizard, navigateTo } from '../helpers/setup-wizard';
import type { BrowserContext, Page } from '@playwright/test';

// ── Suite A: no accounts exist ────────────────────────────────────────────────

test.describe('Income by Account card: absent when no accounts exist', () => {
  let ctx: BrowserContext;
  let pg: Page;
  let teardown: () => Promise<void>;

  test.beforeAll(async () => {
    const ext = await launchExtensionContext();
    ctx = ext.context;
    teardown = ext.cleanup;
    pg = await ctx.newPage();
    await pg.goto(ext.extUrl);
    await completeSetupWizard(pg);
  });

  test.afterAll(async () => {
    await teardown();
  });

  test('Income by Account card is NOT shown when no bank accounts exist', async () => {
    // Fresh context — no accounts, no income — dashboard should not show the card
    await expect(pg.locator('[data-testid="income-by-account-card"]')).not.toBeVisible({ timeout: 6000 });
    await pg.screenshot({ path: 'tests/screenshots/dash-cond-01-no-accounts.png' });
  });
});

// ── Suite B: account exists but income is not linked ─────────────────────────

test.describe('Income by Account card: absent when account has no linked income', () => {
  let ctx: BrowserContext;
  let pg: Page;
  let teardown: () => Promise<void>;

  test.beforeAll(async () => {
    const ext = await launchExtensionContext();
    ctx = ext.context;
    teardown = ext.cleanup;
    pg = await ctx.newPage();
    await pg.goto(ext.extUrl);
    await completeSetupWizard(pg);
  });

  test.afterAll(async () => {
    await teardown();
  });

  test('fixture: adds a savings account (without linking any income)', async () => {
    await navigateTo(pg, 'accounts');
    await pg.click('[data-testid="add-account-btn"]');
    await expect(pg.locator('[data-testid="modal-dialog"]')).toBeVisible();
    await pg.fill('#ba-name', 'Savings Account');
    await pg.selectOption('#ba-type', 'savings');
    await pg.click('[data-testid="modal-submit"]');
    await expect(pg.locator('[data-testid="modal-dialog"]')).not.toBeVisible();
    await expect(pg.locator('[data-testid="account-row"]').filter({ hasText: 'Savings Account' })).toBeVisible();
  });

  test('Income by Account card is NOT shown when account has no linked income source', async () => {
    await navigateTo(pg, 'dashboard');
    await expect(pg.locator('[data-testid="income-by-account-card"]')).not.toBeVisible({ timeout: 6000 });
    await pg.screenshot({ path: 'tests/screenshots/dash-cond-02-no-linked-income.png' });
  });
});
