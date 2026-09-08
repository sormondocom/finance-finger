import { navigate } from '@/app/router';

export type HelpSection =
  | 'setup'
  | 'dashboard'
  | 'income'
  | 'accounts'
  | 'expenses'
  | 'calendar'
  | 'budget'
  | 'debt'
  | 'reports'
  | 'whatif'
  | 'learn'
  | 'settings';

export function navigateToHelp(section: HelpSection): void {
  sessionStorage.setItem('ff-help-section', section);
  navigate('/help');
}

export function makeHelpBtn(section: HelpSection): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'help-nav-btn';
  btn.title = 'Help';
  btn.setAttribute('aria-label', 'Open help for this page');
  btn.setAttribute('data-testid', `help-btn-${section}`);
  btn.textContent = '?';
  btn.addEventListener('click', () => navigateToHelp(section));
  return btn;
}
