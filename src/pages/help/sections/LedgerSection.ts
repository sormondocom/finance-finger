import { makeCard } from '../helpUtils';

export function render(grid: HTMLElement): void {
  grid.appendChild(cardWhatIsLedger());
  grid.appendChild(cardHowEntriesCreated());
  grid.appendChild(cardReadingBalances());
  grid.appendChild(cardFilters());
  grid.appendChild(cardTransferCorrelation());
}

function cardWhatIsLedger(): HTMLElement {
  const card = makeCard('📒', 'What Is the Ledger?');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>The Ledger page is a chronological audit trail of every balance-affecting action across all your accounts — debt cards and bank accounts alike. Every charge, payment, transfer, bank deposit or withdrawal, and reconciliation appears here as a permanent, automatically written record.</p>
      <p>Entries are displayed newest-first with a running balance per account. Use the Ledger to verify that your records match your bank statements, trace exactly where a balance came from, or investigate an unexpected change.</p>
    </div>
    <div class="help-callout">
      The Ledger is read-only — entries are created automatically when you record transactions in other parts of the app. To add an entry, use the Debt, Accounts, or Expenses pages.
    </div>
  `;
  return card;
}

function cardHowEntriesCreated(): HTMLElement {
  const card = makeCard('➕', 'How Entries Are Created');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>Ledger entries are written automatically whenever you take a balance-affecting action anywhere in the app. You never create ledger entries directly.</p>
    </div>
    <div class="help-steps">
      <div class="help-step"><span class="help-step-num">💳</span><div class="help-step-body"><strong>Card charge</strong> — logged when you add a charge on a debt card, record an expense payment charged to a card, or import a credit card statement. Appears as a debit (increases the card balance).</div></div>
      <div class="help-step"><span class="help-step-num">💰</span><div class="help-step-body"><strong>Debt payment</strong> — logged when you record a payment on a debt account. Appears as a credit on the card (reduces the balance). If you specify a bank account as the source, a paired bank debit entry is also created.</div></div>
      <div class="help-step"><span class="help-step-num">🏦</span><div class="help-step-body"><strong>Bank credit / debit</strong> — logged when income is deposited, an expense is paid from a bank account, or a debt payment clears from a bank account. Updates the bank account's running balance.</div></div>
      <div class="help-step"><span class="help-step-num">🔄</span><div class="help-step-body"><strong>Transfer</strong> — moving money between two bank accounts creates a linked pair: a <em>transfer-out</em> on the source account and a <em>transfer-in</em> on the destination. Both entries share a correlation ID so they display as a matched pair in the Ledger.</div></div>
      <div class="help-step"><span class="help-step-num">✅</span><div class="help-step-body"><strong>Reconciliation</strong> — a special hard-reset entry written when you set a known-good balance via <em>Settings → Reconciliation</em>. It overrides the running total to match the value you entered, with a required memo explaining why. See <strong>Settings &amp; Data</strong> in this Help for full details.</div></div>
      <div class="help-step"><span class="help-step-num">📥</span><div class="help-step-body"><strong>Import</strong> — confirming rows in the CSV Import Wizard creates ledger entries for every transaction: charges for card imports, and bank credits/debits plus any categorized debt payments or transfers for bank statement imports.</div></div>
    </div>
  `;
  return card;
}

function cardReadingBalances(): HTMLElement {
  const card = makeCard('📊', 'Reading Running Balances');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>The Ledger derives each account's balance by replaying its entire entry history from oldest to newest. Because entries are displayed newest-first, the top row shows the current balance and the numbers shift as you scroll down into history.</p>
    </div>
    <div class="help-steps">
      <div class="help-step"><span class="help-step-num">🔢</span><div class="help-step-body"><strong>Balance column</strong> — shows the running account balance at the moment of each entry. The value at the top row matches the "actual balance" shown on the Accounts and Debt pages — all three derive from the same ledger replay.</div></div>
      <div class="help-step"><span class="help-step-num">✅</span><div class="help-step-body"><strong>Reconciliation as a clean break</strong> — a reconciliation entry appears with a dashed separator. Everything above it reflects transactions that occurred after the reconciliation; everything below shows pre-reconciliation history. The balance at the reconciliation row is exactly the value you set.</div></div>
      <div class="help-step"><span class="help-step-num">🔍</span><div class="help-step-body"><strong>Balance mismatch</strong> — if your Ledger balance doesn't match your bank statement, the gap is caused by transactions you haven't recorded yet, bank fees, or rounding. Use <em>Settings → Reconciliation</em> to set the verified correct balance with a memo explaining the adjustment.</div></div>
    </div>
  `;
  return card;
}

function cardFilters(): HTMLElement {
  const card = makeCard('🔍', 'Filtering Entries');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>Use the filter bar at the top of the Ledger to narrow the view. All filters can be combined.</p>
    </div>
    <div class="help-steps">
      <div class="help-step"><span class="help-step-num">🏦</span><div class="help-step-body"><strong>Account</strong> — filter to a single debt card or bank account. Shows only entries that affect that account's balance.</div></div>
      <div class="help-step"><span class="help-step-num">🏷️</span><div class="help-step-body"><strong>Entry type</strong> — choose one: <em>Charge, Payment, Bank Credit, Bank Debit, Transfer, Reconciliation</em>. Useful for quickly auditing all reconciliation points, all transfers, or all charges in a period.</div></div>
      <div class="help-step"><span class="help-step-num">📅</span><div class="help-step-body"><strong>Date range</strong> — enter a start date, end date, or both. Only entries whose transaction date falls within the range are shown.</div></div>
      <div class="help-step"><span class="help-step-num">↺</span><div class="help-step-body"><strong>Reset filters</strong> — click the reset button to clear all active filters and return to the full view.</div></div>
    </div>
    <div class="help-callout">
      When a date filter is active and no entries match, an empty-state message confirms the filter is working — there simply aren't entries in that range.
    </div>
  `;
  return card;
}

function cardTransferCorrelation(): HTMLElement {
  const card = makeCard('🔗', 'Transfer Correlation');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>When you record a transfer between two bank accounts, Financial Finger creates two ledger entries — a <strong>transfer-out</strong> on the source account and a <strong>transfer-in</strong> on the destination — and links them with a shared correlation ID.</p>
      <p>In the Ledger, correlated entries display as linked pills: each transfer-out row shows a <em>→ paired with transfer-in</em> indicator, and each transfer-in row shows a <em>← paired with transfer-out</em> indicator. Click either pill to jump directly to the matched entry.</p>
    </div>
    <div class="help-steps">
      <div class="help-step"><span class="help-step-num">💡</span><div class="help-step-body"><strong>Why it matters</strong> — a transfer appears as both a debit and a credit in the full ledger. The correlation pill makes it immediately clear that these two entries are two sides of the same move, not an unexplained double-entry.</div></div>
      <div class="help-step"><span class="help-step-num">🔎</span><div class="help-step-body"><strong>Cross-account tracing</strong> — filter to the source account's view to see the outflow; filter to the destination to see the inflow. The correlation pill links both views together for easy verification.</div></div>
    </div>
  `;
  return card;
}
