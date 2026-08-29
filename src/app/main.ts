import './styles/base.css';
import './styles/nav.css';
import browser from 'webextension-polyfill';
import { register, navigate, navigateReplace, currentRoute, initRouter, onRouteChange } from './router';
import { isVaultOpen, closeVault } from '@/crypto/vault';
import { setCurrency } from '@/utils/finance';
import type { VaultConfig } from '@/types';

async function getVaultConfig(): Promise<VaultConfig | null> {
  const result = await browser.storage.local.get('vaultConfig');
  return (result['vaultConfig'] as VaultConfig | undefined) ?? null;
}

function buildNav(): HTMLElement {
  const nav = document.getElementById('app-nav')!;
  nav.innerHTML = `
    <div class="nav-brand">
      <span class="nav-brand-logo">🐷</span>
      <span class="nav-brand-name">Financial<br>Finger</span>
    </div>
    <nav class="nav-links" role="navigation" aria-label="Main">
      <a href="#/dashboard" class="nav-link" data-route="/dashboard" data-testid="nav-dashboard">Dashboard</a>
      <a href="#/income"    class="nav-link" data-route="/income"    data-testid="nav-income">Income</a>
      <a href="#/accounts"  class="nav-link" data-route="/accounts"  data-testid="nav-accounts">Accounts</a>
      <a href="#/expenses"  class="nav-link" data-route="/expenses"  data-testid="nav-expenses">Expenses</a>
      <a href="#/calendar"  class="nav-link" data-route="/calendar"  data-testid="nav-calendar">Calendar</a>
      <a href="#/budget"    class="nav-link" data-route="/budget"    data-testid="nav-budget">Budget</a>
      <a href="#/debt"      class="nav-link" data-route="/debt"      data-testid="nav-debt">Debt</a>
      <a href="#/reports"   class="nav-link" data-route="/reports"   data-testid="nav-reports">Reports</a>
      <a href="#/afford"    class="nav-link" data-route="/afford"    data-testid="nav-afford">What If?</a>
      <a href="#/insights"  class="nav-link" data-route="/insights"  data-testid="nav-insights">Learn</a>
    </nav>
    <div class="nav-footer">
      <a href="#/settings" class="nav-link" data-route="/settings" data-testid="nav-settings">Settings</a>
      <button class="nav-lock-btn" id="nav-lock-btn" data-testid="nav-lock-btn">🔒 Lock Vault</button>
      <a href="https://buymeacoffee.com/sormondocom" target="_blank" rel="noopener noreferrer" class="nav-coffee">☕ buy me a coffee</a>
    </div>
  `;

  nav.querySelectorAll<HTMLAnchorElement>('[data-route]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(a.dataset['route'] as Parameters<typeof navigate>[0]);
    });
  });

  nav.querySelector<HTMLButtonElement>('#nav-lock-btn')!.addEventListener('click', () => {
    closeVault();
    location.reload();
  });

  return nav;
}

function setActiveNavLink(route: string): void {
  document.querySelectorAll('.nav-link').forEach((a) => {
    a.classList.toggle('nav-link--active', (a as HTMLElement).dataset['route'] === route);
  });
}

async function applyTheme(): Promise<void> {
  const result = await browser.storage.local.get('theme');
  const theme = result['theme'] as string | undefined;
  if (theme && theme !== 'auto') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

async function applyCurrency(): Promise<void> {
  const result = await browser.storage.local.get('currency');
  const currency = result['currency'] as string | undefined;
  if (currency) setCurrency(currency);
}

// Transitions the page into the full app without a reload, preserving the
// in-memory vault session key.  Called as a callback from setup and unlock.
function launchApp(): void {
  document.body.classList.remove('no-sidebar');
  buildNav();

  register('/dashboard', async () => {
    const { Dashboard } = await import('@/pages/dashboard/Dashboard');
    return new Dashboard().render();
  });
  register('/income', async () => {
    const { IncomePage } = await import('@/pages/income/Income');
    return new IncomePage().render();
  });
  register('/accounts', async () => {
    const { AccountsPage } = await import('@/pages/accounts/Accounts');
    return new AccountsPage().render();
  });
  register('/expenses', async () => {
    const { ExpensesPage } = await import('@/pages/expenses/Expenses');
    return new ExpensesPage().render();
  });
  register('/calendar', async () => {
    const { CalendarPage } = await import('@/pages/calendar/Calendar');
    return new CalendarPage().render();
  });
  register('/budget', async () => {
    const { BudgetPage } = await import('@/pages/budget/Budget');
    return new BudgetPage().render();
  });
  register('/debt', async () => {
    const { DebtPage } = await import('@/pages/debt/Debt');
    return new DebtPage().render();
  });
  register('/reports', async () => {
    const { ReportsPage } = await import('@/pages/reports/Reports');
    return new ReportsPage().render();
  });
  register('/afford', async () => {
    const { AffordPage } = await import('@/pages/afford/Afford');
    return new AffordPage().render();
  });
  register('/insights', async () => {
    const { InsightsPage } = await import('@/pages/insights/Insights');
    return new InsightsPage().render();
  });
  register('/settings', async () => {
    const { SettingsPage } = await import('@/pages/settings/Settings');
    return new SettingsPage().render();
  });
  register('/break-glass', async () => {
    const [{ BreakGlassPage }, cfgResult] = await Promise.all([
      import('@/pages/break-glass/BreakGlassPage'),
      browser.storage.local.get('vaultConfig'),
    ]);
    const cfg = cfgResult['vaultConfig'] as { mascotGender?: 'buck' | 'penny' } | undefined;
    return new BreakGlassPage().render(cfg?.mascotGender);
  });

  onRouteChange(setActiveNavLink);

  // Replace the setup/unlock history entry so Back doesn't return to the gate.
  navigateReplace('/dashboard');

  // Check for any due custom notifications after the dashboard has rendered
  setTimeout(() => {
    import('@/utils/notifications').then(({ checkAndFireNotifications }) => {
      checkAndFireNotifications();
    });
  }, 1500);
}

async function boot(): Promise<void> {
  await Promise.all([applyTheme(), applyCurrency()]);
  const config = await getVaultConfig();

  if (!config?.setupComplete) {
    document.body.classList.add('no-sidebar');
    register('/setup', async () => {
      const { SetupWizard } = await import('@/pages/setup/Setup');
      return new SetupWizard(launchApp).render();
    });
    history.replaceState({}, '', '#/setup');
    initRouter();
    return;
  }

  if (!isVaultOpen()) {
    document.body.classList.add('no-sidebar');
    register('/unlock', async () => {
      const { UnlockPage } = await import('@/pages/unlock/Unlock');
      return new UnlockPage(config, launchApp).render();
    });
    history.replaceState({}, '', '#/unlock');
    initRouter();
    return;
  }

  // Vault already open in this page load (e.g. HMR in development).
  launchApp();
}

boot();
