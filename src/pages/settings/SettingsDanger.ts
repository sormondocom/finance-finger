import browser from 'webextension-polyfill';
import { openConfirmDialog } from '@/components/ConfirmDialog';
import { openFormModal } from '@/components/Modal';
import { getDebtAccounts, getBankAccounts, getIncomeSources } from '@/db';
import { accounting } from '@/accounting';
import { escapeHtml } from '@/utils/escapeHtml';
import { fmtCents } from '@/utils/finance';
import { getPaydaysInMonth } from '@/utils/paydays';
import { paydayCorrelationId } from '@/utils/paydayDeposits';
import { showMascot } from '@/mascot/Mascot';
import type { DebtAccount, BankAccount } from '@/types';

export function buildDangerSection(showToast: (msg: string) => void, onAccountReset?: () => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'settings-group';
  wrap.innerHTML = `<div class="settings-group-title" style="color:var(--status-past-due)">Danger Zone</div>`;

  // ── Reset Account History ──────────────────────────────────────────────────

  const resetAcctDescRow = document.createElement('div');
  resetAcctDescRow.className = 'setting-row';
  resetAcctDescRow.innerHTML = `
    <div class="setting-row-info">
      <span class="setting-row-label">Reset account history</span>
      <span class="setting-row-desc">
        Removes all transactions, charges, payments, and transfers for a single account.
        The account name and settings are kept. For bank accounts, expense payments drawn
        from that account are also expunged.
        <strong>This cannot be undone.</strong>
      </span>
    </div>
  `;
  wrap.appendChild(resetAcctDescRow);

  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'settings-scroll-wrap';

  const accountList = document.createElement('div');
  accountList.className = 'recon-account-list';
  accountList.setAttribute('data-testid', 'settings-danger-reset-list');

  const updateFade = () => {
    scrollWrap.classList.toggle('no-overflow', accountList.scrollHeight - accountList.scrollTop <= accountList.clientHeight + 1);
  };
  accountList.addEventListener('scroll', updateFade);

  scrollWrap.appendChild(accountList);
  wrap.appendChild(scrollWrap);

  void loadResetAccounts(accountList, updateFade, showToast, onAccountReset);

  // Divider
  const divider = document.createElement('hr');
  divider.style.cssText = 'border:none;border-top:1px solid var(--color-border);margin:var(--space-3) var(--space-5) 0';
  wrap.appendChild(divider);

  // ── Reset vault configuration ──────────────────────────────────────────────

  const resetRow = document.createElement('div');
  resetRow.className = 'setting-row settings-danger';
  resetRow.innerHTML = `
    <div class="setting-row-info">
      <span class="setting-row-label">Reset vault configuration</span>
      <span class="setting-row-desc">
        Clears all stored settings and vault config from this browser.
        Your encrypted data in IndexedDB is deleted too.
        <strong>This cannot be undone.</strong>
      </span>
    </div>
  `;

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn btn-danger setting-row-control';
  resetBtn.textContent = 'Reset';
  resetBtn.addEventListener('click', async () => {
    const confirmed = await openConfirmDialog({
      title: 'Reset vault',
      message: 'This will permanently delete your vault configuration and all encrypted data in this browser. Your private key stored offsite is NOT affected — but without vault data there is nothing to decrypt.',
      confirmLabel: 'Reset',
    });
    if (!confirmed) return;
    void doReset();
  });

  resetRow.appendChild(resetBtn);
  wrap.appendChild(resetRow);
  return wrap;
}

async function loadResetAccounts(
  list: HTMLElement,
  updateFade: () => void,
  showToast: (msg: string) => void,
  onAccountReset?: () => void,
): Promise<void> {
  // Fetch all data before touching the DOM — any await after innerHTML='' lets the
  // browser paint the empty list at scroll 0, causing the visible jiggle.
  const [debtAccounts, bankAccounts] = await Promise.all([
    getDebtAccounts(),
    getBankAccounts(),
  ]);

  const balanceMap = new Map<string, number>();
  if (debtAccounts.length > 0 || bankAccounts.length > 0) {
    await Promise.all([
      ...debtAccounts.map(async (a) => { balanceMap.set(a.id, await accounting.getDebtBalance(a.id)); }),
      ...bankAccounts.map(async (a) => { balanceMap.set(a.id, await accounting.getBankBalance(a.id)); }),
    ]);
  }

  // All data ready — clear and rebuild synchronously with no further awaits.
  const prevScroll = list.scrollTop;
  list.innerHTML = '';

  if (debtAccounts.length === 0 && bankAccounts.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-muted text-sm';
    empty.style.padding = 'var(--space-2) var(--space-5) var(--space-4)';
    empty.textContent = 'No accounts yet.';
    list.appendChild(empty);
    requestAnimationFrame(() => { list.scrollTop = prevScroll; updateFade(); });
    return;
  }

  const groups: Array<{ label: string; accounts: Array<DebtAccount | BankAccount>; type: 'debt' | 'bank' }> = [
    { label: 'Debt accounts', accounts: debtAccounts, type: 'debt' },
    { label: 'Bank accounts', accounts: bankAccounts, type: 'bank' },
  ];

  for (const group of groups) {
    if (group.accounts.length === 0) continue;

    const groupHeader = document.createElement('div');
    groupHeader.style.cssText =
      'padding:var(--space-2) var(--space-5) var(--space-1);display:flex;align-items:center;justify-content:space-between;gap:var(--space-2)';

    const groupLabel = document.createElement('span');
    groupLabel.style.cssText =
      'font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--color-muted)';
    groupLabel.textContent = group.label;
    groupHeader.appendChild(groupLabel);

    groupHeader.appendChild(
      buildResetAllButton(group.label, group.accounts, group.type, list, updateFade, showToast, onAccountReset),
    );

    list.appendChild(groupHeader);

    for (const account of group.accounts) {
      const balance = balanceMap.get(account.id) ?? 0;
      list.appendChild(buildResetRow(account, group.type, balance, list, updateFade, showToast, onAccountReset));
    }
  }

  requestAnimationFrame(() => { list.scrollTop = prevScroll; updateFade(); });
}

// Core reset + bank-specific side effects, shared by the per-account "Reset
// History" button and the per-group "Reset All" button below. Does not
// prompt for confirmation or touch any button's disabled/label state — that's
// the caller's responsibility, since the two callers gate it very differently
// (two sequential prompts vs. one bulk confirmation).
async function performAccountReset(
  account: DebtAccount | BankAccount,
  accountType: 'debt' | 'bank',
  newBalance: number | undefined,
): Promise<{ creditedSources: string[]; creditedAccountName: string | null }> {
  await accounting.resetAccount({
    accountId: account.id,
    accountType,
    ...(newBalance !== undefined ? { newOpeningBalance: newBalance } : {}),
    newOpeningBalanceNote: 'Opening balance after history reset',
  });

  if (accountType !== 'bank') return { creditedSources: [], creditedAccountName: null };

  // Record the reset timestamp so autoRecordPaydays() won't backfill deposits
  // that pre-date this reset for income sources linked to this bank account.
  const result = await browser.storage.local.get('accountResetTimestamps');
  const timestamps = (result['accountResetTimestamps'] as Record<string, number> | undefined) ?? {};
  timestamps[account.id] = Date.now();
  await browser.storage.local.set({ accountResetTimestamps: timestamps });

  // If today is payday for any recurring income source linked to this account,
  // re-add that deposit immediately so the user isn't left short.
  const today = new Date();
  const todayDay   = today.getDate();
  const todayYear  = today.getFullYear();
  const todayMonth = today.getMonth();
  const paydayTs   = new Date(todayYear, todayMonth, todayDay).getTime();

  const allSources = await getIncomeSources();
  const linkedSources = allSources.filter(
    (s) => s.active && s.bankAccountId === account.id && s.frequency !== 'once',
  );

  const creditedSources: string[] = [];
  for (const source of linkedSources) {
    const days = getPaydaysInMonth(source, todayYear, todayMonth);
    const paydayIndex = days.indexOf(todayDay);
    if (paydayIndex === -1) continue;

    const amount =
      source.frequency === 'semimonthly' && source.amount2 != null && paydayIndex === 1
        ? source.amount2
        : source.amount;

    await accounting.recordBankCredit({
      accountId: account.id,
      description: source.name,
      amount,
      date: paydayTs,
      correlationId: paydayCorrelationId(source.id, todayYear, todayMonth, todayDay),
    });
    creditedSources.push(source.name);
  }

  return { creditedSources, creditedAccountName: creditedSources.length > 0 ? account.name : null };
}

// In-app modal replacement for a native prompt() confirmation — browser
// prompt() dialogs are plain text with no real layout control, and with a
// full account list embedded they either visually truncate or (depending on
// the Modal's rendering) collapse every line into one run-on sentence. A
// real modal can show the account list as an actual list and never cuts
// off, however many accounts are in the group.
function openBulkResetConfirmModal(
  groupLabel: string,
  accounts: Array<DebtAccount | BankAccount>,
  accountType: 'debt' | 'bank',
  onConfirm: () => void | Promise<void>,
): void {
  const phrase = `RESET ALL ${groupLabel.toUpperCase()}`;

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';

  const warning = document.createElement('p');
  warning.className = 'text-sm';
  warning.style.margin = '0';
  warning.innerHTML =
    `This permanently removes all transactions, charges, payments, and transfers for every ` +
    `${accountType === 'debt' ? 'debt' : 'bank'} account below, restarting each at a $0 balance. ` +
    `${accountType === 'bank' ? 'Expense payments drawn from them are also expunged. ' : ''}` +
    `The accounts themselves are kept. <strong>This cannot be undone.</strong>`;
  body.appendChild(warning);

  const list = document.createElement('ul');
  list.style.cssText = 'margin:0;padding-left:var(--space-5);font-size:var(--text-sm);max-height:160px;overflow-y:auto';
  for (const account of accounts) {
    const li = document.createElement('li');
    li.innerHTML = escapeHtml(account.name);
    list.appendChild(li);
  }
  body.appendChild(list);

  const formGroup = document.createElement('div');
  formGroup.className = 'form-group';

  const label = document.createElement('label');
  label.className = 'form-label';
  label.innerHTML = `Type <strong>${escapeHtml(phrase)}</strong> to confirm`;
  formGroup.appendChild(label);

  const input = document.createElement('input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.setAttribute('data-testid', 'settings-danger-reset-all-confirm-input');
  formGroup.appendChild(input);

  const errEl = document.createElement('div');
  errEl.className = 'form-error';
  errEl.style.display = 'none';
  formGroup.appendChild(errEl);

  body.appendChild(formGroup);

  openFormModal({
    title: `Reset all ${groupLabel.toLowerCase()}?`,
    body,
    submitLabel: 'Reset All',
    onSubmit: async (closeModal) => {
      if (input.value.trim().toUpperCase() !== phrase) {
        errEl.textContent = 'Confirmation text didn\'t match.';
        errEl.style.display = 'block';
        input.focus();
        return;
      }
      closeModal();
      await onConfirm();
    },
  });

  // openFormModal appends `body` as a sibling of the footer inside one
  // wrapper div, so the submit button it creates is reachable from here.
  const submitBtn = body.parentElement?.querySelector<HTMLButtonElement>('[data-testid="modal-submit"]');
  if (submitBtn) {
    submitBtn.className = 'btn btn-danger';
    submitBtn.disabled = true;
    input.addEventListener('input', () => {
      submitBtn.disabled = input.value.trim().toUpperCase() !== phrase;
      if (!submitBtn.disabled) { errEl.style.display = 'none'; }
    });
  }

  input.focus();
}

// Resets every account in one group (all debt accounts, or all bank
// accounts) at once, restarting each at a $0 balance — same default as
// leaving the per-account prompt's balance field blank. Guarded by a typed
// confirmation phrase scaled to the bulk action's wider blast radius (the
// per-account flow requires typing that one account's exact name; this
// requires typing a fixed phrase naming the whole group).
function buildResetAllButton(
  groupLabel: string,
  accounts: Array<DebtAccount | BankAccount>,
  accountType: 'debt' | 'bank',
  list: HTMLElement,
  updateFade: () => void,
  showToast: (msg: string) => void,
  onAccountReset?: () => void,
): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'btn btn-danger btn-sm';
  btn.setAttribute('data-testid', `settings-danger-reset-all-${accountType}`);
  btn.style.cssText = 'flex-shrink:0;font-size:var(--text-xs);padding:2px var(--space-2)';
  btn.textContent = `Reset All (${accounts.length})`;

  btn.addEventListener('click', () => {
    openBulkResetConfirmModal(groupLabel, accounts, accountType, async () => {
      // Sequential, not Promise.all: resetAccount() reads and syncs counterpart
      // accounts (transfers between accounts in the same group, debt payments
      // funded from a bank account also being reset), so resetting a group's
      // accounts concurrently risks one reset's counterpart sync racing
      // another's own in-flight wipe.
      let failures = 0;
      const creditedAccountNames: string[] = [];
      const creditedSourceNames: string[] = [];
      for (const account of accounts) {
        try {
          const { creditedSources, creditedAccountName } = await performAccountReset(account, accountType, undefined);
          if (creditedAccountName) creditedAccountNames.push(creditedAccountName);
          creditedSourceNames.push(...creditedSources);
        } catch {
          failures += 1;
        }
      }

      if (creditedSourceNames.length > 0) {
        setTimeout(() => {
          void showMascot(
            'payday-reset-credit',
            { sources: creditedSourceNames.join(', '), account: creditedAccountNames.join(', ') },
            0,
          );
        }, 600);
      }

      if (failures === 0) {
        showToast(`All ${accounts.length} ${groupLabel.toLowerCase()} have been reset.`);
      } else {
        showToast(`Reset ${accounts.length - failures} of ${accounts.length} ${groupLabel.toLowerCase()} — ${failures} failed.`);
      }
      onAccountReset?.();
      void loadResetAccounts(list, updateFade, showToast, onAccountReset);
    });
  });

  return btn;
}

function buildResetRow(
  account: DebtAccount | BankAccount,
  accountType: 'debt' | 'bank',
  balance: number,
  list: HTMLElement,
  updateFade: () => void,
  showToast: (msg: string) => void,
  onAccountReset?: () => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'setting-row settings-danger';
  row.setAttribute('data-testid', 'settings-danger-reset-row');
  row.setAttribute('data-account-id', account.id);

  const info = document.createElement('div');
  info.className = 'setting-row-info';
  info.innerHTML = `
    <span class="setting-row-label">${escapeHtml(account.name)}</span>
    <span class="setting-row-desc">
      ${accountType === 'debt' ? 'Debt' : 'Bank'} ·
      Balance: <strong>${fmtCents.format(balance)}</strong>
    </span>
  `;

  const btn = document.createElement('button');
  btn.className = 'btn btn-danger setting-row-control';
  btn.setAttribute('data-testid', 'settings-danger-reset-btn');
  btn.style.flexShrink = '0';
  btn.textContent = 'Reset History';

  btn.addEventListener('click', async () => {
    const typed = prompt(
      `You are about to reset the history for:\n\n"${account.name}"\n\n` +
      `This permanently removes all transactions, charges, payments, and transfers.\n` +
      `For bank accounts, expense payments drawn from this account are also expunged.\n` +
      `The account itself is kept.\n\n` +
      `Type the account name exactly to confirm:`,
    );
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== account.name.toLowerCase()) {
      alert(`Account name didn't match — reset cancelled.`);
      return;
    }

    const balStr = prompt(
      `Optional: enter a new opening balance (e.g. 1500.00).\n` +
      `Leave blank or enter 0 to start at zero:`,
      '',
    );
    if (balStr === null) return;

    const newBalance = balStr.trim() ? parseFloat(balStr.trim()) : undefined;
    if (newBalance !== undefined && (isNaN(newBalance) || newBalance < 0)) {
      alert(`Invalid balance — reset cancelled.`);
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Resetting…';

    try {
      const { creditedSources } = await performAccountReset(account, accountType, newBalance);
      if (creditedSources.length > 0) {
        setTimeout(() => {
          void showMascot(
            'payday-reset-credit',
            { sources: creditedSources.join(', '), account: account.name },
            0,
          );
        }, 600);
      }
      showToast(`History for "${account.name}" has been reset.`);
      onAccountReset?.();
      void loadResetAccounts(list, updateFade, showToast, onAccountReset);
    } catch {
      btn.disabled = false;
      btn.textContent = 'Reset History';
      showToast(`Reset failed — please try again.`);
    }
  });

  row.appendChild(info);
  row.appendChild(btn);
  return row;
}

async function doReset(): Promise<void> {
  await browser.storage.local.clear();
  indexedDB.deleteDatabase('financial-finger');
  location.reload();
}
