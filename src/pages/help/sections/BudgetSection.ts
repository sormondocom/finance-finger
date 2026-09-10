import { makeCard } from '../helpUtils';

export function render(grid: HTMLElement): void {
  grid.appendChild(cardBudgetSummary());
  grid.appendChild(cardBudgetBuckets());
  grid.appendChild(cardBudgetLedger());
  grid.appendChild(cardBudgetCharts());
}

function cardBudgetSummary(): HTMLElement {
  const card = makeCard('📊', 'Budget Summary Bar');
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

function cardBudgetBuckets(): HTMLElement {
  const card = makeCard('🪣', 'Spending Buckets (Envelope Budgeting)');
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

function cardBudgetLedger(): HTMLElement {
  const card = makeCard('📋', 'Spending Category Ledger');
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

function cardBudgetCharts(): HTMLElement {
  const card = makeCard('🍩', 'Budget Charts');
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
