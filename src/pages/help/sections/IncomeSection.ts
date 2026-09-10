import { makeCard } from '../helpUtils';

export function render(grid: HTMLElement): void {
  grid.appendChild(cardMembers());
  grid.appendChild(cardIncomeSources());
  grid.appendChild(cardIncomeMonthNav());
}

function cardMembers(): HTMLElement {
  const card = makeCard('👥', 'Household Members');
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

function cardIncomeSources(): HTMLElement {
  const card = makeCard('💰', 'Income Sources');
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

function cardIncomeMonthNav(): HTMLElement {
  const card = makeCard('📅', 'Month Navigation, Totals & Year Overview');
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
