import { computeMinPayment } from '@/utils/paymentStatus';
import { navigate } from '@/app/router';
import { sourceMonthly, fmt, fmtCents } from '@/utils/finance';
import type { DebtAccount, IncomeSource, BankAccount } from '@/types';
import { userLocale } from '@/utils/locale';

export function buildFinancialHealthRow(
  cards: DebtAccount[],
  sources: IncomeSource[],
): HTMLElement | null {
  const monthlyIncome = sources
    .filter((s) => s.active && s.frequency !== 'once')
    .reduce((sum, s) => sum + sourceMonthly(s), 0);

  const monthlyMinPayments = cards
    .filter((c) => c.balance > 0)
    .reduce((sum, c) => sum + (computeMinPayment(c) ?? 0), 0);

  const cardAccounts = cards.filter((c) => c.type === 'card' && (c.creditLimit ?? 0) > 0 && c.balance > 0);
  const totalCardBalance = cardAccounts.reduce((s, c) => s + c.balance, 0);
  const totalCardLimit = cardAccounts.reduce((s, c) => s + (c.creditLimit ?? 0), 0);

  const hasDTI = monthlyIncome > 0 && monthlyMinPayments > 0;
  const hasUtil = totalCardLimit > 0;
  if (!hasDTI && !hasUtil) return null;

  const dti = hasDTI ? (monthlyMinPayments / monthlyIncome) * 100 : null;
  const util = hasUtil ? (totalCardBalance / totalCardLimit) * 100 : null;

  const dtiColor = dti == null ? '' : dti < 36 ? 'var(--ff-green)' : dti < 43 ? 'var(--ff-rust)' : 'var(--color-danger)';
  const dtiLabel = dti == null ? '' : dti < 36 ? 'Healthy' : dti < 43 ? 'Elevated' : 'High';
  const utilColor = util == null ? '' : util < 30 ? 'var(--ff-green)' : util < 50 ? 'var(--ff-rust)' : 'var(--color-danger)';
  const utilLabel = util == null ? '' : util < 30 ? 'Good' : util < 50 ? 'Fair' : 'High';

  const row = document.createElement('div');
  row.className = 'dashboard-health-row';
  row.setAttribute('data-testid', 'financial-health-row');

  if (hasDTI && dti != null) {
    const chip = document.createElement('div');
    chip.className = 'health-chip';
    chip.setAttribute('data-testid', 'dti-chip');
    chip.setAttribute('title', 'Debt-to-Income Ratio: monthly minimum debt payments ÷ monthly income. Under 36% is healthy; above 43% is high.');
    chip.innerHTML = `
      <span class="health-chip-label">Debt-to-Income</span>
      <span class="health-chip-value" style="color:${dtiColor}" data-testid="dti-value">${dti.toFixed(0)}%</span>
      <span class="health-chip-tag" style="background:${dtiColor}20;color:${dtiColor}">${dtiLabel}</span>
    `;
    row.appendChild(chip);
  }

  if (hasUtil && util != null) {
    const utilHealth = util < 30 ? 'good' : util < 50 ? 'amber' : 'high';
    const chip = document.createElement('div');
    chip.className = 'health-chip';
    chip.setAttribute('data-testid', 'util-chip');
    chip.setAttribute('data-health', utilHealth);
    chip.setAttribute('title', 'Credit Utilization: total card balance ÷ total credit limit. Under 30% is good for your credit score.');
    chip.innerHTML = `
      <span class="health-chip-label">Credit Utilization</span>
      <span class="health-chip-value" style="color:${utilColor}" data-testid="util-value">${util.toFixed(0)}%</span>
      <span class="health-chip-tag" style="background:${utilColor}20;color:${utilColor}">${utilLabel}</span>
    `;
    row.appendChild(chip);
  }

  return row;
}

export function buildIncomeByAccountCard(
  sources: IncomeSource[],
  bankAccounts: BankAccount[],
  viewYear: number,
  viewMonth: number,
): HTMLElement | null {
  const assignedSources = sources.filter((s) => s.active && s.bankAccountId);
  if (assignedSources.length === 0 || bankAccounts.length === 0) return null;

  const accountMap = new Map(bankAccounts.map((a) => [a.id, a]));

  const monthStart = new Date(viewYear, viewMonth, 1).getTime();
  const monthEnd = new Date(viewYear, viewMonth + 1, 1).getTime();

  type RowData = { account: BankAccount | null; monthlyRecurring: number; oneTimeThisMonth: number };
  const rows = new Map<string, RowData>();

  sources.forEach((s) => {
    if (!s.active) return;
    const key = s.bankAccountId ?? '__none__';
    const row = rows.get(key) ?? { account: accountMap.get(s.bankAccountId ?? '') ?? null, monthlyRecurring: 0, oneTimeThisMonth: 0 };
    if (s.frequency === 'once') {
      if (s.date !== undefined && s.date >= monthStart && s.date < monthEnd) {
        row.oneTimeThisMonth += s.amount;
      }
    } else {
      row.monthlyRecurring += sourceMonthly(s);
    }
    rows.set(key, row);
  });

  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('data-testid', 'income-by-account-card');

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4)';
  const title = document.createElement('h2');
  title.className = 'font-serif';
  title.style.fontSize = 'var(--text-xl)';
  title.textContent = 'Income by Account';
  const manageLink = document.createElement('a');
  manageLink.href = '#/accounts';
  manageLink.dataset['route'] = '/accounts';
  manageLink.style.cssText = 'font-size:var(--text-sm)';
  manageLink.textContent = 'Manage →';
  manageLink.addEventListener('click', (e) => { e.preventDefault(); navigate('/accounts'); });
  header.appendChild(title);
  header.appendChild(manageLink);
  card.appendChild(header);

  const rowStyle = 'display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) var(--space-1);border-bottom:1px solid var(--color-border)';

  rows.forEach((data) => {
    const total = data.monthlyRecurring + data.oneTimeThisMonth;
    if (total === 0) return;

    const row = document.createElement('div');
    row.style.cssText = rowStyle;
    row.setAttribute('data-testid', 'income-by-account-row');

    const nameCol = document.createElement('div');
    const name = data.account ? data.account.name : 'Unassigned';
    nameCol.innerHTML = `<span class="text-sm font-bold">${name}</span>`;
    if (data.account) {
      const badge = document.createElement('span');
      badge.className = 'text-xs text-muted';
      badge.style.cssText = 'display:block;text-transform:capitalize';
      badge.textContent = data.account.accountType.replace('-', ' ');
      nameCol.appendChild(badge);
    }

    const amtCol = document.createElement('div');
    amtCol.style.cssText = 'text-align:right';
    amtCol.innerHTML = `<span class="text-sm font-bold" style="color:var(--ff-green)">${fmt.format(data.monthlyRecurring)}<span class="text-xs text-muted">/mo</span></span>`;
    if (data.oneTimeThisMonth > 0) {
      const ot = document.createElement('span');
      ot.className = 'text-xs text-muted';
      ot.style.display = 'block';
      ot.textContent = `+${fmt.format(data.oneTimeThisMonth)} this month`;
      amtCol.appendChild(ot);
    }

    row.appendChild(nameCol);
    row.appendChild(amtCol);
    card.appendChild(row);
  });

  return card;
}

export function renderIncomePanel(
  sources: IncomeSource[],
  viewYear: number,
  viewMonth: number,
): string {
  const recurring = sources.filter((s) => s.active && s.frequency !== 'once');

  const monthStart = new Date(viewYear, viewMonth, 1).getTime();
  const monthEnd = new Date(viewYear, viewMonth + 1, 1).getTime();
  const oneTime = sources.filter(
    (s) => s.frequency === 'once' && s.date !== undefined && s.date >= monthStart && s.date < monthEnd,
  );

  if (recurring.length === 0 && oneTime.length === 0) {
    return `
      <div class="empty-state">
        <span class="empty-state-icon">💰</span>
        <h3>No income sources yet</h3>
        <p>Add your income sources to start building your budget picture.</p>
        <a href="#/income" class="btn btn-primary" data-route="/income" style="text-decoration:none">Add income →</a>
      </div>
    `;
  }

  const hasBoth = recurring.length > 0 && oneTime.length > 0;
  const rowStyle = 'display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) 0;border-bottom:1px solid var(--color-border)';
  const subLabelStyle = 'font-size:var(--text-xs);font-weight:var(--weight-bold);text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);padding:var(--space-2) 0 var(--space-1)';

  let html = '';

  if (hasBoth) html += `<div style="${subLabelStyle}">Recurring</div>`;
  html += recurring.slice(0, 5).map((s) => `
    <div style="${rowStyle}">
      <span class="text-sm">${s.name}</span>
      <span class="text-sm font-bold">${fmt.format(s.amount)} / ${s.frequency}</span>
    </div>
  `).join('');

  if (oneTime.length > 0) {
    if (hasBoth) html += `<div style="${subLabelStyle};margin-top:var(--space-2)">One-time this month</div>`;
    html += oneTime.map((s) => {
      const dateStr = s.date
        ? new Date(s.date).toLocaleDateString(userLocale, { month: 'short', day: 'numeric' })
        : '';
      return `
        <div style="${rowStyle}">
          <div>
            <span class="text-sm">${s.name}</span>
            ${dateStr ? `<span class="text-xs text-muted" style="display:block">${dateStr}</span>` : ''}
          </div>
          <span class="text-sm font-bold" style="color:var(--ff-green)">+${fmt.format(s.amount)}</span>
        </div>
      `;
    }).join('');
  }

  return html;
}

export function renderDebtPanel(cards: DebtAccount[]): string {
  if (cards.length === 0) {
    return `
      <div class="empty-state">
        <span class="empty-state-icon">💳</span>
        <h3>No accounts added yet</h3>
        <p>Add your debt accounts to see payoff scenarios and interest calculations.</p>
        <a href="#/debt" class="btn btn-primary" data-route="/debt" style="text-decoration:none">Add account →</a>
      </div>
    `;
  }
  return cards
    .slice(0, 5)
    .map(
      (c) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) 0;border-bottom:1px solid var(--color-border)">
        <div>
          <span class="text-sm font-bold">${c.name}</span>
          <span class="text-xs text-muted" style="display:block">${c.apr}% APR</span>
        </div>
        <span class="text-sm" style="color:var(--color-danger)">${fmtCents.format(c.balance)}</span>
      </div>
    `,
    )
    .join('');
}
