import {
  getMembers as _getMembers, getBankAccounts, getExpenses,
  saveExpense, saveBankAccount,
  deleteMember, deleteIncomeSource, createMember, saveMember, saveIncomeSource,
} from '@/db';
import { sourceMonthly, fmt, fmtCents, FREQUENCY_LABELS } from '@/utils/finance';
import { escapeHtml } from '@/utils/escapeHtml';
import { openAddNotificationModal } from '@/utils/notificationModal';
import type { HouseholdMember, IncomeSource, BankAccount } from '@/types';
import { userLocale } from '@/utils/locale';

export type IncomePanelContext = {
  members: HouseholdMember[];
  sources: IncomeSource[];
  bankAccounts: BankAccount[];
  viewYear: number;
  viewMonth: number;
  onLoad: () => Promise<void>;
  onEditSource: (existing?: IncomeSource) => void;
};

export function buildYtdPanel(sources: IncomeSource[]): HTMLElement | null {
  const now = new Date();
  const year = now.getFullYear();
  const yearStart = new Date(year, 0, 1).getTime();
  const yearEnd   = new Date(year, 11, 31, 23, 59, 59, 999).getTime();
  const todayEnd  = new Date(year, now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  const activeSources = sources.filter((s) => s.active && s.frequency !== 'once');
  const oneTimeSources = sources.filter(
    (s) => s.frequency === 'once' && s.date != null && s.date >= yearStart && s.date <= yearEnd,
  );

  if (activeSources.length === 0 && oneTimeSources.length === 0) return null;

  const completedMonths = now.getMonth();
  const daysInCurrentMonth = new Date(year, now.getMonth() + 1, 0).getDate();
  const monthsElapsed = completedMonths + now.getDate() / daysInCurrentMonth;

  const ytdRecurring = activeSources.reduce((sum, s) => sum + sourceMonthly(s) * monthsElapsed, 0);
  const ytdOneTime   = oneTimeSources
    .filter((s) => s.date! <= todayEnd)
    .reduce((sum, s) => sum + s.amount, 0);
  const ytdTotal = ytdRecurring + ytdOneTime;

  const projRecurring = activeSources.reduce((sum, s) => sum + sourceMonthly(s) * 12, 0);
  const projOneTime   = oneTimeSources.reduce((sum, s) => sum + s.amount, 0);
  const projTotal     = projRecurring + projOneTime;

  const todayLabel = now.toLocaleDateString(userLocale, { month: 'short', day: 'numeric' });

  const panel = document.createElement('div');
  panel.className = 'income-ytd-bar';

  const makeBlock = (label: string, value: number, sub: string): HTMLElement => {
    const block = document.createElement('div');
    block.className = 'income-ytd-block';
    block.innerHTML = `
      <div class="income-ytd-label">${label}</div>
      <div class="income-ytd-value">${fmt.format(value)}</div>
      <div class="income-ytd-sub">${sub}</div>
    `;
    return block;
  };

  panel.appendChild(makeBlock('Year-to-Date Income', ytdTotal, `Jan 1–${todayLabel}, ${year}`));

  const divider = document.createElement('div');
  divider.className = 'income-ytd-divider';
  panel.appendChild(divider);

  panel.appendChild(makeBlock(`Projected ${year}`, projTotal, 'Full-year estimate · assumes no changes'));

  return panel;
}

export function buildMembersCard(ctx: IncomePanelContext): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';

  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4)';
  titleRow.innerHTML = '<h2 class="font-serif" style="font-size:var(--text-xl)">Household Members</h2>';

  const list = document.createElement('div');
  list.className = 'members-list';

  ctx.members.forEach((m) => {
    const chip = document.createElement('div');
    chip.className = 'member-chip';
    chip.setAttribute('data-testid', 'income-member-chip');
    chip.setAttribute('data-member-id', m.id);
    const nameSpan = document.createElement('span');
    nameSpan.textContent = m.name;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'member-chip-remove';
    removeBtn.setAttribute('aria-label', `Remove ${m.name}`);
    removeBtn.setAttribute('data-id', m.id);
    removeBtn.setAttribute('data-testid', 'income-member-remove');
    removeBtn.setAttribute('title', 'Remove');
    removeBtn.textContent = '✕';
    chip.appendChild(nameSpan);
    chip.appendChild(removeBtn);
    removeBtn.addEventListener('click', async () => {
      if (!confirm(`Remove "${m.name}"? Their income sources will also be removed.`)) return;
      const toDelete = ctx.sources.filter((s) => s.memberId === m.id);
      const [allAccounts, allExpenses] = await Promise.all([getBankAccounts(), getExpenses()]);
      await Promise.all([
        ...toDelete.map((s) => deleteIncomeSource(s.id)),
        ...allAccounts.filter((a) => a.memberId === m.id).map(({ memberId: _, ...a }) => saveBankAccount(a)),
        ...allExpenses.filter((e) => e.memberId === m.id).map((e) => saveExpense({ ...e, memberId: null })),
      ]);
      await deleteMember(m.id);
      await ctx.onLoad();
    });
    list.appendChild(chip);
  });

  const addRow = document.createElement('div');
  addRow.className = 'add-member-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Member name...';
  input.maxLength = 48;
  input.setAttribute('data-testid', 'income-add-member-input');
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-secondary';
  addBtn.style.whiteSpace = 'nowrap';
  addBtn.setAttribute('data-testid', 'income-add-member-btn');
  addBtn.textContent = '+ Add member';

  const doAdd = async () => {
    const name = input.value.trim();
    if (!name) return;
    const member = createMember(name);
    await saveMember(member);
    input.value = '';
    await ctx.onLoad();
  };

  addBtn.addEventListener('click', doAdd);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void doAdd(); });
  addRow.appendChild(input);
  addRow.appendChild(addBtn);

  card.appendChild(titleRow);
  card.appendChild(list);
  card.appendChild(addRow);
  return card;
}

export function buildSourcesCard(ctx: IncomePanelContext): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';

  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-6)';
  titleRow.innerHTML = '<h2 class="font-serif" style="font-size:var(--text-xl)">Income Sources</h2>';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary';
  addBtn.setAttribute('data-testid', 'income-add-source-btn');
  addBtn.textContent = '+ Add source';
  addBtn.addEventListener('click', () => ctx.onEditSource());
  titleRow.appendChild(addBtn);
  card.appendChild(titleRow);

  if (ctx.sources.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <span class="empty-state-icon">💰</span>
      <h3>No income sources yet</h3>
      <p>Add your salary, wages, side income — anything that brings money in.</p>
    `;
    card.appendChild(empty);
    return card;
  }

  const monthStart = new Date(ctx.viewYear, ctx.viewMonth, 1).getTime();
  const monthEnd   = new Date(ctx.viewYear, ctx.viewMonth + 1, 0, 23, 59, 59, 999).getTime();

  let anyVisible = false;

  ctx.members.forEach((member) => {
    const memberSources = ctx.sources.filter((s) => {
      if (s.memberId !== member.id) return false;
      if (s.frequency !== 'once') return true;
      return s.date != null && s.date >= monthStart && s.date <= monthEnd;
    });
    if (memberSources.length === 0) return;
    anyVisible = true;

    const memberRecurring = memberSources
      .filter((s) => s.active && s.frequency !== 'once')
      .reduce((sum, s) => sum + sourceMonthly(s), 0);
    const memberOneTime = memberSources
      .filter((s) => s.frequency === 'once')
      .reduce((sum, s) => sum + s.amount, 0);
    const memberTotal = memberRecurring + memberOneTime;

    const totalLabel = memberOneTime > 0
      ? `${fmt.format(memberRecurring)}<span class="text-xs text-muted">/mo</span> + ${fmt.format(memberOneTime)}`
      : `${fmt.format(memberRecurring)}<span class="text-xs text-muted">/mo</span>`;

    const group = document.createElement('div');
    group.className = 'source-group';

    const groupHeader = document.createElement('div');
    groupHeader.className = 'source-group-header';
    groupHeader.innerHTML = `
      <span>${escapeHtml(member.name)}</span>
      <span style="color:var(--ff-green)">${memberOneTime > 0 ? fmt.format(memberTotal) : totalLabel}</span>
    `;
    group.appendChild(groupHeader);

    memberSources.forEach((source) => {
      group.appendChild(buildSourceRow(source, ctx));
    });

    card.appendChild(group);
  });

  if (!anyVisible) {
    const empty = document.createElement('p');
    empty.className = 'text-sm text-muted';
    empty.style.padding = 'var(--space-2) 0';
    empty.textContent = 'No one-time income recorded for this month.';
    card.appendChild(empty);
  }

  return card;
}

function buildSourceRow(source: IncomeSource, ctx: IncomePanelContext): HTMLElement {
  const row = document.createElement('div');
  row.className = 'source-row';
  row.setAttribute('data-testid', 'income-source-row');
  row.setAttribute('data-source-id', source.id);

  const isOnce = source.frequency === 'once';
  const isUnequal = source.frequency === 'semimonthly' && source.amount2 != null;
  const monthly = sourceMonthly(source);
  const dateStr = isOnce && source.date
    ? new Date(source.date).toLocaleDateString(userLocale, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  const amountDisplay = source.payType === 'hourly' && source.hourlyRate && source.hoursPerWeek
    ? `${fmtCents.format(source.hourlyRate)}/hr · ${source.hoursPerWeek}h/wk`
    : isUnequal
      ? `${fmtCents.format(source.amount)} / ${fmtCents.format(source.amount2!)}`
      : fmtCents.format(source.amount);

  row.innerHTML = `
    <div class="source-row-name">
      ${source.name}
      ${!source.active && !isOnce ? '<span class="inactive-badge">Inactive</span>' : ''}
      ${isOnce ? '<span class="inactive-badge one-time-badge">One-time</span>' : ''}
    </div>
    <div class="source-row-amount">${amountDisplay}</div>
    <div class="source-row-freq">${dateStr ?? FREQUENCY_LABELS[source.frequency]}</div>
    <div class="source-row-monthly">${isOnce ? '' : `≈ ${fmt.format(monthly)}/mo`}</div>
    <div class="source-row-actions">
      <button class="icon-btn" data-action="notif" title="Add reminder">🔔</button>
      <button class="icon-btn" data-action="edit" data-testid="income-source-edit" title="Edit">✏️</button>
      ${!isOnce ? `<button class="icon-btn" data-action="toggle" data-testid="income-source-toggle" title="${source.active ? 'Deactivate' : 'Activate'}">${source.active ? '⏸' : '▶️'}</button>` : ''}
      <button class="icon-btn danger" data-action="delete" data-testid="income-source-delete" title="Delete">🗑️</button>
    </div>
  `;

  row.querySelector('[data-action="notif"]')!.addEventListener('click', () => {
    openAddNotificationModal({ label: source.name, defaultTrigger: 'monthly-day' });
  });
  row.querySelector('[data-action="edit"]')!.addEventListener('click', () =>
    ctx.onEditSource(source),
  );

  if (!isOnce) {
    row.querySelector('[data-action="toggle"]')!.addEventListener('click', async () => {
      await saveIncomeSource({ ...source, active: !source.active, updatedAt: Date.now() });
      await ctx.onLoad();
    });
  }

  row.querySelector('[data-action="delete"]')!.addEventListener('click', async () => {
    if (!confirm(`Delete "${source.name}"?`)) return;
    await deleteIncomeSource(source.id);
    await ctx.onLoad();
  });

  return row;
}
