import { makeCard } from '../helpUtils';

export function render(grid: HTMLElement): void {
  grid.appendChild(cardScenarioFilms());
}

function cardScenarioFilms(): HTMLElement {
  const card = makeCard('🎬', 'What If? Scenario Films');
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
