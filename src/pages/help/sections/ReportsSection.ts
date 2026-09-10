import { makeCard } from '../helpUtils';

export function render(grid: HTMLElement): void {
  grid.appendChild(cardReportsDateRange());
  grid.appendChild(cardReportsKpis());
  grid.appendChild(cardReportsCharts());
  grid.appendChild(cardReportsLeakyBucket());
  grid.appendChild(cardReportsPayeeSchedule());
  grid.appendChild(cardReportsDebtCharts());
  grid.appendChild(cardReportsOverage());
}

function cardReportsDateRange(): HTMLElement {
  const card = makeCard('📅', 'Date Range & Presets');
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

function cardReportsKpis(): HTMLElement {
  const card = makeCard('📌', 'KPI Chips (click to expand)');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>The four chips at the top summarise the selected date range. Two of them are interactive — click anywhere on the chip to expand a detailed breakdown:</p>
    </div>
    <div class="help-steps">
      <div class="help-step"><span class="help-step-num">💸</span><div class="help-step-body"><strong>Total Spending</strong> — includes one-time expenses, bill payments, card charges, and debt payments. Click to expand a full transaction list sorted newest-first, with type badges (expense, bill, charge, debt) and individual amounts.</div></div>
      <div class="help-step"><span class="help-step-num">💰</span><div class="help-step-body"><strong>Total Income</strong> — recurring sources × months in range, plus any one-time income. Click to expand the income payment schedule: per-month sections listing each source, its per-paycheck amount, frequency, and payday dates.</div></div>
      <div class="help-step"><span class="help-step-num">📊</span><div class="help-step-body"><strong>Net Cash Flow</strong> — income minus all spending; green for surplus, red for deficit.</div></div>
      <div class="help-step"><span class="help-step-num">🎯</span><div class="help-step-body"><strong>Savings Rate</strong> — net ÷ income as a percentage. Under 20% shows an amber warning; negative shows red. Replaced by Top Category when no income is entered.</div></div>
    </div>
    <div class="help-callout">
      Click the underlined link at the bottom of Total Spending or Total Income to toggle the detail open or closed. The other chips in the row stay at their natural height — only the clicked chip expands.
    </div>
  `;
  return card;
}

function cardReportsCharts(): HTMLElement {
  const card = makeCard('📊', 'Spending & Income Charts');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>All spending charts count <strong>every outflow</strong>: one-time expenses, bill payments (from Mark Paid), card charges, and debt payments. Nothing is double-counted.</p>
    </div>
    <div class="help-steps">
      <div class="help-step"><span class="help-step-num">📊</span><div class="help-step-body"><strong>Spending Over Time</strong> — stacked bar chart by month: Expenses &amp; Bills (rust), Card Charges (navy), and Debt Payments (gold) as separate layers.</div></div>
      <div class="help-step"><span class="help-step-num">🍩</span><div class="help-step-body"><strong>By Category</strong> — donut chart with a ranked table of spending share per category.</div></div>
      <div class="help-step"><span class="help-step-num">🏪</span><div class="help-step-body"><strong>Top Merchants</strong> — horizontal bar chart of your biggest card-charge destinations.</div></div>
      <div class="help-step"><span class="help-step-num">⚖️</span><div class="help-step-body"><strong>Income vs Spending</strong> — side-by-side bars per month. Below the chart: an <strong>Income Payment Schedule</strong> showing per-month chips — each chip lists every income event (payday dates, amounts, frequency) and the month's income/spending totals.</div></div>
      <div class="help-step"><span class="help-step-num">📅</span><div class="help-step-body"><strong>Spending by Day</strong> and <strong>Spending by Week of Month</strong> — see which day or week costs the most.</div></div>
      <div class="help-step"><span class="help-step-num">🧾</span><div class="help-step-body"><strong>Biggest Transactions</strong> — top 12 individual expenses and card charges.</div></div>
      <div class="help-step"><span class="help-step-num">🔄</span><div class="help-step-body"><strong>Recurring vs One-time</strong> — what share of spending is predictable each month.</div></div>
    </div>
  `;
  return card;
}

function cardReportsLeakyBucket(): HTMLElement {
  const card = makeCard('🪣', 'Leaky Bucket');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>The <strong>Leaky Bucket</strong> is an animated, day-by-day scrubber of your month. The bucket fills to represent your monthly budget; each day's spending drains it. Step forward one day at a time or drag the scrubber to jump directly.</p>
    </div>
    <div class="help-steps">
      <div class="help-step"><span class="help-step-num">🗓️</span><div class="help-step-body"><strong>Calendar widget</strong> — the top-right corner shows a tear-off calendar that updates as you step through days: weekday name, day number (color-coded green/amber/red to match bucket fill), and month/year.</div></div>
      <div class="help-step"><span class="help-step-num">💰</span><div class="help-step-body"><strong>Payday chips</strong> — a green 💰 Payday chip appears on days when a recurring income source is scheduled to pay.</div></div>
      <div class="help-step"><span class="help-step-num">💸</span><div class="help-step-body"><strong>Spending chips</strong> — every expense, bill payment, card charge, and debt payment on that day appears as a chip with the payee name and amount.</div></div>
      <div class="help-step"><span class="help-step-num">📊</span><div class="help-step-body"><strong>Stats</strong> — Budget, Spent, Remaining, and % Used update live as you scrub. The balance below the bucket turns amber or red when you're running low.</div></div>
      <div class="help-step"><span class="help-step-num">📆</span><div class="help-step-body"><strong>Month selector</strong> — browse any of the last 12 months from the dropdown.</div></div>
    </div>
  `;
  return card;
}

function cardReportsPayeeSchedule(): HTMLElement {
  const card = makeCard('📋', 'Payee Schedule');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>The <strong>Payee Schedule</strong> groups every recurring obligation by payment frequency so you can answer "who am I paying this year, and when?" at a glance.</p>
    </div>
    <div class="help-steps">
      <div class="help-step"><span class="help-step-num">📅</span><div class="help-step-body"><strong>Frequency groups</strong> — Annual, Quarterly, Twice Monthly, Monthly, Every 2 Weeks, Weekly. Each group shows a payee count and the group's annual cost.</div></div>
      <div class="help-step"><span class="help-step-num">💳</span><div class="help-step-body"><strong>Debt minimum payments</strong> — debt accounts with a minimum payment set appear under Monthly as separate payee rows, labelled with the account name.</div></div>
      <div class="help-step"><span class="help-step-num">📆</span><div class="help-step-body"><strong>Due day</strong> — if a recurring bill has a due day set, it appears alongside the payee name (e.g. "due 15th").</div></div>
      <div class="help-step"><span class="help-step-num">💰</span><div class="help-step-body"><strong>Summary banner</strong> — shows total annual commitment and its monthly equivalent across all payees.</div></div>
    </div>
    <div class="help-callout">
      The Payee Schedule is independent of the date range — it reflects your current recurring obligations, not a historical period.
    </div>
  `;
  return card;
}

function cardReportsDebtCharts(): HTMLElement {
  const card = makeCard('📉', 'Card Balance Trend');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>The <strong>Card Balance Trend</strong> chart reconstructs your balance history from payment records — a rising line signals balance creep (you're spending faster than you're paying down).</p>
      <p>A warning banner appears automatically if any card's balance has grown more than 5% since the first recorded payment.</p>
    </div>
  `;
  return card;
}

function cardReportsOverage(): HTMLElement {
  const card = makeCard('🔥', 'Common Overage Offenders');
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
