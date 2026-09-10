import { navigate } from '@/app/router';
import { openFormModal } from '@/components/Modal';
import { saveCategory } from '@/db';
import { fmtCents, toMonthly } from '@/utils/finance';
import type { ExpenseCategory, Expense, CardCharge, BankAccount, DebtAccount } from '@/types';
import { userLocale } from '@/utils/locale';

export type BudgetBucketsContext = {
  accounts: BankAccount[];
  debtAccounts: DebtAccount[];
  onReload: () => void;
};

function buildBucketSVG(_color: string, fillPct: number, isOver: boolean): string {
  const clamped = Math.min(fillPct, 1);
  const id = `bclip-${Math.random().toString(36).slice(2, 9)}`;
  const bucketH = 80;
  const fillY = 22 + bucketH * (1 - clamped);
  const fillH = bucketH * clamped;

  const gradTop = isOver ? '#FCA5A5' : fillPct >= 0.7 ? '#FDE68A' : '#93C5FD';
  const gradBot = isOver ? '#DC2626' : fillPct >= 0.7 ? '#B45309' : '#1D4ED8';

  const lx = (y: number) => (6 - (y - 22) * 6 / 80).toFixed(1);
  const rx = (y: number) => (74 + (y - 22) * 6 / 80).toFixed(1);

  const topBand = `M ${lx(22)} 22 Q 40 20 ${rx(22)} 22 L ${rx(28)} 28 Q 40 26 ${lx(28)} 28 Z`;
  const midBand = `M ${lx(60)} 60 Q 40 58 ${rx(60)} 60 L ${rx(65)} 65 Q 40 63 ${lx(65)} 65 Z`;

  const wave = clamped > 0.03
    ? `<path d="M 0 ${fillY.toFixed(1)} Q 20 ${(fillY - 3).toFixed(1)} 40 ${fillY.toFixed(1)} Q 60 ${(fillY + 3).toFixed(1)} 80 ${fillY.toFixed(1)} L 80 102 L 0 102 Z" fill="white" opacity="0.15"/>`
    : '';

  const overLabel = isOver
    ? `<text x="40" y="68" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="system-ui">OVER</text>`
    : '';

  return `<svg viewBox="0 0 80 112" xmlns="http://www.w3.org/2000/svg" fill="none" class="bucket-svg" aria-hidden="true">
    <defs>
      <clipPath id="${id}"><polygon points="6,22 74,22 80,102 0,102"/></clipPath>
      <linearGradient id="${id}-wg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="${gradTop}" stop-opacity="0.92"/>
        <stop offset="100%" stop-color="${gradBot}" stop-opacity="0.97"/>
      </linearGradient>
    </defs>
    <!-- Wood body -->
    <polygon points="6,22 74,22 80,102 0,102" fill="#8B5E3C"/>
    <!-- Slats -->
    <g clip-path="url(#${id})">
      <line x1="20" y1="22" x2="16" y2="102" stroke="#5C3A18" stroke-width="1.5" opacity="0.38"/>
      <line x1="30" y1="22" x2="28" y2="102" stroke="#5C3A18" stroke-width="1.5" opacity="0.38"/>
      <line x1="40" y1="22" x2="40" y2="102" stroke="#5C3A18" stroke-width="1.5" opacity="0.38"/>
      <line x1="50" y1="22" x2="52" y2="102" stroke="#5C3A18" stroke-width="1.5" opacity="0.38"/>
      <line x1="60" y1="22" x2="64" y2="102" stroke="#5C3A18" stroke-width="1.5" opacity="0.38"/>
    </g>
    <!-- Water fill -->
    ${clamped > 0 ? `<g clip-path="url(#${id})">
      <rect x="0" y="${fillY.toFixed(1)}" width="80" height="${Math.max(fillH, 0.1).toFixed(1)}" fill="url(#${id}-wg)"/>
      ${wave}
    </g>` : ''}
    <!-- Metal bands (drawn over water) -->
    <path d="${topBand}" fill="#C9A84C" opacity="0.92"/>
    <path d="${midBand}" fill="#C9A84C" opacity="0.85"/>
    <!-- Outline and bottom arc -->
    <polygon points="6,22 74,22 80,102 0,102" stroke="#3D1F08" stroke-width="2" fill="none"/>
    <path d="M 0 102 Q 40 110 80 102" fill="none" stroke="#3D1F08" stroke-width="2.5" stroke-linecap="round"/>
    <!-- Handle with gold rivets -->
    <path d="M 20 22 Q 40 6 60 22" stroke="#6B3A1F" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <circle cx="20" cy="22" r="3.5" fill="#C9A84C"/>
    <circle cx="60" cy="22" r="3.5" fill="#C9A84C"/>
    ${overLabel}
  </svg>`;
}

export function renderBuckets(
  categories: ExpenseCategory[],
  recurringExpenses: Expense[],
  monthlyIncome: number,
  monthCharges: CardCharge[],
  ctx: BudgetBucketsContext,
): HTMLElement | null {
  if (categories.length === 0) return null;

  const budgeted = categories.filter((c) => c.monthlyBudget != null && c.monthlyBudget > 0);
  const unbudgeted = categories.filter((c) => !c.monthlyBudget);

  if (budgeted.length === 0 && unbudgeted.length === 0) return null;

  const spendByCat = new Map<string, number>();
  recurringExpenses.forEach((e) => {
    const key = e.categoryId || '__none__';
    spendByCat.set(key, (spendByCat.get(key) ?? 0) + toMonthly(e.amount, e.recurringFrequency ?? 'monthly'));
  });
  monthCharges.forEach((c) => {
    const key = c.categoryId || '__none__';
    spendByCat.set(key, (spendByCat.get(key) ?? 0) + c.amount);
  });

  const totalBudgeted = budgeted.reduce((s, c) => s + (c.monthlyBudget ?? 0), 0);
  const unassigned = monthlyIncome - totalBudgeted;

  const section = document.createElement('div');
  section.className = 'card buckets-section';
  section.setAttribute('data-testid', 'buckets-section');

  const header = document.createElement('div');
  header.className = 'buckets-header';

  const titleEl = document.createElement('div');
  titleEl.innerHTML = `
    <h2 class="font-serif" style="font-size:var(--text-xl)">Spending Buckets</h2>
    <p class="text-muted text-sm" style="margin-top:var(--space-1)">
      Set a monthly budget on each category to fill your pails.
    </p>
  `;
  header.appendChild(titleEl);

  if (monthlyIncome > 0 && budgeted.length > 0) {
    const assignColor = unassigned > 0 ? '--positive' : unassigned < 0 ? '--negative' : '--zero';
    const counter = document.createElement('div');
    counter.className = 'buckets-assign-counter';
    counter.setAttribute('data-testid', 'buckets-unassigned');
    counter.innerHTML = `
      <span class="buckets-assign-label">To Assign</span>
      <span class="buckets-assign-value buckets-assign-value${assignColor}" data-testid="buckets-unassigned-value">
        ${unassigned >= 0 ? '' : '-'}${fmtCents.format(Math.abs(unassigned))}
      </span>
    `;
    header.appendChild(counter);
  }
  section.appendChild(header);

  if (budgeted.length > 0) {
    const grid = document.createElement('div');
    grid.className = 'buckets-grid';
    grid.setAttribute('data-testid', 'buckets-grid');

    budgeted.forEach((cat) => {
      const spent = spendByCat.get(cat.id) ?? 0;
      const budget = cat.monthlyBudget!;
      const pct = budget > 0 ? spent / budget : 0;
      const isOver = pct > 1;
      const pctClass = isOver ? 'bucket-pct--over' : pct >= 0.7 ? 'bucket-pct--warning' : 'bucket-pct--ok';

      const item = document.createElement('div');
      item.className = 'bucket-item';
      item.setAttribute('data-testid', 'bucket-item');
      item.setAttribute('data-category-id', cat.id);
      item.setAttribute('title', `${cat.name}: ${fmtCents.format(spent)} / ${fmtCents.format(budget)} · Click to edit budget`);

      item.innerHTML = `
        ${buildBucketSVG(cat.color, pct, isOver)}
        <div class="bucket-info">
          <div class="bucket-name">${cat.name}</div>
          <div class="bucket-amounts">${fmtCents.format(spent)} / ${fmtCents.format(budget)}</div>
          <div class="bucket-pct ${pctClass}">${Math.round(pct * 100)}%</div>
        </div>
      `;

      const catExpenses = recurringExpenses.filter((e) => e.categoryId === cat.id);
      const catCharges = monthCharges.filter((c) => c.categoryId === cat.id);
      item.addEventListener('click', () => openBudgetEditor(cat, catExpenses, catCharges, ctx));

      grid.appendChild(item);
    });

    section.appendChild(grid);
  }

  if (unbudgeted.length > 0) {
    const unbudgetedWrap = document.createElement('div');
    unbudgetedWrap.className = 'buckets-unbudgeted';
    const label = document.createElement('div');
    label.className = 'unbudgeted-label';
    label.textContent = 'No budget set';
    unbudgetedWrap.appendChild(label);

    const list = document.createElement('div');
    list.className = 'unbudgeted-list';

    unbudgeted.forEach((cat) => {
      const pill = document.createElement('button');
      pill.className = 'unbudgeted-pill';
      pill.setAttribute('data-testid', 'unbudgeted-pill');
      pill.setAttribute('data-category-id', cat.id);
      pill.innerHTML = `
        <span class="unbudgeted-pill-dot" style="background:${cat.color}"></span>
        <span>${cat.name}</span>
        <span class="unbudgeted-pill-add">+ Set budget</span>
      `;
      const catExpenses = recurringExpenses.filter((e) => e.categoryId === cat.id);
      const catCharges = monthCharges.filter((c) => c.categoryId === cat.id);
      pill.addEventListener('click', () => openBudgetEditor(cat, catExpenses, catCharges, ctx));
      list.appendChild(pill);
    });

    unbudgetedWrap.appendChild(list);
    section.appendChild(unbudgetedWrap);
  }

  return section;
}

export function openBudgetEditor(
  cat: ExpenseCategory,
  catExpenses: Expense[],
  catCharges: CardCharge[],
  ctx: BudgetBucketsContext,
): void {
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';
  body.innerHTML = `
    <p class="text-sm text-muted">
      Set how many dollars you want to pour into the <strong>${cat.name}</strong> bucket each month.
    </p>
    <div class="form-group">
      <label class="form-label" for="be-budget">Monthly budget</label>
      <input id="be-budget" type="number" min="0" step="0.01"
        value="${cat.monthlyBudget ?? ''}" placeholder="0.00"
        title="Monthly spending cap for this category — the budget bar turns red when spending exceeds this amount. Leave blank to remove the cap." />
      <span class="form-hint">Leave empty to remove this bucket's cap.</span>
    </div>
  `;

  const freqLabels: Record<string, string> = {
    monthly: 'monthly', weekly: 'weekly', biweekly: 'bi-weekly',
    semimonthly: 'twice/mo', quarterly: 'quarterly', annually: 'annually',
  };

  const recurringTotal = catExpenses.reduce(
    (s, e) => s + toMonthly(e.amount, e.recurringFrequency ?? 'monthly'), 0,
  );
  const chargesTotal = catCharges.reduce((s, c) => s + c.amount, 0);
  const spendingTotal = recurringTotal + chargesTotal;

  const ledger = document.createElement('div');
  ledger.className = 'be-spending-ledger';

  const header = document.createElement('div');
  header.className = 'be-spending-header';
  const titleEl = document.createElement('span');
  titleEl.className = 'be-spending-title';
  titleEl.textContent = 'This Month\'s Spending';
  const totalEl = document.createElement('span');
  totalEl.className = 'be-spending-total';
  totalEl.textContent = fmtCents.format(spendingTotal);
  header.append(titleEl, totalEl);
  ledger.appendChild(header);

  const modalRef: { close?: () => void } = {};

  const goTo = (
    route: '/accounts' | '/debt',
    id: string,
    extraKey?: string,
    extraVal?: string,
  ) => {
    modalRef.close?.();
    sessionStorage.setItem(route === '/accounts' ? 'cal-focus-bank' : 'cal-focus-account', id);
    if (extraKey && extraVal) sessionStorage.setItem(extraKey, extraVal);
    navigate(route);
  };

  type NavTarget = { route: '/accounts' | '/debt'; id: string; label: string; icon: string } | null;

  const addRow = (
    meta: string,
    desc: string,
    amount: number,
    onItemClick: (() => void) | null,
    src: NavTarget,
  ) => {
    const row = document.createElement('div');
    row.className = 'be-spending-row';

    const metaEl = document.createElement('span');
    metaEl.className = 'be-spending-meta';
    metaEl.textContent = meta;

    const itemEl = document.createElement('button');
    itemEl.type = 'button';
    itemEl.className = onItemClick ? 'be-spending-item be-spending-item--link' : 'be-spending-item';
    itemEl.textContent = desc;
    if (onItemClick) itemEl.addEventListener('click', (e) => { e.stopPropagation(); onItemClick(); });

    const srcEl = document.createElement('span');
    srcEl.className = 'be-spending-src';
    if (src) {
      const srcBtn = document.createElement('button');
      srcBtn.type = 'button';
      srcBtn.className = 'be-spending-src-link';
      srcBtn.textContent = `${src.icon} ${src.label}`;
      srcBtn.addEventListener('click', (e) => { e.stopPropagation(); goTo(src.route, src.id); });
      srcEl.appendChild(srcBtn);
    }

    const amtEl = document.createElement('span');
    amtEl.className = 'be-spending-amount';
    amtEl.textContent = fmtCents.format(amount);

    row.append(metaEl, itemEl, srcEl, amtEl);
    ledger.appendChild(row);
  };

  if (catExpenses.length === 0 && catCharges.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'be-spending-empty';
    empty.textContent = 'No spending recorded this month.';
    ledger.appendChild(empty);
  } else {
    if (catExpenses.length > 0) {
      const groupLabel = document.createElement('div');
      groupLabel.className = 'be-spending-group-label';
      groupLabel.textContent = 'Recurring Expenses';
      ledger.appendChild(groupLabel);
      catExpenses.forEach((e) => {
        const monthly = toMonthly(e.amount, e.recurringFrequency ?? 'monthly');
        const freq = e.recurringFrequency
          ? (freqLabels[e.recurringFrequency] ?? e.recurringFrequency)
          : 'one-time';
        let src: NavTarget = null;
        let onItemClick: (() => void) | null = null;
        if (e.bankAccountId) {
          const acct = ctx.accounts.find((a) => a.id === e.bankAccountId);
          if (acct) {
            src = { route: '/accounts', id: acct.id, label: acct.name, icon: '🏦' };
            onItemClick = () => goTo('/accounts', acct.id, 'ff-focus-ledger-bank', e.id);
          }
        } else if (e.linkedCardId) {
          const card = ctx.debtAccounts.find((d) => d.id === e.linkedCardId);
          if (card) {
            src = { route: '/debt', id: card.id, label: card.name, icon: '💳' };
            onItemClick = () => goTo('/debt', card.id);
          }
        }
        addRow(freq, e.description, monthly, onItemClick, src);
      });
    }

    if (catCharges.length > 0) {
      const groupLabel = document.createElement('div');
      groupLabel.className = 'be-spending-group-label';
      groupLabel.textContent = 'Charges';
      ledger.appendChild(groupLabel);
      [...catCharges]
        .sort((a, b) => b.date - a.date)
        .forEach((c) => {
          const dateStr = new Date(c.date).toLocaleDateString(userLocale, {
            month: 'short', day: 'numeric',
          });
          const card = ctx.debtAccounts.find((d) => d.id === c.accountId);
          const src: NavTarget = card
            ? { route: '/debt', id: card.id, label: card.name, icon: '💳' }
            : null;
          const onItemClick = card
            ? () => goTo('/debt', card.id, 'ff-focus-charge', c.id)
            : null;
          addRow(dateStr, c.merchant, c.amount, onItemClick, src);
        });
    }
  }

  body.appendChild(ledger);

  const { close } = openFormModal({
    title: `Budget — ${cat.name}`,
    body,
    submitLabel: 'Save',
    onSubmit: async (close) => {
      const raw = parseFloat(body.querySelector<HTMLInputElement>('#be-budget')!.value);
      const updated: ExpenseCategory = { ...cat };
      if (!isNaN(raw) && raw > 0) {
        updated.monthlyBudget = raw;
      } else {
        delete updated.monthlyBudget;
      }
      await saveCategory(updated);
      close();
      ctx.onReload();
    },
  });
  modalRef.close = close;
}
