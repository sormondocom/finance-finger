import { expect, type Page } from '@playwright/test';

export const TEST_KEY_NAME = 'Test User';
export const TEST_KEY_EMAIL = 'test@financial-finger.local';
export const TEST_PASSPHRASE = 'test-passphrase-financial-finger';
export const TEST_HOUSEHOLD = 'Test Household';

export interface SetupResult {
  privateKey: string;
}

/**
 * Drives the setup wizard to completion using the generate-key path.
 * Leaves the page on the dashboard after `setup-enter-app` is clicked.
 */
export async function completeSetupWizard(page: Page): Promise<SetupResult> {
  // Step: Welcome
  await expect(page.locator('[data-testid="setup-next"]')).toBeVisible();
  await page.click('[data-testid="setup-next"]');

  // Step: Mascot — default (Buck) is fine
  await expect(page.locator('[data-testid="mascot-option-buck"]')).toBeVisible();
  await page.click('[data-testid="setup-next"]');

  // Step: Keys — fill generate form
  await page.fill('#key-name', TEST_KEY_NAME);
  await page.fill('#key-email', TEST_KEY_EMAIL);
  await page.fill('#key-pass', TEST_PASSPHRASE);
  // Key generation takes a few seconds — give it time
  await page.click('[data-testid="setup-next"]');
  await expect(page.locator('[data-testid="copy-private-key"]')).toBeVisible({ timeout: 30_000 });

  // Step: Save key — capture the private key text then continue
  const privateKey = await page.locator('#key-display').innerText();
  await page.click('[data-testid="setup-next"]');

  // Step: Profile
  await page.fill('#profile-name', TEST_HOUSEHOLD);
  await page.click('[data-testid="setup-next"]');

  // Step: Done
  await expect(page.locator('[data-testid="setup-enter-app"]')).toBeVisible({ timeout: 15_000 });
  await page.click('[data-testid="setup-enter-app"]');

  // Confirm dashboard loaded
  await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible();

  return { privateKey };
}

/** Navigates to a page by clicking the sidebar nav link. */
export async function navigateTo(
  page: Page,
  route: 'dashboard' | 'income' | 'expenses' | 'calendar' | 'budget' | 'debt' | 'settings',
): Promise<void> {
  await page.click(`[data-testid="nav-${route}"]`);
}
