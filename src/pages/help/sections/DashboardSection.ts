import { makeCard } from '../helpUtils';

export function render(grid: HTMLElement): void {
  grid.appendChild(cardDashboardSummary());
  grid.appendChild(cardDashboardHealth());
  grid.appendChild(cardDashboardActivity());
}

function cardDashboardSummary(): HTMLElement {
  const card = makeCard('📊', 'Summary Cards');
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

function cardDashboardHealth(): HTMLElement {
  const card = makeCard('❤️', 'Financial Health Chips');
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

function cardDashboardActivity(): HTMLElement {
  const card = makeCard('📝', 'Monthly Activity & Tips');
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
