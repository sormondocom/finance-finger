import { makeCard } from '../helpUtils';
import { cardImportTransactions } from './sharedCards';

export function render(grid: HTMLElement): void {
  grid.appendChild(cardDebtAccounts());
  grid.appendChild(cardDebtStrategies());
  grid.appendChild(cardDebtPayments());
  grid.appendChild(cardDebtWhatIf());
  grid.appendChild(cardImportTransactions());
}

function cardDebtAccounts(): HTMLElement {
  const card = makeCard('💳', 'Adding Debt Accounts');
  card.innerHTML += `
    <div class="edu-card-voice">
      <p>Track every type of debt in one place. Click <strong>+ Add Account</strong> and choose the account type:</p>
    </div>
    <div class="help-steps">
      <div class="help-step"><span class="help-step-num">💳</span><div class="help-step-body"><strong>Credit Card</strong> — balance, APR, credit limit, minimum payment (fixed $ or % of balance), due day, 0% intro APR end date.</div></div>
      <div class="help-step"><span class="help-step-num">🏠</span><div class="help-step-body"><strong>Mortgage / Vehicle Loan / Personal &amp; Student Loan</strong> — add original principal and term; the app generates the full amortization schedule.</div></div>
      <div class="help-step"><span class="help-step-num">🏥</span><div class="help-step-body"><strong>Medical debt</strong> — balance and payment info, same as personal loan.</div></div>
    </div>
    <div class="help-callout">
      <strong>Utilization bars</strong> on each card show the balance-to-limit ratio colored gold (under 30%), rust (30–89%), or red (90%+ or over-limit). The <strong>Minimum Payment Trap</strong> detector flags any card where paying minimums only would take more than 3 years or cost more than 50% of the original balance in interest.
    </div>
  `;
  return card;
}

function cardDebtStrategies(): HTMLElement {
  const card = makeCard('🎯', 'Payoff Strategies & Amortization');
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

function cardDebtPayments(): HTMLElement {
  const card = makeCard('📝', 'Recording Payments & Card Charges');
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

function cardDebtWhatIf(): HTMLElement {
  const card = makeCard('🔢', 'The What-If Grid');
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
