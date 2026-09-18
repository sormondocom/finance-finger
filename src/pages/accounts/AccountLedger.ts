import { fmtCents } from '@/utils/finance';
import { userLocale } from '@/utils/locale';
import { deriveBalance } from '@/accounting';
import type { LedgerEntry, LedgerEntryType, ExpensePaidRecord } from '@/types';

function dayStart(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Credits (income, reversals) sort before debits within the same business date.
function entryTypePriority(type: LedgerEntryType): number {
  if (type === 'reconciliation') return 0;
  if (type === 'bank-credit' || type === 'transfer-in' || type === 'payment') return 1;
  return 2;
}

export function buildAccountLedgerPanel(
  entries: LedgerEntry[],
  paidRecords: ExpensePaidRecord[],
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'account-ledger-panel';
  panel.style.display = 'none';

  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-muted text-sm';
    empty.style.padding = 'var(--space-3) var(--space-4)';
    empty.textContent = 'No transactions recorded for this account yet.';
    panel.appendChild(empty);
    return panel;
  }

  // Sort ascending by date for deterministic balance replay.
  // Within the same date, credits sort before debits; createdAt breaks remaining ties.
  const sorted = [...entries].sort(
    (a, b) => dayStart(a.date) - dayStart(b.date) || entryTypePriority(a.type) - entryTypePriority(b.type) || a.createdAt - b.createdAt,
  );

  // Replay to capture the running balance at each entry
  let running = 0;
  const rows: Array<{ entry: LedgerEntry; balance: number }> = [];
  for (const entry of sorted) {
    if (entry.type === 'reconciliation') {
      running = entry.targetBalance ?? running;
    } else {
      running += entry.signedAmount;
    }
    rows.push({ entry, balance: running });
  }
  const actualBalance = running;

  const firstRecon = sorted.find((e) => e.type === 'reconciliation');
  const openingBalance = firstRecon?.targetBalance ?? 0;

  // Map paid-record id → expense id so Budget-page scroll-focus still works
  const paidToExpense = new Map(paidRecords.map((r) => [r.id, r.expenseId]));

  // ── Summary bar ──────────────────────────────────────────────────────────
  const summaryBar = document.createElement('div');
  summaryBar.className = 'account-ledger-actual-balance';
  const isNeg = actualBalance < 0;
  summaryBar.innerHTML = `
    <span class="account-ledger-actual-balance-opening">
      Opening: ${fmtCents.format(openingBalance)}
    </span>
    <span class="account-ledger-actual-balance-current">
      <span class="account-ledger-actual-balance-label">Actual balance</span>
      <span class="account-ledger-actual-balance-value ${isNeg ? 'account-ledger-actual-balance-value--negative' : 'account-ledger-actual-balance-value--positive'}">
        ${isNeg ? '−' : ''}${fmtCents.format(Math.abs(actualBalance))}
      </span>
    </span>
  `;
  panel.appendChild(summaryBar);

  // ── Column headers ───────────────────────────────────────────────────────
  const headerRow = document.createElement('div');
  headerRow.className = 'account-ledger-row account-ledger-col-header';
  (
    [
      ['Date / Time', 'account-ledger-date'],
      ['Description', 'account-ledger-desc'],
      ['Amount',      'account-ledger-amount'],
      ['Balance',     'account-ledger-balance'],
    ] as [string, string][]
  ).forEach(([text, cls]) => {
    const cell = document.createElement('span');
    cell.className = cls;
    cell.textContent = text;
    headerRow.appendChild(cell);
  });
  panel.appendChild(headerRow);

  // ── Transaction rows (most recent first) ─────────────────────────────────
  for (const { entry, balance } of [...rows].reverse()) {
    if (entry.type === 'reconciliation') continue; // shown as opening row at bottom

    const ledgerRow = document.createElement('div');
    ledgerRow.className = 'account-ledger-row';

    // Enable scroll-focus from Budget page via paid-record → expense ID lookup
    if (entry.sourceType === 'expense-payment' && entry.sourceId) {
      const expenseId = paidToExpense.get(entry.sourceId);
      if (expenseId) ledgerRow.setAttribute('data-expense-id', expenseId);
    }

    const isCredit = entry.signedAmount >= 0;

    const dateEl = document.createElement('span');
    dateEl.className = 'account-ledger-date';
    const datePrimary = document.createElement('span');
    datePrimary.className = 'account-ledger-date-primary';
    datePrimary.textContent = new Date(entry.date).toLocaleDateString(userLocale, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const dateTime = document.createElement('span');
    dateTime.className = 'account-ledger-date-time';
    dateTime.textContent = new Date(entry.createdAt).toLocaleTimeString(userLocale, {
      hour: 'numeric', minute: '2-digit',
    });
    dateEl.appendChild(datePrimary);
    dateEl.appendChild(dateTime);

    const descEl = document.createElement('span');
    descEl.className = 'account-ledger-desc';
    descEl.textContent = entry.description;

    const amtEl = document.createElement('span');
    amtEl.className = `account-ledger-amount${isCredit ? ' account-ledger-amount--credit' : ' account-ledger-amount--debit'}`;
    amtEl.textContent = `${isCredit ? '+' : '−'}${fmtCents.format(Math.abs(entry.signedAmount))}`;

    const balEl = document.createElement('span');
    const balNeg = balance < 0;
    balEl.className = `account-ledger-balance${balNeg ? ' account-ledger-balance--negative' : ''}`;
    balEl.textContent = `${balNeg ? '−' : ''}${fmtCents.format(Math.abs(balance))}`;

    ledgerRow.appendChild(dateEl);
    ledgerRow.appendChild(descEl);
    ledgerRow.appendChild(amtEl);
    ledgerRow.appendChild(balEl);
    panel.appendChild(ledgerRow);
  }

  // ── Opening balance row ──────────────────────────────────────────────────
  const openingRow = document.createElement('div');
  openingRow.className = 'account-ledger-row account-ledger-opening-row';
  const openingDateEl = document.createElement('span');
  openingDateEl.className = 'account-ledger-date';
  const openingDescEl = document.createElement('span');
  openingDescEl.className = 'account-ledger-desc';
  openingDescEl.textContent = firstRecon?.note ?? 'Opening balance';
  const openingAmtEl = document.createElement('span');
  openingAmtEl.className = 'account-ledger-amount';
  const openingBalEl = document.createElement('span');
  openingBalEl.className = 'account-ledger-balance';
  openingBalEl.textContent = fmtCents.format(openingBalance);
  openingRow.appendChild(openingDateEl);
  openingRow.appendChild(openingDescEl);
  openingRow.appendChild(openingAmtEl);
  openingRow.appendChild(openingBalEl);
  panel.appendChild(openingRow);

  return panel;
}

// Re-export deriveBalance so callers in the accounts page can use it without
// a separate import from @/accounting.
export { deriveBalance };
