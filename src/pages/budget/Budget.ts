import './budget.css';
import {
  Chart,
  DoughnutController,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { getIncomeSources, getExpenses, getCategories, saveCategory } from '@/db';
import { toMonthly, sourceMonthly, fmt, fmtCents } from '@/utils/finance';
import { showMascot } from '@/mascot/Mascot';
import { openFormModal } from '@/components/Modal';
import type { ExpenseCategory, Expense, IncomeSource } from '@/types';

Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

interface CategoryTotals {
  cat: ExpenseCategory | null;
  monthlyTotal: number;
}

export class BudgetPage {
  private container!: HTMLElement;

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'budget-page';
    this.container.innerHTML = '<p class="text-muted">Loading...</p>';
    this.populate();
    return this.container;
  }

  private async populate(): Promise<void> {
    const el = this.container;
    const [sources, expenses, categories] = await Promise.all([
      getIncomeSources(),
      getExpenses(),
      getCategories(),
    ]);

    const monthlyIncome = sources
      .filter((s: IncomeSource) => s.active)
      .reduce((sum, s) => sum + sourceMonthly(s), 0);

    const recurringExpenses = expenses.filter((e: Expense) => e.recurring);
    const monthlyExpenses = recurringExpenses.reduce(
      (sum, e) => sum + toMonthly(e.amount, e.recurringFrequency ?? 'monthly'),
      0,
    );

    const surplus = monthlyIncome - monthlyExpenses;

    el.innerHTML = '';

    if (monthlyIncome === 0 && monthlyExpenses === 0) {
      el.appendChild(this.renderEmpty());
      return;
    }

    // ── Page title ───────────────────────────────────────────────────────
    const now = new Date();
    const title = document.createElement('div');
    title.innerHTML = `
      <h1 class="font-serif">Budget Overview</h1>
      <p class="text-muted text-sm">${now.toLocaleString('default', { month: 'long', year: 'numeric' })} · Recurring expenses only</p>
    `;
    el.appendChild(title);

    // ── Buckets (envelope budgeting) ─────────────────────────────────────
    const bucketsSection = this.renderBuckets(categories, recurringExpenses, monthlyIncome);
    if (bucketsSection) el.appendChild(bucketsSection);

    // ── Summary stats ────────────────────────────────────────────────────
    el.appendChild(this.renderSummary(monthlyIncome, monthlyExpenses, surplus));

    // ── Category totals ──────────────────────────────────────────────────
    const catMap = new Map(categories.map((c: ExpenseCategory) => [c.id, c]));
    const byCat = new Map<string, number>();

    recurringExpenses.forEach((e) => {
      const key = e.categoryId || '__none__';
      byCat.set(key, (byCat.get(key) ?? 0) + toMonthly(e.amount, e.recurringFrequency ?? 'monthly'));
    });

    const totals: CategoryTotals[] = Array.from(byCat.entries())
      .map(([id, monthlyTotal]) => ({
        cat: id === '__none__' ? null : (catMap.get(id) ?? null),
        monthlyTotal,
      }))
      .sort((a, b) => b.monthlyTotal - a.monthlyTotal);

    // ── Main grid: donut + breakdown ─────────────────────────────────────
    const main = document.createElement('div');
    main.className = 'budget-main';

    if (totals.length > 0) {
      main.appendChild(this.renderDonut(totals, monthlyExpenses));
      main.appendChild(this.renderBreakdown(totals, monthlyIncome));
    } else {
      // No categories — just a cash-flow view
      main.style.gridTemplateColumns = '1fr';
    }

    el.appendChild(main);

    // ── Cash flow bars ───────────────────────────────────────────────────
    if (monthlyIncome > 0) {
      el.appendChild(this.renderCashFlow(monthlyIncome, monthlyExpenses, surplus));
    }

    // Mascot: warn when spending outpaces income
    if (surplus < 0) {
      setTimeout(() => showMascot('negative-cashflow'), 1000);
    }
  }

  // ── Bucket SVG generator ───────────────────────────────────────────────

  private buildBucketSVG(color: string, fillPct: number, isOver: boolean): string {
    const clamped = Math.min(fillPct, 1);
    const fillColor = isOver ? '#DC2626' : fillPct >= 0.7 ? '#B45309' : '#2D5A27';
    const id = `bclip-${Math.random().toString(36).slice(2, 9)}`;

    // Bucket polygon: wider at top (y=22), narrower at bottom (y=102)
    // Top-left=6,22  Top-right=74,22  Bot-right=80,102  Bot-left=0,102
    const bucketH = 80; // 102 - 22
    const fillY = 22 + bucketH * (1 - clamped);
    const fillH = bucketH * clamped;

    const overLabel = isOver
      ? `<text x="40" y="68" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="system-ui">OVER</text>`
      : '';

    return `<svg viewBox="0 0 80 112" xmlns="http://www.w3.org/2000/svg" fill="none" class="bucket-svg" aria-hidden="true">
      <path d="M20 22 Q40 6 60 22" stroke="${color}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <defs><clipPath id="${id}"><polygon points="6,22 74,22 80,102 0,102"/></clipPath></defs>
      <polygon points="6,22 74,22 80,102 0,102" fill="var(--color-bg-sunken)"/>
      ${fillPct > 0 ? `<rect x="0" y="${fillY.toFixed(1)}" width="80" height="${Math.max(fillH, 0.1).toFixed(1)}" fill="${fillColor}" opacity="0.75" clip-path="url(#${id})"/>` : ''}
      <polygon points="6,22 74,22 80,102 0,102" stroke="${color}" stroke-width="2" fill="none"/>
      ${overLabel}
    </svg>`;
  }

  // ── Buckets section ────────────────────────────────────────────────────

  private renderBuckets(
    categories: ExpenseCategory[],
    recurringExpenses: Expense[],
    monthlyIncome: number,
  ): HTMLElement | null {
    if (categories.length === 0) return null;

    const budgeted = categories.filter((c) => c.monthlyBudget != null && c.monthlyBudget > 0);
    const unbudgeted = categories.filter((c) => !c.monthlyBudget);

    if (budgeted.length === 0 && unbudgeted.length === 0) return null;

    // Compute monthly spend per category
    const spendByCat = new Map<string, number>();
    recurringExpenses.forEach((e) => {
      const key = e.categoryId || '__none__';
      spendByCat.set(key, (spendByCat.get(key) ?? 0) + toMonthly(e.amount, e.recurringFrequency ?? 'monthly'));
    });

    const totalBudgeted = budgeted.reduce((s, c) => s + (c.monthlyBudget ?? 0), 0);
    const unassigned = monthlyIncome - totalBudgeted;

    const section = document.createElement('div');
    section.className = 'card buckets-section';
    section.setAttribute('data-testid', 'buckets-section');

    // Header
    const header = document.createElement('div');
    header.className = 'buckets-header';

    const titleEl = document.createElement('div');
    titleEl.innerHTML = `
      <h2 class="font-serif" style="font-size:var(--text-xl)">Spending Buckets</h2>
      <p class="text-muted text-sm" style="margin-top:var(--space-1)">
        Set a monthly budget on each category to fill your pails.
      </p>
    `;
    header.appendChild(titleEl);

    if (monthlyIncome > 0 && budgeted.length > 0) {
      const assignColor = unassigned > 0 ? '--positive' : unassigned < 0 ? '--negative' : '--zero';
      const counter = document.createElement('div');
      counter.className = 'buckets-assign-counter';
      counter.setAttribute('data-testid', 'buckets-unassigned');
      counter.innerHTML = `
        <span class="buckets-assign-label">To Assign</span>
        <span class="buckets-assign-value buckets-assign-value${assignColor}" data-testid="buckets-unassigned-value">
          ${unassigned >= 0 ? '' : '-'}${fmt.format(Math.abs(unassigned))}
        </span>
      `;
      header.appendChild(counter);
    }
    section.appendChild(header);

    // Bucket grid
    if (budgeted.length > 0) {
      const grid = document.createElement('div');
      grid.className = 'buckets-grid';
      grid.setAttribute('data-testid', 'buckets-grid');

      budgeted.forEach((cat) => {
        const spent = spendByCat.get(cat.id) ?? 0;
        const budget = cat.monthlyBudget!;
        const pct = budget > 0 ? spent / budget : 0;
        const isOver = pct > 1;
        const pctClass = isOver ? 'bucket-pct--over' : pct >= 0.7 ? 'bucket-pct--warning' : 'bucket-pct--ok';

        const item = document.createElement('div');
        item.className = 'bucket-item';
        item.setAttribute('data-testid', 'bucket-item');
        item.setAttribute('data-category-id', cat.id);
        item.setAttribute('title', `${cat.name}: ${fmtCents.format(spent)} / ${fmtCents.format(budget)} · Click to edit budget`);

        item.innerHTML = `
          ${this.buildBucketSVG(cat.color, pct, isOver)}
          <div class="bucket-info">
            <div class="bucket-name">${cat.name}</div>
            <div class="bucket-amounts">${fmt.format(spent)} / ${fmt.format(budget)}</div>
            <div class="bucket-pct ${pctClass}">${Math.round(pct * 100)}%</div>
          </div>
        `;

        item.addEventListener('click', () => this.openBudgetEditor(cat));

        grid.appendChild(item);
      });

      section.appendChild(grid);
    }

    // Unbudgeted categories
    if (unbudgeted.length > 0) {
      const unbudgetedWrap = document.createElement('div');
      unbudgetedWrap.className = 'buckets-unbudgeted';
      const label = document.createElement('div');
      label.className = 'unbudgeted-label';
      label.textContent = 'No budget set';
      unbudgetedWrap.appendChild(label);

      const list = document.createElement('div');
      list.className = 'unbudgeted-list';

      unbudgeted.forEach((cat) => {
        const pill = document.createElement('button');
        pill.className = 'unbudgeted-pill';
        pill.setAttribute('data-testid', 'unbudgeted-pill');
        pill.setAttribute('data-category-id', cat.id);
        pill.innerHTML = `
          <span class="unbudgeted-pill-dot" style="background:${cat.color}"></span>
          <span>${cat.name}</span>
          <span class="unbudgeted-pill-add">+ Set budget</span>
        `;
        pill.addEventListener('click', () => this.openBudgetEditor(cat));
        list.appendChild(pill);
      });

      unbudgetedWrap.appendChild(list);
      section.appendChild(unbudgetedWrap);
    }

    return section;
  }

  // ── Budget editor modal ────────────────────────────────────────────────

  private openBudgetEditor(cat: ExpenseCategory): void {
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';
    body.innerHTML = `
      <p class="text-sm text-muted">
        Set how many dollars you want to pour into the <strong>${cat.name}</strong> bucket each month.
      </p>
      <div class="form-group">
        <label class="form-label" for="be-budget">Monthly budget</label>
        <input id="be-budget" type="number" min="0" step="0.01"
          value="${cat.monthlyBudget ?? ''}" placeholder="0.00" />
        <span class="form-hint">Leave empty to remove this bucket's cap.</span>
      </div>
    `;

    openFormModal({
      title: `Set Budget — ${cat.name}`,
      body,
      submitLabel: 'Save',
      onSubmit: async (close) => {
        const raw = parseFloat(body.querySelector<HTMLInputElement>('#be-budget')!.value);
        const updated: ExpenseCategory = { ...cat };
        if (!isNaN(raw) && raw > 0) {
          updated.monthlyBudget = raw;
        } else {
          delete updated.monthlyBudget;
        }
        await saveCategory(updated);
        close();
        this.populate();
      },
    });
  }

  // ── Summary stats row ──────────────────────────────────────────────────

  private renderSummary(income: number, expenses: number, surplus: number): HTMLElement {
    const pct = income > 0 ? Math.round(Math.abs(surplus) / income * 100) : 0;
    const div = document.createElement('div');
    div.className = 'budget-summary';
    div.setAttribute('data-testid', 'budget-summary');
    div.innerHTML = `
      <div class="budget-stat" data-testid="budget-stat-income">
        <div class="budget-stat-label">Monthly Income</div>
        <div class="budget-stat-value" data-testid="budget-income-value">${income > 0 ? fmt.format(income) : '—'}</div>
        <div class="budget-stat-sub">Active sources only</div>
      </div>
      <div class="budget-stat" data-testid="budget-stat-expenses">
        <div class="budget-stat-label">Monthly Expenses</div>
        <div class="budget-stat-value" data-testid="budget-expenses-value">${expenses > 0 ? fmt.format(expenses) : '—'}</div>
        <div class="budget-stat-sub">Recurring only</div>
      </div>
      <div class="budget-stat" data-testid="budget-stat-surplus">
        <div class="budget-stat-label">${surplus >= 0 ? 'Surplus' : 'Shortfall'}</div>
        <div class="budget-stat-value ${surplus >= 0 ? 'positive' : 'negative'}" data-testid="budget-surplus-value">
          ${income > 0 ? fmt.format(Math.abs(surplus)) : '—'}
        </div>
        <div class="budget-stat-sub">${income > 0 ? `${pct}% of income` : 'Add income to see this'}</div>
      </div>
    `;
    return div;
  }

  // ── Donut chart ────────────────────────────────────────────────────────

  private renderDonut(totals: CategoryTotals[], total: number): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card budget-chart-card';
    card.setAttribute('data-testid', 'budget-chart-card');

    const h3 = document.createElement('h3');
    h3.className = 'font-serif';
    h3.style.fontSize = 'var(--text-lg)';
    h3.textContent = 'Spending by category';
    card.appendChild(h3);

    const wrap = document.createElement('div');
    wrap.className = 'chart-canvas-wrap';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    card.appendChild(wrap);

    const colors = totals.map((t) => t.cat?.color ?? '#999999');
    const labels = totals.map((t) => t.cat?.name ?? 'Uncategorized');
    const data = totals.map((t) => t.monthlyTotal);

    new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: getComputedStyle(document.documentElement)
            .getPropertyValue('--color-bg-elevated').trim() || '#fff',
          borderWidth: 3,
          hoverOffset: 6,
        }],
      },
      options: {
        responsive: true,
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed as number;
                const pct = total > 0 ? Math.round(val / total * 100) : 0;
                return ` ${fmt.format(val)}/mo (${pct}%)`;
              },
            },
          },
        },
      },
    });

    // Legend
    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-2);margin-top:var(--space-3)';
    totals.forEach((t) => {
      const pct = total > 0 ? Math.round(t.monthlyTotal / total * 100) : 0;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-xs)';
      row.innerHTML = `
        <span style="width:10px;height:10px;border-radius:50%;background:${t.cat?.color ?? '#999'};flex-shrink:0"></span>
        <span style="flex:1;color:var(--color-text-muted)">${t.cat?.name ?? 'Uncategorized'}</span>
        <span style="font-weight:600">${pct}%</span>
      `;
      legend.appendChild(row);
    });
    card.appendChild(legend);

    return card;
  }

  // ── Category breakdown bars ────────────────────────────────────────────

  private renderBreakdown(totals: CategoryTotals[], monthlyIncome: number): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-testid', 'budget-breakdown-card');

    const h3 = document.createElement('h3');
    h3.className = 'font-serif';
    h3.style.cssText = 'font-size:var(--text-lg);margin-bottom:var(--space-5)';
    h3.textContent = 'Category breakdown';
    card.appendChild(h3);

    const table = document.createElement('div');
    table.className = 'breakdown-table';

    const maxVal = totals[0]?.monthlyTotal ?? 1;

    totals.forEach((t) => {
      const pct = Math.round(t.monthlyTotal / maxVal * 100);
      const ofIncome = monthlyIncome > 0
        ? Math.round(t.monthlyTotal / monthlyIncome * 100)
        : 0;

      const row = document.createElement('div');
      row.className = 'breakdown-row';
      row.setAttribute('data-testid', 'budget-breakdown-row');
      row.innerHTML = `
        <div class="breakdown-label">
          <span class="breakdown-dot" style="background:${t.cat?.color ?? '#999'}"></span>
          <span>${t.cat?.name ?? 'Uncategorized'}</span>
        </div>
        <div class="breakdown-bar-wrap">
          <div class="breakdown-bar-fill" style="width:${pct}%;background:${t.cat?.color ?? '#999'}"></div>
        </div>
        <div class="breakdown-amount">
          ${fmt.format(t.monthlyTotal)}<span class="text-xs text-muted" style="font-weight:400"> (${ofIncome}%)</span>
        </div>
      `;
      table.appendChild(row);
    });

    card.appendChild(table);
    return card;
  }

  // ── Cash flow visualization ────────────────────────────────────────────

  private renderCashFlow(income: number, expenses: number, surplus: number): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card cashflow-card';
    card.setAttribute('data-testid', 'budget-cashflow-card');

    const h3 = document.createElement('h3');
    h3.className = 'font-serif';
    h3.style.cssText = 'font-size:var(--text-lg);margin-bottom:var(--space-4)';
    h3.textContent = 'Monthly cash flow';
    card.appendChild(h3);

    const bars: { label: string; value: number; color: string; pct: number }[] = [
      { label: 'Income', value: income, color: 'var(--ff-green)', pct: 100 },
      { label: 'Expenses', value: expenses, color: 'var(--ff-rust)', pct: income > 0 ? Math.min(Math.round(expenses / income * 100), 100) : 0 },
      {
        label: surplus >= 0 ? 'Surplus' : 'Shortfall',
        value: Math.abs(surplus),
        color: surplus >= 0 ? 'var(--ff-gold)' : 'var(--color-danger)',
        pct: income > 0 ? Math.min(Math.round(Math.abs(surplus) / income * 100), 100) : 0,
      },
    ];

    bars.forEach(({ label, value, color, pct }) => {
      const group = document.createElement('div');
      group.className = 'cashflow-bar-group';
      group.innerHTML = `
        <div class="cashflow-bar-label">${label}</div>
        <div class="cashflow-bar-track">
          <div class="cashflow-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="cashflow-bar-value" style="color:${color}">${fmt.format(value)}</div>
      `;
      card.appendChild(group);
    });

    return card;
  }

  // ── Empty state ────────────────────────────────────────────────────────

  private renderEmpty(): HTMLElement {
    const div = document.createElement('div');
    div.innerHTML = `
      <h1 class="font-serif">Budget Overview</h1>
      <div class="budget-empty" data-testid="budget-empty">
        <div class="budget-empty-icon">📊</div>
        <h3>Nothing to show yet</h3>
        <p>Add some income sources and recurring expenses, then come back here to see your budget picture.</p>
      </div>
    `;
    return div;
  }
}
