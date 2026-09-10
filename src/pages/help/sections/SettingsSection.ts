import { makeCard } from '../helpUtils';

export function render(grid: HTMLElement): void {
  grid.appendChild(cardSettingsBasic());
  grid.appendChild(cardReminders());
  grid.appendChild(cardDataSharing());
  grid.appendChild(cardSnapshots());
  grid.appendChild(cardBreakGlass());
}

function cardSettingsBasic(): HTMLElement {
  const card = makeCard('⚙️', 'Mascot, Theme & Household');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>The Settings page is the central control panel for the extension's configuration.</p>
    </div>
    <div class="help-steps">
      <div class="help-step"><span class="help-step-num">🐷</span><div class="help-step-body"><strong>Mascot</strong> — click Buck or Penny to switch; type in the name field to rename. Changes apply immediately.</div></div>
      <div class="help-step"><span class="help-step-num">🏠</span><div class="help-step-body"><strong>Household name</strong> — updates the title shown on the Dashboard.</div></div>
      <div class="help-step"><span class="help-step-num">👥</span><div class="help-step-body"><strong>Members</strong> — add members centrally or remove them (with a confirmation warning that income sources will also be removed).</div></div>
      <div class="help-step"><span class="help-step-num">🌙</span><div class="help-step-body"><strong>Theme</strong> — Light, Dark, or Auto (follows your OS preference). Applies immediately without a reload.</div></div>
      <div class="help-step"><span class="help-step-num">💱</span><div class="help-step-body"><strong>Currency</strong> — choose from 20 currencies; the symbol, decimal precision, and formatting update everywhere money is shown.</div></div>
      <div class="help-step"><span class="help-step-num">🔐</span><div class="help-step-body"><strong>Security &amp; Keys</strong> — view your PGP fingerprint; export your armored public key to share with household members.</div></div>
    </div>
  `;
  return card;
}

function cardReminders(): HTMLElement {
  const card = makeCard('🔔', 'Custom Reminders');
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

function cardDataSharing(): HTMLElement {
  const card = makeCard('🔄', 'Export, Import & Data Sharing');
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
      <strong>What's included in a full export:</strong> members, income sources, expense categories, expenses, debt accounts, payment history, card charges, expense payment records, bank accounts, account transfers, bank transactions, import history, transaction rules, scenarios, calendar marks &amp; memos, reminders, and settings (theme, currency, etc.).<br><br>
      <strong>Not included:</strong> snapshots (local backups stay on each device) and the vault key (each machine holds its own key — the import process re-encrypts all data using the destination machine's vault key automatically).
    </div>
  `;
  return card;
}

function cardSnapshots(): HTMLElement {
  const card = makeCard('⏱️', 'Snapshots & Point-in-Time Restore');
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

function cardBreakGlass(): HTMLElement {
  const card = makeCard('🔧', 'Break Glass & Danger Zone');
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
