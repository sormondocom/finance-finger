import { Chart, BarController, BarElement, LinearScale, CategoryScale, Tooltip, Legend } from 'chart.js';
import { fmtCents, sourceMonthly } from '@/utils/finance';
import type { BankAccount, IncomeSource } from '@/types';
import { userLocale } from '@/utils/locale';

export type ChartRef = { instance: Chart | null };

Chart.register(BarController, BarElement, LinearScale, CategoryScale, Tooltip, Legend);

const SERIES_COLORS = [
  '#2D5A27', '#1B2A4A', '#C9A84C', '#B45309', '#7C3AED',
  '#0891B2', '#BE185D', '#374151', '#065F46', '#6B21A8',
];

function mLabel(y: number, m: number): string {
  return new Date(y, m, 1).toLocaleDateString(userLocale, { month: 'short', year: '2-digit' });
}

export function buildDepositsChart(
  accounts: BankAccount[],
  incomeSources: IncomeSource[],
  chartRef: ChartRef,
): HTMLElement | null {
  const assignedSources = incomeSources.filter((s) => s.active && s.bankAccountId);
  if (assignedSources.length === 0 || accounts.length === 0) return null;

  const now = new Date();
  const months: { y: number; m: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ y: d.getFullYear(), m: d.getMonth() });
  }

  const labels = months.map(({ y, m }) => mLabel(y, m));

  const datasets = accounts
    .filter((a) => assignedSources.some((s) => s.bankAccountId === a.id))
    .map((account, idx) => {
      const sources = incomeSources.filter((s) => s.active && s.bankAccountId === account.id);

      const data = months.map(({ y, m }) => {
        const mStart = new Date(y, m, 1).getTime();
        const mEnd = new Date(y, m + 1, 1).getTime();
        let total = 0;
        sources.forEach((s) => {
          if (s.createdAt >= mEnd) return;
          if (s.frequency === 'once') {
            if (s.date !== undefined && s.date >= mStart && s.date < mEnd) total += s.amount;
          } else {
            total += sourceMonthly(s);
          }
        });
        return Math.round(total * 100) / 100;
      });

      const color = account.color ?? SERIES_COLORS[idx % SERIES_COLORS.length]!;
      return {
        label: account.name,
        data,
        backgroundColor: color + 'CC',
        borderColor: color,
        borderWidth: 1,
        borderRadius: 3,
      };
    });

  const card = document.createElement('div');
  card.className = 'card';

  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4)';
  const title = document.createElement('h2');
  title.className = 'font-serif';
  title.style.fontSize = 'var(--text-xl)';
  title.textContent = 'Monthly Deposits';
  const sub = document.createElement('span');
  sub.className = 'text-xs text-muted';
  sub.textContent = 'Last 7 months — from income sources as of when they were added';
  titleRow.appendChild(title);
  titleRow.appendChild(sub);
  card.appendChild(titleRow);

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;height:220px';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  card.appendChild(wrap);

  requestAnimationFrame(() => {
    chartRef.instance = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12, padding: 10 } },
          tooltip: {
            callbacks: {
              label: (c) => `${c.dataset.label}: ${fmtCents.format(c.parsed.y ?? 0)}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            ticks: { callback: (v) => `$${Number(v).toLocaleString()}` },
          },
        },
      },
    });
  });

  return card;
}
