import './ledger.css';
import { makeHelpBtn } from '@/utils/helpNav';
import { showPageError } from '@/utils/errorUI';
import { getAllLedgerEntries, getDebtPayments, getCardCharges, getExpenses } from '@/db';
import { getDebtAccounts, getBankAccounts } from '@/db';
import { fmtCents } from '@/utils/finance';
import { escapeHtml } from '@/utils/escapeHtml';
import { userLocale } from '@/utils/locale';
import type { LedgerEntry, LedgerEntryType, DebtPayment, DebtAccount, BankAccount } from '@/types';

// Normalize a timestamp to midnight of its local calendar day.
// Needed because some older entries used T12:00:00 while newer ones use T00:00:00;
// normalizing before comparison prevents noon entries from sorting after midnight
// entries on the same calendar day.
function dayStart(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Credits (income, debt-payment reversals) sort before debits within the same business date.
function entryTypePriority(type: LedgerEntryType): number {
  if (type === 'reconciliation') return 0;
  if (type === 'bank-credit' || type === 'transfer-in' || type === 'payment') return 1;
  return 2;
}

interface EnrichedEntry extends LedgerEntry {
  accountName: string;
  accountType: 'bank' | 'debt';
  balanceAfter: number;
}

interface TxGroup {
  id: string;
  date: number;
  fromEntry: EnrichedEntry;
  toEntry?: EnrichedEntry;
  isFlow: boolean;
  isReconciliation: boolean;
  // Charges nested inside this group (billing cycle for a payment card)
  cycleCharges?: EnrichedEntry[];
  // When the payment was voided: the reversal entry, rendered inline at the card bottom
  voidEntry?: EnrichedEntry;
  // Legacy payment: bank account name when no bank-debit ledger entry exists
  legacyBankName?: string;
  // Standalone charge linked to a paid expense (safety fallback; normally absorbed)
  chargeExpenseName?: string;
}


const FLOW_FROM_TYPES = new Set<LedgerEntry['type']>(['transfer-out', 'bank-debit']);

const PAGE_SIZE = 25;

function flowOrder(a: EnrichedEntry, b: EnrichedEntry): [EnrichedEntry, EnrichedEntry] {
  if (FLOW_FROM_TYPES.has(a.type)) return [a, b];
  if (FLOW_FROM_TYPES.has(b.type)) return [b, a];
  return [a, b];
}

function deriveBalances(
  entries: LedgerEntry[],
  accountMap: Map<string, string>,
  accountTypeMap: Map<string, 'bank' | 'debt'>,
): EnrichedEntry[] {
  const running = new Map<string, number>();
  return entries.map((e) => {
    const prior = running.get(e.accountId) ?? 0;
    const bal =
      e.type === 'reconciliation' ? (e.targetBalance ?? prior) : prior + e.signedAmount;
    running.set(e.accountId, bal);
    return {
      ...e,
      accountName: accountMap.get(e.accountId) ?? `(${e.accountId.slice(0, 6)}…)`,
      accountType: accountTypeMap.get(e.accountId) ?? 'bank',
      balanceAfter: bal,
    };
  });
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(userLocale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString(userLocale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(userLocale, { month: 'short', day: 'numeric' });
}

function typeBadgeEl(type: LedgerEntry['type'] | 'paycheck' | 'void'): HTMLElement {
  const labels: Record<string, string> = {
    charge: 'Charge',
    void: 'Void',
    payment: 'Payment',
    'bank-credit': 'Credit',
    'bank-debit': 'Debit',
    'transfer-in': 'Xfer In',
    'transfer-out': 'Xfer Out',
    reconciliation: 'Recon',
    paycheck: 'Paycheck',
  };
  const el = document.createElement('span');
  el.className = `ledger-type-badge ledger-type-badge--${type}`;
  el.textContent = labels[type] ?? String(type);
  return el;
}

function deltaText(entry: EnrichedEntry): string {
  if (entry.type === 'reconciliation') return fmtCents.format(entry.targetBalance ?? 0);
  const sign = entry.signedAmount >= 0 ? '+' : '−';
  return `${sign}${fmtCents.format(Math.abs(entry.signedAmount))}`;
}

function deltaCls(type: LedgerEntry['type']): string {
  if (['payment', 'bank-credit', 'transfer-in'].includes(type)) return 'ledger-amount--good';
  if (['charge', 'bank-debit', 'transfer-out'].includes(type)) return 'ledger-amount--bad';
  return '';
}

// ── Coin builder ──────────────────────────────────────────────────────────────

type CoinKind = 'bank' | 'debt' | 'expense';

interface CoinOpts {
  kind: CoinKind;
  name: string;
  balance: string | null;
  delta: string;
  deltaClass: string;
  nameTestId?: string;
  // When > 0, adds an expand/collapse toggle badge to the coin's right side
  chargeCount?: number;
}

function buildCoin(opts: CoinOpts): HTMLElement {
  const { kind, name, balance, delta, deltaClass, nameTestId, chargeCount } = opts;
  const el = document.createElement('div');
  el.className = `ledger-coin ledger-coin--${kind}`;

  const left = document.createElement('div');
  left.className = 'ledger-coin-left';

  const dot = document.createElement('span');
  dot.className = `ledger-coin-dot ledger-coin-dot--${kind}`;
  dot.setAttribute('aria-hidden', 'true');

  const info = document.createElement('div');
  info.className = 'ledger-coin-info';

  const nameEl = document.createElement('span');
  nameEl.className = 'ledger-coin-name';
  if (nameTestId) nameEl.setAttribute('data-testid', nameTestId);
  nameEl.textContent = name;
  info.appendChild(nameEl);

  if (balance !== null) {
    const balEl = document.createElement('span');
    balEl.className = 'ledger-coin-balance';
    balEl.textContent = `bal ${balance}`;
    info.appendChild(balEl);
  } else {
    const balEl = document.createElement('span');
    balEl.className = 'ledger-coin-balance ledger-coin-balance--unknown';
    balEl.textContent = 'bal —';
    info.appendChild(balEl);
  }

  left.appendChild(dot);
  left.appendChild(info);
  el.appendChild(left);

  const deltaEl = document.createElement('span');
  deltaEl.className = `ledger-coin-delta ${deltaClass}`;
  deltaEl.textContent = delta;

  if (chargeCount != null && chargeCount > 0) {
    // Right group: amount + expand toggle side by side
    const rightGroup = document.createElement('div');
    rightGroup.className = 'ledger-coin-right';
    rightGroup.appendChild(deltaEl);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'ledger-coin-toggle';
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.setAttribute('aria-label', `${chargeCount} charge${chargeCount !== 1 ? 's' : ''}`);
    toggleBtn.type = 'button';

    const countBadge = document.createElement('span');
    countBadge.className = 'ledger-coin-count';
    countBadge.textContent = String(chargeCount);

    const chevron = document.createElement('span');
    chevron.className = 'ledger-coin-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▾';

    toggleBtn.appendChild(countBadge);
    toggleBtn.appendChild(chevron);
    rightGroup.appendChild(toggleBtn);
    el.appendChild(rightGroup);
  } else {
    el.appendChild(deltaEl);
  }

  return el;
}

function buildConnector(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ledger-v-connector';
  el.setAttribute('aria-hidden', 'true');
  const line = document.createElement('div');
  line.className = 'ledger-v-line';
  const arrow = document.createElement('span');
  arrow.className = 'ledger-v-arrow';
  arrow.textContent = '↓';
  el.appendChild(line);
  el.appendChild(arrow);
  return el;
}

// ── Page class ────────────────────────────────────────────────────────────────

export class LedgerPage {
  private container!: HTMLElement;
  private allEntries: EnrichedEntry[] = [];
  private filterAccount = '';
  private filterType = '';
  private filterFrom = '';
  private filterTo = '';
  private filterSearch = '';
  private accountNames: Map<string, string> = new Map();
  private accountTypes: Map<string, 'bank' | 'debt'> = new Map();
  private debtPaymentMap: Map<string, DebtPayment> = new Map();
  // cardChargeId → expense description (for charge items nested in coins)
  private chargeExpenseMap: Map<string, string> = new Map();
  private feedEl!: HTMLElement;
  private summaryEl!: HTMLElement;
  private paginationEl!: HTMLElement;
  private currentPage = 1;
  // Billing-cycle state (rebuilt whenever allEntries changes)
  private chargesByPaymentId: Map<string, EnrichedEntry[]> = new Map();
  // sourceId of deleted payment → void-reversal entry (rendered inside payment card)
  private voidPaymentMap: Map<string, EnrichedEntry> = new Map();
  // sourceId of deleted charge → void-reversal entry (rendered inside charge card)
  private voidChargeMap: Map<string, EnrichedEntry> = new Map();
  // sourceId of voided expense-payment bank-debit → void bank-credit entry (rendered inside debit card)
  private voidBankDebitMap: Map<string, EnrichedEntry> = new Map();
  private absorbedChargeIds: Set<string> = new Set();

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'ledger-page';
    this.container.innerHTML = '<p class="text-muted">Loading…</p>';
    void this.populate();
    return this.container;
  }

  private async populate(): Promise<void> {
    try {
      const [rawEntries, debtAccounts, bankAccounts, payments, charges, expenses] =
        await Promise.all([
          getAllLedgerEntries(),
          getDebtAccounts(),
          getBankAccounts(),
          getDebtPayments(),
          getCardCharges(),
          getExpenses(),
        ]);

      const accountMap = new Map<string, string>();
      const typeMap = new Map<string, 'bank' | 'debt'>();
      for (const a of debtAccounts) { accountMap.set(a.id, a.name); typeMap.set(a.id, 'debt'); }
      for (const a of bankAccounts) { accountMap.set(a.id, a.name); typeMap.set(a.id, 'bank'); }
      this.accountNames = accountMap;
      this.accountTypes = typeMap;

      this.debtPaymentMap = new Map(payments.map((p) => [p.id, p]));

      const expenseDescMap = new Map(expenses.map((e) => [e.id, e.description]));
      this.chargeExpenseMap = new Map(
        charges
          .filter((c) => c.sourceExpenseId != null)
          .map((c) => [c.id, expenseDescMap.get(c.sourceExpenseId!) ?? c.merchant]),
      );

      this.allEntries = deriveBalances(rawEntries, accountMap, typeMap);
      this.buildBillingCycles();
      this.buildPage(debtAccounts, bankAccounts);
    } catch (err) {
      showPageError(this.container, 'Could not load ledger entries.', () => this.populate());
      console.error(err);
    }
  }

  // ── Billing cycle builder ─────────────────────────────────────────────────
  //
  // For each debt account, assign each charge entry to the first payment whose
  // date is >= the charge date (its "covering" payment).  Covered charges are
  // absorbed into the payment card; uncovered charges are left unabsorbed and
  // appear as standalone Charge cards in the feed.

  private buildBillingCycles(): void {
    this.chargesByPaymentId = new Map();
    this.voidPaymentMap = new Map();
    this.voidChargeMap = new Map();
    this.voidBankDebitMap = new Map();
    this.absorbedChargeIds = new Set();

    // Index void-payment, void-charge, and void-bank-debit reversal entries.
    // The maps mark the original transaction as "voided" (inline indicator on its card).
    // Void entries are NOT added to absorbedChargeIds — they appear as separate standalone
    // cards so repeated pay→void events each have a distinct, visible audit record.
    for (const e of this.allEntries) {
      if (e.type === 'payment' && e.accountType === 'debt' && e.signedAmount > 0 && e.sourceId != null) {
        this.voidPaymentMap.set(e.sourceId, e);
      }
      if (e.type === 'charge' && e.signedAmount < 0 && e.description.startsWith('Void: ') && e.sourceId != null) {
        this.voidChargeMap.set(e.sourceId, e);
      }
      if (e.type === 'bank-credit' && e.description.startsWith('Void: ') && e.sourceType === 'expense-payment' && e.sourceId != null) {
        this.voidBankDebitMap.set(e.sourceId, e);
      }
    }

    const debtIds = new Set<string>();
    for (const e of this.allEntries) {
      if (e.accountType === 'debt') debtIds.add(e.accountId);
    }

    for (const debtId of debtIds) {
      const debtEntries = this.allEntries.filter((e) => e.accountId === debtId);

      // Exclude void-payment entries (signedAmount > 0): they should never
      // count as covering charges, regardless of their date.
      const payments = debtEntries
        .filter((e) => e.type === 'payment' && e.signedAmount < 0)
        .sort((a, b) => dayStart(a.date) - dayStart(b.date) || entryTypePriority(a.type) - entryTypePriority(b.type) || a.createdAt - b.createdAt);

      const allDebtCharges = debtEntries.filter((e) => e.type === 'charge');

      // Active charges only: exclude void entries (already absorbed globally) and
      // the originals they cancelled (which appear as standalone charge cards with
      // an inline void footer row).
      const charges = allDebtCharges
        .filter(
          (e) =>
            !(e.signedAmount < 0 && e.description.startsWith('Void: ')) &&
            !(e.sourceId != null && this.voidChargeMap.has(e.sourceId)),
        )
        .sort((a, b) => dayStart(a.date) - dayStart(b.date) || entryTypePriority(a.type) - entryTypePriority(b.type) || a.createdAt - b.createdAt);

      if (charges.length === 0) continue;

      for (const charge of charges) {
        const coveringPayment = payments.find(
          (p) => dayStart(p.date) >= dayStart(charge.date) && p.createdAt >= charge.createdAt,
        );
        if (coveringPayment) {
          if (!this.chargesByPaymentId.has(coveringPayment.id)) {
            this.chargesByPaymentId.set(coveringPayment.id, []);
          }
          this.chargesByPaymentId.get(coveringPayment.id)!.push(charge);
          this.absorbedChargeIds.add(charge.id);
        }
        // Uncovered charges are not absorbed — they appear as standalone Charge cards.
      }
    }
  }

  // ── Charge item helpers ───────────────────────────────────────────────────

  private chargeItemName(entry: EnrichedEntry): string {
    if (entry.sourceId) {
      const name = this.chargeExpenseMap.get(entry.sourceId);
      if (name) return name;
    }
    return entry.description;
  }

  private buildVoidRow(voidEntry: EnrichedEntry, positionTop = false): HTMLElement {
    const row = document.createElement('div');
    row.className = positionTop ? 'ledger-void-row ledger-void-row--top' : 'ledger-void-row';
    row.appendChild(typeBadgeEl('void'));
    const time = document.createElement('span');
    time.className = 'ledger-void-row-time';
    time.textContent = fmtDateTime(voidEntry.createdAt);
    row.appendChild(time);
    const amt = document.createElement('span');
    amt.className = 'ledger-void-row-amount ledger-amount--bad';
    const label = voidEntry.type === 'payment' ? 'Payment reversed' :
                  voidEntry.type === 'bank-credit' ? 'Debit reversed' :
                  'Charge reversed';
    amt.textContent = `${label} · ${fmtCents.format(Math.abs(voidEntry.signedAmount))}`;
    row.appendChild(amt);
    return row;
  }

  private buildChargesSection(charges: EnrichedEntry[]): HTMLElement {
    const section = document.createElement('div');
    section.className = 'ledger-coin-charges';

    for (const charge of charges) {
      const item = document.createElement('div');
      item.className = 'ledger-charge-item';

      const dot = document.createElement('span');
      dot.className = 'ledger-charge-dot';
      dot.setAttribute('aria-hidden', 'true');

      const nameEl = document.createElement('span');
      nameEl.className = 'ledger-charge-name';
      const displayName = this.chargeItemName(charge);
      nameEl.textContent = displayName;
      nameEl.title = displayName;

      const dateEl = document.createElement('span');
      dateEl.className = 'ledger-charge-date';
      dateEl.textContent = fmtShortDate(charge.date);

      const amountEl = document.createElement('span');
      amountEl.className = 'ledger-charge-amount';
      amountEl.textContent = fmtCents.format(Math.abs(charge.signedAmount));

      item.appendChild(dot);
      item.appendChild(nameEl);
      item.appendChild(dateEl);
      item.appendChild(amountEl);
      section.appendChild(item);
    }

    return section;
  }

  // Wire the expand toggle inside a coin to show/hide a charges section.
  // startExpanded = true for pending groups (show by default), false for payment cycles.
  private wireChargesToggle(
    coin: HTMLElement,
    chargesSection: HTMLElement,
    startExpanded: boolean,
  ): void {
    const toggleBtn = coin.querySelector<HTMLButtonElement>('.ledger-coin-toggle');
    if (!toggleBtn) return;

    chargesSection.hidden = !startExpanded;
    if (startExpanded) toggleBtn.setAttribute('aria-expanded', 'true');

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', String(!isExpanded));
      chargesSection.hidden = isExpanded;
    });
  }

  // ── Page builder ──────────────────────────────────────────────────────────

  private buildPage(debtAccounts: DebtAccount[], bankAccounts: BankAccount[]): void {
    const el = this.container;
    el.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'ledger-header';
    const titleWrap = document.createElement('div');
    titleWrap.innerHTML = `
      <h1 class="ledger-title">Ledger</h1>
      <p class="ledger-subtitle">A chronological record of every balance-affecting event.</p>
    `;
    titleWrap.querySelector('h1')?.appendChild(makeHelpBtn('ledger'));
    header.appendChild(titleWrap);
    el.appendChild(header);

    const searchWrap = document.createElement('div');
    searchWrap.className = 'ledger-search-wrap';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'ledger-search-input';
    searchInput.placeholder = 'Search descriptions, accounts, amounts…';
    searchInput.setAttribute('data-testid', 'ledger-search');
    searchInput.addEventListener('input', () => {
      this.filterSearch = searchInput.value.trim();
      this.currentPage = 1;
      this.applyFilters();
    });
    searchWrap.appendChild(searchInput);
    el.appendChild(searchWrap);

    const accountOptions = [
      '<option value="">All accounts</option>',
      '<optgroup label="Debt">',
      ...debtAccounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`),
      '</optgroup>',
      '<optgroup label="Bank">',
      ...bankAccounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`),
      '</optgroup>',
    ].join('');

    const filters = document.createElement('div');
    filters.className = 'ledger-filters';
    filters.innerHTML = `
      <div class="ledger-filter-group">
        <span class="ledger-filter-label">Account</span>
        <select data-testid="ledger-filter-account">
          ${accountOptions}
        </select>
      </div>
      <div class="ledger-filter-group">
        <span class="ledger-filter-label">Type</span>
        <select data-testid="ledger-filter-type">
          <option value="">All types</option>
          <option value="charge">Charge</option>
          <option value="payment">Payment</option>
          <option value="bank-credit">Bank Credit</option>
          <option value="bank-debit">Bank Debit</option>
          <option value="transfer-in">Transfer In</option>
          <option value="transfer-out">Transfer Out</option>
          <option value="reconciliation">Reconciliation</option>
        </select>
      </div>
      <div class="ledger-filter-group">
        <span class="ledger-filter-label">From</span>
        <input type="date" data-testid="ledger-filter-from" />
      </div>
      <div class="ledger-filter-group">
        <span class="ledger-filter-label">To</span>
        <input type="date" data-testid="ledger-filter-to" />
      </div>
      <button class="ledger-filter-reset" data-testid="ledger-filter-reset">Clear filters</button>
    `;
    el.appendChild(filters);

    filters.querySelector<HTMLSelectElement>('[data-testid="ledger-filter-account"]')!
      .addEventListener('change', (e) => {
        this.filterAccount = (e.target as HTMLSelectElement).value;
        this.currentPage = 1;
        this.applyFilters();
      });
    filters.querySelector<HTMLSelectElement>('[data-testid="ledger-filter-type"]')!
      .addEventListener('change', (e) => {
        this.filterType = (e.target as HTMLSelectElement).value;
        this.currentPage = 1;
        this.applyFilters();
      });
    filters.querySelector<HTMLInputElement>('[data-testid="ledger-filter-from"]')!
      .addEventListener('change', (e) => {
        this.filterFrom = (e.target as HTMLInputElement).value;
        this.currentPage = 1;
        this.applyFilters();
      });
    filters.querySelector<HTMLInputElement>('[data-testid="ledger-filter-to"]')!
      .addEventListener('change', (e) => {
        this.filterTo = (e.target as HTMLInputElement).value;
        this.currentPage = 1;
        this.applyFilters();
      });
    filters.querySelector<HTMLButtonElement>('[data-testid="ledger-filter-reset"]')!
      .addEventListener('click', () => {
        this.filterAccount = '';
        this.filterType = '';
        this.filterFrom = '';
        this.filterTo = '';
        this.filterSearch = '';
        filters.querySelector<HTMLSelectElement>('[data-testid="ledger-filter-account"]')!.value = '';
        filters.querySelector<HTMLSelectElement>('[data-testid="ledger-filter-type"]')!.value = '';
        filters.querySelector<HTMLInputElement>('[data-testid="ledger-filter-from"]')!.value = '';
        filters.querySelector<HTMLInputElement>('[data-testid="ledger-filter-to"]')!.value = '';
        searchInput.value = '';
        this.currentPage = 1;
        this.applyFilters();
      });

    this.summaryEl = document.createElement('div');
    this.summaryEl.className = 'ledger-summary';
    el.appendChild(this.summaryEl);

    this.paginationEl = document.createElement('div');
    this.paginationEl.className = 'ledger-pagination';
    el.appendChild(this.paginationEl);

    this.feedEl = document.createElement('div');
    this.feedEl.className = 'ledger-feed';
    el.appendChild(this.feedEl);

    this.applyFilters();
  }

  // ── Grouping ──────────────────────────────────────────────────────────────
  //
  // Works from this.allEntries (not just visible) so that billing-cycle charges
  // always appear nested inside their payment cards.  A group is included in
  // the output only if at least one of its constituent entry IDs appears in
  // visibleIds.

  private buildGroups(visibleIds: Set<string>): TxGroup[] {
    const corrMap = new Map<string, EnrichedEntry[]>();
    for (const e of this.allEntries) {
      if (!e.correlationId) continue;
      if (!corrMap.has(e.correlationId)) corrMap.set(e.correlationId, []);
      corrMap.get(e.correlationId)!.push(e);
    }

    const handledCorr = new Set<string>();
    const handledId = new Set<string>();
    const groups: TxGroup[] = [];

    for (const entry of this.allEntries) {
      if (handledId.has(entry.id)) continue;

      // Charge entries are absorbed: they appear nested inside payment or pending cards.
      if (this.absorbedChargeIds.has(entry.id)) continue;

      // ── Reconciliation ──────────────────────────────────────────────────
      if (entry.type === 'reconciliation') {
        if (!visibleIds.has(entry.id)) continue;
        groups.push({
          id: entry.id,
          date: entry.date,
          fromEntry: entry,
          isFlow: false,
          isReconciliation: true,
        });
        continue;
      }

      // ── Correlated pair (transfer or bank-funded payment) ───────────────
      if (entry.correlationId) {
        if (handledCorr.has(entry.correlationId)) continue;
        handledCorr.add(entry.correlationId);

        const siblings = corrMap.get(entry.correlationId) ?? [];
        const sibling = siblings.find((s) => s.id !== entry.id);
        if (sibling) {
          handledId.add(sibling.id);
          const [from, to] = flowOrder(entry, sibling);

          const cycleCharges = to.type === 'payment'
            ? this.chargesByPaymentId.get(to.id)
            : undefined;

          const voidEntry = to.type === 'payment' && to.sourceId
            ? this.voidPaymentMap.get(to.sourceId)
            : undefined;

          const inVisible =
            visibleIds.has(from.id) ||
            visibleIds.has(to.id) ||
            (cycleCharges?.some((c) => visibleIds.has(c.id)) ?? false);
          if (!inVisible) continue;

          groups.push({
            id: entry.correlationId,
            date: entry.date,
            fromEntry: from,
            toEntry: to,
            isFlow: true,
            isReconciliation: false,
            ...(cycleCharges ? { cycleCharges } : {}),
            ...(voidEntry ? { voidEntry } : {}),
          });
          continue;
        }
      }

      // ── Single-leg entry (non-absorbed, non-correlated) ─────────────────
      const cycleCharges = entry.type === 'payment'
        ? this.chargesByPaymentId.get(entry.id)
        : undefined;

      const cycleInVisible = cycleCharges?.some((c) => visibleIds.has(c.id)) ?? false;
      if (!visibleIds.has(entry.id) && !cycleInVisible) continue;

      let legacyBankName: string | undefined;
      if (entry.type === 'payment' && entry.sourceType === 'debt-payment' && entry.sourceId) {
        const dp = this.debtPaymentMap.get(entry.sourceId);
        if (dp?.bankAccountId) {
          legacyBankName = this.accountNames.get(dp.bankAccountId);
        }
      }

      let chargeExpenseName: string | undefined;
      if (entry.type === 'charge' && entry.sourceType === 'card-charge' && entry.sourceId) {
        chargeExpenseName = this.chargeExpenseMap.get(entry.sourceId);
      }

      // Void entries carry the original payment/charge/record ID as their sourceId.
      // Skip the map lookup for void entries themselves to prevent self-reference.
      const isVoidPaymentEntry = entry.type === 'payment' && entry.accountType === 'debt' && entry.signedAmount > 0;
      const isVoidBankCreditEntry = entry.type === 'bank-credit' && entry.description.startsWith('Void: ');
      const voidEntry = (!isVoidPaymentEntry && !isVoidBankCreditEntry && entry.sourceId)
        ? (entry.type === 'payment' ? this.voidPaymentMap.get(entry.sourceId) : undefined) ??
          (entry.type === 'charge' && entry.signedAmount > 0 ? this.voidChargeMap.get(entry.sourceId) : undefined) ??
          (entry.type === 'bank-debit' && entry.sourceType === 'expense-payment' ? this.voidBankDebitMap.get(entry.sourceId) : undefined)
        : undefined;

      groups.push({
        id: entry.id,
        date: entry.date,
        fromEntry: entry,
        isFlow: false,
        isReconciliation: false,
        ...(legacyBankName != null ? { legacyBankName } : {}),
        ...(chargeExpenseName != null ? { chargeExpenseName } : {}),
        ...(cycleCharges ? { cycleCharges } : {}),
        ...(voidEntry ? { voidEntry } : {}),
      });
    }

    return groups;
  }

  // ── Card rendering ─────────────────────────────────────────────────────────

  private renderTxGroup(group: TxGroup): HTMLElement {
    const card = document.createElement('div');
    card.setAttribute('data-testid', 'ledger-entry-row');
    card.setAttribute('data-group-id', group.id);

    // ── Reconciliation ─────────────────────────────────────────────────────
    if (group.isReconciliation) {
      card.className = 'ledger-txn ledger-txn--reconciliation';
      const entry = group.fromEntry;

      const hdr = document.createElement('div');
      hdr.className = 'ledger-txn-header';
      hdr.appendChild(typeBadgeEl('reconciliation'));
      const desc = document.createElement('span');
      desc.className = 'ledger-txn-desc';
      desc.textContent = entry.accountName;
      hdr.appendChild(desc);
      const dateEl = document.createElement('span');
      dateEl.className = 'ledger-txn-date';
      dateEl.textContent = fmtDateTime(entry.createdAt);
      hdr.appendChild(dateEl);
      card.appendChild(hdr);

      const body = document.createElement('div');
      body.className = 'ledger-recon-body';
      body.innerHTML = `
        <span class="ledger-coin-dot ledger-coin-dot--${entry.accountType}" aria-hidden="true"></span>
        <span class="ledger-recon-account">${escapeHtml(entry.accountName)}</span>
        <span class="ledger-recon-sep">·</span>
        <span class="ledger-recon-label">balance set to</span>
        <span class="ledger-recon-value">${escapeHtml(fmtCents.format(entry.targetBalance ?? 0))}</span>
        <span class="ledger-recon-marker">⬛ clean break</span>
      `;
      card.appendChild(body);
      if (entry.note) {
        const note = document.createElement('div');
        note.className = 'ledger-txn-note';
        note.textContent = entry.note;
        card.appendChild(note);
      }
      return card;
    }

    // ── Two-entry flow (transfer or bank-funded payment) ──────────────────
    if (group.isFlow && group.toEntry) {
      card.className = 'ledger-txn ledger-txn--flow';
      const from = group.fromEntry;
      const to = group.toEntry;
      const primary = to.type === 'payment' ? to : from;

      const hdr = document.createElement('div');
      hdr.className = 'ledger-txn-header';
      hdr.appendChild(typeBadgeEl(primary.type));
      const desc = document.createElement('span');
      desc.className = 'ledger-txn-desc';
      desc.textContent = primary.description;
      hdr.appendChild(desc);
      const dateEl = document.createElement('span');
      dateEl.className = 'ledger-txn-date';
      dateEl.textContent = fmtDateTime(Math.min(from.createdAt, to.createdAt));
      hdr.appendChild(dateEl);
      card.appendChild(hdr);
      if (group.voidEntry) card.appendChild(this.buildVoidRow(group.voidEntry, true));

      const parentCoin = buildCoin({
        kind: from.accountType,
        name: from.accountName,
        balance: fmtCents.format(from.balanceAfter),
        delta: deltaText(from),
        deltaClass: deltaCls(from.type),
        nameTestId: 'ledger-flow-from-account',
      });

      const isVoidedPayment = to.type === 'payment' && group.voidEntry != null;
      const toLabel = isVoidedPayment ? 'Voided' : (to.type === 'payment' ? `${deltaText(to)} owed` : deltaText(to));
      const hasCycleCharges = group.cycleCharges != null && group.cycleCharges.length > 0;

      const subCoin = buildCoin({
        kind: to.accountType,
        name: to.accountName,
        balance: fmtCents.format(to.balanceAfter),
        delta: toLabel,
        deltaClass: isVoidedPayment ? 'ledger-amount--voided' : deltaCls(to.type),
        nameTestId: 'ledger-flow-to-account',
        ...(hasCycleCharges ? { chargeCount: group.cycleCharges!.length } : {}),
      });

      const vFlow = document.createElement('div');
      vFlow.className = 'ledger-v-flow';
      vFlow.appendChild(parentCoin);
      vFlow.appendChild(buildConnector());
      vFlow.appendChild(subCoin);

      if (hasCycleCharges) {
        const chargesSection = this.buildChargesSection(group.cycleCharges!);
        this.wireChargesToggle(subCoin, chargesSection, /* startExpanded= */ false);
        vFlow.appendChild(chargesSection);
      }

      card.appendChild(vFlow);

      if (primary.note) {
        const note = document.createElement('div');
        note.className = 'ledger-txn-note';
        note.textContent = primary.note;
        card.appendChild(note);
      }
      return card;
    }

    // ── Legacy flow (payment with known bank, no bank-debit ledger entry) ──
    if (group.legacyBankName) {
      card.className = 'ledger-txn ledger-txn--flow ledger-txn--legacy-flow';
      const payment = group.fromEntry;
      const hasCycleCharges = group.cycleCharges != null && group.cycleCharges.length > 0;

      const hdr = document.createElement('div');
      hdr.className = 'ledger-txn-header';
      hdr.appendChild(typeBadgeEl('payment'));
      const desc = document.createElement('span');
      desc.className = 'ledger-txn-desc';
      desc.textContent = payment.description;
      hdr.appendChild(desc);
      const dateEl = document.createElement('span');
      dateEl.className = 'ledger-txn-date';
      dateEl.textContent = fmtDateTime(payment.createdAt);
      hdr.appendChild(dateEl);
      card.appendChild(hdr);
      if (group.voidEntry) card.appendChild(this.buildVoidRow(group.voidEntry, true));

      const parentCoin = buildCoin({
        kind: 'bank',
        name: group.legacyBankName,
        balance: null,
        delta: `−${fmtCents.format(Math.abs(payment.signedAmount))}`,
        deltaClass: 'ledger-amount--bad',
        nameTestId: 'ledger-flow-from-account',
      });

      const subCoin = buildCoin({
        kind: payment.accountType,
        name: payment.accountName,
        balance: fmtCents.format(payment.balanceAfter),
        delta: group.voidEntry ? 'Voided' : `${deltaText(payment)} owed`,
        deltaClass: group.voidEntry ? 'ledger-amount--voided' : deltaCls(payment.type),
        nameTestId: 'ledger-flow-to-account',
        ...(hasCycleCharges ? { chargeCount: group.cycleCharges!.length } : {}),
      });

      const vFlow = document.createElement('div');
      vFlow.className = 'ledger-v-flow';
      vFlow.appendChild(parentCoin);
      vFlow.appendChild(buildConnector());
      vFlow.appendChild(subCoin);

      if (hasCycleCharges) {
        const chargesSection = this.buildChargesSection(group.cycleCharges!);
        this.wireChargesToggle(subCoin, chargesSection, /* startExpanded= */ false);
        vFlow.appendChild(chargesSection);
      }

      card.appendChild(vFlow);

      if (payment.note) {
        const note = document.createElement('div');
        note.className = 'ledger-txn-note';
        note.textContent = payment.note;
        card.appendChild(note);
      }
      return card;
    }

    // ── Single-leg with expense sub-coin (charge → expense paid) ──────────
    // This path fires only for non-absorbed charges (edge case safety fallback).
    if (group.chargeExpenseName) {
      card.className = 'ledger-txn ledger-txn--expense-flow';
      const entry = group.fromEntry;

      const hdr = document.createElement('div');
      hdr.className = 'ledger-txn-header';
      hdr.appendChild(typeBadgeEl(entry.type));
      const desc = document.createElement('span');
      desc.className = 'ledger-txn-desc';
      desc.textContent = entry.description;
      hdr.appendChild(desc);
      const dateEl = document.createElement('span');
      dateEl.className = 'ledger-txn-date';
      dateEl.textContent = fmtDateTime(entry.createdAt);
      hdr.appendChild(dateEl);
      card.appendChild(hdr);

      const chargeCoin = buildCoin({
        kind: entry.accountType,
        name: entry.accountName,
        balance: fmtCents.format(entry.balanceAfter),
        delta: deltaText(entry),
        deltaClass: deltaCls(entry.type),
      });

      const expenseCoin = buildCoin({
        kind: 'expense',
        name: group.chargeExpenseName,
        balance: null,
        delta: fmtCents.format(Math.abs(entry.signedAmount)),
        deltaClass: '',
      });
      expenseCoin.querySelector('.ledger-coin-balance')!.textContent = 'Bill paid';

      const vFlow = document.createElement('div');
      vFlow.className = 'ledger-v-flow';
      vFlow.appendChild(chargeCoin);
      vFlow.appendChild(buildConnector());
      vFlow.appendChild(expenseCoin);
      card.appendChild(vFlow);

      if (group.voidEntry) card.appendChild(this.buildVoidRow(group.voidEntry));

      if (entry.note) {
        const note = document.createElement('div');
        note.className = 'ledger-txn-note';
        note.textContent = entry.note;
        card.appendChild(note);
      }
      return card;
    }

    // ── Single-leg entry (bank credit/debit, standalone payment, etc.) ─────
    card.className = 'ledger-txn';
    const entry = group.fromEntry;

    const isVoidEntry =
      (entry.type === 'charge' && entry.signedAmount < 0 && entry.description.startsWith('Void: ')) ||
      (entry.type === 'payment' && entry.accountType === 'debt' && entry.signedAmount > 0) ||
      (entry.type === 'bank-credit' && entry.description.startsWith('Void: '));

    const hdr = document.createElement('div');
    hdr.className = 'ledger-txn-header';
    const badgeType =
      entry.type === 'bank-credit' && entry.correlationId?.startsWith('payday-') ? 'paycheck' :
      isVoidEntry ? 'void' :
      entry.type;
    hdr.appendChild(typeBadgeEl(badgeType));
    const desc = document.createElement('span');
    desc.className = 'ledger-txn-desc';
    desc.textContent = entry.description;
    hdr.appendChild(desc);
    const dateEl = document.createElement('span');
    dateEl.className = 'ledger-txn-date';
    dateEl.textContent = fmtDateTime(entry.createdAt);
    hdr.appendChild(dateEl);
    card.appendChild(hdr);
    // Payment void: appears above the coins so it's clearly about the payment, not any nested charges
    if (group.voidEntry && entry.type === 'payment') card.appendChild(this.buildVoidRow(group.voidEntry, true));

    const vFlow = document.createElement('div');
    vFlow.className = 'ledger-v-flow';

    const hasCycleCharges = group.cycleCharges != null && group.cycleCharges.length > 0;
    // isVoidEntry guard: a standalone void-payment card is the void itself, not a voided payment.
    const isVoidedPayment = entry.type === 'payment' && !isVoidEntry && group.voidEntry != null;
    const coinEl = buildCoin({
      kind: entry.accountType,
      name: entry.accountName,
      balance: fmtCents.format(entry.balanceAfter),
      delta: isVoidedPayment ? 'Voided' : deltaText(entry),
      deltaClass: isVoidedPayment ? 'ledger-amount--voided' :
                  (isVoidEntry && entry.type === 'payment') ? 'ledger-amount--bad' :
                  isVoidEntry ? 'ledger-amount--good' :
                  deltaCls(entry.type),
      ...(hasCycleCharges ? { chargeCount: group.cycleCharges!.length } : {}),
    });
    vFlow.appendChild(coinEl);

    if (hasCycleCharges) {
      const chargesSection = this.buildChargesSection(group.cycleCharges!);
      this.wireChargesToggle(coinEl, chargesSection, /* startExpanded= */ false);
      vFlow.appendChild(chargesSection);
    }

    card.appendChild(vFlow);

    // Charge void: appears below the coin (only one coin, no ambiguity)
    if (group.voidEntry && entry.type !== 'payment') card.appendChild(this.buildVoidRow(group.voidEntry));

    if (entry.note) {
      const note = document.createElement('div');
      note.className = 'ledger-txn-note';
      note.textContent = entry.note;
      card.appendChild(note);
    }
    return card;
  }

  // ── Filter + render ────────────────────────────────────────────────────────

  private applyFilters(): void {
    let visible = this.allEntries.slice();

    if (this.filterAccount) visible = visible.filter((e) => e.accountId === this.filterAccount);
    if (this.filterType) visible = visible.filter((e) => e.type === this.filterType);
    if (this.filterFrom) {
      const ts = new Date(this.filterFrom + 'T00:00:00').getTime();
      visible = visible.filter((e) => e.date >= ts);
    }
    if (this.filterTo) {
      const ts = new Date(this.filterTo + 'T23:59:59').getTime();
      visible = visible.filter((e) => e.date <= ts);
    }
    // Normalize once — used for both filtering and post-render highlighting.
    const searchQuery = this.filterSearch.toLowerCase().replace(/[$,]/g, '');
    if (searchQuery) {
      visible = visible.filter((e) => {
        const amt = Math.abs(e.signedAmount).toFixed(2);
        return (
          e.description.toLowerCase().replace(/[$,]/g, '').includes(searchQuery) ||
          e.accountName.toLowerCase().replace(/[$,]/g, '').includes(searchQuery) ||
          amt.includes(searchQuery)
        );
      });
    }

    this.summaryEl.innerHTML = `
      <span><span class="ledger-summary-count" data-testid="ledger-entry-count">${visible.length}</span> entr${visible.length === 1 ? 'y' : 'ies'}</span>
    `;

    this.feedEl.innerHTML = '';
    this.paginationEl.innerHTML = '';

    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ledger-empty';
      empty.innerHTML = `
        <div class="ledger-empty-icon">📒</div>
        <div class="ledger-empty-title" data-testid="ledger-empty-title">No entries yet</div>
        <div class="ledger-empty-body">As you record charges, payments, and account changes, they'll appear here.</div>
      `;
      this.feedEl.appendChild(empty);
      return;
    }

    const visibleIds = new Set(visible.map((e) => e.id));
    const groups = this.buildGroups(visibleIds);

    type FeedItem = { date: number; createdAt: number; renderEl: () => HTMLElement };
    const allItems: FeedItem[] = groups.map((g) => ({
      date: g.date,
      // Use the earliest createdAt across all entries in the group.
      // For bank-funded payments, the bank-debit entry is created after an async
      // _ensureLedgerSeed() call, so its createdAt is slightly later than the
      // payment entry's.  Taking the min keeps the group anchored to the moment
      // the user initiated the action, not the moment the last entry was flushed.
      createdAt: g.toEntry
        ? Math.min(g.fromEntry.createdAt, g.toEntry.createdAt)
        : g.fromEntry.createdAt,
      renderEl: () => this.renderTxGroup(g),
    }));
    // Descending chronological order — newest at top.
    // Primary key: business day (normalized to midnight so noon vs midnight entries on
    // the same calendar day sort together).
    // Tiebreaker: createdAt (wall-clock recording time), also descending.
    allItems.sort((a, b) => dayStart(b.date) - dayStart(a.date) || b.createdAt - a.createdAt);

    const totalPages = Math.max(1, Math.ceil(allItems.length / PAGE_SIZE));
    this.currentPage = Math.min(Math.max(1, this.currentPage), totalPages);
    const pageStart = (this.currentPage - 1) * PAGE_SIZE;
    const pageItems = allItems.slice(pageStart, pageStart + PAGE_SIZE);

    const prev = document.createElement('button');
    prev.className = 'ledger-page-btn';
    prev.textContent = '← Prev';
    prev.disabled = this.currentPage === 1;
    prev.addEventListener('click', () => {
      this.currentPage--;
      this.applyFilters();
      this.paginationEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const info = document.createElement('span');
    info.className = 'ledger-page-info';
    info.textContent = `Page ${this.currentPage} of ${totalPages}`;

    const next = document.createElement('button');
    next.className = 'ledger-page-btn';
    next.textContent = 'Next →';
    next.disabled = this.currentPage === totalPages;
    next.addEventListener('click', () => {
      this.currentPage++;
      this.applyFilters();
      this.paginationEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    this.paginationEl.appendChild(prev);
    this.paginationEl.appendChild(info);
    this.paginationEl.appendChild(next);

    const byDay = new Map<string, FeedItem[]>();
    for (const item of pageItems) {
      const key = fmtDate(item.date);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(item);
    }

    for (const [day, items] of byDay) {
      const dayEl = document.createElement('div');
      dayEl.className = 'ledger-day-group';
      const label = document.createElement('div');
      label.className = 'ledger-day-label';
      label.textContent = day;
      dayEl.appendChild(label);
      const events = document.createElement('div');
      events.className = 'ledger-day-events';
      for (const item of items) events.appendChild(item.renderEl());
      dayEl.appendChild(events);
      this.feedEl.appendChild(dayEl);
    }

    if (searchQuery) this.highlightFeed(searchQuery);
  }

  // Walk every text node in the feed and wrap matched substrings in <mark>.
  // Strips $ and , from both the text and the query before matching so that
  // searching "100" highlights inside "$1,100.00", then maps positions back
  // to the original string to preserve the display characters in the mark.
  private highlightFeed(q: string): void {
    const STRIP = /[$,]/g;
    const walker = document.createTreeWalker(
      this.feedEl,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const el = node.parentElement;
          if (!el) return NodeFilter.FILTER_REJECT;
          // Skip buttons, day-header labels, and badge elements
          if (el.closest('button') ||
              el.closest('.ledger-day-label') ||
              el.closest('.ledger-coin-charge-count')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );

    const textNodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) textNodes.push(n as Text);

    for (const textNode of textNodes) {
      const original = textNode.textContent ?? '';

      // Build normalized string + position map (original index for each normalized char)
      const normChars: string[] = [];
      const origPos: number[] = [];
      for (let i = 0; i < original.length; i++) {
        const c = original[i]!;
        if (c !== '$' && c !== ',') {
          normChars.push(c.toLowerCase());
          origPos.push(i);
        }
      }
      const normalized = normChars.join('');

      // Collect all match ranges in normalized space, map to original positions
      const ranges: Array<[number, number]> = [];
      let nStart = 0;
      while (true) {
        const nIdx = normalized.indexOf(q, nStart);
        if (nIdx === -1) break;
        const oStart = origPos[nIdx]!;
        const oEnd = origPos[nIdx + q.length - 1]! + 1;
        ranges.push([oStart, oEnd]);
        nStart = nIdx + q.length;
      }

      if (ranges.length === 0) continue;

      const parent = textNode.parentNode!;
      const anchor = textNode.nextSibling;
      parent.removeChild(textNode);

      let cursor = 0;
      for (const [oStart, oEnd] of ranges) {
        if (oStart > cursor) {
          parent.insertBefore(document.createTextNode(original.slice(cursor, oStart)), anchor);
        }
        const mark = document.createElement('mark');
        mark.className = 'ledger-highlight';
        mark.textContent = original.slice(oStart, oEnd);
        parent.insertBefore(mark, anchor);
        cursor = oEnd;
      }
      if (cursor < original.length) {
        parent.insertBefore(document.createTextNode(original.slice(cursor)), anchor);
      }
    }
  }
}
