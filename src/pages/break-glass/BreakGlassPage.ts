import './break-glass.css';
import { BUCK_SVG, PENNY_SVG } from '@/mascot/svgs';
import { navigate } from '@/app/router';
import {
  getMembers, saveMember, deleteMember,
  getIncomeSources, saveIncomeSource, deleteIncomeSource,
  getCategories, saveCategory, deleteCategory,
  getExpenses, saveExpense, deleteExpense,
  getDebtAccounts, saveDebtAccount, deleteDebtAccount,
  getDebtPayments, saveDebtPayment, deleteDebtPayment,
  getCardCharges, saveCardCharge, deleteCardCharge,
  getExpensePaidRecords, saveExpensePaidRecord, deleteExpensePaidRecord,
  getBankAccounts, saveBankAccount, deleteBankAccount,
  getScenarios, saveScenario, deleteScenario,
} from '@/db';
import type {
  MascotGender,
  HouseholdMember, IncomeSource, ExpenseCategory, Expense,
  DebtAccount, DebtPayment, CardCharge, ExpensePaidRecord, BankAccount, Scenario,
} from '@/types';

// ── Store registry ────────────────────────────────────────────────────────────

type Rec = { id: string } & Record<string, unknown>;

interface StoreEntry {
  label: string;
  getAll: () => Promise<Rec[]>;
  save: (record: Rec) => Promise<void>;
  delete: (id: string) => Promise<void>;
  getDisplay: (rec: Rec) => string;
}

const fmt$ = (n: unknown): string =>
  typeof n === 'number' ? `$${n.toFixed(2)}` : '?';
const fmtDate = (n: unknown): string =>
  typeof n === 'number' && n > 0 ? new Date(n).toLocaleString() : '?';

function storeOf<T extends { id: string }>(
  label: string,
  getAll: () => Promise<T[]>,
  save: (r: T) => Promise<void>,
  del: (id: string) => Promise<void>,
  getDisplay: (r: T) => string,
): StoreEntry {
  return {
    label,
    getAll: getAll as unknown as () => Promise<Rec[]>,
    save: save as unknown as (r: Rec) => Promise<void>,
    delete: del,
    getDisplay: getDisplay as (r: Rec) => string,
  };
}

export const STORES: Record<string, StoreEntry> = {
  members:              storeOf('Members',            getMembers,                  saveMember,           deleteMember,           (r: HouseholdMember)    => r.name),
  income_sources:       storeOf('Income Sources',     getIncomeSources,            saveIncomeSource,     deleteIncomeSource,     (r: IncomeSource)       => r.name),
  expense_categories:   storeOf('Expense Categories', getCategories,               saveCategory,         deleteCategory,         (r: ExpenseCategory)    => r.name),
  expenses:             storeOf('Expenses',           getExpenses,                 saveExpense,          deleteExpense,          (r: Expense)            => r.description),
  debt_accounts:        storeOf('Debt Accounts',      getDebtAccounts,             saveDebtAccount,      deleteDebtAccount,      (r: DebtAccount)        => r.name),
  bank_accounts:        storeOf('Bank Accounts',      getBankAccounts,             saveBankAccount,      deleteBankAccount,      (r: BankAccount)        => r.name),
  debt_payments:        storeOf('Debt Payments',      () => getDebtPayments(),     saveDebtPayment,      deleteDebtPayment,      (r: DebtPayment)        => `${fmtDate(r.date)} — ${fmt$(r.amount)}`),
  card_charges:         storeOf('Card Charges',       () => getCardCharges(),      saveCardCharge,       deleteCardCharge,       (r: CardCharge)         => `${r.merchant} (${fmt$(r.amount)})`),
  expense_paid_records: storeOf('Paid Records',       () => getExpensePaidRecords(), saveExpensePaidRecord, deleteExpensePaidRecord, (r: ExpensePaidRecord) => `${fmtDate(r.date)} — ${fmt$(r.amount)}`),
  scenarios:            storeOf('Scenarios',          getScenarios,                saveScenario,         deleteScenario,         (r: Scenario)           => r.name),
};

// ── Orphan scan definitions ───────────────────────────────────────────────────

interface FkCheck {
  sourceStore: string;
  field: string;
  fieldLabel: string;
  targetStore: string;
  nullable: boolean;
}

const FK_CHECKS: FkCheck[] = [
  { sourceStore: 'income_sources',       field: 'memberId',        fieldLabel: 'Member',          targetStore: 'members',            nullable: false },
  { sourceStore: 'income_sources',       field: 'bankAccountId',   fieldLabel: 'Bank Account',    targetStore: 'bank_accounts',      nullable: true  },
  { sourceStore: 'expense_categories',   field: 'parentId',        fieldLabel: 'Parent Category', targetStore: 'expense_categories', nullable: true  },
  { sourceStore: 'expense_categories',   field: 'defaultCardId',   fieldLabel: 'Default Card',    targetStore: 'debt_accounts',      nullable: true  },
  { sourceStore: 'expenses',             field: 'categoryId',      fieldLabel: 'Category',        targetStore: 'expense_categories', nullable: false },
  { sourceStore: 'expenses',             field: 'memberId',        fieldLabel: 'Member',          targetStore: 'members',            nullable: true  },
  { sourceStore: 'expenses',             field: 'linkedCardId',    fieldLabel: 'Linked Card',     targetStore: 'debt_accounts',      nullable: true  },
  { sourceStore: 'expenses',             field: 'bankAccountId',   fieldLabel: 'Bank Account',    targetStore: 'bank_accounts',      nullable: true  },
  { sourceStore: 'expense_paid_records', field: 'expenseId',       fieldLabel: 'Expense',         targetStore: 'expenses',           nullable: false },
  { sourceStore: 'expense_paid_records', field: 'cardId',          fieldLabel: 'Card',            targetStore: 'debt_accounts',      nullable: true  },
  { sourceStore: 'expense_paid_records', field: 'bankAccountId',   fieldLabel: 'Bank Account',    targetStore: 'bank_accounts',      nullable: true  },
  { sourceStore: 'debt_payments',        field: 'accountId',       fieldLabel: 'Debt Account',    targetStore: 'debt_accounts',      nullable: false },
  { sourceStore: 'debt_payments',        field: 'bankAccountId',   fieldLabel: 'Bank Account',    targetStore: 'bank_accounts',      nullable: true  },
  { sourceStore: 'card_charges',         field: 'accountId',       fieldLabel: 'Debt Account',    targetStore: 'debt_accounts',      nullable: false },
  { sourceStore: 'card_charges',         field: 'categoryId',      fieldLabel: 'Category',        targetStore: 'expense_categories', nullable: true  },
  { sourceStore: 'card_charges',         field: 'sourceExpenseId', fieldLabel: 'Source Expense',  targetStore: 'expenses',           nullable: true  },
  { sourceStore: 'bank_accounts',        field: 'memberId',        fieldLabel: 'Member',          targetStore: 'members',            nullable: true  },
];

interface OrphanIssue {
  sourceStore: string;
  field: string;
  fieldLabel: string;
  record: Rec;
  missingValue: string;
  targetStore: string;
  type: 'dangling' | 'missing';
}

// ── Field type inference ──────────────────────────────────────────────────────

type FieldType =
  | 'id'       // this record's own id — read-only UUID
  | 'uuid-ref' // FK to another store
  | 'currency' // dollar amount stored as a plain number
  | 'percent'  // rate stored as decimal (0.1999 = 19.99%)
  | 'date'     // epoch milliseconds
  | 'boolean'
  | 'integer'
  | 'float'
  | 'text'
  | 'object'   // nested object or array → JSON textarea
  | 'empty';   // null, undefined, '', or 0 on a date field

const CURRENCY_FIELDS = new Set([
  'amount', 'amount2', 'balance', 'creditLimit', 'originalAmount',
  'minimumPaymentValue', 'monthlyBudget', 'threshold', 'hourlyRate',
]);
const PERCENT_FIELDS = new Set(['apr']);
const DATE_FIELDS = new Set([
  'createdAt', 'updatedAt', 'date', 'paydayRef',
  'introAprEndDate', 'nextDueDateMs', 'addedAt',
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// sourceStore → fieldName → targetStore, built from FK_CHECKS after it's declared
const FK_LOOKUP: Map<string, Map<string, string>> = new Map();

function inferFieldType(key: string, value: unknown): FieldType {
  if (value === null || value === undefined || value === '') return 'empty';
  if (key === 'id') return 'id';
  if (PERCENT_FIELDS.has(key) && typeof value === 'number') return 'percent';
  if (CURRENCY_FIELDS.has(key) && typeof value === 'number') return 'currency';
  if (DATE_FIELDS.has(key) && typeof value === 'number') return value === 0 ? 'empty' : 'date';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'float';
  if (typeof value === 'string') return UUID_RE.test(value) ? 'uuid-ref' : 'text';
  if (typeof value === 'object') return 'object';
  return 'text';
}

function humanLabel(key: string): string {
  const words = key.replace(/([A-Z])/g, ' $1').trim().split(/\s+/);
  return words.map((w) => {
    const low = w.toLowerCase();
    if (low === 'id')  return 'ID';
    if (low === 'apr') return 'APR';
    if (low === 'url') return 'URL';
    if (low === 'ms')  return 'ms';
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

function displayFieldValue(type: FieldType, value: unknown): string {
  switch (type) {
    case 'empty':    return '—';
    case 'id':
    case 'uuid-ref': return String(value);
    case 'currency': return `$${(value as number).toFixed(2)}`;
    case 'percent':  return `${((value as number) * 100).toFixed(2)}%`;
    case 'date': {
      const d = new Date(value as number);
      return d.toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit',
      });
    }
    case 'boolean': return (value as boolean) ? 'Yes' : 'No';
    case 'integer': return String(value as number);
    case 'float':   return String(value as number);
    case 'text':    return String(value);
    case 'object':  return JSON.stringify(value);
  }
}

// ── Columnar view (read-only) ─────────────────────────────────────────────────

// Build FK_LOOKUP from FK_CHECKS (runs once, after both arrays are defined)
FK_CHECKS.forEach((check) => {
  if (!FK_LOOKUP.has(check.sourceStore)) FK_LOOKUP.set(check.sourceStore, new Map());
  FK_LOOKUP.get(check.sourceStore)!.set(check.field, check.targetStore);
});

type NavCallback = (targetStore: string, recordId: string) => void;

function buildFieldTable(rec: Rec, storeKey: string, onNavigate: NavCallback): HTMLElement {
  const table = document.createElement('div');
  table.className = 'bg-field-table';

  const fkMap = FK_LOOKUP.get(storeKey);

  // id first, then insertion order
  const entries = Object.entries(rec);
  const sorted = [
    ...entries.filter(([k]) => k === 'id'),
    ...entries.filter(([k]) => k !== 'id'),
  ];

  sorted.forEach(([key, value]) => {
    const type = inferFieldType(key, value);
    const row = document.createElement('div');
    row.className = 'bg-field-row';

    const label = document.createElement('span');
    label.className = 'bg-field-label';
    label.textContent = humanLabel(key);

    const valEl = document.createElement('span');
    valEl.className = `bg-field-value bg-fv--${type}`;

    const targetStore = type === 'uuid-ref' ? fkMap?.get(key) : undefined;

    if (targetStore) {
      const targetLabel = STORES[targetStore]?.label ?? targetStore;
      const link = document.createElement('button');
      link.className = 'bg-fk-link';
      link.type = 'button';
      link.textContent = String(value);
      link.title = `View in ${targetLabel}`;
      link.addEventListener('click', () => onNavigate(targetStore, String(value)));

      const badge = document.createElement('span');
      badge.className = 'bg-fk-badge';
      badge.textContent = `→ ${targetLabel}`;

      valEl.appendChild(link);
      valEl.appendChild(badge);
    } else {
      if (type === 'boolean') valEl.dataset['bool'] = String(value);
      valEl.textContent = displayFieldValue(type, value);
    }

    row.appendChild(label);
    row.appendChild(valEl);
    table.appendChild(row);
  });

  return table;
}

// ── Columnar editor ───────────────────────────────────────────────────────────

interface FieldEditorResult {
  el: HTMLElement;
  collect: () => Rec | { error: string };
}

function buildFieldEditor(rec: Rec): FieldEditorResult {
  const table = document.createElement('div');
  table.className = 'bg-field-table bg-field-table--edit';

  const getters = new Map<string, () => unknown>();

  const entries = Object.entries(rec);
  const sorted = [
    ...entries.filter(([k]) => k === 'id'),
    ...entries.filter(([k]) => k !== 'id'),
  ];

  sorted.forEach(([key, value]) => {
    const type = inferFieldType(key, value);
    const row = document.createElement('div');
    row.className = 'bg-field-row';

    const label = document.createElement('span');
    label.className = 'bg-field-label';
    label.textContent = humanLabel(key);

    const control = document.createElement('div');
    control.className = 'bg-field-control';

    let getter: () => unknown;

    switch (type) {
      case 'id': {
        const code = document.createElement('code');
        code.className = 'bg-fv--id bg-id-readonly';
        code.textContent = String(value);
        control.appendChild(code);
        getter = () => value;
        break;
      }
      case 'boolean': {
        const wrap = document.createElement('label');
        wrap.className = 'bg-field-bool-wrap';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = value as boolean;
        wrap.appendChild(chk);
        control.appendChild(wrap);
        getter = () => chk.checked;
        break;
      }
      case 'currency': {
        const wrap = document.createElement('div');
        wrap.className = 'bg-input-affix';
        const pre = document.createElement('span');
        pre.textContent = '$';
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.step = '0.01';
        inp.min = '0';
        inp.value = (value as number).toFixed(2);
        wrap.appendChild(pre);
        wrap.appendChild(inp);
        control.appendChild(wrap);
        getter = () => parseFloat(inp.value) || 0;
        break;
      }
      case 'percent': {
        const wrap = document.createElement('div');
        wrap.className = 'bg-input-affix';
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.step = '0.0001';
        inp.min = '0';
        inp.value = ((value as number) * 100).toFixed(4);
        const suf = document.createElement('span');
        suf.textContent = '%';
        wrap.appendChild(inp);
        wrap.appendChild(suf);
        control.appendChild(wrap);
        getter = () => parseFloat(inp.value) / 100;
        break;
      }
      case 'date': {
        const inp = document.createElement('input');
        inp.type = 'datetime-local';
        inp.step = '1'; // expose seconds field
        const d = new Date(value as number);
        const pad = (n: number) => String(n).padStart(2, '0');
        inp.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        control.appendChild(inp);
        getter = () => inp.value ? new Date(inp.value).getTime() : value as number;
        break;
      }
      case 'integer': {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.step = '1';
        inp.value = String(value as number);
        control.appendChild(inp);
        getter = () => parseInt(inp.value, 10);
        break;
      }
      case 'float': {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.step = 'any';
        inp.value = String(value as number);
        control.appendChild(inp);
        getter = () => parseFloat(inp.value);
        break;
      }
      case 'object': {
        const ta = document.createElement('textarea');
        ta.className = 'bg-field-json-input';
        ta.value = JSON.stringify(value, null, 2);
        ta.rows = Math.min(6, (JSON.stringify(value, null, 2).split('\n').length) + 1);
        control.appendChild(ta);
        getter = () => {
          try { return JSON.parse(ta.value); }
          catch { return { __parseError: true, field: key }; }
        };
        break;
      }
      case 'empty': {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = '(not set)';
        inp.value = value === null || value === undefined ? '' : String(value);
        control.appendChild(inp);
        const emptyFallback = value;
        getter = () => inp.value === '' ? emptyFallback : inp.value;
        break;
      }
      default: {
        // text, uuid-ref
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = String(value ?? '');
        control.appendChild(inp);
        getter = () => inp.value;
        break;
      }
    }

    getters.set(key, getter);
    row.appendChild(label);
    row.appendChild(control);
    table.appendChild(row);
  });

  return {
    el: table,
    collect: () => {
      const result: Rec = { id: rec.id };
      for (const [key, getter] of getters) {
        const v = getter();
        if (typeof v === 'object' && v !== null && '__parseError' in v) {
          return { error: `Invalid JSON in field "${humanLabel(key)}"` };
        }
        result[key] = v;
      }
      return result;
    },
  };
}

// ── Session warning flag ──────────────────────────────────────────────────────

const WARNED_KEY = 'bg-warned';
export function acknowledgeBreakGlass(): void { sessionStorage.setItem(WARNED_KEY, '1'); }
function isAcknowledged(): boolean { return sessionStorage.getItem(WARNED_KEY) === '1'; }

function buildWarningOverlay(
  mascotGender: MascotGender | null | undefined,
  onConfirm: () => void,
): HTMLElement {
  const svg = (mascotGender ?? 'buck') === 'penny' ? PENNY_SVG : BUCK_SVG;
  const overlay = document.createElement('div');
  overlay.className = 'bg-overlay';

  const card = document.createElement('div');
  card.className = 'bg-warning-card';
  card.innerHTML = `
    <div class="bg-warning-mascot">${svg}</div>
    <p class="bg-warning-title">Hold on there, sugar.</p>
    <div class="bg-warning-body">
      <p>What you're fixin' to open is the <strong>Break Glass</strong> tool — direct access to every raw record in your database. No guardrails, no polished forms, and no undo button once you start messin' around in there.</p>
      <p>One wrong character in the wrong field and your whole financial setup could end up more tangled than a fishing line in a cedar tree. I'm talkin' <em>corrupted records, orphaned data, the whole nine yards</em>.</p>
      <p>Now, if something broke and you need to fix it — I'm right here with you, and I'm proud of you for bein' brave. If you're just pokin' around — please, for the love of sweet tea, close this up and go about your day.</p>
      <p>Still wanna go in? <strong>Bless your heart.</strong> I'll be right here.</p>
    </div>
  `;

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn-danger bg-warning-btn';
  confirmBtn.dataset['testid'] = 'bg-warning-confirm';
  confirmBtn.textContent = "I hear ya — open 'er up";
  confirmBtn.addEventListener('click', () => { acknowledgeBreakGlass(); onConfirm(); });

  overlay.addEventListener('click', (e) => {
    if (e.target !== overlay) return;
    card.style.animation = 'none';
    requestAnimationFrame(() => { card.style.animation = 'bg-shake 0.35s ease'; });
  });

  card.appendChild(confirmBtn);
  overlay.appendChild(card);
  return overlay;
}

// ── Page component ────────────────────────────────────────────────────────────

type DetailMode = 'view' | 'edit' | 'edit-raw';

export class BreakGlassPage {
  private container!: HTMLElement;
  private tabContent!: HTMLElement;
  private activeTab: 'browser' | 'scanner' = 'browser';

  // Browser state
  private currentStoreKey = 'members';
  private records: Rec[] = [];
  private selectedId: string | null = null;
  private detailMode: DetailMode = 'view';
  private editDraft = ''; // only used in 'edit-raw' mode

  // Browser DOM refs
  private storeSelect!: HTMLSelectElement;
  private countEl!: HTMLSpanElement;
  private listDiv!: HTMLElement;
  private detailDiv!: HTMLElement;

  render(mascotGender?: MascotGender | null): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'bg-page';
    this.container.appendChild(this.buildHeader());
    this.container.appendChild(this.buildTabBar());

    this.tabContent = document.createElement('div');
    this.tabContent.className = 'bg-tab-content';
    this.container.appendChild(this.tabContent);

    this.showTab('browser');

    if (!isAcknowledged()) {
      const overlay = buildWarningOverlay(mascotGender, () => overlay.remove());
      document.body.appendChild(overlay);
    }

    return this.container;
  }

  // ── Header ──────────────────────────────────────────────────────────────────

  private buildHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'bg-page-header';

    const backBtn = document.createElement('button');
    backBtn.className = 'bg-back-btn';
    backBtn.type = 'button';
    backBtn.dataset['testid'] = 'bg-back-btn';
    backBtn.textContent = '← Settings';
    backBtn.addEventListener('click', () => navigate('/settings'));

    const title = document.createElement('h1');
    title.className = 'bg-page-title font-serif';
    title.textContent = '🔧 Break Glass';

    header.appendChild(backBtn);
    header.appendChild(title);
    return header;
  }

  // ── Tab bar ──────────────────────────────────────────────────────────────────

  private buildTabBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'bg-tab-bar';

    (['browser', 'scanner'] as const).forEach((tab) => {
      const btn = document.createElement('button');
      btn.className = `bg-tab-btn${this.activeTab === tab ? ' bg-tab-btn--active' : ''}`;
      btn.type = 'button';
      btn.dataset['tab'] = tab;
      btn.dataset['testid'] = `bg-tab-${tab}`;
      btn.textContent = tab === 'browser' ? 'Data Browser' : 'Orphan Scanner';
      btn.addEventListener('click', () => {
        if (this.activeTab === tab) return;
        this.showTab(tab);
        bar.querySelectorAll('.bg-tab-btn').forEach((b) => {
          b.classList.toggle('bg-tab-btn--active', (b as HTMLElement).dataset['tab'] === tab);
        });
      });
      bar.appendChild(btn);
    });

    return bar;
  }

  private showTab(tab: 'browser' | 'scanner'): void {
    this.activeTab = tab;
    this.tabContent.innerHTML = '';
    if (tab === 'browser') {
      this.tabContent.appendChild(this.buildBrowserContent());
      void this.loadRecords();
    } else {
      this.tabContent.appendChild(this.buildScannerContent());
    }
  }

  // ── Data Browser ─────────────────────────────────────────────────────────────

  private buildBrowserContent(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'bg-browser';

    // Left column
    const left = document.createElement('div');
    left.className = 'bg-browser-left';

    const toolbar = document.createElement('div');
    toolbar.className = 'bg-browser-toolbar';

    this.storeSelect = document.createElement('select');
    this.storeSelect.className = 'bg-store-select';
    this.storeSelect.dataset['testid'] = 'bg-store-select';
    Object.entries(STORES).forEach(([key, entry]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = entry.label;
      opt.selected = key === this.currentStoreKey;
      this.storeSelect.appendChild(opt);
    });
    this.storeSelect.addEventListener('change', () => {
      this.currentStoreKey = this.storeSelect.value;
      this.selectedId = null;
      this.detailMode = 'view';
      this.editDraft = '';
      void this.loadRecords();
    });

    this.countEl = document.createElement('span');
    this.countEl.className = 'bg-record-count';
    this.countEl.dataset['testid'] = 'bg-record-count';

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'bg-refresh-btn';
    refreshBtn.type = 'button';
    refreshBtn.title = 'Refresh';
    refreshBtn.dataset['testid'] = 'bg-refresh-btn';
    refreshBtn.textContent = '↺';
    refreshBtn.addEventListener('click', () => void this.loadRecords());

    toolbar.appendChild(this.storeSelect);
    toolbar.appendChild(this.countEl);
    toolbar.appendChild(refreshBtn);

    this.listDiv = document.createElement('div');
    this.listDiv.className = 'bg-record-list';
    this.listDiv.dataset['testid'] = 'bg-record-list';

    left.appendChild(toolbar);
    left.appendChild(this.listDiv);

    // Right column
    this.detailDiv = document.createElement('div');
    this.detailDiv.className = 'bg-detail';
    this.detailDiv.dataset['testid'] = 'bg-detail';
    this.renderDetail();

    wrapper.appendChild(left);
    wrapper.appendChild(this.detailDiv);
    return wrapper;
  }

  private async loadRecords(): Promise<void> {
    const entry = STORES[this.currentStoreKey]!;
    this.listDiv.innerHTML = '<span class="bg-list-empty">Loading…</span>';
    this.detailDiv.innerHTML = '';
    try {
      this.records = await entry.getAll();
      this.countEl.textContent = `${this.records.length} record${this.records.length !== 1 ? 's' : ''}`;
      this.renderList();
      this.renderDetail();
    } catch (e) {
      this.listDiv.innerHTML = `<span class="bg-list-empty" style="color:var(--color-danger)">Load failed: ${(e as Error).message}</span>`;
      this.countEl.textContent = '';
    }
  }

  private renderList(): void {
    const entry = STORES[this.currentStoreKey]!;
    this.listDiv.innerHTML = '';
    if (this.records.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'bg-list-empty';
      empty.textContent = 'No records in this store.';
      this.listDiv.appendChild(empty);
      return;
    }
    this.records.forEach((rec) => {
      const item = document.createElement('button');
      item.className = `bg-list-item${rec.id === this.selectedId ? ' bg-list-item--selected' : ''}`;
      item.type = 'button';

      const nameEl = document.createElement('span');
      nameEl.className = 'bg-list-name';
      nameEl.textContent = entry.getDisplay(rec);

      const idEl = document.createElement('span');
      idEl.className = 'bg-list-id';
      idEl.textContent = String(rec.id).slice(0, 8) + '…';

      item.appendChild(nameEl);
      item.appendChild(idEl);
      item.addEventListener('click', () => {
        if (this.selectedId !== rec.id) { this.detailMode = 'view'; this.editDraft = ''; }
        this.selectedId = rec.id;
        this.renderList();
        this.renderDetail();
      });
      this.listDiv.appendChild(item);
    });
  }

  private renderDetail(): void {
    const entry = STORES[this.currentStoreKey]!;
    this.detailDiv.innerHTML = '';
    const rec = this.records.find((r) => r.id === this.selectedId);

    if (!rec) {
      this.detailMode = 'view';
      const hint = document.createElement('div');
      hint.className = 'bg-detail-hint';
      hint.textContent = '← Select a record from the list to view or edit it.';
      this.detailDiv.appendChild(hint);
      return;
    }

    // Header row: title + deselect
    const header = document.createElement('div');
    header.className = 'bg-detail-header';

    const titleEl = document.createElement('span');
    titleEl.className = 'bg-detail-title';
    titleEl.textContent = (this.detailMode !== 'view' ? 'Editing: ' : '') + entry.getDisplay(rec);

    const deselectBtn = document.createElement('button');
    deselectBtn.className = 'bg-detail-close';
    deselectBtn.title = 'Deselect';
    deselectBtn.textContent = '✕';
    deselectBtn.addEventListener('click', () => {
      this.selectedId = null; this.detailMode = 'view'; this.editDraft = '';
      this.renderList(); this.renderDetail();
    });

    header.appendChild(titleEl);
    header.appendChild(deselectBtn);
    this.detailDiv.appendChild(header);

    if (this.detailMode === 'view') {
      this.detailDiv.appendChild(buildFieldTable(rec, this.currentStoreKey, (ts, id) => this.openInBrowser(ts, id)));
      this.detailDiv.appendChild(this.buildViewButtons(rec, entry));

    } else if (this.detailMode === 'edit') {
      const editor = buildFieldEditor(rec);
      this.detailDiv.appendChild(editor.el);
      this.detailDiv.appendChild(this.buildEditButtons(rec, entry, editor.collect, 'edit'));

    } else {
      // edit-raw
      const jsonStr = this.editDraft || JSON.stringify(rec, null, 2);
      const area = document.createElement('textarea');
      area.className = 'bg-edit-area';
      area.value = jsonStr;
      area.rows = Math.max(8, Math.min(24, jsonStr.split('\n').length + 1));
      area.addEventListener('input', () => { this.editDraft = area.value; });
      this.detailDiv.appendChild(area);

      const parseAndCollect = (): Rec | { error: string } => {
        let parsed: Rec;
        try { parsed = JSON.parse(area.value) as Rec; }
        catch { return { error: 'Invalid JSON — fix the syntax and try again.' }; }
        if (typeof parsed.id !== 'string' || !parsed.id) {
          return { error: 'The "id" field must be a non-empty string.' };
        }
        return parsed;
      };

      this.detailDiv.appendChild(this.buildEditButtons(rec, entry, parseAndCollect, 'edit-raw'));
    }
  }

  private buildViewButtons(rec: Rec, entry: StoreEntry): HTMLElement {
    const row = document.createElement('div');
    row.className = 'bg-detail-btns';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-secondary';
    editBtn.dataset['testid'] = 'bg-edit-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => { this.detailMode = 'edit'; this.editDraft = ''; this.renderDetail(); });

    const rawBtn = document.createElement('button');
    rawBtn.className = 'btn btn-secondary';
    rawBtn.dataset['testid'] = 'bg-edit-raw-btn';
    rawBtn.textContent = 'Edit Raw JSON';
    rawBtn.addEventListener('click', () => { this.detailMode = 'edit-raw'; this.editDraft = ''; this.renderDetail(); });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-secondary bg-delete-btn';
    deleteBtn.dataset['testid'] = 'bg-delete-btn';
    deleteBtn.textContent = '🗑 Delete';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete this record?\n\nStore: ${entry.label}\nID: ${rec.id}\n\nThis cannot be undone.`)) return;
      try {
        await entry.delete(String(rec.id));
        this.records = this.records.filter((r) => r.id !== rec.id);
        this.countEl.textContent = `${this.records.length} record${this.records.length !== 1 ? 's' : ''}`;
        this.selectedId = null;
        this.renderList(); this.renderDetail();
      } catch (e) { alert(`Delete failed: ${(e as Error).message}`); }
    });

    row.appendChild(editBtn);
    row.appendChild(rawBtn);
    row.appendChild(deleteBtn);
    return row;
  }

  private buildEditButtons(
    rec: Rec,
    entry: StoreEntry,
    collect: () => Rec | { error: string },
    mode: 'edit' | 'edit-raw',
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'bg-detail-btns';

    const errEl = document.createElement('div');
    errEl.className = 'bg-detail-err';
    errEl.style.display = 'none';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-primary';
    saveBtn.dataset['testid'] = 'bg-save-btn';
    saveBtn.textContent = 'Save Changes';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.dataset['testid'] = 'bg-cancel-btn';
    cancelBtn.textContent = 'Cancel';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'bg-mode-link';
    toggleBtn.type = 'button';
    toggleBtn.dataset['testid'] = 'bg-mode-toggle';
    toggleBtn.textContent = mode === 'edit' ? 'Edit Raw JSON' : 'Edit Fields';
    toggleBtn.addEventListener('click', () => {
      this.detailMode = mode === 'edit' ? 'edit-raw' : 'edit';
      this.editDraft = '';
      this.renderDetail();
    });

    saveBtn.addEventListener('click', async () => {
      errEl.style.display = 'none';
      const result = collect();
      if ('error' in result) {
        errEl.textContent = result.error;
        errEl.style.display = '';
        return;
      }
      try {
        saveBtn.disabled = true;
        await entry.save(result);
        const idx = this.records.findIndex((r) => r.id === rec.id);
        if (idx >= 0) this.records[idx] = result;
        this.selectedId = result.id;
        this.detailMode = 'view'; this.editDraft = '';
        this.renderList(); this.renderDetail();
      } catch (e) {
        errEl.textContent = `Save failed: ${(e as Error).message}`;
        errEl.style.display = '';
        saveBtn.disabled = false;
      }
    });

    cancelBtn.addEventListener('click', () => {
      this.detailMode = 'view'; this.editDraft = '';
      this.renderDetail();
    });

    wrap.appendChild(saveBtn);
    wrap.appendChild(cancelBtn);
    wrap.appendChild(toggleBtn);
    wrap.appendChild(errEl);
    return wrap;
  }

  // Called from Orphan Scanner to jump to a record
  openInBrowser(storeKey: string, recordId: string): void {
    this.activeTab = 'browser';
    this.currentStoreKey = storeKey;
    this.selectedId = recordId;
    this.detailMode = 'view';
    this.editDraft = '';
    this.container.querySelectorAll('.bg-tab-btn').forEach((b) => {
      b.classList.toggle('bg-tab-btn--active', (b as HTMLElement).dataset['tab'] === 'browser');
    });
    this.tabContent.innerHTML = '';
    this.tabContent.appendChild(this.buildBrowserContent());
    this.storeSelect.value = storeKey;
    void this.loadRecords();
  }

  // ── Orphan Scanner ────────────────────────────────────────────────────────────

  private buildScannerContent(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'bg-scanner';

    const toolbar = document.createElement('div');
    toolbar.className = 'bg-scanner-toolbar';

    const scanBtn = document.createElement('button');
    scanBtn.className = 'btn btn-primary';
    scanBtn.type = 'button';
    scanBtn.dataset['testid'] = 'bg-scan-btn';
    scanBtn.textContent = 'Run Scan';

    const statusEl = document.createElement('span');
    statusEl.className = 'bg-scanner-status';
    statusEl.dataset['testid'] = 'bg-scan-status';

    toolbar.appendChild(scanBtn);
    toolbar.appendChild(statusEl);

    const results = document.createElement('div');
    results.className = 'bg-scanner-results';
    results.dataset['testid'] = 'bg-scan-results';
    const hint = document.createElement('p');
    hint.className = 'bg-scanner-hint';
    hint.textContent = 'Click "Run Scan" to check for orphaned records with broken FK references.';
    results.appendChild(hint);

    scanBtn.addEventListener('click', async () => {
      scanBtn.disabled = true;
      scanBtn.textContent = 'Scanning…';
      statusEl.textContent = '';
      results.innerHTML = '';
      try {
        const issues = await this.runScan();
        this.renderScanResults(results, issues);
        statusEl.textContent = issues.length === 0
          ? '✅ Clean'
          : `⚠ ${issues.length} issue${issues.length !== 1 ? 's' : ''} found`;
      } catch (e) {
        results.innerHTML = `<p class="bg-scanner-err">Scan failed: ${(e as Error).message}</p>`;
      } finally {
        scanBtn.disabled = false;
        scanBtn.textContent = 'Run Scan';
      }
    });

    wrapper.appendChild(toolbar);
    wrapper.appendChild(results);
    return wrapper;
  }

  private async runScan(): Promise<OrphanIssue[]> {
    const storeData = new Map<string, Rec[]>();
    await Promise.all(
      Object.entries(STORES).map(async ([key, entry]) => {
        storeData.set(key, await entry.getAll());
      }),
    );

    const idSets = new Map<string, Set<string>>();
    storeData.forEach((recs, key) => {
      idSets.set(key, new Set(recs.map((r) => r.id)));
    });

    const issues: OrphanIssue[] = [];

    for (const check of FK_CHECKS) {
      const sourceRecs = storeData.get(check.sourceStore) ?? [];
      const targetIds = idSets.get(check.targetStore) ?? new Set<string>();

      for (const rec of sourceRecs) {
        const fkValue = rec[check.field];

        if (fkValue === null || fkValue === undefined || fkValue === '') {
          if (!check.nullable) {
            issues.push({
              sourceStore: check.sourceStore, field: check.field, fieldLabel: check.fieldLabel,
              record: rec, missingValue: '', targetStore: check.targetStore, type: 'missing',
            });
          }
          continue;
        }

        if (!targetIds.has(fkValue as string)) {
          issues.push({
            sourceStore: check.sourceStore, field: check.field, fieldLabel: check.fieldLabel,
            record: rec, missingValue: fkValue as string, targetStore: check.targetStore, type: 'dangling',
          });
        }
      }
    }

    return issues;
  }

  private renderScanResults(container: HTMLElement, issues: OrphanIssue[]): void {
    container.innerHTML = '';

    if (issues.length === 0) {
      const clean = document.createElement('div');
      clean.className = 'bg-scanner-clean';
      clean.innerHTML = '<span class="bg-scanner-clean-icon">✅</span> No orphaned records found. Your data is clean.';
      container.appendChild(clean);
      return;
    }

    const byStore = new Map<string, OrphanIssue[]>();
    issues.forEach((issue) => {
      const list = byStore.get(issue.sourceStore) ?? [];
      list.push(issue);
      byStore.set(issue.sourceStore, list);
    });

    byStore.forEach((storeIssues, storeKey) => {
      const storeEntry = STORES[storeKey]!;

      const group = document.createElement('div');
      group.className = 'bg-scanner-group';

      const groupHeader = document.createElement('div');
      groupHeader.className = 'bg-scanner-group-header';
      groupHeader.innerHTML = `
        <span class="bg-scanner-group-store">${storeEntry.label}</span>
        <span class="bg-scanner-group-count">${storeIssues.length} issue${storeIssues.length !== 1 ? 's' : ''}</span>
      `;
      group.appendChild(groupHeader);

      storeIssues.forEach((issue) => {
        const targetLabel = STORES[issue.targetStore]?.label ?? issue.targetStore;
        const row = document.createElement('div');
        row.className = 'bg-scanner-issue';

        const badge = document.createElement('span');
        badge.className = `bg-issue-badge bg-issue-badge--${issue.type}`;
        badge.textContent = issue.type === 'missing' ? 'Missing' : 'Dangling';

        const desc = document.createElement('span');
        desc.className = 'bg-issue-desc';
        if (issue.type === 'missing') {
          desc.innerHTML = `<strong>${issue.fieldLabel}</strong> is required but not set`;
        } else {
          desc.innerHTML = `<strong>${issue.fieldLabel}</strong> → <code>${issue.missingValue.slice(0, 12)}…</code> not found in ${targetLabel}`;
        }

        const recordName = document.createElement('span');
        recordName.className = 'bg-issue-record';
        recordName.textContent = storeEntry.getDisplay(issue.record);

        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn btn-secondary bg-issue-view-btn';
        viewBtn.type = 'button';
        viewBtn.textContent = 'View in Browser →';
        viewBtn.addEventListener('click', () => this.openInBrowser(storeKey, issue.record.id));

        row.appendChild(badge);
        row.appendChild(desc);
        row.appendChild(recordName);
        row.appendChild(viewBtn);
        group.appendChild(row);
      });

      container.appendChild(group);
    });
  }
}
