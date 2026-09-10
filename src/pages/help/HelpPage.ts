import './help.css';
import * as SetupSection    from './sections/SetupSection';
import * as DashboardSection from './sections/DashboardSection';
import * as IncomeSection   from './sections/IncomeSection';
import * as AccountsSection from './sections/AccountsSection';
import * as ExpensesSection from './sections/ExpensesSection';
import * as CalendarSection from './sections/CalendarSection';
import * as BudgetSection   from './sections/BudgetSection';
import * as DebtSection     from './sections/DebtSection';
import * as ReportsSection  from './sections/ReportsSection';
import * as WhatIfSection   from './sections/WhatIfSection';
import * as LearnSection    from './sections/LearnSection';
import * as SettingsSection from './sections/SettingsSection';

type HelpSection =
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

const SECTION_LABELS: Record<HelpSection, string> = {
  setup:     'Setup & Security',
  dashboard: 'Dashboard',
  income:    'Income',
  accounts:  'Accounts',
  expenses:  'Expenses & Bills',
  calendar:  'Calendar',
  budget:    'Budget',
  debt:      'Debt',
  reports:   'Reports',
  whatif:    'What If?',
  learn:     'Learn',
  settings:  'Settings & Data',
};

const SECTION_RENDERERS: Record<HelpSection, (grid: HTMLElement) => void> = {
  setup:     SetupSection.render,
  dashboard: DashboardSection.render,
  income:    IncomeSection.render,
  accounts:  AccountsSection.render,
  expenses:  ExpensesSection.render,
  calendar:  CalendarSection.render,
  budget:    BudgetSection.render,
  debt:      DebtSection.render,
  reports:   ReportsSection.render,
  whatif:    WhatIfSection.render,
  learn:     LearnSection.render,
  settings:  SettingsSection.render,
};

export class HelpPage {
  private section: HelpSection = 'setup';
  private container!: HTMLElement;

  render(): HTMLElement {
    const stored = sessionStorage.getItem('ff-help-section') as HelpSection | null;
    if (stored && Object.prototype.hasOwnProperty.call(SECTION_LABELS, stored)) {
      this.section = stored;
      sessionStorage.removeItem('ff-help-section');
    }

    this.container = document.createElement('div');
    this.container.className = 'help-page';
    this.paint();
    return this.container;
  }

  private paint(): void {
    this.container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'help-header';
    header.innerHTML = `
      <h1 class="font-serif">Help</h1>
      <blockquote class="help-quote">
        "Ain't no question too small — ask away and we'll walk ya through it, partner."
        <cite>— Buck &amp; Penny</cite>
      </blockquote>
    `;
    this.container.appendChild(header);
    this.container.appendChild(this.buildTabs());

    const grid = document.createElement('div');
    grid.className = 'help-grid';
    grid.id = 'help-grid';
    grid.setAttribute('data-testid', 'help-grid');
    SECTION_RENDERERS[this.section](grid);
    this.container.appendChild(grid);
  }

  private buildTabs(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'help-tabs';

    (Object.keys(SECTION_LABELS) as HelpSection[]).forEach((s) => {
      const btn = document.createElement('button');
      btn.className = `help-tab ${this.section === s ? 'active' : ''}`;
      btn.setAttribute('data-testid', `help-tab-${s}`);
      btn.textContent = SECTION_LABELS[s];
      btn.addEventListener('click', () => {
        this.section = s;
        bar.querySelectorAll('.help-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const grid = document.getElementById('help-grid')!;
        grid.innerHTML = '';
        SECTION_RENDERERS[s](grid);
      });
      bar.appendChild(btn);
    });

    return bar;
  }
}
