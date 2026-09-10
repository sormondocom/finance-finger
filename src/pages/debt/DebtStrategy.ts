import { comparePayoffScenarios } from '@/engine/amortize';
import { showMascot } from '@/mascot/Mascot';
import { fmtCents } from '@/utils/finance';
import type { DebtAccount, DebtAccountType, DebtStrategy } from '@/types';
import { userLocale } from '@/utils/locale';

const STRATEGY_DESCS: Record<DebtStrategy, string> = {
  avalanche: 'Pay off highest-APR account first. Saves the most interest overall.',
  snowball:  'Pay off smallest balance first. Builds momentum with quick wins.',
  custom:    'You decide the payoff order.',
};

const DEBT_TYPE_ICONS: Record<DebtAccountType, string> = {
  card: '💳', mortgage: '🏠', medical: '🏥', loan: '💼', vehicle: '🚗',
};

function renderStrategyResults(
  container: HTMLElement,
  strategy: DebtStrategy,
  accounts: DebtAccount[],
  customOrder: string[],
  extraPayment: number,
  horizonYears: number,
): void {
  container.innerHTML = '';

  const orderedAccounts = strategy === 'custom'
    ? customOrder.map((id) => accounts.find((a) => a.id === id)!).filter(Boolean)
    : accounts;

  const maxMonths = horizonYears * 12;
  const comparison = comparePayoffScenarios(orderedAccounts, strategy, extraPayment, new Date(), maxMonths);
  const { minOnly, withExtra, interestSaved, monthsSaved } = comparison;

  const fmtDate = (d: Date | null): string =>
    d
      ? d.toLocaleDateString(userLocale, { month: 'long', year: 'numeric' })
      : `Not paid off within ${horizonYears}-year horizon`;

  const grid = document.createElement('div');
  grid.className = 'whatif-grid';
  grid.innerHTML = `
    <div class="whatif-panel baseline">
      <div class="whatif-label">Minimum payments only</div>
      <div class="whatif-stat">
        <span class="whatif-stat-label">Debt-free</span>
        <span class="whatif-stat-value">${fmtDate(minOnly.debtFreeDate)}</span>
      </div>
      <div class="whatif-stat">
        <span class="whatif-stat-label">Total interest</span>
        <span class="whatif-stat-value" style="color:var(--ff-rust)">${fmtCents.format(minOnly.totalInterest)}</span>
      </div>
      <div class="whatif-stat">
        <span class="whatif-stat-label">Total paid</span>
        <span class="whatif-stat-value">${fmtCents.format(minOnly.totalPaid)}</span>
      </div>
    </div>
    <div class="whatif-panel improved">
      <div class="whatif-label">
        ${extraPayment > 0 ? `With +${fmtCents.format(extraPayment)}/mo extra` : 'With extra payment'}
      </div>
      <div class="whatif-stat">
        <span class="whatif-stat-label">Debt-free</span>
        <span class="whatif-stat-value" style="color:var(--ff-green)">${fmtDate(withExtra.debtFreeDate)}</span>
      </div>
      <div class="whatif-stat">
        <span class="whatif-stat-label">Total interest</span>
        <span class="whatif-stat-value" style="color:var(--ff-rust)">${fmtCents.format(withExtra.totalInterest)}</span>
      </div>
      <div class="whatif-stat">
        <span class="whatif-stat-label">Total paid</span>
        <span class="whatif-stat-value">${fmtCents.format(withExtra.totalPaid)}</span>
      </div>
    </div>
  `;
  container.appendChild(grid);

  if (extraPayment > 0 && interestSaved > 0) {
    const yrs = Math.floor(monthsSaved / 12);
    const mos = monthsSaved % 12;
    const timeStr = [yrs > 0 ? `${yrs} yr` : '', mos > 0 ? `${mos} mo` : ''].filter(Boolean).join(' ');

    const banner = document.createElement('div');
    banner.className = 'savings-banner';
    banner.innerHTML = `
      <span class="savings-banner-icon">🎉</span>
      <div>
        <strong>You'd save ${fmtCents.format(interestSaved)} in interest</strong> and be debt-free
        ${timeStr ? `<strong>${timeStr} sooner</strong>` : 'sooner'}.
        That money stays in your pocket instead of going to the bank.
      </div>
    `;
    container.appendChild(banner);

    setTimeout(() =>
      showMascot('debt-free-improvement', {
        amount: fmtCents.format(extraPayment),
        date: fmtDate(withExtra.debtFreeDate),
        interest: fmtCents.format(interestSaved),
        months: String(monthsSaved),
      }),
      800,
    );
  }

  if (minOnly.paidOffOrder.length > 1) {
    const orderEl = document.createElement('div');
    orderEl.innerHTML = `<h3 class="font-serif" style="font-size:var(--text-base);margin-bottom:var(--space-3)">Payoff order</h3>`;
    const list = document.createElement('div');
    list.className = 'payoff-order';
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    minOnly.paidOffOrder.forEach((id, i) => {
      const a = accountMap.get(id);
      if (!a) return;
      const step = document.createElement('div');
      step.className = 'payoff-order-step';
      step.innerHTML = `
        <span class="payoff-order-num">${i + 1}</span>
        <span>${DEBT_TYPE_ICONS[a.type]} ${a.name}</span>
        <span class="text-xs text-muted">${a.apr}% APR · ${fmtCents.format(a.balance)}</span>
      `;
      list.appendChild(step);
      if (i < minOnly.paidOffOrder.length - 1) {
        const arrow = document.createElement('div');
        arrow.className = 'payoff-order-arrow';
        arrow.innerHTML = '↓ then';
        list.appendChild(arrow);
      }
    });

    orderEl.appendChild(list);
    container.appendChild(orderEl);
  }
}

export function buildStrategyPanel(
  accounts: DebtAccount[],
  initialStrategy: DebtStrategy,
  initialExtraPayment: number,
  initialCustomOrder: string[],
  horizonYears: number,
  onChange: {
    strategy: (s: DebtStrategy) => void;
    extraPayment: (e: number) => void;
    customOrder: (order: string[]) => void;
    rebuildChart: () => void;
  },
): HTMLElement {
  let localStrategy = initialStrategy;
  let localExtraPayment = initialExtraPayment;
  const localCustomOrder = [...initialCustomOrder];

  const panel = document.createElement('div');
  panel.className = 'card';
  panel.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-5)';

  const refreshPanel = (p: HTMLElement): void => {
    const wrap = p.querySelector<HTMLElement>('#custom-order-wrap');
    if (wrap) wrap.style.display = localStrategy === 'custom' ? '' : 'none';
    const resultsEl = p.querySelector<HTMLElement>('#strategy-results');
    if (resultsEl) renderStrategyResults(resultsEl, localStrategy, accounts, localCustomOrder, localExtraPayment, horizonYears);
    onChange.rebuildChart();
  };

  const renderCustomOrder = (wrap: HTMLElement): void => {
    wrap.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'custom-order-list';

    const orderedAccounts = localCustomOrder
      .map((id) => accounts.find((a) => a.id === id))
      .filter(Boolean) as DebtAccount[];

    orderedAccounts.forEach((a, idx) => {
      const item = document.createElement('div');
      item.className = 'custom-order-item';
      item.setAttribute('data-testid', 'custom-order-item');
      item.setAttribute('data-account-id', a.id);
      item.innerHTML = `
        <span>${idx + 1}. ${DEBT_TYPE_ICONS[a.type]} ${a.name}</span>
        <span class="text-xs text-muted">${a.apr}% APR · ${fmtCents.format(a.balance)}</span>
        <button class="order-btn" data-dir="up" ${idx === 0 ? 'disabled' : ''}>▲</button>
        <button class="order-btn" data-dir="down" ${idx === orderedAccounts.length - 1 ? 'disabled' : ''}>▼</button>
      `;
      item.querySelector('[data-dir="up"]')!.addEventListener('click', () => {
        [localCustomOrder[idx - 1], localCustomOrder[idx]] =
          [localCustomOrder[idx]!, localCustomOrder[idx - 1]!];
        onChange.customOrder([...localCustomOrder]);
        renderCustomOrder(wrap);
        refreshPanel(wrap.closest('.card') as HTMLElement);
      });
      item.querySelector('[data-dir="down"]')!.addEventListener('click', () => {
        [localCustomOrder[idx], localCustomOrder[idx + 1]] =
          [localCustomOrder[idx + 1]!, localCustomOrder[idx]!];
        onChange.customOrder([...localCustomOrder]);
        renderCustomOrder(wrap);
        refreshPanel(wrap.closest('.card') as HTMLElement);
      });
      list.appendChild(item);
    });

    wrap.appendChild(list);
  };

  const h2 = document.createElement('h2');
  h2.className = 'font-serif';
  h2.style.fontSize = 'var(--text-xl)';
  h2.textContent = 'Payoff Strategy';
  panel.appendChild(h2);

  const tabs = document.createElement('div');
  tabs.className = 'strategy-tabs';
  const desc = document.createElement('p');
  desc.className = 'strategy-desc';
  desc.textContent = STRATEGY_DESCS[localStrategy];

  (['avalanche', 'snowball', 'custom'] as DebtStrategy[]).forEach((s) => {
    const btn = document.createElement('button');
    btn.className = `strategy-tab ${localStrategy === s ? 'active' : ''}`;
    btn.setAttribute('data-testid', `strategy-tab-${s}`);
    btn.setAttribute('data-strategy', s);
    btn.textContent = s.charAt(0).toUpperCase() + s.slice(1);
    btn.addEventListener('click', () => {
      localStrategy = s;
      onChange.strategy(s);
      desc.textContent = STRATEGY_DESCS[s];
      tabs.querySelectorAll('.strategy-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      refreshPanel(panel);
    });
    tabs.appendChild(btn);
  });

  panel.appendChild(tabs);
  panel.appendChild(desc);

  const customOrderWrap = document.createElement('div');
  customOrderWrap.id = 'custom-order-wrap';
  customOrderWrap.style.display = localStrategy === 'custom' ? '' : 'none';
  renderCustomOrder(customOrderWrap);
  panel.appendChild(customOrderWrap);

  const extraRow = document.createElement('div');
  extraRow.className = 'extra-payment-row';
  extraRow.innerHTML = `
    <label for="extra-payment">Extra monthly payment</label>
    <input id="extra-payment" type="number" min="0" step="10"
      value="${localExtraPayment || ''}" placeholder="0" />
    <span class="extra-payment-desc">Added on top of all minimums, directed at your focus account.</span>
  `;
  extraRow.querySelector<HTMLInputElement>('#extra-payment')!.addEventListener('input', (e) => {
    localExtraPayment = parseFloat((e.target as HTMLInputElement).value) || 0;
    onChange.extraPayment(localExtraPayment);
    refreshPanel(panel);
  });
  panel.appendChild(extraRow);

  const resultsEl = document.createElement('div');
  resultsEl.id = 'strategy-results';
  panel.appendChild(resultsEl);

  renderStrategyResults(resultsEl, localStrategy, accounts, localCustomOrder, localExtraPayment, horizonYears);
  return panel;
}
