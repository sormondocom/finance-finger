import { amortizeSingleCard } from '@/engine/amortize';
import { fmtCents } from '@/utils/finance';
import type { DebtAccount, DebtAccountType, PaymentCycle, CardCharge } from '@/types';
import { userLocale } from '@/utils/locale';

const DEBT_TYPE_ICONS: Record<DebtAccountType, string> = {
  card: '💳', mortgage: '🏠', medical: '🏥', loan: '💼', vehicle: '🚗',
};

const PERIODS_PER_YEAR_MAP: Record<PaymentCycle, number> = {
  weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12,
};

function buildScheduleTable(
  schedule: ReturnType<typeof amortizeSingleCard>['schedule'],
  account: DebtAccount,
): HTMLElement {
  const table = document.createElement('table');
  table.className = 'schedule-table';

  table.innerHTML = `
    <thead>
      <tr>
        <th>#</th>
        <th>Date</th>
        <th>Payment</th>
        <th>Interest</th>
        <th>Principal</th>
        <th>Balance</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');
  schedule.forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.period}</td>
      <td>${row.date.toLocaleDateString(userLocale, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
      <td>${fmtCents.format(row.payment)}</td>
      <td class="interest-cell">${fmtCents.format(row.interest)}</td>
      <td>${fmtCents.format(row.principal)}</td>
      <td class="balance-cell">${fmtCents.format(row.remainingBalance)}</td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);

  const totalInterest = schedule.reduce((s, r) => s + r.interest, 0);
  const totalPayment  = schedule.reduce((s, r) => s + r.payment, 0);
  const tfoot = document.createElement('tfoot');
  tfoot.style.cssText = 'background:var(--color-bg-sunken);font-weight:600;position:sticky;bottom:0';
  tfoot.innerHTML = `
    <tr>
      <td colspan="2">${schedule.length} payments · ${account.name}</td>
      <td>${fmtCents.format(totalPayment)}</td>
      <td class="interest-cell">${fmtCents.format(totalInterest)}</td>
      <td>${fmtCents.format(totalPayment - totalInterest)}</td>
      <td>$0.00</td>
    </tr>
  `;
  table.appendChild(tfoot);

  return table;
}

export function buildSchedulePanel(
  accounts: DebtAccount[],
  selectedAccountId: string | null,
  horizonYears: number,
  onAccountChange: (accountId: string) => void,
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'card';

  const h2 = document.createElement('h3');
  h2.className = 'font-serif';
  h2.style.cssText = 'font-size:var(--text-xl);margin-bottom:var(--space-4)';
  h2.textContent = 'Amortization Schedule';
  panel.appendChild(h2);

  const controls = document.createElement('div');
  controls.className = 'schedule-controls';

  const select = document.createElement('select');
  select.id = 'schedule-select';
  select.style.cssText = 'width:auto;max-width:220px';
  accounts.forEach((a) => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = `${DEBT_TYPE_ICONS[a.type]} ${a.name}`;
    opt.selected = a.id === selectedAccountId;
    select.appendChild(opt);
  });

  const extraLabel = document.createElement('span');
  extraLabel.className = 'text-xs text-muted';
  extraLabel.textContent = 'Showing minimum payments only. Extra payment applies in the multi-account strategy above.';

  controls.appendChild(select);
  controls.appendChild(extraLabel);
  panel.appendChild(controls);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'schedule-table-wrap';
  panel.appendChild(tableWrap);

  const renderTable = (accountId: string) => {
    const a = accounts.find((x) => x.id === accountId);
    if (!a) return;
    const maxPeriods = horizonYears * PERIODS_PER_YEAR_MAP[a.paymentCycle];
    const result = amortizeSingleCard(a, 0, new Date(), maxPeriods);
    const truncated = result.schedule.length >= maxPeriods && (result.schedule[result.schedule.length - 1]?.remainingBalance ?? 0) > 0;
    tableWrap.innerHTML = '';
    if (truncated) {
      const note = document.createElement('p');
      note.className = 'schedule-truncated-note';
      note.textContent = `Showing first ${horizonYears} years. Balance not paid off within this horizon — adjust the horizon above or add a higher payment.`;
      tableWrap.appendChild(note);
    }
    tableWrap.appendChild(buildScheduleTable(result.schedule, a));
  };

  select.addEventListener('change', () => {
    onAccountChange(select.value);
    renderTable(select.value);
  });

  if (selectedAccountId) renderTable(selectedAccountId);

  return panel;
}

export function buildMerchantSummary(charges: CardCharge[]): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card merchant-summary';

  const heading = document.createElement('div');
  heading.className = 'merchant-summary-heading';
  heading.innerHTML = `<h2 class="font-serif">Spending by Merchant</h2><span class="merchant-summary-subtitle">All card charges · ranked by total</span>`;
  card.appendChild(heading);

  const merchantTotals = new Map<string, { total: number; count: number }>();
  charges.forEach((c) => {
    const entry = merchantTotals.get(c.merchant) ?? { total: 0, count: 0 };
    entry.total += c.amount;
    entry.count += 1;
    merchantTotals.set(c.merchant, entry);
  });

  const sorted = [...merchantTotals.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 15);

  const maxTotal = sorted[0]?.[1].total ?? 1;

  const list = document.createElement('div');
  list.className = 'merchant-summary-list';

  sorted.forEach(([merchant, { total, count }], idx) => {
    const row = document.createElement('div');
    row.className = 'merchant-summary-row';
    row.innerHTML = `
      <div class="merchant-summary-bar-bg" style="transform:scaleX(${(total / maxTotal).toFixed(3)})"></div>
      <span class="merchant-summary-rank">${idx + 1}</span>
      <span class="merchant-summary-name">${merchant}</span>
      <span class="merchant-summary-count">${count} charge${count !== 1 ? 's' : ''}</span>
      <span class="merchant-summary-amount">${fmtCents.format(total)}</span>
    `;
    list.appendChild(row);
  });

  card.appendChild(list);
  return card;
}
