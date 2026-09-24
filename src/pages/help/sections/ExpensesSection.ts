import { makeCard } from '../helpUtils';

export function render(grid: HTMLElement): void {
  grid.appendChild(cardCategories());
  grid.appendChild(cardAddExpense());
  grid.appendChild(cardBillTracking());
  grid.appendChild(cardMarkPaid());
  grid.appendChild(cardAutoPay());
}

function cardCategories(): HTMLElement {
  const card = makeCard('🏷️', 'Expense Categories');
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

function cardAddExpense(): HTMLElement {
  const card = makeCard('➕', 'Adding an Expense');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>Click <strong>+ Add Expense</strong> on the Expenses page. Key fields:</p>
    </div>
    <div class="help-steps">
      <div class="help-step"><span class="help-step-num">🔁</span><div class="help-step-body"><strong>Recurring</strong> checkbox — marks this as a recurring bill and reveals: <em>Frequency</em> (weekly → annual), <em>Due day</em> (1–28, turns it into a tracked bill), <em>Monthly threshold</em> (overage budget for variable bills; hidden when <em>Fixed rate</em> is checked), <em>Fixed rate</em> — check this when the bill <strong>never</strong> varies (insurance, subscriptions) — the payment dialog pre-fills the exact amount as read-only and the threshold field is hidden; leave unchecked for variable bills (electricity, water) where you set a budget target and enter the actual each month. When <em>Auto-pay</em> is also checked, fixed-rate bills are recorded silently on each app open; variable-rate auto-pay bills surface a reminder toast prompting you to log the actual charge.</div></div>
      <div class="help-step"><span class="help-step-num">💳</span><div class="help-step-body"><strong>Charge to card</strong> — link a recurring expense to a debt account so payments automatically create a charge entry on that card.</div></div>
      <div class="help-step"><span class="help-step-num">🔔</span><div class="help-step-body">The <strong>Reminders</strong> section at the bottom lets you attach a custom notification — e.g. 7 days before a bill's due date.</div></div>
    </div>
  `;
  return card;
}

function cardBillTracking(): HTMLElement {
  const card = makeCard('📋', 'Bill Tracking & Status Badges');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>A recurring expense becomes a <strong>tracked bill</strong> when you set a due day (1–28). The extension monitors its payment status automatically each month:</p>
    </div>
    <div class="help-status-grid">
      <div class="help-status-row"><span class="help-status-dot" style="background:var(--ff-green)"></span><div><strong>✓ Paid</strong> — marked paid this calendar month (green left border)</div></div>
      <div class="help-status-row"><span class="help-status-dot" style="background:#f59e0b"></span><div><strong>⏰ Due Soon</strong> — due within 7 days (amber left border)</div></div>
      <div class="help-status-row"><span class="help-status-dot" style="background:var(--color-danger)"></span><div><strong>⚠ Past Due</strong> — due day passed without payment — pulsing red border</div></div>
      <div class="help-status-row"><span class="help-status-dot" style="background:var(--ff-gold)"></span><div><strong>⚡ Threshold</strong> — bill has a monthly cost target set (variable-rate bills only)</div></div>
      <div class="help-status-row"><span class="help-status-dot" style="background:rgba(99,102,241,0.5)"></span><div><strong>📌 Fixed rate</strong> — amount never varies; payment pre-fills automatically (shown on non-auto-pay fixed bills)</div></div>
    </div>
    <div class="help-callout">
      Click the <strong>📋</strong> icon on any bill row to open its <strong>payment ledger</strong> — a full history of every recorded payment with edit (✏️) and delete (🗑️) buttons on each entry.
    </div>
  `;
  return card;
}

function cardAutoPay(): HTMLElement {
  const card = makeCard('🔄', 'Auto-Pay Auto-Record');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>When a recurring bill has both <strong>Auto-pay</strong> and <strong>Fixed amount</strong> checked, Financial Finger records the payment automatically — no action required from you. Each time you open the app, the extension checks for past-due auto-pay bills and silently posts a payment entry and a bank-debit ledger entry.</p>
    </div>
    <div class="help-steps">
      <div class="help-step"><span class="help-step-num">✅</span><div class="help-step-body"><strong>Fixed-amount auto-pay</strong> — recorded silently on the next app open after the due date passes. A brief toast confirms how many bills were recorded. The bill status updates to ✓ Paid and the linked bank account balance decreases by the payment amount.</div></div>
      <div class="help-step"><span class="help-step-num">⚠️</span><div class="help-step-body"><strong>Variable-amount auto-pay</strong> — NOT auto-recorded (the amount varies each cycle). A warning toast names the bills and prompts you to go to Expenses and use <em>Log Actual</em> to enter the real charge. This keeps your balance accurate without guessing.</div></div>
      <div class="help-step"><span class="help-step-num">🔁</span><div class="help-step-body"><strong>No double-recording</strong> — once a bill is recorded for the current cycle, subsequent app opens skip it automatically. The dedup check uses the bill's last-paid date, so even reopening the app multiple times on the same day is safe.</div></div>
      <div class="help-step"><span class="help-step-num">⏱️</span><div class="help-step-body"><strong>Prompt window</strong> — bills whose due date is older than the configured window (default 7 days) are silently skipped. Adjust the window in <strong>Settings → Auto-pay prompt window</strong>.</div></div>
    </div>
    <div class="help-callout">
      To use auto-record: open an expense, check <strong>Recurring</strong>, set a <strong>Due day</strong>, check <strong>Fixed rate</strong>, check <strong>Auto-pay</strong>, and select the <strong>Bank account</strong> the charge is drawn from. That is all — the extension does the rest.
    </div>
  `;
  return card;
}

function cardMarkPaid(): HTMLElement {
  const card = makeCard('✅', 'Marking Bills Paid');
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
