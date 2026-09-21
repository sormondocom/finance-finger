import { getDebtAccounts, getBankAccounts } from '@/db';
import { accounting } from '@/accounting';
import { fmtCents } from '@/utils/finance';
import { escapeHtml } from '@/utils/escapeHtml';
import type { DebtAccount, BankAccount } from '@/types';

export function buildReconciliationSection(
  showToast: (msg: string) => void,
): { element: HTMLElement; refresh: () => void } {
  const wrap = document.createElement('div');
  wrap.className = 'settings-group';
  wrap.setAttribute('data-testid', 'settings-recon-section');
  wrap.innerHTML = `<div class="settings-group-title">Reconciliation</div>`;

  const descRow = document.createElement('div');
  descRow.className = 'setting-row';
  descRow.innerHTML = `
    <div class="setting-row-info">
      <span class="setting-row-label">Set a known-good balance</span>
      <span class="setting-row-desc">
        Use this when the balance shown doesn't match your actual statement.
        Setting a balance writes a clean-break entry in the Ledger — all history is
        preserved, but future balance calculations restart from this value.
      </span>
    </div>
  `;
  wrap.appendChild(descRow);

  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'settings-scroll-wrap';

  const list = document.createElement('div');
  list.className = 'recon-account-list';
  list.setAttribute('data-testid', 'settings-recon-account-list');

  const updateFade = () => {
    scrollWrap.classList.toggle('no-overflow', list.scrollHeight - list.scrollTop <= list.clientHeight + 1);
  };
  list.addEventListener('scroll', updateFade);

  scrollWrap.appendChild(list);
  wrap.appendChild(scrollWrap);

  const refresh = () => void loadAndRender(list, updateFade, showToast);
  refresh();
  return { element: wrap, refresh };
}

async function loadAndRender(
  list: HTMLElement,
  updateFade: () => void,
  showToast: (msg: string) => void,
): Promise<void> {
  const [debtAccounts, bankAccounts] = await Promise.all([
    getDebtAccounts(),
    getBankAccounts(),
  ]);

  list.innerHTML = '';

  if (debtAccounts.length === 0 && bankAccounts.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-muted text-sm';
    empty.style.padding = 'var(--space-2) var(--space-5) var(--space-4)';
    empty.setAttribute('data-testid', 'settings-recon-empty');
    empty.textContent = 'No accounts yet. Add debt or bank accounts first.';
    list.appendChild(empty);
    requestAnimationFrame(updateFade);
    return;
  }

  // Fetch ledger-derived balances through the accounting service so the
  // displayed "Current" values match exactly what the rest of the UI shows.
  const balanceMap = new Map<string, number>();
  await Promise.all([
    ...debtAccounts.map(async (a) => { balanceMap.set(a.id, await accounting.getDebtBalance(a.id)); }),
    ...bankAccounts.map(async (a) => { balanceMap.set(a.id, await accounting.getBankBalance(a.id)); }),
  ]);

  const groups: Array<{ label: string; accounts: Array<DebtAccount | BankAccount>; type: 'debt' | 'bank' }> = [
    { label: 'Debt accounts', accounts: debtAccounts, type: 'debt' },
    { label: 'Bank accounts', accounts: bankAccounts, type: 'bank' },
  ];

  for (const group of groups) {
    if (group.accounts.length === 0) continue;

    const groupLabel = document.createElement('div');
    groupLabel.style.cssText =
      'padding:var(--space-2) var(--space-5) var(--space-1);font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--color-muted)';
    groupLabel.textContent = group.label;
    list.appendChild(groupLabel);

    for (const account of group.accounts) {
      const balance = balanceMap.get(account.id) ?? 0;
      list.appendChild(buildAccountRow(account, group.type, balance, showToast));
    }
  }

  requestAnimationFrame(updateFade);
}

function buildAccountRow(
  account: DebtAccount | BankAccount,
  accountType: 'debt' | 'bank',
  balance: number,
  showToast: (msg: string) => void,
): HTMLElement {
  // Outer wrapper holds the setting-row and the error line beneath it
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-testid', 'settings-recon-account-row');
  wrapper.setAttribute('data-account-id', account.id);

  const row = document.createElement('div');
  row.className = 'setting-row';

  const info = document.createElement('div');
  info.className = 'setting-row-info';
  info.innerHTML = `
    <span class="setting-row-label" data-testid="settings-recon-account-name">${escapeHtml(account.name)}</span>
    <span class="setting-row-desc">
      Current: <strong data-testid="settings-recon-current-balance">${fmtCents.format(balance)}</strong>
    </span>
  `;

  const control = document.createElement('div');
  control.className = 'setting-row-control';
  control.style.cssText = 'display:flex;gap:var(--space-2);align-items:center';

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.step = '0.01';
  input.placeholder = balance.toFixed(2);
  input.style.cssText = 'width:120px;text-align:right';
  input.setAttribute('data-testid', 'settings-recon-balance-input');

  control.appendChild(input);
  row.appendChild(info);
  row.appendChild(control);
  wrapper.appendChild(row);

  // Memo row — required before the balance can be set
  const memoRow = document.createElement('div');
  memoRow.style.cssText = 'padding:var(--space-2) var(--space-5);display:flex;gap:var(--space-2);align-items:center';

  const memoInput = document.createElement('input');
  memoInput.type = 'text';
  memoInput.maxLength = 120;
  memoInput.placeholder = 'Reason for adjustment (required)';
  memoInput.style.flex = '1';
  memoInput.setAttribute('data-testid', 'settings-recon-memo-input');

  const btn = document.createElement('button');
  btn.className = 'btn btn-primary';
  btn.setAttribute('data-testid', 'settings-recon-set-btn');
  btn.textContent = 'Set Balance';

  memoRow.appendChild(memoInput);
  memoRow.appendChild(btn);
  wrapper.appendChild(memoRow);

  // Error line sits inside the wrapper so it's reachable via wrapper's testid locator
  const errEl = document.createElement('div');
  errEl.style.cssText = 'padding:0 var(--space-5) var(--space-2);font-size:var(--text-xs);color:var(--color-danger);display:none';
  errEl.setAttribute('data-testid', 'settings-recon-error');
  wrapper.appendChild(errEl);

  const doSet = async () => {
    const raw = parseFloat(input.value);
    const memo = memoInput.value.trim();

    if (isNaN(raw) || raw < 0) {
      errEl.textContent = 'Enter a valid balance (0 or more).';
      errEl.style.display = 'block';
      return;
    }
    if (!memo) {
      errEl.textContent = 'A memo is required — briefly explain why the balance is being adjusted.';
      errEl.style.display = 'block';
      memoInput.focus();
      return;
    }
    errEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      await accounting.reconcileAccount({
        accountId: account.id,
        accountType,
        targetBalance: raw,
        note: memo,
      });

      const newFmt = fmtCents.format(raw);
      wrapper.querySelector<HTMLElement>('[data-testid="settings-recon-current-balance"]')!.textContent = newFmt;
      input.value = '';
      input.placeholder = raw.toFixed(2);
      memoInput.value = '';

      showToast(`Balance for "${account.name}" set to ${newFmt}.`);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Set Balance';
    }
  };

  btn.addEventListener('click', () => void doSet());
  memoInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') void doSet(); });

  return wrapper;
}
