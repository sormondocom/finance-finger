import { amortizeSingleCard, amortizeMultiCard } from '@/engine/amortize';
import { fmtCents } from '@/utils/finance';
import { escapeHtml } from '@/utils/escapeHtml';
import type { DebtAccount, DebtAccountType, DebtPayment, DebtStrategy } from '@/types';
import { userLocale } from '@/utils/locale';

const DEBT_TYPE_ICONS: Record<DebtAccountType, string> = {
  card: '💳', mortgage: '🏠', medical: '🏥', loan: '💼', vehicle: '🚗',
};

export function buildMilestoneCard(
  accounts: DebtAccount[],
  payments: DebtPayment[],
  strategy: DebtStrategy,
  extraPayment: number,
): HTMLElement | null {
  const active = accounts.filter((a) => a.balance > 0);
  if (active.length === 0) return null;

  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('data-testid', 'milestone-card');

  const h3 = document.createElement('h3');
  h3.className = 'font-serif';
  h3.style.cssText = 'font-size:var(--text-xl);margin-bottom:var(--space-2)';
  h3.textContent = '🏆 Payoff Milestones';
  card.appendChild(h3);

  const strategyNote = document.createElement('p');
  strategyNote.className = 'text-xs text-muted';
  strategyNote.style.marginBottom = 'var(--space-5)';
  const extraNote = extraPayment > 0
    ? ` · +${fmtCents.format(extraPayment)}/mo extra`
    : ' · minimum payments only';
  strategyNote.textContent =
    `${strategy.charAt(0).toUpperCase() + strategy.slice(1)} strategy${extraNote}`;
  card.appendChild(strategyNote);

  const perAccountResults = active
    .map((a) => ({ account: a, result: amortizeSingleCard(a, extraPayment / active.length) }))
    .sort((a, b) => a.result.debtFreeDate.getTime() - b.result.debtFreeDate.getTime());

  const totalPaidPerAccount = new Map<string, number>();
  payments.forEach((p) => {
    totalPaidPerAccount.set(p.accountId, (totalPaidPerAccount.get(p.accountId) ?? 0) + p.amount);
  });

  const timeline = document.createElement('div');
  timeline.className = 'milestone-timeline';
  timeline.setAttribute('data-testid', 'milestone-timeline');

  perAccountResults.forEach(({ account, result }, idx) => {
    const paidSoFar = totalPaidPerAccount.get(account.id) ?? 0;
    const estimatedOriginal = account.balance + paidSoFar;
    const pctPaid = estimatedOriginal > 0 ? paidSoFar / estimatedOriginal : 0;
    const barColor = idx === 0 ? 'var(--ff-gold)' : 'var(--ff-green)';
    const icon = DEBT_TYPE_ICONS[account.type];
    // No minimum payment configured means calcMinPayment() returns 0, so the
    // amortization engine runs the full 100-year cap at $0/period — a real,
    // mathematically-correct extrapolation of "never pay anything," but
    // displaying its trillion-dollar-interest, decades-out result reads as a
    // broken app rather than an unset field. Show the same prompt the debt
    // list's "Needs payment info" badge already points the user at instead.
    const needsSetup = account.minimumPaymentValue == null;
    const dateStr = needsSetup
      ? null
      : result.debtFreeDate.toLocaleDateString(userLocale, { month: 'short', year: 'numeric' });

    const row = document.createElement('div');
    row.className = 'milestone-row';
    row.setAttribute('data-testid', 'milestone-row');
    row.setAttribute('data-account-id', account.id);
    row.innerHTML = `
      <div class="milestone-rank">${idx + 1}</div>
      <div class="milestone-info">
        <div class="milestone-name">${icon} ${escapeHtml(account.name)}</div>
        <div class="milestone-progress-wrap">
          <div class="milestone-progress-bar" style="width:${Math.round(pctPaid * 100)}%;background:${barColor}"></div>
        </div>
        <div class="milestone-meta">
          ${fmtCents.format(account.balance)} remaining
          · ${Math.round(pctPaid * 100)}% paid
          ${needsSetup ? '' : `· <strong>${fmtCents.format(result.totalInterest)}</strong> est. interest`}
        </div>
      </div>
      <div class="milestone-date" data-testid="milestone-date">
        ${needsSetup
          ? '<span class="milestone-date-label text-muted">Add a minimum payment to see a payoff estimate</span>'
          : `<span class="milestone-date-label">Paid off</span><span class="milestone-date-value">${dateStr}</span>`}
      </div>
    `;
    timeline.appendChild(row);
  });

  card.appendChild(timeline);

  // The combined projection is only meaningful once every active account has
  // payment info — one unset account would otherwise drag the whole payoff
  // schedule out to the same 100-year cap as the per-account case above.
  const anyNeedsSetup = active.some((a) => a.minimumPaymentValue == null);

  const multiResult = anyNeedsSetup ? null : amortizeMultiCard(active, strategy, extraPayment);
  const freedomDate = multiResult?.debtFreeDate
    ? multiResult.debtFreeDate.toLocaleDateString(userLocale, { month: 'long', year: 'numeric' })
    : '—';

  const freedomBanner = document.createElement('div');
  freedomBanner.className = 'milestone-freedom-banner';
  freedomBanner.setAttribute('data-testid', 'milestone-freedom-banner');
  freedomBanner.innerHTML = anyNeedsSetup
    ? `
      <span class="milestone-freedom-icon">🎯</span>
      <div>
        <div class="milestone-freedom-label">Complete debt freedom</div>
        <div class="milestone-freedom-date text-muted" data-testid="milestone-freedom-date" style="font-size:var(--text-sm)">
          Add a minimum payment to every debt above to see your debt-free date
        </div>
      </div>
    `
    : `
      <span class="milestone-freedom-icon">🎯</span>
      <div>
        <div class="milestone-freedom-label">Complete debt freedom</div>
        <div class="milestone-freedom-date" data-testid="milestone-freedom-date">${freedomDate}</div>
      </div>
      <div class="milestone-freedom-stats">
        <div class="milestone-freedom-stat">
          <span class="text-muted text-xs">Total interest at current pace</span>
          <span class="milestone-freedom-stat-val">${fmtCents.format(multiResult!.totalInterest)}</span>
        </div>
      </div>
    `;
  card.appendChild(freedomBanner);

  if (extraPayment === 0 && multiResult) {
    const nudge = amortizeMultiCard(active, strategy, 50);
    const monthsSaved = multiResult.monthly.length - nudge.monthly.length;
    const interestSaved = multiResult.totalInterest - nudge.totalInterest;
    if (monthsSaved > 0) {
      const tip = document.createElement('p');
      tip.className = 'milestone-whatif-tip';
      tip.setAttribute('data-testid', 'milestone-whatif-tip');
      tip.innerHTML = `
        💡 Add just <strong>$50/month</strong> and you'd be debt-free
        <strong>${monthsSaved} month${monthsSaved !== 1 ? 's' : ''} sooner</strong>,
        saving <strong>${fmtCents.format(interestSaved)}</strong> in interest.
      `;
      card.appendChild(tip);
    }
  }

  return card;
}
