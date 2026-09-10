import { makeCard } from '../helpUtils';
import { cardImportTransactions } from './sharedCards';

export function render(grid: HTMLElement): void {
  grid.appendChild(cardBankAccounts());
  grid.appendChild(cardBalanceProjection());
  grid.appendChild(cardImportTransactions());
}

function cardBankAccounts(): HTMLElement {
  const card = makeCard('🏦', 'Accounts');
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

function cardBalanceProjection(): HTMLElement {
  const card = makeCard('📈', 'Actual vs. Projected Balance');
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
