import {
  saveDebtAccount, deleteDebtAccount,
  deleteDebtPayment, deleteCardCharge,
  getCategories, saveCategory,
  getExpenses, saveExpense,
  getExpensePaidRecords, saveExpensePaidRecord,
} from '@/db';
import { openImportWizard } from '@/components/ImportWizard';
import { fmtCents } from '@/utils/finance';
import { computePaymentStatus } from '@/utils/paymentStatus';
import { openAddNotificationModal } from '@/utils/notificationModal';
import { openDebtForm } from './DebtAccountForm';
import { openPaymentModal, buildPaymentHistoryPanel } from './DebtPayments';
import { buildChargesPanel } from './DebtCharges';
import type { BankAccount, CardCharge, DebtAccount, DebtAccountType, DebtPayment, ExpenseCategory, PaymentCycle } from '@/types';
import { userLocale } from '@/utils/locale';

const PAYMENT_CYCLE_LABELS: Record<PaymentCycle, string> = {
  weekly: 'Weekly', biweekly: 'Every 2 weeks', semimonthly: 'Twice monthly', monthly: 'Monthly',
};

const DEBT_TYPE_ICONS: Record<DebtAccountType, string> = {
  card: '💳', mortgage: '🏠', medical: '🏥', loan: '💼', vehicle: '🚗',
};

const HIGH_APR_THRESHOLD = 20;

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

type ChargesState = { page: number; pageSize: number; sortAsc: boolean };

type DebtListCallbacks = {
  onPaint: () => void;
  onLoad: () => Promise<void>;
  onDebtFormSaved: (account: DebtAccount, wasPaidOff: boolean) => Promise<void>;
};

function getSortedAccounts(accounts: DebtAccount[], sortMode: string): DebtAccount[] {
  const accs = [...accounts];
  switch (sortMode) {
    case 'priority-asc':
      return accs.sort((a, b) => {
        const pa = a.priority ?? null, pb = b.priority ?? null;
        if (pa !== null && pb !== null) return pa - pb;
        if (pa !== null) return -1;
        if (pb !== null) return 1;
        return 0;
      });
    case 'priority-desc':
      return accs.sort((a, b) => {
        const pa = a.priority ?? null, pb = b.priority ?? null;
        if (pa !== null && pb !== null) return pb - pa;
        if (pa !== null) return -1;
        if (pb !== null) return 1;
        return 0;
      });
    case 'balance-asc':  return accs.sort((a, b) => a.balance - b.balance);
    case 'balance-desc': return accs.sort((a, b) => b.balance - a.balance);
    case 'name-asc':     return accs.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc':    return accs.sort((a, b) => b.name.localeCompare(a.name));
    case 'due-asc':      return accs.sort((a, b) => (a.dueDay ?? 999) - (b.dueDay ?? 999));
    case 'due-desc':     return accs.sort((a, b) => (b.dueDay ?? 0) - (a.dueDay ?? 0));
    default:             return accs;
  }
}

function buildDebtRow(
  a: DebtAccount,
  payments: DebtPayment[],
  charges: CardCharge[],
  totalAccounts: number,
  accounts: DebtAccount[],
  expenseCategories: ExpenseCategory[],
  bankAccounts: BankAccount[],
  openChargesPanels: Set<string>,
  chargesPageState: Map<string, ChargesState>,
  callbacks: DebtListCallbacks,
  onResort: () => void,
): HTMLElement {
  const isCard = a.type === 'card';
  const util = isCard && (a.creditLimit ?? 0) > 0 ? a.balance / a.creditLimit! : 0;
  const utilPct = Math.round(util * 100);
  const utilClass = util >= 1 ? 'maxed' : util >= 0.8 ? 'high' : '';
  const needsSetup = a.minimumPaymentValue == null && a.balance > 0;
  const dueDayStr = a.dueDay ? `Due the ${a.dueDay}${ordinal(a.dueDay)}` : '';
  const icon = DEBT_TYPE_ICONS[a.type];

  const payStatus = computePaymentStatus(a, payments);
  const dueSoonLabel = payStatus.dueDayThisMonth
    ? `Due ${payStatus.dueDayThisMonth.toLocaleDateString(userLocale, { month: 'short', day: 'numeric' })}`
    : 'Due Soon';
  const statusBadge = (() => {
    switch (payStatus.currentMonth) {
      case 'paid': {
        const extraTxt = payStatus.currentMonthExtra > 0
          ? ` +${fmtCents.format(payStatus.currentMonthExtra)} extra`
          : '';
        return `<span class="debt-badge debt-badge--paid" data-testid="debt-badge-paid">✓ Paid${extraTxt}</span>`;
      }
      case 'past-due': return '<span class="debt-badge debt-badge--past-due" data-testid="debt-badge-past-due">⚠ Past Due</span>';
      case 'due-soon': return `<span class="debt-badge debt-badge--due-soon" data-testid="debt-badge-due-soon">⏰ ${dueSoonLabel}</span>`;
      case 'partial':  return '<span class="debt-badge debt-badge--partial" data-testid="debt-badge-partial">½ Partial</span>';
      default: return '';
    }
  })();

  const now = Date.now();
  const introActive = isCard && !!a.introAprEndDate && a.introAprEndDate > now;
  const highApr = a.apr >= HIGH_APR_THRESHOLD;
  const badges = [
    highApr && !introActive ? '<span class="debt-badge debt-badge--high-apr">High APR</span>' : '',
    introActive             ? '<span class="debt-badge debt-badge--intro">0% Intro</span>' : '',
    statusBadge,
  ].join('');

  const introEndStr = introActive
    ? new Date(a.introAprEndDate!).toLocaleDateString(userLocale, { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const aprDisplay = introActive
    ? `0% until ${introEndStr}, then ${a.apr}% APR`
    : `${a.apr}% APR`;
  const cycleDisplay = `${aprDisplay} · ${PAYMENT_CYCLE_LABELS[a.paymentCycle]}${dueDayStr ? ' · ' + dueDayStr : ''}`;

  const hasPayments = payments.length > 0;
  const hasCharges = charges.length > 0;

  const wrapClasses = ['debt-account-wrap'];
  if (needsSetup) wrapClasses.push('debt-account-wrap--needs-setup');
  if (payStatus.currentMonth === 'past-due') wrapClasses.push('debt-account-wrap--past-due');
  else if (payStatus.currentMonth === 'due-soon') wrapClasses.push('debt-account-wrap--due-soon');
  else if (payStatus.currentMonth === 'paid') wrapClasses.push('debt-account-wrap--paid');

  const wrap = document.createElement('div');
  wrap.className = wrapClasses.join(' ');
  wrap.setAttribute('data-account-id', a.id);
  wrap.setAttribute('data-testid', 'debt-account-wrap');

  const row = document.createElement('div');
  row.className = 'card-row';
  row.setAttribute('data-testid', 'debt-row');
  row.innerHTML = `
    <div class="card-row-info">
      <div class="card-row-name">
        <span class="card-row-name-text">${icon} ${a.name}</span>
        ${needsSetup ? '<span class="setup-badge">⚠ Needs payment info</span>' : ''}
        ${badges}
      </div>
      <div class="card-row-meta">
        <span class="card-row-apr">${cycleDisplay}</span>
        ${isCard && (a.creditLimit ?? 0) > 0 ? `
          <div class="util-bar-wrap">
            <div class="util-bar-fill ${utilClass}" style="width:${Math.min(utilPct, 100)}%"></div>
          </div>
          <span class="card-row-util-label">${utilPct}% used</span>
        ` : ''}
        ${isCard ? `<button class="btn-charges" data-action="charges" data-testid="debt-charges-btn" title="Log charges">🧾 ${hasCharges ? charges.length : '+Charges'}</button>` : ''}
        ${hasPayments ? `<button class="payment-history-btn" data-action="history" data-testid="payment-history-btn" title="Payment history">↓ ${payments.length}</button>` : ''}
      </div>
      ${needsSetup ? '<button class="btn btn-secondary btn-sm debt-setup-btn" data-action="setup" data-testid="debt-setup">Complete setup →</button>' : ''}
    </div>
    <div class="card-row-balance${a.balance === 0 ? ' card-row-balance--zero' : ''}" data-testid="debt-row-balance">${fmtCents.format(a.balance)}</div>
    <div class="card-row-actions">
      <span class="priority-slot"></span>
      <button class="btn-pay" data-action="pay" data-testid="debt-pay-btn">💰 Pay</button>
      ${isCard ? `<button class="btn-import" data-action="import" data-testid="debt-card-import-btn" title="Import charges from CSV">⬆ Import</button>` : ''}
      <button class="icon-btn" data-action="notif" title="Add reminder">🔔</button>
      <button class="icon-btn" data-action="edit" data-testid="debt-edit" title="Edit">✏️</button>
      <button class="icon-btn danger" data-action="delete" data-testid="debt-delete" title="Delete">🗑️</button>
    </div>
  `;

  wrap.appendChild(row);

  // ── Priority selector ───────────────────────────────────────────────────
  const prioritySel = document.createElement('select');
  prioritySel.className = 'priority-select';
  prioritySel.dataset['priorityFor'] = a.id;
  prioritySel.title = 'Set payoff priority';
  prioritySel.dataset['hasPriority'] = a.priority != null ? '1' : '0';
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '—';
  prioritySel.appendChild(noneOpt);
  for (let i = 1; i <= totalAccounts; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `#${i}`;
    if (a.priority === i) opt.selected = true;
    prioritySel.appendChild(opt);
  }
  prioritySel.addEventListener('change', async () => {
    const newPriority = prioritySel.value === '' ? null : parseInt(prioritySel.value, 10);
    const oldPriority = a.priority ?? null;
    if (newPriority === oldPriority) return;

    const conflict = newPriority !== null
      ? accounts.find((acc) => acc.id !== a.id && (acc.priority ?? null) === newPriority)
      : null;

    a.priority = newPriority;
    prioritySel.dataset['hasPriority'] = newPriority != null ? '1' : '0';

    if (conflict) {
      conflict.priority = oldPriority;
      const conflictSel = document.querySelector<HTMLSelectElement>(`[data-priority-for="${conflict.id}"]`);
      if (conflictSel) {
        conflictSel.value = oldPriority === null ? '' : String(oldPriority);
        conflictSel.dataset['hasPriority'] = oldPriority != null ? '1' : '0';
      }
    }

    const saves: Promise<void>[] = [saveDebtAccount(a)];
    if (conflict) saves.push(saveDebtAccount(conflict));
    await Promise.all(saves);
    onResort();
  });
  row.querySelector<HTMLElement>('.priority-slot')!.replaceWith(prioritySel);

  // Payment history panel (collapsed by default)
  let historyPanel: HTMLElement | null = null;
  if (hasPayments) {
    historyPanel = buildPaymentHistoryPanel(a, payments, bankAccounts, callbacks.onLoad);
    historyPanel.style.display = 'none';
    wrap.appendChild(historyPanel);

    const histBtn = row.querySelector<HTMLButtonElement>('[data-action="history"]')!;
    histBtn.addEventListener('click', () => {
      const open = historyPanel!.style.display !== 'none';
      historyPanel!.style.display = open ? 'none' : '';
      histBtn.textContent = open ? `↓ ${payments.length}` : `↑ ${payments.length}`;
    });
  }

  // Card charges panel — open state persists across re-renders
  let chargesPanel: HTMLElement | null = null;
  if (isCard) {
    const startOpen = openChargesPanels.has(a.id);

    chargesPanel = buildChargesPanel(
      a, charges, expenseCategories, chargesPageState,
      callbacks.onPaint,
      async (accountId) => { openChargesPanels.add(accountId); await callbacks.onLoad(); },
    );
    if (!startOpen) chargesPanel.style.display = 'none';
    wrap.appendChild(chargesPanel);

    const chargesBtn = row.querySelector<HTMLButtonElement>('[data-action="charges"]')!;
    if (startOpen) chargesBtn.textContent = `🧾 ↑`;
    chargesBtn.addEventListener('click', () => {
      const open = chargesPanel!.style.display !== 'none';
      chargesPanel!.style.display = open ? 'none' : '';
      if (open) openChargesPanels.delete(a.id);
      else openChargesPanels.add(a.id);
      chargesBtn.textContent = open
        ? `🧾 ${charges.length > 0 ? charges.length : '+Charges'}`
        : `🧾 ↑`;
    });
  }

  if (needsSetup) {
    row.querySelector('[data-action="setup"]')!.addEventListener('click', () =>
      openDebtForm(a, true, callbacks.onDebtFormSaved));
  }
  row.querySelector('[data-action="pay"]')!.addEventListener('click', () =>
    openPaymentModal(a, bankAccounts, accounts, callbacks.onLoad));

  if (isCard) {
    row.querySelector('[data-action="import"]')?.addEventListener('click', () => {
      openImportWizard({
        targetId: a.id,
        targetType: 'debt-card',
        targetName: a.name,
        categories: expenseCategories,
        onComplete: callbacks.onLoad,
      });
    });
  }

  if (a.url) {
    const link = document.createElement('a');
    link.className = 'icon-btn';
    link.setAttribute('data-testid', 'debt-url-link');
    link.href = a.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = 'Open billing portal';
    link.textContent = '↗';
    row.querySelector('[data-action="edit"]')!.before(link);
  }

  row.querySelector('[data-action="notif"]')!.addEventListener('click', () => {
    openAddNotificationModal({ label: a.name, defaultTrigger: 'monthly-day' });
  });
  row.querySelector('[data-action="edit"]')!.addEventListener('click', () =>
    openDebtForm(a, false, callbacks.onDebtFormSaved));
  row.querySelector('[data-action="delete"]')!.addEventListener('click', async () => {
    if (!confirm(`Delete "${a.name}"?`)) return;
    const [allExpenses, allCategories, allPaidRecords] = await Promise.all([
      getExpenses(),
      getCategories(),
      getExpensePaidRecords(),
    ]);
    await Promise.all([
      ...payments.map((p) => deleteDebtPayment(p.id)),
      ...charges.map((c) => deleteCardCharge(c.id)),
      ...allExpenses.filter((e) => e.linkedCardId === a.id).map(({ linkedCardId: _, ...e }) => saveExpense(e)),
      ...allCategories.filter((c) => c.defaultCardId === a.id).map(({ defaultCardId: _, ...c }) => saveCategory(c)),
      ...allPaidRecords.filter((r) => r.cardId === a.id).map(({ cardId: _, ...r }) => saveExpensePaidRecord(r)),
    ]);
    await deleteDebtAccount(a.id);
    await callbacks.onLoad();
  });

  return wrap;
}

export function buildDebtList(
  accounts: DebtAccount[],
  payments: DebtPayment[],
  charges: CardCharge[],
  expenseCategories: ExpenseCategory[],
  bankAccounts: BankAccount[],
  sortModeRef: { value: string },
  openChargesPanels: Set<string>,
  chargesPageState: Map<string, ChargesState>,
  callbacks: DebtListCallbacks,
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';

  const titleRow = document.createElement('div');
  titleRow.className = 'debt-list-title-row';

  const heading = document.createElement('h2');
  heading.className = 'font-serif';
  heading.style.fontSize = 'var(--text-xl)';
  heading.textContent = 'My Debt';
  titleRow.appendChild(heading);

  const sortBar = document.createElement('div');
  sortBar.className = 'debt-sort-bar';

  const list = document.createElement('div');
  list.className = 'debt-account-list';
  list.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-3)';

  const resortList = () => {
    getSortedAccounts(accounts, sortModeRef.value).forEach((a) => {
      const wrap = list.querySelector<HTMLElement>(`[data-account-id="${a.id}"]`);
      if (wrap) list.appendChild(wrap);
    });
  };

  const refreshSortButtons = () => {
    const dashIdx = sortModeRef.value.lastIndexOf('-');
    const field = sortModeRef.value.slice(0, dashIdx);
    const dir = sortModeRef.value.slice(dashIdx + 1);
    sortBar.querySelectorAll<HTMLButtonElement>('.debt-sort-btn').forEach((btn) => {
      const isActive = btn.dataset['sortField'] === field;
      btn.classList.toggle('active', isActive);
      btn.textContent = isActive
        ? `${btn.dataset['sortLabel']} ${dir === 'asc' ? '↑' : '↓'}`
        : btn.dataset['sortLabel']!;
    });
  };

  (['priority', 'balance', 'name', 'due'] as const).forEach((field) => {
    const label = field === 'due' ? 'Due' : field.charAt(0).toUpperCase() + field.slice(1);
    const btn = document.createElement('button');
    btn.className = 'debt-sort-btn';
    btn.dataset['sortField'] = field;
    btn.dataset['sortLabel'] = label;
    btn.addEventListener('click', () => {
      const dashIdx = sortModeRef.value.lastIndexOf('-');
      const curField = sortModeRef.value.slice(0, dashIdx);
      const curDir = sortModeRef.value.slice(dashIdx + 1);
      sortModeRef.value = curField === field
        ? `${field}-${curDir === 'asc' ? 'desc' : 'asc'}`
        : `${field}-asc`;
      refreshSortButtons();
      resortList();
    });
    sortBar.appendChild(btn);
  });
  refreshSortButtons();

  titleRow.appendChild(sortBar);
  card.appendChild(titleRow);

  const paymentsByAccount = new Map<string, DebtPayment[]>();
  payments.forEach((p) => {
    const arr = paymentsByAccount.get(p.accountId) ?? [];
    arr.push(p);
    paymentsByAccount.set(p.accountId, arr);
  });

  const chargesByAccount = new Map<string, CardCharge[]>();
  charges.forEach((c) => {
    const arr = chargesByAccount.get(c.accountId) ?? [];
    arr.push(c);
    chargesByAccount.set(c.accountId, arr);
  });

  getSortedAccounts(accounts, sortModeRef.value).forEach((a) => {
    const accountPayments = paymentsByAccount.get(a.id) ?? [];
    const accountCharges = chargesByAccount.get(a.id) ?? [];
    list.appendChild(buildDebtRow(
      a, accountPayments, accountCharges, accounts.length,
      accounts, expenseCategories, bankAccounts,
      openChargesPanels, chargesPageState,
      callbacks, resortList,
    ));
  });

  card.appendChild(list);
  return card;
}
