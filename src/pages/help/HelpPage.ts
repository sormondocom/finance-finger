import './help.css';

type HelpSection =
  | 'setup'
  | 'dashboard'
  | 'income'
  | 'accounts'
  | 'expenses'
  | 'calendar'
  | 'budget'
  | 'debt'
  | 'reports'
  | 'whatif'
  | 'learn'
  | 'settings';

const SECTION_LABELS: Record<HelpSection, string> = {
  setup:     'Setup & Security',
  dashboard: 'Dashboard',
  income:    'Income',
  accounts:  'Accounts',
  expenses:  'Expenses & Bills',
  calendar:  'Calendar',
  budget:    'Budget',
  debt:      'Debt',
  reports:   'Reports',
  whatif:    'What If?',
  learn:     'Learn',
  settings:  'Settings & Data',
};

export class HelpPage {
  private section: HelpSection = 'setup';
  private container!: HTMLElement;

  render(): HTMLElement {
    const stored = sessionStorage.getItem('ff-help-section') as HelpSection | null;
    if (stored && Object.prototype.hasOwnProperty.call(SECTION_LABELS, stored)) {
      this.section = stored;
      sessionStorage.removeItem('ff-help-section');
    }

    this.container = document.createElement('div');
    this.container.className = 'help-page';
    this.paint();
    return this.container;
  }

  private paint(): void {
    this.container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'help-header';
    header.innerHTML = `
      <h1 class="font-serif">Help</h1>
      <blockquote class="help-quote">
        "Ain't no question too small — ask away and we'll walk ya through it, partner."
        <cite>— Buck &amp; Penny</cite>
      </blockquote>
    `;
    this.container.appendChild(header);

    this.container.appendChild(this.buildTabs());

    const grid = document.createElement('div');
    grid.className = 'help-grid';
    grid.id = 'help-grid';
    this.renderSection(grid);
    this.container.appendChild(grid);
  }

  private buildTabs(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'help-tabs';

    (Object.keys(SECTION_LABELS) as HelpSection[]).forEach((s) => {
      const btn = document.createElement('button');
      btn.className = `help-tab ${this.section === s ? 'active' : ''}`;
      btn.setAttribute('data-testid', `help-tab-${s}`);
      btn.textContent = SECTION_LABELS[s];
      btn.addEventListener('click', () => {
        this.section = s;
        bar.querySelectorAll('.help-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const grid = document.getElementById('help-grid')!;
        grid.innerHTML = '';
        this.renderSection(grid);
      });
      bar.appendChild(btn);
    });

    return bar;
  }

  private renderSection(grid: HTMLElement): void {
    switch (this.section) {
      case 'setup':     this.renderSetup(grid);     break;
      case 'dashboard': this.renderDashboard(grid); break;
      case 'income':    this.renderIncome(grid);    break;
      case 'accounts':  this.renderAccounts(grid);  break;
      case 'expenses':  this.renderExpenses(grid);  break;
      case 'calendar':  this.renderCalendar(grid);  break;
      case 'budget':    this.renderBudget(grid);    break;
      case 'debt':      this.renderDebt(grid);      break;
      case 'reports':   this.renderReports(grid);   break;
      case 'whatif':    this.renderWhatIf(grid);    break;
      case 'learn':     this.renderLearn(grid);     break;
      case 'settings':  this.renderSettings(grid);  break;
    }
  }

  // ── Setup & Security ───────────────────────────────────────────────────────

  private renderSetup(grid: HTMLElement): void {
    grid.appendChild(this.cardSetupWizard());
    grid.appendChild(this.cardKeyPair());
    grid.appendChild(this.cardUnlocking());
    grid.appendChild(this.cardKeyBackup());
  }

  private cardSetupWizard(): HTMLElement {
    const card = this.makeCard('🧙', 'The Six-Step Setup Wizard');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>The setup wizard runs automatically the first time you open Financial Finger. You only go through it once. Here's what each step does:</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">1️⃣</span><div class="help-step-body"><strong>Welcome</strong> — an overview of the privacy model: all your data stays on your device, encrypted to a key only you hold.</div></div>
        <div class="help-step"><span class="help-step-num">2️⃣</span><div class="help-step-body"><strong>Mascot</strong> — choose <strong>Buck</strong> (cowboy pig) or <strong>Penny</strong> (sunflower-hat pig). You can rename them too.</div></div>
        <div class="help-step"><span class="help-step-num">3️⃣</span><div class="help-step-body"><strong>Keys</strong> — generate a new ECC curve25519 PGP keypair (name, email, passphrase) or paste an existing private key.</div></div>
        <div class="help-step"><span class="help-step-num">4️⃣</span><div class="help-step-body"><strong>Save your key</strong> — your private key is shown exactly once. Copy it to a password manager or print it. <em>It is never stored by the extension.</em></div></div>
        <div class="help-step"><span class="help-step-num">5️⃣</span><div class="help-step-body"><strong>Profile</strong> — name your household. This appears as the Dashboard title.</div></div>
        <div class="help-step"><span class="help-step-num">6️⃣</span><div class="help-step-body"><strong>Done</strong> — your vault is created. You land on the Dashboard.</div></div>
      </div>
    `;
    return card;
  }

  private cardKeyPair(): HTMLElement {
    const card = this.makeCard('🔑', 'Your PGP Key Pair');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Financial Finger uses <strong>OpenPGP</strong> (ECC curve25519) to protect your data. Two mathematically linked keys are generated:</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
        <div class="calc-result good" style="border-left-color:var(--ff-navy)">
          <div style="font-weight:700;color:var(--ff-navy);margin-bottom:var(--space-2)">🔓 Public Key</div>
          <ul style="margin:0;padding-left:var(--space-4);font-size:var(--text-sm);line-height:1.7">
            <li>Stored in the extension</li>
            <li>Used to encrypt your vault key and exports</li>
            <li>Safe to share with household members</li>
          </ul>
        </div>
        <div class="calc-result" style="border-left-color:var(--ff-rust)">
          <div style="font-weight:700;color:var(--ff-rust);margin-bottom:var(--space-2)">🔒 Private Key</div>
          <ul style="margin:0;padding-left:var(--space-4);font-size:var(--text-sm);line-height:1.7">
            <li>Never stored by the extension</li>
            <li>You paste it each session to unlock</li>
            <li>Losing it means losing your data</li>
          </ul>
        </div>
      </div>
      <div class="help-callout">
        <strong>How it works:</strong> A random AES vault key encrypts all your records. That vault key is then encrypted with your public key and stored safely. When you unlock, your private key + passphrase decrypt the vault key, which decrypts your data for the session. Close the tab → vault locks.
      </div>
    `;
    return card;
  }

  private cardUnlocking(): HTMLElement {
    const card = this.makeCard('🔓', 'Unlocking the Vault');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>On every launch after setup, an unlock screen appears. Here's what to do:</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">1️⃣</span><div class="help-step-body"><strong>Load your private key</strong> — paste the armored key text from your password manager, or click <em>Choose file…</em> to load a saved <code>.asc</code> file.</div></div>
        <div class="help-step"><span class="help-step-num">2️⃣</span><div class="help-step-body"><strong>Enter your passphrase</strong> — the password you chose when generating keys.</div></div>
        <div class="help-step"><span class="help-step-num">3️⃣</span><div class="help-step-body"><strong>Click Unlock</strong> — the vault key is decrypted in memory only. Your data is now accessible.</div></div>
      </div>
      <div class="help-callout">
        The vault stays unlocked for the full browser session. Closing all extension tabs re-locks it automatically. Click <strong>🔒 Lock Vault</strong> in the sidebar at any time to lock manually.
      </div>
    `;
    return card;
  }

  private cardKeyBackup(): HTMLElement {
    const card = this.makeCard('💾', 'Keeping Your Key Safe');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Your private key is the only thing that can open your vault. Financial Finger deliberately does not store it — that's the security model. Losing it means your data is permanently inaccessible.</p>
        <p><strong>Recommended approach:</strong></p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">✅</span><div class="help-step-body"><strong>Password manager</strong> (1Password, Bitwarden, KeePass) — paste the full armored private key as a secure note.</div></div>
        <div class="help-step"><span class="help-step-num">✅</span><div class="help-step-body"><strong>Encrypted USB drive</strong> — keep one offsite. Good for disaster recovery.</div></div>
        <div class="help-step"><span class="help-step-num">✅</span><div class="help-step-body"><strong>Printed copy</strong> in a secure physical location — low-tech but reliable for extreme scenarios.</div></div>
        <div class="help-step"><span class="help-step-num">❌</span><div class="help-step-body"><strong>Email or cloud storage (unencrypted)</strong> — don't store the raw key text in plain email or an unencrypted cloud folder.</div></div>
      </div>
      <div class="help-callout">
        <strong>Passphrase tip:</strong> use 4–5 random words strung together (e.g. "purple-anvil-river-66"). Long passphrases are far harder to crack than short symbol-filled ones. Write it down and keep it with your key backup.
      </div>
    `;
    return card;
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  private renderDashboard(grid: HTMLElement): void {
    grid.appendChild(this.cardDashboardSummary());
    grid.appendChild(this.cardDashboardHealth());
    grid.appendChild(this.cardDashboardActivity());
  }

  private cardDashboardSummary(): HTMLElement {
    const card = this.makeCard('📊', 'Summary Cards');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>The four summary cards at the top of the Dashboard give you a monthly financial snapshot. Use the <strong>‹ / ›</strong> arrows at the top right to step backward through previous months, or click <strong>Custom Range</strong> to view any date span.</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">💵</span><div class="help-step-body"><strong>Income</strong> — recurring monthly income (prorated for partial months) plus any one-time income logged in the period.</div></div>
        <div class="help-step"><span class="help-step-num">🧾</span><div class="help-step-body"><strong>Expenses</strong> — recurring monthly expenses (prorated) plus one-time expenses in the period.</div></div>
        <div class="help-step"><span class="help-step-num">📈</span><div class="help-step-body"><strong>Net Cash Flow</strong> — income minus expenses. Green when positive, red when negative.</div></div>
        <div class="help-step"><span class="help-step-num">💳</span><div class="help-step-body"><strong>Total Debt</strong> — sum of all debt account balances (not date-sensitive; always the current balance).</div></div>
      </div>
      <div class="edu-card-voice">
        <p>Below the summary cards, the <strong>Income Sources</strong> panel lists every active income source and its monthly contribution. One-time sources logged that month also appear here.</p>
        <p>The <strong>Payment Reminders</strong> card appears when any debt or bill is past due or due within 7 days. Each row links directly to the relevant page.</p>
      </div>
    `;
    return card;
  }

  private cardDashboardHealth(): HTMLElement {
    const card = this.makeCard('❤️', 'Financial Health Chips');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>When you have both income and at least one debt account entered, two health chips appear below the summary cards:</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">📉</span><div class="help-step-body"><strong>Debt-to-Income (DTI)</strong> — total monthly minimum payments ÷ monthly income. Under 36% is healthy; 43%+ is high. Hover the chip for the definition.</div></div>
        <div class="help-step"><span class="help-step-num">💳</span><div class="help-step-body"><strong>Credit Utilization</strong> — total card balances ÷ total credit limits. Under 30% is good for your credit score; under 10% is excellent.</div></div>
      </div>
      <div class="help-callout">
        Both chips update automatically when you record payments or add new debt accounts. They reflect the <em>current</em> state of your accounts, not the viewed month.
      </div>
    `;
    return card;
  }

  private cardDashboardActivity(): HTMLElement {
    const card = this.makeCard('📝', 'Monthly Activity & Tips');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>The <strong>Monthly Activity widget</strong> at the bottom of the Dashboard is for logging one-off items without navigating away:</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">+</span><div class="help-step-body">Click <strong>+ Log</strong> under <em>One-time Income</em> to record a bonus, tax refund, side-gig payment, or any non-recurring deposit.</div></div>
        <div class="help-step"><span class="help-step-num">+</span><div class="help-step-body">Click <strong>+ Log</strong> under <em>One-time Expenses</em> to record a surprise cost (vet bill, car repair, etc.).</div></div>
      </div>
      <div class="edu-card-voice">
        <p>In <strong>Custom Range</strong> mode, the widget becomes a <strong>Period Report</strong>: a month-by-month table with expandable rows showing individual one-time items.</p>
        <p>The gold <strong>tip widget</strong> at the page bottom delivers a rotating daily financial tip from Buck or Penny when clicked.</p>
      </div>
    `;
    return card;
  }

  // ── Income ─────────────────────────────────────────────────────────────────

  private renderIncome(grid: HTMLElement): void {
    grid.appendChild(this.cardMembers());
    grid.appendChild(this.cardIncomeSources());
    grid.appendChild(this.cardIncomeMonthNav());
  }

  // ── Accounts ───────────────────────────────────────────────────────────────

  private renderAccounts(grid: HTMLElement): void {
    grid.appendChild(this.cardBankAccounts());
    grid.appendChild(this.cardBalanceProjection());
    grid.appendChild(this.cardImportTransactions());
  }

  private cardMembers(): HTMLElement {
    const card = this.makeCard('👥', 'Household Members');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Members are the people in your household who have income. They appear in income source forms, the Dashboard's Income panel, and optionally on expenses and memos.</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">➕</span><div class="help-step-body">On the <strong>Income</strong> page, type a name into the <em>Add member</em> field and click <strong>Add Member</strong> (or press Enter).</div></div>
        <div class="help-step"><span class="help-step-num">✏️</span><div class="help-step-body">Click the avatar chip to choose avatar type: adult male, adult female, baby, child, or teen.</div></div>
        <div class="help-step"><span class="help-step-num">🗑️</span><div class="help-step-body">Remove a member in <strong>Settings → Members</strong>. A confirmation warns you that all their income sources will also be removed.</div></div>
      </div>
      <div class="help-callout">
        Members are also available in <strong>Settings</strong> for adding new ones centrally, and on <strong>Calendar memos</strong> to attribute a note to a specific person.
      </div>
    `;
    return card;
  }

  private cardIncomeSources(): HTMLElement {
    const card = this.makeCard('💰', 'Income Sources');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Each member can have multiple income sources. The app normalizes recurring sources to a monthly amount for all calculations. One-time sources are scoped to their recorded date and only appear in the month they fall in.</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">📝</span><div class="help-step-body"><strong>Salary</strong> — enter the amount at any frequency (hourly, weekly, biweekly, semi-monthly, monthly, annual, or one-time).</div></div>
        <div class="help-step"><span class="help-step-num">⏱️</span><div class="help-step-body"><strong>Hourly</strong> — enter rate and hours per period; the app computes the per-period pay and shows a preview.</div></div>
        <div class="help-step"><span class="help-step-num">📅</span><div class="help-step-body"><strong>Semi-monthly</strong> — supports unequal paychecks: enter different amounts for the 1st and 15th of the month.</div></div>
        <div class="help-step"><span class="help-step-num">⏸️</span><div class="help-step-body">Toggle <strong>Active / Inactive</strong> to temporarily exclude a recurring source from calculations without deleting it (seasonal job, parental leave, etc.).</div></div>
        <div class="help-step"><span class="help-step-num">🏦</span><div class="help-step-body">Use the <strong>Deposit to</strong> dropdown to link the source to a bank account — this feeds the balance projection on the Accounts page.</div></div>
      </div>
      <div class="help-callout">
        Each income source form has a <strong>Reminders</strong> section at the bottom — add a custom notification (e.g. "review budget on payday") directly from there.
      </div>
    `;
    return card;
  }

  private cardIncomeMonthNav(): HTMLElement {
    const card = this.makeCard('📅', 'Month Navigation, Totals & Year Overview');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>The Income page has <strong>‹ / ›</strong> arrows in the top-right corner to step through past months. The source list and totals update to reflect what is relevant to the viewed month.</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">🔁</span><div class="help-step-body"><strong>Recurring sources</strong> — always visible regardless of which month you are viewing, since they apply every month. The recurring total is the same for any month.</div></div>
        <div class="help-step"><span class="help-step-num">1️⃣</span><div class="help-step-body"><strong>One-time sources</strong> — only appear when their recorded date falls inside the viewed month. They are hidden in all other months.</div></div>
        <div class="help-step"><span class="help-step-num">👤</span><div class="help-step-body"><strong>Member group totals</strong> — the amount next to each member's name reflects their recurring monthly income plus any one-time income in the viewed month.</div></div>
      </div>
      <div class="edu-card-voice" style="margin-top:var(--space-3)">
        <p><strong>Monthly total breakdown</strong> — when one-time income is present in the viewed month, the header expands to three lines:</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">🔁</span><div class="help-step-body"><strong>Recurring</strong> — sum of all active recurring sources, normalized to monthly.</div></div>
        <div class="help-step"><span class="help-step-num">+</span><div class="help-step-body"><strong>+ One-time</strong> — sum of one-time payments dated in the viewed month.</div></div>
        <div class="help-step"><span class="help-step-num">=</span><div class="help-step-body"><strong>Total</strong> — the combined figure for the month.</div></div>
      </div>
      <div class="edu-card-voice" style="margin-top:var(--space-3)">
        <p><strong>Year-to-date and projected income</strong> — when viewing the current month, a panel below the header shows two year-level figures:</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
        <div class="calc-result good" style="border-left-color:var(--ff-green)">
          <div style="font-weight:700;color:var(--ff-green);margin-bottom:var(--space-2)">Year-to-Date Income</div>
          <div style="font-size:var(--text-sm)">Recurring sources pro-rated from Jan 1 to today, plus all one-time payments already received this calendar year.</div>
        </div>
        <div class="calc-result" style="border-left-color:var(--color-text-muted)">
          <div style="font-weight:700;color:var(--color-text-muted);margin-bottom:var(--space-2)">Projected [Year]</div>
          <div style="font-size:var(--text-sm)">Recurring sources × 12, plus all one-time payments entered for this year — past or future dates already logged.</div>
        </div>
      </div>
      <div class="help-callout" style="margin-top:var(--space-3)">
        The YTD / Projected panel is hidden when browsing past months — it always reflects the current calendar year and is not month-specific.
      </div>
    `;
    return card;
  }

  private cardBankAccounts(): HTMLElement {
    const card = this.makeCard('🏦', 'Accounts');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Track every deposit account in your household. Bank accounts link income sources and expenses together to give you two running balances per account — what your records show you have (Actual) and what your budget predicts (Projected).</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">➕</span><div class="help-step-body">Click <strong>+ Add Account</strong> on the Accounts page. Choose type: <strong>Checking</strong>, <strong>Savings</strong>, <strong>Money Market</strong>, <strong>Cash</strong>, or <strong>Other</strong>. Use <em>Cash</em> for physical currency — a wallet, petty-cash envelope, or allowance jar.</div></div>
        <div class="help-step"><span class="help-step-num">👤</span><div class="help-step-body">Set ownership: <strong>Individual</strong> (select a member), <strong>Joint</strong>, or <strong>Household</strong>.</div></div>
        <div class="help-step"><span class="help-step-num">💵</span><div class="help-step-body">Enter a <strong>starting balance</strong> — a known balance at a specific point in time that the projection builds forward from.</div></div>
        <div class="help-step"><span class="help-step-num">🎨</span><div class="help-step-body">Choose a <strong>chart color</strong> to identify this account in the balance chart.</div></div>
      </div>
    `;
    return card;
  }

  private cardBalanceProjection(): HTMLElement {
    const card = this.makeCard('📈', 'Actual vs. Projected Balance');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Each account row shows two labeled balances side by side. They answer two different questions:</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
        <div class="calc-result good" style="border-left-color:var(--ff-green)">
          <div style="font-weight:700;color:var(--ff-green);margin-bottom:var(--space-2)">Actual Balance</div>
          <div style="font-size:var(--text-sm)">Computed from your <strong>recorded transactions</strong> — expense payments, income deposits, and debt payments actually logged against this account. Reflects what your records say you have right now.</div>
        </div>
        <div class="calc-result" style="border-left-color:var(--color-text-muted)">
          <div style="font-weight:700;color:var(--color-text-muted);margin-bottom:var(--space-2)">Projected Balance</div>
          <div style="font-size:var(--text-sm)">Starting balance + linked recurring income − linked recurring expenses and debt payments for the viewed month. Reflects what your budget <em>plan</em> predicts.</div>
        </div>
      </div>
      <div class="help-callout" style="margin-top:var(--space-3)">
        A red Actual balance means your records show a negative account — check the ledger for an unexpected debit or a missing income entry.
      </div>
      <div class="edu-card-voice" style="margin-top:var(--space-3)">
        <p><strong>Running ledger</strong> — expand any account row to reveal a chronological transaction ledger: every income deposit, expense payment, and debt payment recorded against that account, with a running balance column on the right. When you click an item name in the Budget spending ledger, the app navigates here and highlights the specific transaction with a <strong>golden pulse animation</strong>.</p>
        <p>Use the <strong>‹ / ›</strong> arrows to step through months. The stacked bar chart at the top shows all accounts side-by-side over recent months. The <strong>Income by Account</strong> card on the Dashboard appears when at least one account has a linked income source.</p>
      </div>
    `;
    return card;
  }

  private cardImportTransactions(): HTMLElement {
    const card = this.makeCard('⬆', 'Importing Transactions');
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

  // ── Expenses & Bills ───────────────────────────────────────────────────────

  private renderExpenses(grid: HTMLElement): void {
    grid.appendChild(this.cardCategories());
    grid.appendChild(this.cardAddExpense());
    grid.appendChild(this.cardBillTracking());
    grid.appendChild(this.cardMarkPaid());
  }

  private cardCategories(): HTMLElement {
    const card = this.makeCard('🏷️', 'Expense Categories');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Categories organize your spending and power the charts throughout the app. Each category gets a color that flows through every chart referencing it.</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">➕</span><div class="help-step-body">Click <strong>+ Add Category</strong> at the top of the Expenses page. Give it a name (e.g. Housing, Food, Utilities) and choose a color.</div></div>
        <div class="help-step"><span class="help-step-num">✏️</span><div class="help-step-body">Click any category pill in the management row to <strong>rename</strong> it, pick a new color from the 32-color palette, or set a <strong>monthly budget</strong> for the category.</div></div>
        <div class="help-step"><span class="help-step-num">🔍</span><div class="help-step-body">Click a category <strong>chip</strong> to filter the expense list to that category. Click again to clear.</div></div>
      </div>
    `;
    return card;
  }

  private cardAddExpense(): HTMLElement {
    const card = this.makeCard('➕', 'Adding an Expense');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Click <strong>+ Add Expense</strong> on the Expenses page. Key fields:</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">🔁</span><div class="help-step-body"><strong>Recurring</strong> checkbox — marks this as a recurring bill and reveals: <em>Frequency</em> (weekly → annual), <em>Due day</em> (1–28, turns it into a tracked bill), <em>Monthly threshold</em> (overage warning), <em>Fixed amount</em> (always the same — payment dialog pre-fills it), and <em>Auto-pay</em> (bank pays it automatically — no manual tracking needed).</div></div>
        <div class="help-step"><span class="help-step-num">💳</span><div class="help-step-body"><strong>Charge to card</strong> — link a recurring expense to a debt account so payments automatically create a charge entry on that card.</div></div>
        <div class="help-step"><span class="help-step-num">🔔</span><div class="help-step-body">The <strong>Reminders</strong> section at the bottom lets you attach a custom notification — e.g. 7 days before a bill's due date.</div></div>
      </div>
    `;
    return card;
  }

  private cardBillTracking(): HTMLElement {
    const card = this.makeCard('📋', 'Bill Tracking & Status Badges');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>A recurring expense becomes a <strong>tracked bill</strong> when you set a due day (1–28). The extension monitors its payment status automatically each month:</p>
      </div>
      <div class="help-status-grid">
        <div class="help-status-row"><span class="help-status-dot" style="background:var(--ff-green)"></span><div><strong>✓ Paid</strong> — marked paid this calendar month (green left border)</div></div>
        <div class="help-status-row"><span class="help-status-dot" style="background:#f59e0b"></span><div><strong>⏰ Due Soon</strong> — due within 7 days (amber left border)</div></div>
        <div class="help-status-row"><span class="help-status-dot" style="background:var(--color-danger)"></span><div><strong>⚠ Past Due</strong> — due day passed without payment — pulsing red border</div></div>
        <div class="help-status-row"><span class="help-status-dot" style="background:var(--ff-gold)"></span><div><strong>⚡ Threshold</strong> — bill has a monthly cost target set</div></div>
        <div class="help-status-row"><span class="help-status-dot" style="background:var(--ff-gold-dark)"></span><div><strong>⚠ Sync issue</strong> — stale paid date without a payment record. Click <em>↺ Reset Status</em> to fix.</div></div>
      </div>
      <div class="help-callout">
        Click the <strong>📋</strong> icon on any bill row to open its <strong>payment ledger</strong> — a full history of every recorded payment with edit (✏️) and delete (🗑️) buttons on each entry.
      </div>
    `;
    return card;
  }

  private cardMarkPaid(): HTMLElement {
    const card = this.makeCard('✅', 'Marking Bills Paid');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Click <strong>Mark Paid</strong> on any due or overdue bill. The dialog walks you through:</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">💵</span><div class="help-step-body"><strong>Actual amount paid</strong> — pre-filled with the bill's usual amount. Change it for variable bills (electricity, water, gas). If it exceeds your threshold, an inline overage warning appears immediately.</div></div>
        <div class="help-step"><span class="help-step-num">📅</span><div class="help-step-body"><strong>Billing cycle selector</strong> — pill buttons for this month and last month. Select which cycle the payment covers. Already-paid cycles are struck through.</div></div>
        <div class="help-step"><span class="help-step-num">☑️</span><div class="help-step-body"><strong>Catch-up checkbox</strong> — appears when the previous cycle was missed. Check it to record payments for both the current and missed cycle in one submit.</div></div>
        <div class="help-step"><span class="help-step-num">🏦</span><div class="help-step-body"><strong>Payment source</strong> — select the bank account or leave blank. If the bill is linked to a card, a charge entry is created on that card automatically.</div></div>
      </div>
    `;
    return card;
  }

  // ── Calendar ───────────────────────────────────────────────────────────────

  private renderCalendar(grid: HTMLElement): void {
    grid.appendChild(this.cardCalendarGrid());
    grid.appendChild(this.cardCalendarPaydays());
    grid.appendChild(this.cardCalendarMemos());
  }

  private cardCalendarGrid(): HTMLElement {
    const card = this.makeCard('📆', 'Reading the Calendar Grid');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>The Calendar page shows all tracked bills (recurring expenses with a due day) laid out on a monthly grid. Bills with due days on days 29–31 clamp to the last day of shorter months.</p>
      </div>
      <div class="help-status-grid">
        <div class="help-status-row"><span class="help-status-dot" style="background:var(--color-danger)"></span><div><strong>Red chip</strong> — Past Due</div></div>
        <div class="help-status-row"><span class="help-status-dot" style="background:#f59e0b"></span><div><strong>Amber chip</strong> — Due Soon (within 7 days)</div></div>
        <div class="help-status-row"><span class="help-status-dot" style="background:var(--ff-green)"></span><div><strong>Green chip</strong> — Paid this calendar month</div></div>
        <div class="help-status-row"><span class="help-status-dot" style="background:var(--ff-sage)"></span><div><strong>Sage chip</strong> — Upcoming (due later in the month)</div></div>
      </div>
      <div class="edu-card-voice">
        <p>The summary bar above the grid shows a count for each status. Click <strong>✓ Mark Paid</strong> below any unpaid chip — the same payment dialog as the Expenses page opens.</p>
        <p>Use the <strong>‹ / ›</strong> arrows to navigate between months. Today's date is highlighted in the grid.</p>
      </div>
    `;
    return card;
  }

  private cardCalendarPaydays(): HTMLElement {
    const card = this.makeCard('💰', 'Payday Chips');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Income sources with a set frequency show gold 💰 payday chips on the Calendar at the days they pay out. This lets you see at a glance when money is coming in vs. when bills are due.</p>
        <p><strong>Semi-monthly sources</strong> show on the 1st and 15th with their respective amounts. <strong>Biweekly sources</strong> calculate forward from a reference date you set on the income source form.</p>
        <p>One-time income items logged on the Dashboard also appear as 💵 chips on the Calendar for their logged date.</p>
      </div>
    `;
    return card;
  }

  private cardCalendarMemos(): HTMLElement {
    const card = this.makeCard('📌', 'Sticky Note Memos');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Add personal notes to any calendar day — a note about what happened, a reminder to follow up, or anything worth remembering. Memos are stored encrypted like all other data.</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">🖱️</span><div class="help-step-body"><strong>Hover any calendar cell</strong> to reveal the sticky-note button (yellow, bottom-right of the cell). It stays hidden until you hover to keep the grid clean.</div></div>
        <div class="help-step"><span class="help-step-num">➕</span><div class="help-step-body">An <strong>empty cell</strong> shows a <code>+</code> button. Click it to open the memo modal and type your note.</div></div>
        <div class="help-step"><span class="help-step-num">✎</span><div class="help-step-body">A <strong>cell with notes</strong> shows a pencil icon (with a count badge for 2+ notes). Click to open the viewer.</div></div>
        <div class="help-step"><span class="help-step-num">◀▶</span><div class="help-step-body"><strong>Page through notes</strong> with the prev/next buttons at the top of the viewer. The label shows "Note N of M."</div></div>
        <div class="help-step"><span class="help-step-num">🗑️</span><div class="help-step-body"><strong>Delete</strong> any note using the trash button below its card. Deleting all notes restores the empty <code>+</code> state.</div></div>
        <div class="help-step"><span class="help-step-num">👤</span><div class="help-step-body">Optionally <strong>attribute a memo</strong> to a household member using the dropdown in the add form.</div></div>
      </div>
      <div class="help-callout">
        Multiple notes on a day show a <strong>stacked sticky-note visual</strong> (two or three layers) as a visual cue that more than one note exists.
      </div>
    `;
    return card;
  }

  // ── Budget ─────────────────────────────────────────────────────────────────

  private renderBudget(grid: HTMLElement): void {
    grid.appendChild(this.cardBudgetSummary());
    grid.appendChild(this.cardBudgetBuckets());
    grid.appendChild(this.cardBudgetLedger());
    grid.appendChild(this.cardBudgetCharts());
  }

  private cardBudgetSummary(): HTMLElement {
    const card = this.makeCard('📊', 'Budget Summary Bar');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>The Budget page shows a real-time picture of your monthly recurring finances. All numbers are based on <strong>recurring expenses only</strong> — one-time items logged on the Dashboard are not included here.</p>
        <p>The <strong>summary bar</strong> at the top shows:</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">💵</span><div class="help-step-body"><strong>Total monthly income</strong> — sum of all active recurring income sources, normalized to monthly.</div></div>
        <div class="help-step"><span class="help-step-num">🧾</span><div class="help-step-body"><strong>Total recurring expenses</strong> — all recurring bills normalized to monthly.</div></div>
        <div class="help-step"><span class="help-step-num">📈</span><div class="help-step-body"><strong>Surplus or deficit</strong> — income minus expenses. If this is negative, Buck or Penny slide in automatically with a heads-up.</div></div>
      </div>
    `;
    return card;
  }

  private cardBudgetBuckets(): HTMLElement {
    const card = this.makeCard('🪣', 'Spending Buckets (Envelope Budgeting)');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Spending buckets are a visual form of <strong>envelope budgeting</strong> — you set a monthly budget for each expense category, and the bucket shows how full it is based on your recurring expenses in that category. Each bucket is a <strong>wooden bucket SVG icon</strong> that fills up as spending approaches the category limit.</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">🟢</span><div class="help-step-body"><strong>Sage</strong> — well under budget. You're in good shape.</div></div>
        <div class="help-step"><span class="help-step-num">🟡</span><div class="help-step-body"><strong>Amber</strong> — approaching the limit. Keep an eye on this category.</div></div>
        <div class="help-step"><span class="help-step-num">🟠</span><div class="help-step-body"><strong>Rust</strong> — close to or at the limit.</div></div>
        <div class="help-step"><span class="help-step-num">🔴</span><div class="help-step-body"><strong>Red</strong> — over budget. Expenses in this category exceed the monthly budget you set.</div></div>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">📝</span><div class="help-step-body">Click any bucket to open the <strong>budget editor</strong> — set or update the monthly budget for that category, and view the <strong>spending ledger</strong> for that category's recorded transactions.</div></div>
        <div class="help-step"><span class="help-step-num">🔢</span><div class="help-step-body">The <strong>To-assign</strong> counter at the top shows how much monthly income is unbudgeted — assign it to categories until it reaches zero (zero-based budgeting).</div></div>
        <div class="help-step"><span class="help-step-num">🏷️</span><div class="help-step-body">Categories with expenses but no budget set appear as <strong>unbudgeted pills</strong> below the buckets — a prompt to assign them a target.</div></div>
      </div>
    `;
    return card;
  }

  private cardBudgetLedger(): HTMLElement {
    const card = this.makeCard('📋', 'Spending Category Ledger');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>When you open the budget editor for a category (by clicking a bucket or a breakdown bar), a <strong>spending ledger</strong> appears below the category form if you have recorded payments in that category. It shows every expense and charge that contributed to the category total.</p>
        <p>The ledger is displayed in four columns:</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">📅</span><div class="help-step-body"><strong>Date / freq</strong> — when the charge occurred or the expense frequency for recurring bills.</div></div>
        <div class="help-step"><span class="help-step-num">🏷️</span><div class="help-step-body"><strong>Item name</strong> — the expense description or merchant name. <strong>Click to navigate directly to that transaction</strong> — the app closes the modal, goes to the Accounts or Debt page, opens the relevant ledger or charges panel, and highlights the specific entry with a golden pulse.</div></div>
        <div class="help-step"><span class="help-step-num">🏦</span><div class="help-step-body"><strong>Source pill</strong> — the bank account or debt card the charge came from. <strong>Click to navigate to the account</strong> — the app highlights the account or card row itself with the same golden pulse.</div></div>
        <div class="help-step"><span class="help-step-num">💵</span><div class="help-step-body"><strong>Amount</strong> — the dollar amount of the expense or charge.</div></div>
      </div>
      <div class="edu-card-voice">
        <p>Rows are grouped into <strong>Expenses</strong> (recorded payments from bank accounts) and <strong>Charges</strong> (card charges from debt accounts).</p>
      </div>
      <div class="help-callout">
        <strong>Golden pulse highlight</strong> — when the app navigates you to a specific transaction, a glowing gold ring animation plays on that row for about two seconds so it's easy to spot even in a long ledger.
      </div>
    `;
    return card;
  }

  private cardBudgetCharts(): HTMLElement {
    const card = this.makeCard('🍩', 'Budget Charts');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Below the summary bar and buckets, three charts give visual context for your spending:</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">🍩</span><div class="help-step-body"><strong>Donut chart</strong> — spending share by category. Click any slice to filter the breakdown below to that category only. Click the center or the same slice again to clear.</div></div>
        <div class="help-step"><span class="help-step-num">━</span><div class="help-step-body"><strong>Category breakdown</strong> — horizontal bars showing each category's monthly total as a proportion of total spending, colored with each category's assigned color.</div></div>
        <div class="help-step"><span class="help-step-num">|</span><div class="help-step-body"><strong>Cash flow bar</strong> — a single bar comparing total income to total spending at a glance.</div></div>
      </div>
    `;
    return card;
  }

  // ── Debt ───────────────────────────────────────────────────────────────────

  private renderDebt(grid: HTMLElement): void {
    grid.appendChild(this.cardDebtAccounts());
    grid.appendChild(this.cardDebtStrategies());
    grid.appendChild(this.cardDebtPayments());
    grid.appendChild(this.cardDebtWhatIf());
    grid.appendChild(this.cardImportTransactions());
  }

  private cardDebtAccounts(): HTMLElement {
    const card = this.makeCard('💳', 'Adding Debt Accounts');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Track every type of debt in one place. Click <strong>+ Add Account</strong> and choose the account type:</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">💳</span><div class="help-step-body"><strong>Credit Card</strong> — balance, APR, credit limit, minimum payment (fixed $ or % of balance), due day, 0% intro APR end date.</div></div>
        <div class="help-step"><span class="help-step-num">🏠</span><div class="help-step-body"><strong>Mortgage / Vehicle Loan / Personal & Student Loan</strong> — add original principal and term; the app generates the full amortization schedule.</div></div>
        <div class="help-step"><span class="help-step-num">🏥</span><div class="help-step-body"><strong>Medical debt</strong> — balance and payment info, same as personal loan.</div></div>
      </div>
      <div class="help-callout">
        <strong>Utilization bars</strong> on each card show the balance-to-limit ratio colored gold (under 30%), rust (30–89%), or red (90%+ or over-limit). The <strong>Minimum Payment Trap</strong> detector flags any card where paying minimums only would take more than 3 years or cost more than 50% of the original balance in interest.
      </div>
    `;
    return card;
  }

  private cardDebtStrategies(): HTMLElement {
    const card = this.makeCard('🎯', 'Payoff Strategies & Amortization');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Switch tabs above the card list to change the payoff order — this changes which card receives the extra rollover payment when one is paid off:</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-3)">
        <div class="calc-result good" style="border-left-color:var(--ff-navy)">
          <div style="font-weight:700;color:var(--ff-navy);margin-bottom:4px">🧊 Avalanche</div>
          <div class="text-xs text-muted">Highest APR first. Saves the most money overall.</div>
        </div>
        <div class="calc-result good" style="border-left-color:var(--ff-green)">
          <div style="font-weight:700;color:var(--ff-green);margin-bottom:4px">⛄ Snowball</div>
          <div class="text-xs text-muted">Smallest balance first. Quick psychological wins.</div>
        </div>
        <div class="calc-result good" style="border-left-color:var(--ff-gold)">
          <div style="font-weight:700;color:var(--ff-gold-dark);margin-bottom:4px">✋ Custom</div>
          <div class="text-xs text-muted">Drag cards into any order you prefer.</div>
        </div>
      </div>
      <div class="edu-card-voice">
        <p>Expand any debt card to see its full <strong>amortization schedule</strong> — period, payment, principal, interest split, and remaining balance date by date. When a card reaches zero, its full payment rolls over to the next card automatically.</p>
        <p>When a card balance hits zero, a full-screen <strong>payoff celebration</strong> plays with dancing mascots and confetti.</p>
      </div>
    `;
    return card;
  }

  private cardDebtPayments(): HTMLElement {
    const card = this.makeCard('📝', 'Recording Payments & Card Charges');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p><strong>Recording a debt payment:</strong></p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">1</span><div class="help-step-body">Click <strong>Record Payment</strong> on a debt card.</div></div>
        <div class="help-step"><span class="help-step-num">2</span><div class="help-step-body">Enter the amount and date. Check <strong>Extra payment</strong> if it's above the minimum.</div></div>
        <div class="help-step"><span class="help-step-num">3</span><div class="help-step-body">Click <strong>Save</strong>. The balance and amortization schedule update immediately.</div></div>
      </div>
      <div class="edu-card-voice">
        <p><strong>Logging a card charge:</strong></p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">1</span><div class="help-step-body">Click <strong>+ Charge</strong> on a credit card.</div></div>
        <div class="help-step"><span class="help-step-num">2</span><div class="help-step-body">Enter the merchant name, amount, and date.</div></div>
        <div class="help-step"><span class="help-step-num">3</span><div class="help-step-body">Charges appear in the <strong>Top Merchants</strong> chart on the Reports page.</div></div>
      </div>
      <div class="help-callout">
        Expenses linked to a card (via <em>Charge to card</em>) automatically create a charge entry when you mark the bill paid. No manual double-entry needed.
      </div>
    `;
    return card;
  }

  private cardDebtWhatIf(): HTMLElement {
    const card = this.makeCard('🔢', 'The What-If Grid');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>The <strong>What-if grid</strong> on the Debt page lets you instantly model the impact of an extra monthly payment against your entire debt stack.</p>
        <p>Enter any extra monthly payment in the grid field. The table instantly shows:</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">📅</span><div class="help-step-body"><strong>Months sooner</strong> each card pays off compared to paying minimums only.</div></div>
        <div class="help-step"><span class="help-step-num">💵</span><div class="help-step-body"><strong>Interest saved</strong> on each card over the payoff period.</div></div>
      </div>
      <div class="help-callout">
        Cross-check your extra payment amount against the <strong>Budget page surplus</strong> to confirm you can actually sustain it before committing.
      </div>
    `;
    return card;
  }

  // ── Reports ────────────────────────────────────────────────────────────────

  private renderReports(grid: HTMLElement): void {
    grid.appendChild(this.cardReportsDateRange());
    grid.appendChild(this.cardReportsCharts());
    grid.appendChild(this.cardReportsDebtCharts());
    grid.appendChild(this.cardReportsOverage());
  }

  private cardReportsDateRange(): HTMLElement {
    const card = this.makeCard('📅', 'Date Range & Presets');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Use the preset buttons to quickly set the reporting period, or click <strong>Custom</strong> and enter start and end dates:</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">📅</span><div class="help-step-body"><strong>This Month</strong> — current calendar month.</div></div>
        <div class="help-step"><span class="help-step-num">3️⃣</span><div class="help-step-body"><strong>Last 3 Mo.</strong> — trailing 3 months.</div></div>
        <div class="help-step"><span class="help-step-num">6️⃣</span><div class="help-step-body"><strong>Last 6 Mo.</strong> — trailing 6 months.</div></div>
        <div class="help-step"><span class="help-step-num">📆</span><div class="help-step-body"><strong>This Year</strong> — January 1 through today.</div></div>
        <div class="help-step"><span class="help-step-num">∞</span><div class="help-step-body"><strong>All Time</strong> — every record in the database.</div></div>
        <div class="help-step"><span class="help-step-num">🗓️</span><div class="help-step-body"><strong>Custom</strong> — any start and end date you specify.</div></div>
      </div>
    `;
    return card;
  }

  private cardReportsCharts(): HTMLElement {
    const card = this.makeCard('📊', 'Spending & Income Charts');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>The top of the Reports page shows KPI chips: total spending, total income, net cash flow, and savings rate. Then:</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">📊</span><div class="help-step-body"><strong>Spending Over Time</strong> — stacked bar chart: expenses and card charges by month, colored by category.</div></div>
        <div class="help-step"><span class="help-step-num">🍩</span><div class="help-step-body"><strong>By Category</strong> — donut chart with a ranked table of spending share per category.</div></div>
        <div class="help-step"><span class="help-step-num">🏪</span><div class="help-step-body"><strong>Top Merchants</strong> — horizontal bar chart of your biggest card-charge destinations.</div></div>
        <div class="help-step"><span class="help-step-num">⚖️</span><div class="help-step-body"><strong>Income vs Spending</strong> — side-by-side bars per month with net cash flow chips.</div></div>
        <div class="help-step"><span class="help-step-num">📅</span><div class="help-step-body"><strong>Spending by Day</strong> and <strong>Spending by Week of Month</strong> — see which day or week costs the most.</div></div>
        <div class="help-step"><span class="help-step-num">🧾</span><div class="help-step-body"><strong>Biggest Transactions</strong> — top 12 individual expenses and card charges.</div></div>
        <div class="help-step"><span class="help-step-num">🔄</span><div class="help-step-body"><strong>Recurring vs One-time</strong> — what share of spending is predictable each month.</div></div>
      </div>
    `;
    return card;
  }

  private cardReportsDebtCharts(): HTMLElement {
    const card = this.makeCard('📉', 'Card Balance Trend');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>The <strong>Card Balance Trend</strong> chart reconstructs your balance history from payment records — a rising line signals balance creep (you're spending faster than you're paying down).</p>
        <p>Also available: the <strong>Leaky Bucket</strong> — an animated, day-by-day scrubber of your month. Step through each day and watch the bucket drain as expenses land. Payday chips show when income arrives. It's a visual intuition-builder for cash flow timing.</p>
      </div>
    `;
    return card;
  }

  private cardReportsOverage(): HTMLElement {
    const card = this.makeCard('🔥', 'Common Overage Offenders');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>This card appears when you've set a <strong>monthly threshold</strong> on at least one recurring expense. It's always all-time data (independent of the date range), because seasonal patterns need multiple months of history to be meaningful.</p>
        <p>Each bill shows a grid of colored month cells:</p>
      </div>
      <div class="help-status-grid">
        <div class="help-status-row"><span class="help-status-dot" style="background:var(--ff-green)"></span><div><strong>Green ✓</strong> — actual payment was under threshold</div></div>
        <div class="help-status-row"><span class="help-status-dot" style="background:var(--color-danger)"></span><div><strong>Red (overage $)</strong> — actual payment exceeded threshold</div></div>
      </div>
      <div class="edu-card-voice">
        <p>Bills with 3 or more overages get a 🔥 marker. If 2+ overages cluster in the same season (summer, winter, spring, or fall), a callout appears: "☀️ tends to spike in summer — plan ahead."</p>
      </div>
    `;
    return card;
  }

  // ── What If? ──────────────────────────────────────────────────────────────

  private renderWhatIf(grid: HTMLElement): void {
    grid.appendChild(this.cardScenarioFilms());
  }

  // ── Learn ──────────────────────────────────────────────────────────────────

  private renderLearn(grid: HTMLElement): void {
    grid.appendChild(this.cardLearnPage());
    grid.appendChild(this.cardClassroom());
  }

  private cardScenarioFilms(): HTMLElement {
    const card = this.makeCard('🎬', 'What If? Scenario Films');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>The <strong>What If?</strong> page lets you model hypothetical changes — a new job, a car payment, a cross-country move — without touching your real data. Changes live in "films" that you toggle on and off.</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">➕</span><div class="help-step-body">Click <strong>+ New Film</strong>. Give it a descriptive name (e.g. "Buy a house"), an optional note, and a color.</div></div>
        <div class="help-step"><span class="help-step-num">💵</span><div class="help-step-body">Inside the film card, click <strong>+ Income</strong> to add a hypothetical income change, or <strong>+ Expense</strong> to add a hypothetical recurring or one-time expense.</div></div>
        <div class="help-step"><span class="help-step-num">🔛</span><div class="help-step-body">Toggle the film's switch to <strong>activate</strong> it. The projection panel appears at the top showing adjusted income, expenses, surplus, and a verdict: ✅ Yes / ⚠️ Tight / ❌ In the red.</div></div>
        <div class="help-step"><span class="help-step-num">🔀</span><div class="help-step-body"><strong>Layer multiple films</strong> active at once to model compounded changes. The projection panel combines all active films and shows the aggregate effect.</div></div>
        <div class="help-step"><span class="help-step-num">🗑️</span><div class="help-step-body">Delete a film when done. Your real data is never modified by films.</div></div>
      </div>
    `;
    return card;
  }

  private cardLearnPage(): HTMLElement {
    const card = this.makeCard('📚', 'The Learn Tab (Financial Education)');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>The <strong>Learn</strong> page (labeled "Learn" in the sidebar) provides plain-language financial education with interactive calculators that pull from your real budget data where available. Five tabs cover:</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">💳</span><div class="help-step-body"><strong>Debt Basics</strong> — What is APR?, The Minimum Payment Trap (interactive calculator), Avalanche vs. Snowball.</div></div>
        <div class="help-step"><span class="help-step-num">📊</span><div class="help-step-body"><strong>Budgeting</strong> — The 50/30/20 Rule (with your live data), Emergency Fund calculator, Zero-Based Budgeting.</div></div>
        <div class="help-step"><span class="help-step-num">📈</span><div class="help-step-body"><strong>Credit</strong> — Utilization calculator, What Makes a Credit Score?, Balance Transfers.</div></div>
        <div class="help-step"><span class="help-step-num">💰</span><div class="help-step-body"><strong>Saving &amp; Investing</strong> — Compound Interest chart (drag the years slider), Savings Rate, Opportunity Cost of Debt.</div></div>
        <div class="help-step"><span class="help-step-num">🔑</span><div class="help-step-body"><strong>Privacy &amp; Security</strong> — Public/Private Keys, How Financial Finger Uses Your Keys, Passphrases, The Same Ideas Everywhere.</div></div>
      </div>
    `;
    return card;
  }

  private cardClassroom(): HTMLElement {
    const card = this.makeCard('🏫', 'Financial Finger in the Classroom');
    card.className += ' help-classroom-card';
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Financial Finger is well-suited for educational settings — a financial literacy class, a personal finance unit, or a home-economics course. The offline-first, privacy-first design means students work with realistic data without sharing anything with a cloud service.</p>
        <p><strong>The "Financial Universe" model:</strong> a teacher sets up one installation as the <em>master household</em> and students each set up their own. Here's how it works:</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
        <div>
          <div style="font-weight:700;margin-bottom:var(--space-2);color:var(--ff-navy)">Teacher Setup</div>
          <div class="help-steps">
            <div class="help-step"><span class="help-step-num">1️⃣</span><div class="help-step-body">Complete the six-step setup wizard. Name the household something like "Dollar Farm — Teacher".</div></div>
            <div class="help-step"><span class="help-step-num">2️⃣</span><div class="help-step-body">Create the <strong>expense categories</strong> all students will use (Housing, Food, Transportation, etc.).</div></div>
            <div class="help-step"><span class="help-step-num">3️⃣</span><div class="help-step-body">Add a set of <strong>template recurring expenses</strong> representing a typical household's bills.</div></div>
            <div class="help-step"><span class="help-step-num">4️⃣</span><div class="help-step-body">Export the database (<strong>Settings → Export</strong>) encrypted to your own public key.</div></div>
            <div class="help-step"><span class="help-step-num">5️⃣</span><div class="help-step-body">Share the <code>.ffx</code> file with students (USB drive, shared folder, etc.).</div></div>
          </div>
        </div>
        <div>
          <div style="font-weight:700;margin-bottom:var(--space-2);color:var(--ff-green)">Student Setup</div>
          <div class="help-steps">
            <div class="help-step"><span class="help-step-num">1️⃣</span><div class="help-step-body">Complete the setup wizard — generate their own key pair and name their household.</div></div>
            <div class="help-step"><span class="help-step-num">2️⃣</span><div class="help-step-body">Go to <strong>Settings → Import</strong>, load the teacher's <code>.ffx</code> file, enter the <em>teacher's</em> private key and passphrase (provided by the teacher for classroom use), and import with <strong>Merge</strong>.</div></div>
            <div class="help-step"><span class="help-step-num">3️⃣</span><div class="help-step-body">Add their own <strong>household members</strong> and <strong>income sources</strong> — a realistic hypothetical income scenario assigned by the teacher or chosen by the student.</div></div>
            <div class="help-step"><span class="help-step-num">4️⃣</span><div class="help-step-body">Begin tracking their household: log bill payments, record debt accounts, check their Budget page, and explore What If? scenarios.</div></div>
          </div>
        </div>
      </div>
      <div class="help-callout" style="margin-top:var(--space-4)">
        <strong>Classroom exercise ideas:</strong> Compare Debt pages across students using Avalanche vs. Snowball — who pays off a shared scenario fastest? Use What If? to model a raise, a new car payment, or moving to a different city. Run the Compound Interest visualizer in the Learn tab and discuss why paying down debt early matters more than chasing investment returns early in life. Have students export their finished budget to each other and import as a household "merge" to discuss joint finances.
      </div>
    `;
    return card;
  }

  // ── Settings & Data ────────────────────────────────────────────────────────

  private renderSettings(grid: HTMLElement): void {
    grid.appendChild(this.cardSettingsBasic());
    grid.appendChild(this.cardReminders());
    grid.appendChild(this.cardDataSharing());
    grid.appendChild(this.cardSnapshots());
    grid.appendChild(this.cardBreakGlass());
  }

  private cardSettingsBasic(): HTMLElement {
    const card = this.makeCard('⚙️', 'Mascot, Theme & Household');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>The Settings page is the central control panel for the extension's configuration.</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">🐷</span><div class="help-step-body"><strong>Mascot</strong> — click Buck or Penny to switch; type in the name field to rename. Changes apply immediately.</div></div>
        <div class="help-step"><span class="help-step-num">🏠</span><div class="help-step-body"><strong>Household name</strong> — updates the title shown on the Dashboard.</div></div>
        <div class="help-step"><span class="help-step-num">👥</span><div class="help-step-body"><strong>Members</strong> — add members centrally or remove them (with a confirmation warning that income sources will also be removed).</div></div>
        <div class="help-step"><span class="help-step-num">🌙</span><div class="help-step-body"><strong>Theme</strong> — Light, Dark, or Auto (follows your OS preference). Applies immediately without a reload.</div></div>
        <div class="help-step"><span class="help-step-num">💱</span><div class="help-step-body"><strong>Currency</strong> — change the currency symbol used throughout the app.</div></div>
        <div class="help-step"><span class="help-step-num">🔐</span><div class="help-step-body"><strong>Security &amp; Keys</strong> — view your PGP fingerprint; export your armored public key to share with household members.</div></div>
      </div>
    `;
    return card;
  }

  private cardReminders(): HTMLElement {
    const card = this.makeCard('🔔', 'Custom Reminders');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Custom reminders fire as full-screen overlay notifications when you open the app on the trigger day. They are completely local — no email, no SMS, no server.</p>
        <p>Three trigger types are available:</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">📋</span><div class="help-step-body"><strong>Days before a bill's due date</strong> — e.g. 7 days before the electric bill.</div></div>
        <div class="help-step"><span class="help-step-num">📅</span><div class="help-step-body"><strong>Monthly on a specific day</strong> — fires on the chosen day of each month.</div></div>
        <div class="help-step"><span class="help-step-num">📌</span><div class="help-step-body"><strong>One-time on a specific date</strong> — fires once then deactivates itself.</div></div>
      </div>
      <div class="edu-card-voice">
        <p>Add reminders from the <strong>Reminders section</strong> at the bottom of any income source, expense, debt account, or bank account form — they're linked to that item and also appear in <strong>Settings → Reminders</strong> for centralized management.</p>
      </div>
    `;
    return card;
  }

  private cardDataSharing(): HTMLElement {
    const card = this.makeCard('🔄', 'Export, Import & Data Sharing');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Financial Finger is built for households where each person may use the extension on a separate computer. Data sharing uses PGP encryption — no server required.</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">📤</span><div class="help-step-body"><strong>Export</strong> — encrypt your database to a recipient's public key (saved contact or one-time paste) and download a <code>.ffx</code> file. Send it any way you like — it's safe to email or send over chat.</div></div>
        <div class="help-step"><span class="help-step-num">📥</span><div class="help-step-body"><strong>Import</strong> — load a <code>.ffx</code> file, enter your private key and passphrase, and choose: <strong>Merge</strong> (add incoming records alongside yours) or <strong>Replace</strong> (wipe yours first). Merge is almost always right for regular syncs.</div></div>
        <div class="help-step"><span class="help-step-num">👤</span><div class="help-step-body"><strong>Sharing keys</strong> — store a household member's public key under <em>Settings → Data Sharing → + Add person</em> so you can export to them without re-pasting their key each time.</div></div>
      </div>
      <div class="help-callout">
        <strong>What's included in an export:</strong> members, income sources, expense categories, expenses, debt accounts, and scenarios. <strong>Not included:</strong> bank accounts, payment history, card charges, and individual expense payment records (these are tied to a specific installation).
      </div>
    `;
    return card;
  }

  private cardSnapshots(): HTMLElement {
    const card = this.makeCard('⏱️', 'Snapshots & Point-in-Time Restore');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Financial Finger automatically saves a snapshot of your data every 30 minutes in the background. Snapshots are stored locally inside IndexedDB — they never leave your device.</p>
        <p>You can restore any snapshot from <strong>Settings → Snapshots</strong>, which replaces your current data with the chosen point in time. Before restoring, a safety snapshot of your current state is automatically saved.</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">🕐</span><div class="help-step-body"><strong>Auto snapshots</strong> — taken every 30 minutes by the background service worker. No action required.</div></div>
        <div class="help-step"><span class="help-step-num">📸</span><div class="help-step-body"><strong>Manual snapshot</strong> — click <em>Snapshot now</em> in Settings at any time, e.g. before a large data import or bulk edit.</div></div>
        <div class="help-step"><span class="help-step-num">🔄</span><div class="help-step-body"><strong>Restore</strong> — click <em>Restore</em> next to any snapshot. The app saves your current data first, applies the snapshot, then reloads. You'll re-enter your passphrase to unlock the vault.</div></div>
        <div class="help-step"><span class="help-step-num">🗑️</span><div class="help-step-body"><strong>Retention</strong> — snapshots older than 24 hours are automatically pruned. The 5 most recent snapshots are always kept regardless of age.</div></div>
      </div>
      <div class="help-callout">
        Snapshots store your encrypted data blobs — the same encryption that protects your live data protects snapshot contents too. No vault key is needed to take or prune snapshots.
      </div>
    `;
    return card;
  }

  private cardBreakGlass(): HTMLElement {
    const card = this.makeCard('🔧', 'Break Glass & Danger Zone');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p><strong>Break Glass</strong> is an emergency direct-access panel that gives you raw read/edit/delete access to every record in your encrypted database. It also contains the <strong>Orphan Record Scanner</strong>.</p>
        <p>Open it from the bottom of the Settings page. Your mascot will appear with a warning — confirm to proceed.</p>
      </div>
      <div class="help-steps">
        <div class="help-step"><span class="help-step-num">📂</span><div class="help-step-body"><strong>Data Browser</strong> — select a store (Members, Income Sources, Expenses, etc.) and click any record to view, edit, or delete it. UUID reference fields are clickable links that jump to the referenced record.</div></div>
        <div class="help-step"><span class="help-step-num">🔍</span><div class="help-step-body"><strong>Orphan Scanner</strong> — scans inter-store relationships for dangling references, stale bill dates, and orphaned card charges. Runs automatically when you switch to the tab. Each issue has a Fix or View button.</div></div>
      </div>
      <div class="edu-card-voice">
        <p><strong>Danger Zone</strong> at the bottom of Settings contains the vault wipe button — this permanently deletes all data and returns the extension to the first-run setup wizard. There is no undo.</p>
      </div>
      <div class="help-callout">
        Use Break Glass for data corrections that the normal UI can't make. There is no undo after saving a record — proceed carefully.
      </div>
    `;
    return card;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private makeCard(icon: string, title: string): HTMLElement {
    const card = document.createElement('div');
    card.className = 'edu-card';
    card.innerHTML = `
      <div class="edu-card-icon">${icon}</div>
      <h3>${title}</h3>
    `;
    return card;
  }
}
