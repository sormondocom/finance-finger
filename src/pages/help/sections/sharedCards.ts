import { makeCard } from '../helpUtils';

export function cardImportTransactions(): HTMLElement {
  const card = makeCard('⬆', 'Importing Transactions');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>Download a statement from your bank or credit card provider as a CSV file and bring it straight into Finance Finger — no cloud sync required. The four-step wizard handles common delimiters and dozens of date and amount formats automatically, then lets you categorize each transaction before it touches your data.</p>
    </div>
    <div class="help-steps">
      <div class="help-step"><span class="help-step-num">1</span><div class="help-step-body">
        <strong>Open the wizard.</strong> On the <strong>Accounts</strong> page click the <strong>⬆</strong> button on any account row. On the <strong>Debt</strong> page expand a credit card's charges panel and click <strong>⬆ Import CSV</strong>. The wizard title always shows which account you are importing into.
      </div></div>
      <div class="help-step"><span class="help-step-num">2</span><div class="help-step-body">
        <strong>Load the file.</strong> Drag a CSV, TSV, or pipe-delimited file onto the drop zone, or click to browse. The delimiter is auto-detected — switch it manually with the delimiter buttons if auto-detection picks the wrong one. Quote character (double, single, or none) is also adjustable. File size limit: 20 MB. A raw-text preview appears so you can confirm parsing looks correct before advancing.
      </div></div>
      <div class="help-step"><span class="help-step-num">3</span><div class="help-step-body">
        <strong>Map columns.</strong> Every row from the file is shown in a scrollable table. Use the dropdown in each column header to assign a role: <em>Date</em>, <em>Description</em>, <em>Merchant</em>, <em>Amount</em>, <em>Debit</em>, <em>Credit</em>, <em>Note</em>, or <em>(skip)</em>. Column roles are auto-guessed from header names — verify before continuing. For bank accounts you can also tell the wizard whether negative numbers mean debits or positives do (<em>Invert sign</em> option). You can re-parse with a different delimiter here too without starting over.
      </div></div>
      <div class="help-step"><span class="help-step-num">4</span><div class="help-step-body">
        <strong>Review each transaction.</strong> The wizard shows one transaction at a time. For each you choose what it represents:
        <ul class="help-inline-list">
          <li><em>Expense payment</em> — link to an existing expense (or create one inline with <strong>+ New expense</strong>)</li>
          <li><em>Card / debt payment</em> — link to a debt account to update its balance</li>
          <li><em>Transfer</em> — record a move between two of your bank accounts</li>
          <li><em>Income / deposit</em> — credits that are not transfers</li>
          <li><em>Skip / uncategorized</em> — import the raw transaction without categorization</li>
        </ul>
        The wizard <strong>pre-selects the most likely choice</strong> for you: first by checking your repeat-transaction rules, then by matching the description against your existing expense and debt account names, and finally by keyword inference (e.g. "Payroll" → Income, "Zelle" → Transfer, "Web Pmt" → Debt payment). You can always override the selection.<br><br>
        <strong>Inline editing:</strong> click the <strong>✏ Edit</strong> button on any transaction card to correct the date, description, or amount before it is saved. Click <em>Apply changes</em> to confirm.<br><br>
        <strong>Navigation:</strong> use <em>← Prev</em> / <em>Confirm →</em> / <em>Skip →</em> to move through rows one at a time, or click <em>Skip remaining →</em> to mark all unreviewed rows as uncategorized and jump straight to the summary. The <em>Re-map columns</em> button returns you to Step 3 if you discover a mapping problem mid-review.<br><br>
        <strong>Repeat transactions:</strong> if you confirm the same pattern several times, Finance Finger offers to create an auto-manage rule so matching transactions are categorized automatically in future imports.
      </div></div>
      <div class="help-step"><span class="help-step-num">5</span><div class="help-step-body">
        <strong>Take snapshot &amp; import.</strong> The summary screen shows total row count, date range, credit/debit totals, and a breakdown of how many rows were linked to expenses, debt payments, transfers, and so on. If the same file was imported before, a <strong>duplicate warning</strong> appears — you can still proceed if you intend to re-import. Click <strong>Take snapshot &amp; import</strong> to finalize. A snapshot named <code>Import — [Account] — [date]</code> is saved automatically before any data is written; find it in <em>Settings → Snapshots → Import snapshots</em> to restore if you ever need to undo.
      </div></div>
    </div>
    <div class="help-callout">
      <strong>The import wizard cannot be closed by clicking outside it.</strong> This is intentional — accidentally dismissing the modal mid-review would discard all your categorization decisions. Use the <em>Cancel</em> button in the footer, or the <strong>✕</strong> in the header, to exit deliberately.
    </div>
    <div class="help-callout" style="margin-top:var(--space-3)">
      <strong>Amount sign convention (bank accounts):</strong> most banks export debits as negative numbers. If yours exports them as positive, enable <em>Invert sign</em> in Step 3. You can also map separate <em>Debit</em> and <em>Credit</em> columns if your statement uses two columns for money-in vs. money-out.
    </div>
    <div class="help-callout" style="margin-top:var(--space-3)">
      <strong>Duplicate detection:</strong> Finance Finger hashes the raw file content. Importing the same file twice (even from a different account) surfaces a warning so you don't accidentally double-count transactions.
    </div>
  `;
  return card;
}
