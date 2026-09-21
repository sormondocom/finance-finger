import browser from 'webextension-polyfill';
import { openConfirmDialog } from '@/components/ConfirmDialog';
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
  wrap.innerHTML = `<div class="settings-group-title" style="color:var(--color-danger)">Danger Zone</div>`;

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

    const groupLabel = document.createElement('div');
    groupLabel.style.cssText =
      'padding:var(--space-2) var(--space-5) var(--space-1);font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--color-muted)';
    groupLabel.textContent = group.label;
    list.appendChild(groupLabel);

    for (const account of group.accounts) {
      const balance = balanceMap.get(account.id) ?? 0;
      list.appendChild(buildResetRow(account, group.type, balance, list, updateFade, showToast, onAccountReset));
    }
  }

  requestAnimationFrame(() => { list.scrollTop = prevScroll; updateFade(); });
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
      await accounting.resetAccount({
        accountId: account.id,
        accountType,
        ...(newBalance !== undefined ? { newOpeningBalance: newBalance } : {}),
        newOpeningBalanceNote: 'Opening balance after history reset',
      });
      // Record the reset timestamp so autoRecordPaydays() won't backfill deposits
      // that pre-date this reset for income sources linked to this bank account.
      if (accountType === 'bank') {
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

        const credited: string[] = [];
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
          credited.push(source.name);
        }

        if (credited.length > 0) {
          setTimeout(() => {
            void showMascot(
              'payday-reset-credit',
              { sources: credited.join(', '), account: account.name },
              0,
            );
          }, 600);
        }
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
