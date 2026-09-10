import './import-wizard.css';
import { openModal } from './Modal';
import {
  detectDelimiter,
  parseCSV,
  parseDate,
  parseAmount,
  type Delimiter,
} from '@/utils/csvParser';
import { findDuplicateImport, recordImport, importSnapshotLabel } from '@/utils/importManager';
import { takeSnapshot } from '@/utils/snapshot';
import {
  saveCardCharge, saveBankTransaction,
  getExpenses, saveExpense,
  getDebtAccounts, saveDebtAccount, createDebtAccount,
  getBankAccounts,
  saveCategory,
  createExpensePaidRecord, saveExpensePaidRecord,
  saveDebtPayment,
  saveAccountTransfer,
  getTransactionRules, saveTransactionRule,
  getSetting,
} from '@/db';
import { normalizePattern, toRuleAction } from '@/utils/importRules';
import { inferActionType } from '@/utils/importSuggest';
import { fmt, fmtCents } from '@/utils/finance';
import type {
  CardCharge, BankTransaction, ExpenseCategory, ImportRecord,
  Expense, DebtPayment, AccountTransfer,
  DebtAccountType, IncomeFrequency,
  TransactionRule,
  ReviewAction,
} from '@/types';
import { userLocale } from '@/utils/locale';

// ── Column roles ──────────────────────────────────────────────────────────────

type ColumnRole =
  | 'skip'
  | 'date'
  | 'description'
  | 'merchant'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'note'
  | 'category';

const ROLE_LABELS: Record<ColumnRole, string> = {
  skip:        '(skip)',
  date:        'Date',
  description: 'Description',
  merchant:    'Merchant',
  amount:      'Amount',
  debit:       'Debit (money out)',
  credit:      'Credit (money in)',
  note:        'Note',
  category:    'Category',
};

const BANK_ROLES: ColumnRole[] =    ['skip', 'date', 'description', 'amount', 'debit', 'credit', 'note', 'category'];
const CARD_ROLES: ColumnRole[] =    ['skip', 'date', 'merchant', 'description', 'amount', 'debit', 'credit', 'note', 'category'];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImportWizardOptions {
  targetId: string;
  targetType: 'bank-account' | 'debt-card';
  targetName: string;
  categories: ExpenseCategory[];
  onComplete: () => void;
}

interface ParsedRow {
  date: number | null;
  description: string;
  amount: number | null;
  note: string;
  categoryHint: string;
  raw: string[];
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function openImportWizard(opts: ImportWizardOptions): void {
  const isCard = opts.targetType === 'debt-card';
  const roles = isCard ? CARD_ROLES : BANK_ROLES;

  // ── Mutable wizard state ───────────────────────────────────────────────────
  let rawText = '';
  let fileName = '';
  let fileSize = 0;
  let delimiter: Delimiter = ',';
  let quoteChar = '"'; // '' = no quoting
  let parsed: ReturnType<typeof parseCSV> | null = null;
  let colMap: Record<number, ColumnRole> = {};
  let invertAmount = false;

  // ── Modal container ────────────────────────────────────────────────────────
  const container = document.createElement('div');
  container.className = 'import-wizard';

  const { close } = openModal({
    title: `Import transactions — ${opts.targetName}`,
    content: container,
    backdropClose: false,
  });

  // openModal appends synchronously, so the dialog is immediately accessible
  const dialog = container.closest('dialog') as HTMLDialogElement;
  dialog.classList.add('import-wizard-modal');

  // Persistent footer pinned as a direct flex child of the dialog — outside
  // the scrollable .modal-body so it is always visible regardless of content height
  const wizardFooter = document.createElement('div');
  wizardFooter.className = 'iw-footer';
  dialog.appendChild(wizardFooter);

  // ── Step indicator builder ─────────────────────────────────────────────────

  function buildStepIndicator(active: 1 | 2 | 3 | 4): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'iw-steps';
    const steps = [
      { n: 1, label: 'Load file' },
      { n: 2, label: 'Map columns' },
      { n: 3, label: 'Review' },
      { n: 4, label: 'Confirm' },
    ] as const;
    steps.forEach(({ n, label }, i) => {
      const s = document.createElement('div');
      const cls = n < active ? 'done' : n === active ? 'active' : '';
      s.className = `iw-step ${cls}`.trim();
      const num = document.createElement('span');
      num.className = 'iw-step-num';
      num.textContent = n < active ? '✓' : String(n);
      s.appendChild(num);
      s.appendChild(document.createTextNode(` ${label}`));
      wrap.appendChild(s);
      if (i < steps.length - 1) {
        const sep = document.createElement('div');
        sep.className = 'iw-step-sep';
        wrap.appendChild(sep);
      }
    });
    return wrap;
  }

  // ── Quote char picker (shared between steps) ──────────────────────────────

  function buildQuoteRow(onChangeExtra?: () => void): HTMLElement {
    const QUOTE_OPTS: { label: string; value: string }[] = [
      { label: '" Double', value: '"' },
      { label: "' Single", value: "'" },
      { label: '— None',   value: '' },
    ];

    const row = document.createElement('div');
    row.className = 'iw-delimiter-row';

    const label = document.createElement('span');
    label.className = 'iw-delimiter-label';
    label.textContent = 'Quote char:';
    row.appendChild(label);

    const btns = document.createElement('div');
    btns.className = 'iw-delimiters';

    QUOTE_OPTS.forEach(({ label: lbl, value }) => {
      const btn = document.createElement('button');
      btn.className = 'iw-delim-btn' + (value === quoteChar ? ' active' : '');
      btn.textContent = lbl;
      btn.setAttribute('data-quote', value);
      btn.addEventListener('click', () => {
        quoteChar = value;
        btns.querySelectorAll<HTMLButtonElement>('.iw-delim-btn').forEach((b) =>
          b.classList.toggle('active', b.getAttribute('data-quote') === value),
        );
        onChangeExtra?.();
      });
      btns.appendChild(btn);
    });

    row.appendChild(btns);
    return row;
  }

  // ── Step 1 — load file ─────────────────────────────────────────────────────

  function showStep1(): void {
    container.innerHTML = '';
    container.appendChild(buildStepIndicator(1));

    const dropzone = document.createElement('div');
    dropzone.className = 'iw-dropzone';
    dropzone.setAttribute('data-testid', 'iw-dropzone');
    dropzone.innerHTML = `
      <div class="iw-dropzone-icon">📂</div>
      <div>Click to browse, or drag a file here</div>
      <div class="iw-dropzone-hint">CSV, TSV, or any delimited text file</div>
    `;

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'file';
    hiddenInput.accept = '.csv,.tsv,.txt,.dat';
    hiddenInput.style.display = 'none';

    dropzone.addEventListener('click', () => hiddenInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      const file = e.dataTransfer?.files[0];
      if (file) void loadFile(file);
    });

    hiddenInput.addEventListener('change', () => {
      const file = hiddenInput.files?.[0];
      if (file) void loadFile(file);
    });

    container.appendChild(dropzone);
    container.appendChild(hiddenInput);

    // Delimiter picker
    const delimRow = document.createElement('div');
    delimRow.className = 'iw-delimiter-row';

    const delimLabel = document.createElement('span');
    delimLabel.className = 'iw-delimiter-label';
    delimLabel.textContent = 'Delimiter:';
    delimRow.appendChild(delimLabel);

    const delimBtns = document.createElement('div');
    delimBtns.className = 'iw-delimiters';
    delimBtns.setAttribute('data-testid', 'iw-delimiter-btns');

    const DELIM_OPTS: { label: string; value: Delimiter }[] = [
      { label: 'Auto', value: '__auto__' },
      { label: 'Comma  ,', value: ',' },
      { label: 'Semicolon  ;', value: ';' },
      { label: 'Tab  ⇥', value: '\t' },
      { label: 'Pipe  |', value: '|' },
    ];

    let manualDelim: Delimiter | '__auto__' = '__auto__';
    const btns: HTMLButtonElement[] = [];

    DELIM_OPTS.forEach(({ label, value }) => {
      const btn = document.createElement('button');
      btn.className = 'iw-delim-btn' + (value === manualDelim ? ' active' : '');
      btn.textContent = label;
      btn.setAttribute('data-delim', String(value));
      btn.addEventListener('click', () => {
        manualDelim = value;
        btns.forEach((b) => b.classList.toggle('active', b.getAttribute('data-delim') === value));
        if (rawText) {
          delimiter = value === '__auto__' ? detectDelimiter(rawText) : value;
          updateRawPreview();
        }
      });
      delimBtns.appendChild(btn);
      btns.push(btn);
    });
    delimRow.appendChild(delimBtns);
    container.appendChild(delimRow);
    container.appendChild(buildQuoteRow());

    // File loaded indicator (hidden until file picked)
    const fileInfo = document.createElement('div');
    fileInfo.className = 'iw-file-loaded';
    fileInfo.style.display = 'none';
    fileInfo.setAttribute('data-testid', 'iw-file-info');
    container.appendChild(fileInfo);

    // Raw text preview (hidden until file loaded)
    const rawPre = document.createElement('pre');
    rawPre.className = 'iw-raw-preview';
    rawPre.style.display = 'none';
    container.appendChild(rawPre);

    // Error
    const errEl = document.createElement('div');
    errEl.className = 'iw-error';
    errEl.style.display = 'none';
    errEl.setAttribute('data-testid', 'iw-step1-error');
    container.appendChild(errEl);

    function updateRawPreview(): void {
      rawPre.textContent = rawText.slice(0, 1000);
      rawPre.style.display = '';
    }

    async function loadFile(file: File): Promise<void> {
      const MAX_MB = 20;
      if (file.size > MAX_MB * 1024 * 1024) {
        errEl.textContent = `File is too large (max ${MAX_MB} MB). Please trim the file and try again.`;
        errEl.style.display = '';
        return;
      }
      errEl.style.display = 'none';
      rawText = await file.text();
      fileName = file.name;
      fileSize = file.size;

      if (manualDelim === '__auto__') {
        delimiter = detectDelimiter(rawText);
        // Reflect detected delimiter in the buttons
        const detected = String(delimiter);
        btns.forEach((b) => b.classList.toggle('active', b.getAttribute('data-delim') === detected));
      }

      fileInfo.style.display = '';
      fileInfo.innerHTML = '';
      const icon = document.createElement('span');
      icon.textContent = '📄';
      const name = document.createElement('span');
      name.className = 'iw-file-loaded-name';
      name.textContent = fileName;
      const size = document.createElement('span');
      size.className = 'iw-file-loaded-size';
      size.textContent = formatBytes(fileSize);
      fileInfo.appendChild(icon);
      fileInfo.appendChild(name);
      fileInfo.appendChild(size);

      updateRawPreview();
      nextBtn.disabled = false;
    }

    // Footer
    wizardFooter.innerHTML = '';
    const left = document.createElement('div');
    left.className = 'iw-footer-left';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.setAttribute('data-testid', 'iw-cancel');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', close);
    left.appendChild(cancelBtn);
    wizardFooter.appendChild(left);

    const right = document.createElement('div');
    right.className = 'iw-footer-right';
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-primary';
    nextBtn.setAttribute('data-testid', 'iw-step1-next');
    nextBtn.textContent = 'Preview →';
    nextBtn.disabled = true;
    nextBtn.addEventListener('click', () => {
      parsed = parseCSV(rawText, delimiter, quoteChar);
      if (parsed.rows.length < 2) {
        errEl.textContent = 'No data rows found. Check the delimiter and try again.';
        errEl.style.display = '';
        return;
      }
      autoDetectMapping(parsed.headers, opts.targetType);
      showStep2();
    });
    right.appendChild(nextBtn);
    wizardFooter.appendChild(right);
  }

  // ── Auto-detect column mapping from header names ───────────────────────────

  function autoDetectMapping(headers: string[], targetType: 'bank-account' | 'debt-card'): void {
    colMap = {};
    const datePatterns = /date|day|posted|transaction/i;
    const descPatterns = /desc|name|narration|memo|detail|payee/i;
    const merchantPatterns = /merchant|vendor|payee|store/i;
    const amountPatterns = /^amount$|total|amt/i;
    const debitPatterns = /debit|withdrawal|withdrawl|debit.amt/i;
    const creditPatterns = /credit|deposit|credit.amt/i;
    const notePatterns = /note|comment|ref|reference/i;
    const catPatterns = /cat(egory)?|type/i;

    headers.forEach((h, i) => {
      const hTrim = h.trim();
      if (datePatterns.test(hTrim)) { colMap[i] = 'date'; return; }
      if (targetType === 'debt-card' && merchantPatterns.test(hTrim)) { colMap[i] = 'merchant'; return; }
      if (descPatterns.test(hTrim)) { colMap[i] = targetType === 'debt-card' ? 'merchant' : 'description'; return; }
      if (debitPatterns.test(hTrim)) { colMap[i] = 'debit'; return; }
      if (creditPatterns.test(hTrim)) { colMap[i] = 'credit'; return; }
      if (amountPatterns.test(hTrim)) { colMap[i] = 'amount'; return; }
      if (notePatterns.test(hTrim)) { colMap[i] = 'note'; return; }
      if (catPatterns.test(hTrim)) { colMap[i] = 'category'; return; }
    });
  }

  // ── Step 2 — map columns + full preview ───────────────────────────────────

  function showStep2(): void {
    container.innerHTML = '';
    container.appendChild(buildStepIndicator(2));

    if (!parsed) return;
    const { headers, rows } = parsed;
    const dataRows = rows.slice(1); // all rows after header

    const instruction = document.createElement('p');
    instruction.className = 'iw-map-instruction';
    instruction.innerHTML = `
      Assign a role to each column using the dropdowns in the header row.
      ${dataRows.length.toLocaleString()} rows found — scroll to review the full file.
    `;
    container.appendChild(instruction);

    // Delimiter picker (re-parse on change)
    const delimRow = document.createElement('div');
    delimRow.className = 'iw-delimiter-row';
    const delimLabel = document.createElement('span');
    delimLabel.className = 'iw-delimiter-label';
    delimLabel.textContent = 'Delimiter:';
    delimRow.appendChild(delimLabel);
    const delimBtns = document.createElement('div');
    delimBtns.className = 'iw-delimiters';
    const DELIM_OPTS2: { label: string; value: Delimiter }[] = [
      { label: 'Comma  ,', value: ',' },
      { label: 'Semicolon  ;', value: ';' },
      { label: 'Tab  ⇥', value: '\t' },
      { label: 'Pipe  |', value: '|' },
    ];
    DELIM_OPTS2.forEach(({ label, value }) => {
      const btn = document.createElement('button');
      btn.className = 'iw-delim-btn' + (value === delimiter ? ' active' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        delimiter = value;
        delimBtns.querySelectorAll('.iw-delim-btn').forEach((b) =>
          (b as HTMLElement).classList.toggle('active', (b as HTMLElement).textContent?.trim() === label.trim()),
        );
        parsed = parseCSV(rawText, delimiter, quoteChar);
        if (parsed) autoDetectMapping(parsed.headers, opts.targetType);
        showStep2();
      });
      delimBtns.appendChild(btn);
    });
    delimRow.appendChild(delimBtns);
    container.appendChild(delimRow);
    container.appendChild(buildQuoteRow(() => {
      parsed = parseCSV(rawText, delimiter, quoteChar);
      if (parsed) autoDetectMapping(parsed.headers, opts.targetType);
      showStep2();
    }));

    // Full preview table
    const tableWrap = document.createElement('div');
    tableWrap.className = 'iw-table-wrap';
    tableWrap.setAttribute('data-testid', 'iw-preview-table');

    const table = document.createElement('table');
    table.className = 'iw-table';

    // Header row with mapping selects
    const thead = document.createElement('thead');
    const hRow = document.createElement('tr');

    headers.forEach((h, colIdx) => {
      const th = document.createElement('th');
      const sel = document.createElement('select');
      sel.className = 'iw-col-select' + (colMap[colIdx] && colMap[colIdx] !== 'skip' ? ' mapped' : '');
      sel.setAttribute('data-testid', `iw-col-role-${colIdx}`);

      roles.forEach((role) => {
        const opt = document.createElement('option');
        opt.value = role;
        opt.textContent = ROLE_LABELS[role];
        if (colMap[colIdx] === role) opt.selected = true;
        sel.appendChild(opt);
      });

      sel.addEventListener('change', () => {
        colMap[colIdx] = sel.value as ColumnRole;
        sel.classList.toggle('mapped', sel.value !== 'skip');
        updateAmountOpts();
        updateError();
      });

      const colIdx2 = document.createElement('span');
      colIdx2.className = 'iw-col-idx';
      colIdx2.textContent = h || `Col ${colIdx + 1}`;

      th.appendChild(sel);
      th.appendChild(colIdx2);
      hRow.appendChild(th);
    });

    thead.appendChild(hRow);
    table.appendChild(thead);

    // All data rows
    const tbody = document.createElement('tbody');
    dataRows.forEach((row) => {
      const tr = document.createElement('tr');
      row.forEach((cell) => {
        const td = document.createElement('td');
        td.textContent = cell;
        td.title = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    container.appendChild(tableWrap);

    // Amount sign option (bank accounts only)
    const amountOptsWrap = document.createElement('div');
    amountOptsWrap.className = 'iw-amount-opts';
    amountOptsWrap.style.display = 'none';

    if (!isCard) {
      const label = document.createElement('span');
      label.className = 'iw-delimiter-label';
      label.textContent = 'Amounts:';
      amountOptsWrap.appendChild(label);

      const makeOpt = (id: string, text: string, checked: boolean): HTMLLabelElement => {
        const lbl = document.createElement('label');
        const inp = document.createElement('input');
        inp.type = 'radio';
        inp.name = 'iw-sign';
        inp.id = id;
        inp.checked = checked;
        inp.addEventListener('change', () => { invertAmount = id === 'iw-sign-invert'; });
        lbl.appendChild(inp);
        lbl.appendChild(document.createTextNode(' ' + text));
        return lbl;
      };
      amountOptsWrap.appendChild(makeOpt('iw-sign-natural', 'Negative = debit (most banks)', !invertAmount));
      amountOptsWrap.appendChild(makeOpt('iw-sign-invert', 'Positive = debit (invert sign)', invertAmount));
      container.appendChild(amountOptsWrap);
    }

    // Error
    const errEl = document.createElement('div');
    errEl.className = 'iw-error';
    errEl.style.display = 'none';
    errEl.setAttribute('data-testid', 'iw-step2-error');
    container.appendChild(errEl);

    function updateAmountOpts(): void {
      const hasAmount = Object.values(colMap).includes('amount');
      const hasDebitCredit = Object.values(colMap).includes('debit') || Object.values(colMap).includes('credit');
      amountOptsWrap.style.display = (hasAmount || hasDebitCredit) && !isCard ? '' : 'none';
    }
    updateAmountOpts();

    function updateError(): string | null {
      const roles2 = Object.values(colMap);
      const hasDate = roles2.includes('date');
      const hasAmount = roles2.includes('amount') || (roles2.includes('debit') || roles2.includes('credit'));
      const desc = isCard ? 'Merchant' : 'Description';
      const hasDesc = isCard ? roles2.includes('merchant') : roles2.includes('description');

      const errs: string[] = [];
      if (!hasDate) errs.push('Map a column to "Date"');
      if (!hasAmount) errs.push('Map a column to "Amount", "Debit", or "Credit"');
      if (!hasDesc) errs.push(`Map a column to "${desc}" (optional but recommended)`);

      const requiredMissing = !hasDate || !hasAmount;
      errEl.textContent = errs.join(' · ');
      errEl.style.display = requiredMissing ? '' : 'none';
      nextBtn.disabled = requiredMissing;
      return requiredMissing ? errs[0]! : null;
    }
    // Note: updateError() is called after the footer so nextBtn is in scope

    // Footer
    wizardFooter.innerHTML = '';
    const left = document.createElement('div');
    left.className = 'iw-footer-left';
    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-secondary';
    backBtn.setAttribute('data-testid', 'iw-step2-back');
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', () => showStep1());
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.setAttribute('data-testid', 'iw-cancel');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', close);
    left.appendChild(backBtn);
    left.appendChild(cancelBtn);
    wizardFooter.appendChild(left);

    const right = document.createElement('div');
    right.className = 'iw-footer-right';
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-primary';
    nextBtn.setAttribute('data-testid', 'iw-step2-next');
    nextBtn.disabled = true;
    nextBtn.textContent = 'Review import →';
    nextBtn.addEventListener('click', () => {
      const { validRows, skipped } = buildRows();
      if (validRows.length === 0) {
        errEl.textContent = 'No valid rows to import. Check the column mapping.';
        errEl.style.display = '';
        return;
      }
      void showStep3Review(validRows, skipped);
    });
    right.appendChild(nextBtn);
    wizardFooter.appendChild(right);
    updateError();
  }

  // ── Build parsed rows from current mapping ─────────────────────────────────

  function buildRows(): { validRows: ParsedRow[]; skipped: number } {
    if (!parsed) return { validRows: [], skipped: 0 };
    const dataRows = parsed.rows.slice(1);
    const valid: ParsedRow[] = [];
    let skipped = 0;

    const dateCol = colIndexFor('date');
    const descCol = colIndexFor(isCard ? 'merchant' : 'description') ?? colIndexFor('description') ?? colIndexFor('merchant');
    const amtCol = colIndexFor('amount');
    const debitCol = colIndexFor('debit');
    const creditCol = colIndexFor('credit');
    const noteCol = colIndexFor('note');
    const catCol = colIndexFor('category');

    for (const row of dataRows) {
      const rawDate = dateCol !== null ? (row[dateCol] ?? '') : '';
      const date = parseDate(rawDate);
      if (date === null) { skipped++; continue; }

      let amount: number | null = null;
      if (amtCol !== null) {
        amount = parseAmount(row[amtCol] ?? '');
        if (amount !== null && invertAmount && !isCard) amount = -amount;
      } else if (debitCol !== null || creditCol !== null) {
        const debit = debitCol !== null ? (parseAmount(row[debitCol] ?? '') ?? 0) : 0;
        const credit = creditCol !== null ? (parseAmount(row[creditCol] ?? '') ?? 0) : 0;
        // For bank: net = credit - debit. For card: charge = debit (positive).
        amount = isCard ? Math.abs(debit || credit) : (credit - Math.abs(debit));
      }

      if (amount === null || !isFinite(amount)) { skipped++; continue; }
      // For card charges: amount must be positive
      if (isCard) amount = Math.abs(amount);

      valid.push({
        date,
        description: descCol !== null ? (row[descCol] ?? '').trim() : '',
        amount,
        note: noteCol !== null ? (row[noteCol] ?? '').trim() : '',
        categoryHint: catCol !== null ? (row[catCol] ?? '').trim() : '',
        raw: row,
      });
    }

    return { validRows: valid, skipped };
  }

  function colIndexFor(role: ColumnRole): number | null {
    for (const [idx, r] of Object.entries(colMap)) {
      if (r === role) return +idx;
    }
    return null;
  }

  // ── Step 3 — interactive row-by-row review ────────────────────────────────

  async function showStep3Review(validRows: ParsedRow[], skipped: number): Promise<void> {
    container.innerHTML = '';
    container.appendChild(buildStepIndicator(3));

    // Loading state while fetching context
    const loadEl = document.createElement('p');
    loadEl.className = 'text-muted text-sm';
    loadEl.style.cssText = 'padding:var(--space-8) 0;text-align:center';
    loadEl.textContent = 'Loading your accounts and expenses…';
    container.appendChild(loadEl);

    const [fetchedExpenses, fetchedDebts, allBanks, fetchedRules, repeatEnabled, repeatThreshold] = await Promise.all([
      getExpenses(), getDebtAccounts(), getBankAccounts(), getTransactionRules(),
      getSetting<boolean>('import.repeatDetection.enabled'),
      getSetting<number>('import.repeatDetection.threshold'),
    ]);

    const ctx = {
      expenses: fetchedExpenses,
      debtAccounts: fetchedDebts,
      otherBankAccounts: allBanks.filter((b) => b.id !== opts.targetId),
    };

    const isRepeatEnabled = repeatEnabled ?? true;
    const threshold = repeatThreshold ?? 5;

    // Mutable rules map — updated as user confirms decisions
    const rulesMap = new Map<string, TransactionRule>(fetchedRules.map((r) => [r.pattern, r]));

    // Tracks which row indexes were auto-matched by an active rule
    const autoMatched = new Set<number>();

    // Auto-suggest initial decisions: rules → name match → keyword inference
    function autoSuggest(row: ParsedRow, rowIdx: number): ReviewAction | null {
      const desc = row.description.toLowerCase().trim();
      if (isRepeatEnabled) {
        const pattern = normalizePattern(row.description);
        const rule = rulesMap.get(pattern);
        if (rule?.autoManage) {
          autoMatched.add(rowIdx);
          return rule.action as ReviewAction;
        }
      }
      if (desc.length < 3) return null;
      for (const exp of ctx.expenses) {
        const name = exp.description.toLowerCase();
        if (name.length >= 3 && desc.includes(name.slice(0, Math.min(name.length, 12)))) {
          return { type: 'expense', expenseId: exp.id };
        }
      }
      for (const debt of ctx.debtAccounts) {
        const name = debt.name.toLowerCase();
        if (name.length >= 3 && desc.includes(name.slice(0, Math.min(name.length, 10)))) {
          return { type: 'debt-payment', debtAccountId: debt.id };
        }
      }
      // Keyword-based fallback inference (bank accounts only — card form has no radio types)
      const inferred = inferActionType(row.description, row.amount ?? 0, isCard);
      if (inferred === 'income')        return { type: 'income' };
      if (inferred === 'transfer')      return { type: 'transfer',      toAccountId: '' };
      if (inferred === 'debt-payment')  return { type: 'debt-payment',  debtAccountId: '' };
      return null;
    }

    const decisions: (ReviewAction | null)[] = validRows.map((row, i) => autoSuggest(row, i));
    let currentIdx = 0;

    // Helper: build a <select> element
    function buildSelect(id: string, items: { value: string; label: string }[], selectedValue: string, placeholder: string): HTMLSelectElement {
      const sel = document.createElement('select');
      sel.id = id;
      sel.className = 'iw-review-select';
      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = placeholder;
      sel.appendChild(ph);
      items.forEach(({ value, label }) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        if (value === selectedValue) opt.selected = true;
        sel.appendChild(opt);
      });
      return sel;
    }

    // Helper: build inline quick-create form (generic)
    function buildQCForm(fields: HTMLElement[], onSave: () => Promise<void>): HTMLElement {
      const wrap = document.createElement('div');
      wrap.className = 'iw-quick-create';
      fields.forEach((f) => wrap.appendChild(f));
      const btnRow = document.createElement('div');
      btnRow.className = 'iw-qc-btns';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn btn-primary btn-sm';
      saveBtn.textContent = '✓ Save & link';
      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        await onSave();
        saveBtn.disabled = false;
      });
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-secondary btn-sm iw-qc-cancel';
      cancelBtn.textContent = '✗ Cancel';
      btnRow.appendChild(saveBtn);
      btnRow.appendChild(cancelBtn);
      wrap.appendChild(btnRow);
      return wrap;
    }

    // Collect the current decision from the form
    function collectDecision(optsWrap: HTMLElement, note: string): ReviewAction {
      const n = note || undefined;
      const checked = optsWrap.querySelector<HTMLInputElement>('input[name="iw-review-action"]:checked');
      const actionType = checked?.value ?? 'skip';
      switch (actionType) {
        case 'expense': {
          const expenseId = optsWrap.querySelector<HTMLSelectElement>('#iw-exp-select')?.value ?? '';
          return expenseId ? { type: 'expense', expenseId, ...(n ? { note: n } : {}) } : { type: 'skip' };
        }
        case 'debt-payment': {
          const debtAccountId = optsWrap.querySelector<HTMLSelectElement>('#iw-debt-select')?.value ?? '';
          return debtAccountId ? { type: 'debt-payment', debtAccountId, ...(n ? { note: n } : {}) } : { type: 'skip' };
        }
        case 'transfer': {
          const toAccountId = optsWrap.querySelector<HTMLSelectElement>('#iw-transfer-select')?.value ?? '';
          return toAccountId ? { type: 'transfer', toAccountId, ...(n ? { note: n } : {}) } : { type: 'skip' };
        }
        case 'income': return { type: 'income', ...(n ? { note: n } : {}) };
        case 'category': {
          const categoryId = optsWrap.querySelector<HTMLSelectElement>('#iw-cat-select')?.value ?? '';
          return { type: 'category', ...(categoryId ? { categoryId } : {}), ...(n ? { note: n } : {}) };
        }
        default: return { type: 'skip' };
      }
    }

    function renderReviewCard(idx: number): void {
      container.innerHTML = '';
      wizardFooter.innerHTML = '';
      container.appendChild(buildStepIndicator(3));

      const row = validRows[idx]!;
      const isDebit = (row.amount ?? 0) < 0;
      const curDecision: ReviewAction | null = decisions[idx] ?? null;
      const noun = isCard ? 'Charge' : 'Transaction';

      // ── Progress ─────────────────────────────────────────────────────────
      const progressHead = document.createElement('div');
      progressHead.className = 'iw-review-progress';
      const progressLabel = document.createElement('span');
      progressLabel.className = 'iw-review-progress-label';
      progressLabel.setAttribute('data-testid', 'iw-review-progress');
      progressLabel.textContent = `${noun} ${idx + 1} of ${validRows.length}`;
      progressHead.appendChild(progressLabel);
      const skipAllBtn = document.createElement('button');
      skipAllBtn.className = 'btn btn-secondary btn-sm';
      skipAllBtn.setAttribute('data-testid', 'iw-review-skip-all');
      skipAllBtn.textContent = `Skip remaining ${validRows.length - idx} →`;
      skipAllBtn.addEventListener('click', async () => {
        for (let i = idx; i < decisions.length; i++) decisions[i] = { type: 'skip' };
        const dup = await findDuplicateImport(rawText);
        showStep4(validRows, skipped, decisions, dup, () => renderReviewCard(validRows.length - 1));
      });
      progressHead.appendChild(skipAllBtn);
      container.appendChild(progressHead);

      const barWrap = document.createElement('div');
      barWrap.className = 'iw-review-bar';
      const barFill = document.createElement('div');
      barFill.className = 'iw-review-bar-fill';
      barFill.style.width = `${Math.max(2, Math.round((idx / validRows.length) * 100))}%`;
      barWrap.appendChild(barFill);
      container.appendChild(barWrap);

      // ── Transaction display ───────────────────────────────────────────────
      const txnCard = document.createElement('div');
      txnCard.className = 'iw-review-txn';
      const dateStr = new Date(row.date!).toLocaleDateString(userLocale, { month: 'short', day: 'numeric', year: 'numeric' });
      const amtStr = `${isDebit ? '−' : '+'}${fmtCents.format(Math.abs(row.amount ?? 0))}`;

      const dateSpan = document.createElement('span');
      dateSpan.className = 'iw-review-txn-date';
      dateSpan.textContent = dateStr;

      const descSpan = document.createElement('span');
      descSpan.className = 'iw-review-txn-desc';
      descSpan.title = row.description || '';
      descSpan.textContent = row.description || '(no description)';

      const amtSpan = document.createElement('span');
      amtSpan.className = `iw-review-txn-amount ${isDebit ? 'debit' : 'credit'}`;
      amtSpan.textContent = amtStr;

      const editToggle = document.createElement('button');
      editToggle.type = 'button';
      editToggle.className = 'iw-review-edit-toggle';
      editToggle.setAttribute('data-testid', 'iw-review-edit-toggle');
      editToggle.title = 'Edit transaction details';
      editToggle.textContent = '✏ Edit';

      txnCard.appendChild(dateSpan);
      txnCard.appendChild(descSpan);
      txnCard.appendChild(amtSpan);
      txnCard.appendChild(editToggle);
      container.appendChild(txnCard);

      // ── Inline edit section
      const editSection = document.createElement('div');
      editSection.className = 'iw-review-edit';
      editSection.style.display = 'none';
      editSection.setAttribute('data-testid', 'iw-review-edit-form');

      const makeEditRow = (labelText: string, input: HTMLElement): HTMLElement => {
        const erow = document.createElement('div');
        erow.className = 'iw-review-edit-row';
        const lbl = document.createElement('label');
        lbl.className = 'iw-delimiter-label';
        lbl.textContent = labelText;
        erow.appendChild(lbl);
        erow.appendChild(input);
        return erow;
      };

      const editDateInput = document.createElement('input');
      editDateInput.type = 'date';
      editDateInput.className = 'iw-review-edit-input';
      editDateInput.setAttribute('data-testid', 'iw-review-edit-date');
      if (row.date) {
        const dd = new Date(row.date);
        editDateInput.value = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
      }

      const editDescInput = document.createElement('input');
      editDescInput.type = 'text';
      editDescInput.className = 'iw-review-edit-input';
      editDescInput.maxLength = 128;
      editDescInput.setAttribute('data-testid', 'iw-review-edit-desc');
      editDescInput.placeholder = 'Transaction description';
      editDescInput.value = row.description;

      const editAmtInput = document.createElement('input');
      editAmtInput.type = 'number';
      editAmtInput.className = 'iw-review-edit-input';
      editAmtInput.step = '0.01';
      editAmtInput.setAttribute('data-testid', 'iw-review-edit-amount');
      editAmtInput.value = (row.amount ?? 0).toFixed(2);
      if (!isCard) editAmtInput.title = 'Negative = debit (money out), positive = credit (money in)';

      editSection.appendChild(makeEditRow('Date:', editDateInput));
      editSection.appendChild(makeEditRow('Description:', editDescInput));
      editSection.appendChild(makeEditRow(`Amount${!isCard ? ' (−=debit)' : ''}:`, editAmtInput));

      const editBtnsRow = document.createElement('div');
      editBtnsRow.className = 'iw-review-edit-btns';

      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.className = 'btn btn-primary btn-sm';
      applyBtn.setAttribute('data-testid', 'iw-review-edit-apply');
      applyBtn.textContent = '✓ Apply changes';

      const cancelEditBtn = document.createElement('button');
      cancelEditBtn.type = 'button';
      cancelEditBtn.className = 'btn btn-secondary btn-sm';
      cancelEditBtn.setAttribute('data-testid', 'iw-review-edit-cancel');
      cancelEditBtn.textContent = 'Cancel';

      editBtnsRow.appendChild(applyBtn);
      editBtnsRow.appendChild(cancelEditBtn);
      editSection.appendChild(editBtnsRow);
      container.appendChild(editSection);

      editToggle.addEventListener('click', () => {
        editSection.style.display = '';
        editToggle.classList.add('active');
      });

      cancelEditBtn.addEventListener('click', () => {
        editSection.style.display = 'none';
        editToggle.classList.remove('active');
      });

      applyBtn.addEventListener('click', () => {
        const newDateStr = editDateInput.value;
        if (!newDateStr) { editDateInput.focus(); return; }
        const parts = newDateStr.split('-').map(Number);
        const newDate = new Date(parts[0]!, parts[1]! - 1, parts[2]!).getTime();
        if (isNaN(newDate)) { editDateInput.focus(); return; }

        const newDesc = editDescInput.value.trim();
        const newAmtRaw = parseFloat(editAmtInput.value);
        if (!isFinite(newAmtRaw)) { editAmtInput.focus(); return; }

        const newAmt = isCard ? Math.abs(newAmtRaw) : newAmtRaw;
        validRows[idx] = { ...validRows[idx]!, date: newDate, description: newDesc, amount: newAmt };
        renderReviewCard(idx);
      });

      // ── Auto-match banner ─────────────────────────────────────────────────
      if (autoMatched.has(idx)) {
        const banner = document.createElement('div');
        banner.className = 'iw-automatch-banner';
        banner.innerHTML = `<span class="iw-automatch-icon">🔁</span> Auto-matched from your rules. Confirm to accept or change below.`;
        container.appendChild(banner);
      }

      // ── Categorization form ───────────────────────────────────────────────
      const optsWrap = document.createElement('div');
      optsWrap.className = 'iw-review-opts';

      if (isCard) {
        buildCardForm(optsWrap, curDecision);
      } else if (isDebit) {
        buildDebitForm(optsWrap, curDecision, row);
      } else {
        buildCreditForm(optsWrap, curDecision);
      }
      container.appendChild(optsWrap);

      // ── Note field ────────────────────────────────────────────────────────
      const noteRow = document.createElement('div');
      noteRow.className = 'iw-review-note-row';
      const noteLbl = document.createElement('label');
      noteLbl.className = 'iw-delimiter-label';
      noteLbl.textContent = 'Note:';
      noteLbl.htmlFor = 'iw-review-note';
      const noteInput = document.createElement('input');
      noteInput.type = 'text';
      noteInput.id = 'iw-review-note';
      noteInput.className = 'iw-review-note-input';
      noteInput.placeholder = 'Optional note for this transaction…';
      noteInput.maxLength = 128;
      const existingNote = (curDecision && curDecision.type !== 'skip' && 'note' in curDecision)
        ? (curDecision.note ?? row.note ?? '') : (row.note ?? '');
      noteInput.value = existingNote;
      noteRow.appendChild(noteLbl);
      noteRow.appendChild(noteInput);
      container.appendChild(noteRow);

      // ── Navigation helpers (defined before the footer that references them) ──
      const doAdvance = (): void => {
        currentIdx = idx + 1;
        if (currentIdx >= validRows.length) {
          void findDuplicateImport(rawText).then((dup) => {
            showStep4(validRows, skipped, decisions, dup, () => renderReviewCard(validRows.length - 1));
          });
        } else {
          renderReviewCard(currentIdx);
        }
      };

      const showAutoManagePrompt = async (rule: TransactionRule): Promise<void> => {
        container.innerHTML = '';
        container.appendChild(buildStepIndicator(3));

        const prompt = document.createElement('div');
        prompt.className = 'iw-automatch-prompt';
        prompt.innerHTML = `
          <div class="iw-automatch-prompt-icon">🔁</div>
          <p class="iw-automatch-prompt-title">Pattern recognized</p>
          <p class="iw-automatch-prompt-desc">
            We've confirmed <strong>${rule.appliedCount} transactions</strong> matching
            <strong>"${escHtml(rule.displayName)}"</strong>.<br>
            Would you like to auto-manage similar transactions going forward?
          </p>
          <p class="iw-automatch-prompt-hint">You can always manage or clear rules in Settings → Repeat Transaction Detection.</p>
        `;

        const btnRow = document.createElement('div');
        btnRow.className = 'iw-automatch-prompt-btns';

        const yesBtn = document.createElement('button');
        yesBtn.className = 'btn btn-primary';
        yesBtn.setAttribute('data-testid', 'iw-automatch-yes');
        yesBtn.textContent = 'Yes, auto-manage →';
        yesBtn.addEventListener('click', async () => {
          const updated = { ...rule, autoManage: true };
          await saveTransactionRule(updated);
          rulesMap.set(rule.pattern, updated);
          doAdvance();
        });

        const noBtn = document.createElement('button');
        noBtn.className = 'btn btn-secondary';
        noBtn.setAttribute('data-testid', 'iw-automatch-no');
        noBtn.textContent = 'Not now, continue →';
        noBtn.addEventListener('click', () => doAdvance());

        btnRow.appendChild(yesBtn);
        btnRow.appendChild(noBtn);
        prompt.appendChild(btnRow);
        container.appendChild(prompt);
      };

      const advance = async (): Promise<void> => {
        const confirmedDecision = decisions[idx];
        if (isRepeatEnabled && confirmedDecision && confirmedDecision.type !== 'skip') {
          const ruleAction = toRuleAction(confirmedDecision);
          if (ruleAction) {
            const pattern = normalizePattern(row.description);
            const existing = rulesMap.get(pattern);
            const now = Date.now();
            const thresholdJustReached = existing
              ? existing.appliedCount + 1 === threshold
              : threshold === 1;

            const updated: TransactionRule = existing
              ? { ...existing, action: ruleAction, appliedCount: existing.appliedCount + 1, lastUsedAt: now }
              : {
                  id: crypto.randomUUID(), pattern,
                  displayName: row.description.slice(0, 80),
                  action: ruleAction, appliedCount: 1,
                  autoManage: false, createdAt: now, lastUsedAt: now,
                };

            await saveTransactionRule(updated);
            rulesMap.set(pattern, updated);

            if (thresholdJustReached) {
              await showAutoManagePrompt(updated);
              return;
            }
          }
        }
        doAdvance();
      };

      // ── Footer ────────────────────────────────────────────────────────────
      const left = document.createElement('div');
      left.className = 'iw-footer-left';
      const prevBtn = document.createElement('button');
      prevBtn.className = 'btn btn-secondary';
      prevBtn.setAttribute('data-testid', 'iw-review-prev');
      prevBtn.textContent = '← Prev';
      prevBtn.disabled = idx === 0;
      prevBtn.addEventListener('click', () => { currentIdx = idx - 1; renderReviewCard(currentIdx); });
      const remapBtn = document.createElement('button');
      remapBtn.className = 'btn btn-secondary';
      remapBtn.setAttribute('data-testid', 'iw-review-remap');
      remapBtn.textContent = 'Re-map columns';
      remapBtn.title = 'Go back to column mapping (your current review decisions will be discarded)';
      remapBtn.addEventListener('click', () => showStep2());
      const cancelBtn2 = document.createElement('button');
      cancelBtn2.className = 'btn btn-secondary';
      cancelBtn2.setAttribute('data-testid', 'iw-cancel');
      cancelBtn2.textContent = 'Cancel';
      cancelBtn2.addEventListener('click', close);
      left.appendChild(prevBtn);
      left.appendChild(remapBtn);
      left.appendChild(cancelBtn2);
      wizardFooter.appendChild(left);

      const right = document.createElement('div');
      right.className = 'iw-footer-right';
      const skipBtn = document.createElement('button');
      skipBtn.className = 'btn btn-secondary';
      skipBtn.setAttribute('data-testid', 'iw-review-skip');
      skipBtn.textContent = 'Skip →';
      skipBtn.addEventListener('click', () => { decisions[idx] = { type: 'skip' }; void advance(); });
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'btn btn-primary';
      confirmBtn.setAttribute('data-testid', 'iw-review-confirm');
      confirmBtn.textContent = idx === validRows.length - 1 ? 'Done — summary →' : 'Confirm →';
      confirmBtn.addEventListener('click', async () => {
        decisions[idx] = collectDecision(optsWrap, noteInput.value.trim());
        confirmBtn.disabled = true;
        await advance();
      });
      right.appendChild(skipBtn);
      right.appendChild(confirmBtn);
      wizardFooter.appendChild(right);
    }

    // ── Form builders ─────────────────────────────────────────────────────────────

    function attachRadioDelegate(wrap: HTMLElement): void {
      wrap.addEventListener('change', (e) => {
        const radio = e.target as HTMLInputElement;
        if (radio.name !== 'iw-review-action') return;
        wrap.querySelectorAll<HTMLElement>('.iw-review-opt-detail').forEach((d) => { d.style.display = 'none'; });
        const detail = wrap.querySelector<HTMLElement>(`.iw-opt-detail-${CSS.escape(radio.value)}`);
        if (detail) detail.style.display = '';
      });
    }

    function makeRadioRow(value: string, label: string, isChecked: boolean, detail?: HTMLElement): HTMLElement {
      const row = document.createElement('div');
      row.className = 'iw-review-opt-row';
      // Radio lives inside the label so they are always locked together in layout
      const lbl = document.createElement('label');
      lbl.className = 'iw-review-opt-label';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'iw-review-action';
      radio.id = `iw-action-${value}`;
      radio.value = value;
      radio.checked = isChecked;
      lbl.appendChild(radio);
      lbl.appendChild(document.createTextNode(label));
      row.appendChild(lbl);
      if (detail) {
        detail.classList.add('iw-review-opt-detail', `iw-opt-detail-${value}`);
        detail.style.display = isChecked ? '' : 'none';
        row.appendChild(detail);
      }
      return row;
    }

    function makeToggleCreate(toggleBtn: HTMLButtonElement, form: HTMLElement): void {
      toggleBtn.addEventListener('click', () => { form.style.display = ''; toggleBtn.style.display = 'none'; });
      form.querySelector<HTMLButtonElement>('.iw-qc-cancel')?.addEventListener('click', () => {
        form.style.display = 'none'; toggleBtn.style.display = '';
      });
    }

    function buildDebitForm(wrap: HTMLElement, dec: ReviewAction | null, row: ParsedRow): void {
      const q = document.createElement('p');
      q.className = 'iw-review-opts-label';
      q.textContent = 'What is this transaction?';
      wrap.appendChild(q);

      const initial = (!dec || dec.type === 'skip') ? 'skip' : dec.type;

      // ── Expense option ─────────────────────────────────────────────
      const expDetail = document.createElement('div');
      const expSel = buildSelect(
        'iw-exp-select',
        ctx.expenses.map((e) => ({ value: e.id, label: e.description })),
        dec?.type === 'expense' ? dec.expenseId : '',
        '— Select expense —',
      );
      expDetail.appendChild(expSel);
      const expToggle = document.createElement('button');
      expToggle.type = 'button';
      expToggle.className = 'btn-import iw-qc-toggle';
      expToggle.textContent = '+ New expense';
      expDetail.appendChild(expToggle);

      // Inline expense create form
      const expNameInput = document.createElement('input');
      expNameInput.type = 'text';
      expNameInput.placeholder = 'Expense name';
      expNameInput.maxLength = 64;
      expNameInput.value = row.description.slice(0, 64);
      const expAmtInput = document.createElement('input');
      expAmtInput.type = 'number';
      expAmtInput.min = '0';
      expAmtInput.step = '0.01';
      expAmtInput.placeholder = 'Monthly amount';
      expAmtInput.value = Math.abs(row.amount ?? 0).toFixed(2);
      const expFreqSel = document.createElement('select');
      (['monthly', 'weekly', 'quarterly', 'annual', 'once'] as const).forEach((f) => {
        const o = document.createElement('option');
        o.value = f;
        o.textContent = f.charAt(0).toUpperCase() + f.slice(1);
        expFreqSel.appendChild(o);
      });

      const expCreateForm = buildQCForm([expNameInput, expAmtInput, expFreqSel], async () => {
        const name = expNameInput.value.trim();
        if (!name) { expNameInput.focus(); return; }
        const amount = parseFloat(expAmtInput.value) || 0;
        const freq = expFreqSel.value as IncomeFrequency;
        const newExp: Expense = {
          id: crypto.randomUUID(),
          categoryId: opts.categories[0]?.id ?? '',
          memberId: null,
          description: name,
          amount,
          date: Date.now(),
          recurring: freq !== 'once',
          recurringFrequency: freq !== 'once' ? freq : null,
          createdAt: Date.now(),
        };
        await saveExpense(newExp);
        ctx.expenses.push(newExp);
        const newOpt = document.createElement('option');
        newOpt.value = newExp.id;
        newOpt.textContent = newExp.description;
        newOpt.selected = true;
        expSel.appendChild(newOpt);
        expCreateForm.style.display = 'none';
        expToggle.style.display = '';
        wrap.querySelector<HTMLInputElement>('#iw-action-expense')!.checked = true;
        expDetail.style.display = '';
      });
      expCreateForm.style.display = 'none';
      expDetail.appendChild(expCreateForm);
      makeToggleCreate(expToggle, expCreateForm);
      wrap.appendChild(makeRadioRow('expense', 'Expense payment', initial === 'expense', expDetail));

      // ── Debt payment option ────────────────────────────────────────
      const debtDetail = document.createElement('div');
      const debtSel = buildSelect(
        'iw-debt-select',
        ctx.debtAccounts.map((d) => ({ value: d.id, label: d.name })),
        dec?.type === 'debt-payment' ? dec.debtAccountId : '',
        '— Select account —',
      );
      debtDetail.appendChild(debtSel);
      const debtToggle = document.createElement('button');
      debtToggle.type = 'button';
      debtToggle.className = 'btn-import iw-qc-toggle';
      debtToggle.textContent = '+ New account';
      debtDetail.appendChild(debtToggle);

      const debtNameInput = document.createElement('input');
      debtNameInput.type = 'text';
      debtNameInput.placeholder = 'Account name (e.g. Chase Sapphire)';
      debtNameInput.maxLength = 64;
      const debtTypeSel = document.createElement('select');
      (['card', 'loan', 'mortgage', 'vehicle', 'medical'] as const).forEach((t) => {
        const o = document.createElement('option');
        o.value = t;
        o.textContent = { card: 'Credit Card', loan: 'Personal Loan', mortgage: 'Mortgage', vehicle: 'Vehicle Loan', medical: 'Medical Debt' }[t];
        debtTypeSel.appendChild(o);
      });
      const debtBalInput = document.createElement('input');
      debtBalInput.type = 'number';
      debtBalInput.min = '0';
      debtBalInput.step = '0.01';
      debtBalInput.placeholder = 'Current balance';
      const debtAprInput = document.createElement('input');
      debtAprInput.type = 'number';
      debtAprInput.min = '0';
      debtAprInput.step = '0.01';
      debtAprInput.placeholder = 'APR %';
      debtAprInput.value = '0';

      const debtCreateForm = buildQCForm([debtNameInput, debtTypeSel, debtBalInput, debtAprInput], async () => {
        const name = debtNameInput.value.trim();
        if (!name) { debtNameInput.focus(); return; }
        const balance = parseFloat(debtBalInput.value) || 0;
        const apr = parseFloat(debtAprInput.value) || 0;
        const newDebt = createDebtAccount(debtTypeSel.value as DebtAccountType, name, balance, apr);
        await saveDebtAccount(newDebt);
        ctx.debtAccounts.push(newDebt);
        const newOpt = document.createElement('option');
        newOpt.value = newDebt.id;
        newOpt.textContent = newDebt.name;
        newOpt.selected = true;
        debtSel.appendChild(newOpt);
        debtCreateForm.style.display = 'none';
        debtToggle.style.display = '';
        wrap.querySelector<HTMLInputElement>('#iw-action-debt-payment')!.checked = true;
        debtDetail.style.display = '';
      });
      debtCreateForm.style.display = 'none';
      debtDetail.appendChild(debtCreateForm);
      makeToggleCreate(debtToggle, debtCreateForm);
      wrap.appendChild(makeRadioRow('debt-payment', 'Card / debt payment', initial === 'debt-payment', debtDetail));

      // ── Transfer option ────────────────────────────────────────────
      if (ctx.otherBankAccounts.length > 0) {
        const trDetail = document.createElement('div');
        const trSel = buildSelect(
          'iw-transfer-select',
          ctx.otherBankAccounts.map((b) => ({ value: b.id, label: b.name })),
          dec?.type === 'transfer' ? dec.toAccountId : '',
          '— Select account —',
        );
        trDetail.appendChild(trSel);
        wrap.appendChild(makeRadioRow('transfer', 'Transfer to account', initial === 'transfer', trDetail));
      }

      // ── Skip ───────────────────────────────────────────────────────
      wrap.appendChild(makeRadioRow('skip', 'Skip / uncategorized', initial === 'skip' || !initial));

      attachRadioDelegate(wrap);
    }

    function buildCreditForm(wrap: HTMLElement, dec: ReviewAction | null): void {
      const q = document.createElement('p');
      q.className = 'iw-review-opts-label';
      q.textContent = 'What is this transaction?';
      wrap.appendChild(q);

      const initial = (dec?.type === 'income' ? 'income' : dec?.type === 'transfer' ? 'transfer' : 'income') as string;

      wrap.appendChild(makeRadioRow('income', 'Income / deposit', initial === 'income'));

      if (ctx.otherBankAccounts.length > 0) {
        const trDetail = document.createElement('div');
        const trSel = buildSelect(
          'iw-transfer-select',
          ctx.otherBankAccounts.map((b) => ({ value: b.id, label: b.name })),
          dec?.type === 'transfer' ? dec.toAccountId : '',
          '— Select source account —',
        );
        trDetail.appendChild(trSel);
        wrap.appendChild(makeRadioRow('transfer', 'Transfer from account', initial === 'transfer', trDetail));
      }

      wrap.appendChild(makeRadioRow('skip', 'Skip / other', initial === 'skip'));
      attachRadioDelegate(wrap);
    }

    function buildCardForm(wrap: HTMLElement, dec: ReviewAction | null): void {
      const catRow = document.createElement('div');
      catRow.className = 'iw-review-cat-row';
      const catLbl = document.createElement('label');
      catLbl.className = 'iw-delimiter-label';
      catLbl.textContent = 'Category (optional):';
      catLbl.htmlFor = 'iw-cat-select';
      catRow.appendChild(catLbl);

      const catSelWrap = document.createElement('div');
      catSelWrap.className = 'iw-review-opt-detail';
      catSelWrap.style.display = '';
      const selectedCat = dec?.type === 'category' ? (dec.categoryId ?? '') : '';
      const catSel = buildSelect(
        'iw-cat-select',
        opts.categories.map((c) => ({ value: c.id, label: c.name })),
        selectedCat,
        '— None / skip —',
      );
      catSelWrap.appendChild(catSel);

      const catToggle = document.createElement('button');
      catToggle.type = 'button';
      catToggle.className = 'btn-import iw-qc-toggle';
      catToggle.textContent = '+ New category';
      catSelWrap.appendChild(catToggle);

      const catNameInput = document.createElement('input');
      catNameInput.type = 'text';
      catNameInput.placeholder = 'Category name (e.g. Groceries)';
      catNameInput.maxLength = 48;
      const catColorInput = document.createElement('input');
      catColorInput.type = 'color';
      catColorInput.value = '#C9A84C';
      catColorInput.style.cssText = 'width:40px;height:32px;padding:2px;cursor:pointer';

      const catCreateForm = buildQCForm([catNameInput, catColorInput], async () => {
        const name = catNameInput.value.trim();
        if (!name) { catNameInput.focus(); return; }
        const newCat: ExpenseCategory = {
          id: crypto.randomUUID(),
          name,
          color: catColorInput.value,
          parentId: null,
          createdAt: Date.now(),
        };
        await saveCategory(newCat);
        opts.categories.push(newCat);
        const newOpt = document.createElement('option');
        newOpt.value = newCat.id;
        newOpt.textContent = newCat.name;
        newOpt.selected = true;
        catSel.appendChild(newOpt);
        catCreateForm.style.display = 'none';
        catToggle.style.display = '';
      });
      catCreateForm.style.display = 'none';
      catSelWrap.appendChild(catCreateForm);
      makeToggleCreate(catToggle, catCreateForm);

      // For card, we use a hidden radio to keep collectDecision consistent
      const hiddenRadio = document.createElement('input');
      hiddenRadio.type = 'radio';
      hiddenRadio.name = 'iw-review-action';
      hiddenRadio.value = 'category';
      hiddenRadio.checked = true;
      hiddenRadio.style.display = 'none';
      catRow.appendChild(hiddenRadio);
      catRow.appendChild(catSelWrap);
      wrap.appendChild(catRow);
    }

    renderReviewCard(0);
  }

  // ── Step 4 — confirm ───────────────────────────────────────────────────────

  function showStep4(
    validRows: ParsedRow[],
    skipped: number,
    decisions: (ReviewAction | null)[],
    dup: ImportRecord | null,
    goBack?: () => void,
  ): void {
    container.innerHTML = '';
    wizardFooter.innerHTML = '';
    container.appendChild(buildStepIndicator(4));

    // Duplicate warning
    if (dup) {
      const banner = document.createElement('div');
      banner.className = 'iw-duplicate-banner';
      banner.setAttribute('data-testid', 'iw-duplicate-warning');
      const icon = document.createElement('span');
      icon.className = 'iw-duplicate-icon';
      icon.textContent = '⚠️';
      const text = document.createElement('div');
      const dupDate = new Date(dup.importedAt).toLocaleString(userLocale, {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
      });
      text.innerHTML = `<strong>Possible duplicate.</strong> A file with identical content was imported from <strong>${dup.targetName}</strong> on ${dupDate} (${dup.rowCount.toLocaleString()} rows). You can still proceed — this is just a heads-up.`;
      banner.appendChild(icon);
      banner.appendChild(text);
      container.appendChild(banner);
    }

    // Snapshot callout
    const snapLabel = importSnapshotLabel(opts.targetName);
    const snapCallout = document.createElement('div');
    snapCallout.className = 'iw-snapshot-callout';
    const snapIcon = document.createElement('span');
    snapIcon.className = 'iw-snapshot-icon';
    snapIcon.textContent = '📸';
    const snapText = document.createElement('div');
    snapText.innerHTML = `
      <div>Before importing, <strong>a snapshot will be saved</strong> so you can undo this operation.</div>
      <div class="iw-snapshot-name">${escHtml(snapLabel)}</div>
      <div class="iw-snapshot-sub">Find it in <strong>Settings → Snapshots</strong> under "Import snapshots."</div>
    `;
    snapCallout.appendChild(snapIcon);
    snapCallout.appendChild(snapText);
    container.appendChild(snapCallout);

    // Import summary
    const dates = validRows.map((r) => r.date!).filter((d) => d !== null);
    const minDate = dates.length > 0 ? Math.min(...dates) : null;
    const maxDate = dates.length > 0 ? Math.max(...dates) : null;
    const totalAbs = validRows.reduce((s, r) => s + Math.abs(r.amount!), 0);
    const credits = validRows.filter((r) => (r.amount ?? 0) > 0).reduce((s, r) => s + r.amount!, 0);
    const debits = validRows.filter((r) => (r.amount ?? 0) < 0).reduce((s, r) => s + Math.abs(r.amount!), 0);

    // Decision breakdown counts
    const expenseCount = decisions.filter((d) => d?.type === 'expense').length;
    const debtCount = decisions.filter((d) => d?.type === 'debt-payment').length;
    const transferCount = decisions.filter((d) => d?.type === 'transfer').length;
    const skipCount = decisions.filter((d) => !d || d.type === 'skip').length;

    const summary = document.createElement('div');
    summary.className = 'iw-summary';
    summary.setAttribute('data-testid', 'iw-summary');

    const fmtAmt = (n: number) => fmt.format(n);
    const dateStr = (ts: number) => new Date(ts).toLocaleDateString(userLocale, { month: 'short', day: 'numeric', year: 'numeric' });

    const summaryItems: [string, string][] = [
      ['Transactions', validRows.length.toLocaleString()],
      ...(skipped > 0 ? [['Skipped rows', `${skipped.toLocaleString()} (unparseable date or amount)`] as [string, string]] : []),
      ['Date range', minDate && maxDate ? `${dateStr(minDate)} – ${dateStr(maxDate)}` : '—'] as [string, string],
      ...(isCard
        ? [['Total charges', fmtAmt(totalAbs)] as [string, string]]
        : [
            ['Total credits', credits > 0 ? fmtAmt(credits) : '—'] as [string, string],
            ['Total debits', debits > 0 ? fmtAmt(debits) : '—'] as [string, string],
          ]
      ),
      // Decision breakdown
      ...(expenseCount > 0 ? [['Linked to expenses', expenseCount.toLocaleString()] as [string, string]] : []),
      ...(debtCount > 0 ? [['Linked to debt payments', debtCount.toLocaleString()] as [string, string]] : []),
      ...(transferCount > 0 ? [['Transfers', transferCount.toLocaleString()] as [string, string]] : []),
      ...(skipCount > 0 ? [['Skipped / uncategorized', skipCount.toLocaleString()] as [string, string]] : []),
    ];

    summaryItems.forEach(([label, value]) => {
      const lbl = document.createElement('span');
      lbl.className = 'iw-summary-label';
      lbl.textContent = label;
      const val = document.createElement('span');
      val.className = 'iw-summary-value';
      val.textContent = value;
      summary.appendChild(lbl);
      summary.appendChild(val);
    });
    container.appendChild(summary);

    // Error
    const errEl = document.createElement('div');
    errEl.className = 'iw-error';
    errEl.style.display = 'none';
    errEl.setAttribute('data-testid', 'iw-step3-error');
    container.appendChild(errEl);

    // Footer
    const left = document.createElement('div');
    left.className = 'iw-footer-left';
    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-secondary';
    backBtn.setAttribute('data-testid', 'iw-step3-back');
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', () => {
      if (goBack) {
        goBack();
      } else {
        showStep2();
      }
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.setAttribute('data-testid', 'iw-cancel');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', close);
    left.appendChild(backBtn);
    left.appendChild(cancelBtn);
    wizardFooter.appendChild(left);

    const right = document.createElement('div');
    right.className = 'iw-footer-right';
    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-primary';
    importBtn.setAttribute('data-testid', 'iw-import-btn');
    importBtn.textContent = `Take snapshot & import ${validRows.length.toLocaleString()} rows`;

    if (validRows.length === 0) {
      importBtn.disabled = true;
      errEl.textContent = 'No valid rows to import. Go back and adjust the column mapping.';
      errEl.style.display = '';
    }

    importBtn.addEventListener('click', async () => {
      importBtn.disabled = true;
      importBtn.innerHTML = '<span class="spinner"></span> Saving snapshot…';
      try {
        await takeSnapshot(snapLabel, 'import');
        importBtn.innerHTML = '<span class="spinner"></span> Importing…';
        await doImport(validRows, skipped, decisions, minDate, maxDate);
        close();
        opts.onComplete();
      } catch (err) {
        errEl.textContent = `Import failed: ${String(err)}`;
        errEl.style.display = '';
        importBtn.disabled = false;
        importBtn.textContent = `Take snapshot & import ${validRows.length.toLocaleString()} rows`;
      }
    });
    right.appendChild(importBtn);
    wizardFooter.appendChild(right);
  }

  // ── Do the actual import ───────────────────────────────────────────────────

  async function doImport(
    rows: ParsedRow[],
    skipped: number,
    decisions: (ReviewAction | null)[],
    minDate: number | null,
    maxDate: number | null,
  ): Promise<void> {
    const now = Date.now();
    const importId = crypto.randomUUID();

    if (isCard) {
      const charges: CardCharge[] = rows.map((r, i) => {
        const dec = decisions[i];
        const categoryId = dec?.type === 'category' ? dec.categoryId : undefined;
        const note = (dec?.type === 'category' && dec.note) ? dec.note : (r.note || undefined);
        return {
          id: crypto.randomUUID(),
          accountId: opts.targetId,
          merchant: r.description || 'Imported charge',
          amount: Math.abs(r.amount!),
          date: r.date!,
          ...(categoryId ? { categoryId } : {}),
          ...(note ? { note } : {}),
          createdAt: now,
        };
      });
      await Promise.all(charges.map(saveCardCharge));
    } else {
      const txns: BankTransaction[] = rows.map((r) => ({
        id: crypto.randomUUID(),
        bankAccountId: opts.targetId,
        description: r.description || 'Imported transaction',
        amount: r.amount!,
        date: r.date!,
        ...(r.note ? { note: r.note } : {}),
        importId,
        createdAt: now,
      }));
      await Promise.all(txns.map(saveBankTransaction));

      // After saving bank transactions, create linked records
      const linkedOps: Promise<void>[] = [];
      const debtBalanceUpdates = new Map<string, number>(); // debtId -> amount to deduct

      rows.forEach((r, i) => {
        const dec = decisions[i];
        if (!dec || dec.type === 'skip' || dec.type === 'income' || dec.type === 'category') return;

        if (dec.type === 'expense') {
          const record = createExpensePaidRecord(dec.expenseId, Math.abs(r.amount!), r.date!);
          record.bankAccountId = opts.targetId;
          linkedOps.push(saveExpensePaidRecord(record));
        }

        if (dec.type === 'debt-payment') {
          const payment: DebtPayment = {
            id: crypto.randomUUID(),
            accountId: dec.debtAccountId,
            amount: Math.abs(r.amount!),
            date: r.date!,
            type: 'regular',
            bankAccountId: opts.targetId,
            createdAt: now,
            ...(dec.note ? { note: dec.note } : {}),
          };
          linkedOps.push(saveDebtPayment(payment));
          // Track balance reduction per debt account
          debtBalanceUpdates.set(
            dec.debtAccountId,
            (debtBalanceUpdates.get(dec.debtAccountId) ?? 0) + Math.abs(r.amount!),
          );
        }

        if (dec.type === 'transfer') {
          const transfer: AccountTransfer = {
            id: crypto.randomUUID(),
            fromAccountId: opts.targetId,
            toAccountId: dec.toAccountId,
            amount: Math.abs(r.amount!),
            date: r.date!,
            createdAt: now,
            ...(dec.note ? { note: dec.note } : {}),
          };
          linkedOps.push(saveAccountTransfer(transfer));
        }
      });

      await Promise.all(linkedOps);

      // Update debt account balances
      if (debtBalanceUpdates.size > 0) {
        const allDebts = await getDebtAccounts();
        const debtSaves: Promise<void>[] = [];
        allDebts.forEach((d) => {
          const paid = debtBalanceUpdates.get(d.id);
          if (!paid) return;
          debtSaves.push(saveDebtAccount({ ...d, balance: Math.max(0, d.balance - paid), updatedAt: now }));
        });
        await Promise.all(debtSaves);
      }
    }

    await recordImport({
      rawText,
      targetId: opts.targetId,
      targetType: opts.targetType,
      targetName: opts.targetName,
      importedAt: now,
      rowCount: rows.length,
      skippedCount: skipped,
      dateRange: minDate && maxDate ? { start: minDate, end: maxDate } : null,
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Start ──────────────────────────────────────────────────────────────────
  showStep1();
}
