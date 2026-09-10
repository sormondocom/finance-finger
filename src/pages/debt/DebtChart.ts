import {
  Chart,
  type ChartDataset,
} from 'chart.js';
import { comparePayoffScenarios } from '@/engine/amortize';
import { fmt, fmtCents } from '@/utils/finance';
import type { DebtAccount, DebtStrategy } from '@/types';
import { userLocale } from '@/utils/locale';

export interface ChartRef {
  instance: Chart | null;
}

const HORIZON_OPTIONS = [1, 2, 3, 4, 5, 10, 20, 30] as const;

function buildChartInstance(
  canvas: HTMLCanvasElement,
  accounts: DebtAccount[],
  customOrder: string[],
  strategy: DebtStrategy,
  extraPayment: number,
  horizonYears: number,
  chartRef: ChartRef,
): void {
  const orderedAccounts = strategy === 'custom'
    ? customOrder.map((id) => accounts.find((a) => a.id === id)!).filter(Boolean)
    : accounts;

  const maxMonths = horizonYears * 12;
  const minOnly  = comparePayoffScenarios(orderedAccounts, strategy, 0, new Date(), maxMonths).minOnly;
  const withExtra = extraPayment > 0
    ? comparePayoffScenarios(orderedAccounts, strategy, extraPayment, new Date(), maxMonths).withExtra
    : null;

  const labels = minOnly.monthly.map((m) =>
    m.date.toLocaleDateString(userLocale, { month: 'short', year: '2-digit' }),
  );

  const baseData = minOnly.monthly.map((m) => m.totalBalance);
  const extraData = withExtra
    ? (() => {
        const mapped = new Array(labels.length).fill(0);
        withExtra.monthly.forEach((m) => { if (m.month - 1 < mapped.length) mapped[m.month - 1] = m.totalBalance; });
        return mapped;
      })()
    : null;

  const datasets: ChartDataset<'line'>[] = [
    {
      label: 'Minimum payments only',
      data: baseData,
      borderColor: 'var(--ff-rust)',
      backgroundColor: 'rgba(180,83,9,0.07)',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2,
    },
  ];

  if (extraData) {
    datasets.push({
      label: `With +${fmtCents.format(extraPayment)}/mo`,
      data: extraData,
      borderColor: 'var(--ff-green)',
      backgroundColor: 'rgba(45,90,39,0.07)',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2,
      borderDash: [6, 3],
    });
  }

  chartRef.instance = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 12 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${fmt.format(ctx.parsed.y as number)}`,
          },
        },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 12, font: { size: 11 } }, grid: { display: false } },
        y: {
          ticks: { callback: (v) => fmt.format(v as number), font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
      },
    },
  });
}

export function rebuildChart(
  accounts: DebtAccount[],
  customOrder: string[],
  strategy: DebtStrategy,
  extraPayment: number,
  horizonYears: number,
  chartRef: ChartRef,
): void {
  const canvas = document.getElementById('debt-chart-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;
  chartRef.instance?.destroy();
  buildChartInstance(canvas, accounts, customOrder, strategy, extraPayment, horizonYears, chartRef);
}

export function buildChart(
  accounts: DebtAccount[],
  customOrder: string[],
  strategy: DebtStrategy,
  extraPayment: number,
  horizonYears: number,
  chartRef: ChartRef,
  onHorizonChange: (yr: typeof HORIZON_OPTIONS[number]) => void,
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';

  const chartHeader = document.createElement('div');
  chartHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4)';

  const h2 = document.createElement('h3');
  h2.className = 'font-serif';
  h2.style.cssText = 'font-size:var(--text-xl);margin:0';
  h2.textContent = 'Balance over time';
  chartHeader.appendChild(h2);

  const horizonWrap = document.createElement('div');
  horizonWrap.className = 'horizon-toggle';
  HORIZON_OPTIONS.forEach((yr) => {
    const btn = document.createElement('button');
    btn.className = `horizon-btn${horizonYears === yr ? ' active' : ''}`;
    btn.textContent = `${yr}Y`;
    btn.title = `Show ${yr}-year projection`;
    btn.setAttribute('data-testid', `debt-horizon-btn-${yr}y`);
    btn.addEventListener('click', () => onHorizonChange(yr));
    horizonWrap.appendChild(btn);
  });
  chartHeader.appendChild(horizonWrap);
  card.appendChild(chartHeader);

  const wrap = document.createElement('div');
  wrap.className = 'debt-chart-wrap';
  wrap.id = 'debt-chart-wrap';
  const canvas = document.createElement('canvas');
  canvas.id = 'debt-chart-canvas';
  wrap.appendChild(canvas);
  card.appendChild(wrap);

  requestAnimationFrame(() => buildChartInstance(canvas, accounts, customOrder, strategy, extraPayment, horizonYears, chartRef));

  return card;
}
