import './insights.css';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { getIncomeSources, getExpenses } from '@/db';
import { amortizeSingleCard } from '@/engine/amortize';
import { toMonthly, sourceMonthly, fmt, fmtCents } from '@/utils/finance';
import type { DebtAccount, PaymentCycle } from '@/types';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

type Topic = 'debt' | 'budgeting' | 'credit' | 'savings' | 'security';

const TOPIC_LABELS: Record<Topic, string> = {
  debt:      'Debt Basics',
  budgeting: 'Budgeting',
  credit:    'Credit',
  savings:   'Saving & Investing',
  security:  'Privacy & Security',
};

export class InsightsPage {
  private topic: Topic = 'debt';
  private container!: HTMLElement;
  private monthlyIncome = 0;
  private monthlyExpenses = 0;

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'insights-page';
    this.load();
    return this.container;
  }

  private async load(): Promise<void> {
    const [sources, expenses] = await Promise.all([getIncomeSources(), getExpenses()]);
    this.monthlyIncome = sources.filter((s) => s.active)
      .reduce((sum, s) => sum + sourceMonthly(s), 0);
    this.monthlyExpenses = expenses.filter((e) => e.recurring)
      .reduce((sum, e) => sum + toMonthly(e.amount, e.recurringFrequency ?? 'monthly'), 0);
    this.paint();
  }

  private paint(): void {
    this.container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'insights-header';
    header.innerHTML = `
      <h1 class="font-serif">Education</h1>
      <blockquote class="insights-quote">
        "Figurin' out the basics never hurt nobody — and it might just change everything."
        <cite>— Buck &amp; Penny</cite>
      </blockquote>
    `;
    this.container.appendChild(header);

    // Tabs
    this.container.appendChild(this.buildTabs());

    // Content grid
    const grid = document.createElement('div');
    grid.className = 'insights-grid';
    grid.id = 'insights-grid';
    this.renderTopic(grid);
    this.container.appendChild(grid);
  }

  private buildTabs(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'insights-tabs';

    (Object.keys(TOPIC_LABELS) as Topic[]).forEach((t) => {
      const btn = document.createElement('button');
      btn.className = `insights-tab ${this.topic === t ? 'active' : ''}`;
      btn.textContent = TOPIC_LABELS[t];
      btn.addEventListener('click', () => {
        this.topic = t;
        bar.querySelectorAll('.insights-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const grid = document.getElementById('insights-grid')!;
        grid.innerHTML = '';
        this.renderTopic(grid);
      });
      bar.appendChild(btn);
    });

    return bar;
  }

  private renderTopic(grid: HTMLElement): void {
    switch (this.topic) {
      case 'debt':      this.renderDebtCards(grid);      break;
      case 'budgeting': this.renderBudgetingCards(grid);  break;
      case 'credit':    this.renderCreditCards(grid);     break;
      case 'savings':   this.renderSavingsCards(grid);    break;
      case 'security':  this.renderSecurityCards(grid);   break;
    }
  }

  // ── Debt topic ─────────────────────────────────────────────────────────

  private renderDebtCards(grid: HTMLElement): void {
    grid.appendChild(this.cardAPR());
    grid.appendChild(this.cardMinPaymentTrap());
    grid.appendChild(this.cardAvalancheVsSnowball());
  }

  private cardAPR(): HTMLElement {
    const card = this.makeCard('💳', 'What is APR?');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>APR stands for <strong>Annual Percentage Rate</strong>. It's the annual cost of borrowing money, expressed as a percentage of the balance you're carrying.</p>
        <p>A <strong>22% APR</strong> means for every $100 you carry on that card for a full year, you owe $22 extra — just for the privilege of using their money. They don't charge it all at once though. They take a slice every single billing cycle, so it creeps up on ya.</p>
        <p>The sneaky part: <strong>interest compounds</strong>. You pay interest on your balance, and if you don't pay the interest off, it gets added to your balance — so next month you're paying interest on the interest. That's how a $1,000 balance turns into a years-long ordeal.</p>
      </div>
      <div class="calc-result">
        <div class="calc-result-row">
          <span class="calc-result-label">$1,000 at 22% APR for 1 year</span>
          <span class="calc-result-value" style="color:var(--ff-rust)">≈ $220 in interest</span>
        </div>
        <div class="calc-result-row">
          <span class="calc-result-label">$5,000 at 22% APR for 1 year</span>
          <span class="calc-result-value" style="color:var(--ff-rust)">≈ $1,100 in interest</span>
        </div>
      </div>
    `;
    return card;
  }

  private cardMinPaymentTrap(): HTMLElement {
    const card = this.makeCard('⚠️', 'The Minimum Payment Trap');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Credit card minimum payments are <strong>designed to keep you in debt as long as possible</strong>. The minimum is usually 1–2% of your balance. As your balance drops, so does the minimum — which means you're paying less each month and stretching the debt out for years.</p>
        <p>It's not evil, exactly. It's just business. But now you know — and knowin' is half the fight.</p>
      </div>
    `;

    const calc = this.buildMinPaymentCalc();
    card.appendChild(calc);
    return card;
  }

  private buildMinPaymentCalc(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'calc-section';
    wrap.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
        <div>
          <label for="trap-balance">Balance ($)</label>
          <input id="trap-balance" type="number" min="0" step="100" value="5000" />
        </div>
        <div>
          <label for="trap-apr">APR (%)</label>
          <input id="trap-apr" type="number" min="0" max="99" step="0.5" value="22.99" />
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
        <div>
          <label for="trap-minpct">Min payment (%)</label>
          <input id="trap-minpct" type="number" min="1" max="20" step="0.5" value="2" />
        </div>
        <div>
          <label for="trap-extra">Extra monthly ($)</label>
          <input id="trap-extra" type="number" min="0" step="10" value="0" />
        </div>
      </div>
      <div id="trap-result" class="calc-result"></div>
    `;

    const recalc = () => {
      const balance  = parseFloat(wrap.querySelector<HTMLInputElement>('#trap-balance')!.value) || 0;
      const apr      = parseFloat(wrap.querySelector<HTMLInputElement>('#trap-apr')!.value) || 0;
      const minPct   = parseFloat(wrap.querySelector<HTMLInputElement>('#trap-minpct')!.value) || 2;
      const extra    = parseFloat(wrap.querySelector<HTMLInputElement>('#trap-extra')!.value) || 0;
      const result   = wrap.querySelector<HTMLElement>('#trap-result')!;

      if (!balance || !apr) { result.innerHTML = '<em class="text-muted">Enter a balance and APR above.</em>'; return; }

      const card: DebtAccount = {
        id: 'calc', type: 'card', name: 'Calculator', balance, apr,
        creditLimit: balance * 2, minimumPaymentType: 'percentage',
        minimumPaymentValue: minPct, paymentCycle: 'monthly' as PaymentCycle,
        createdAt: 0, updatedAt: 0,
      };

      const minResult   = amortizeSingleCard(card, 0);
      const extraResult = extra > 0 ? amortizeSingleCard(card, extra) : null;

      const yrs  = (minResult.periodsToPayoff / 12).toFixed(1);
      const saved = extraResult ? minResult.totalInterest - extraResult.totalInterest : 0;
      const mosSaved = extraResult ? minResult.periodsToPayoff - extraResult.periodsToPayoff : 0;

      result.className = 'calc-result';
      result.innerHTML = `
        <div class="calc-result-row">
          <span class="calc-result-label">Payoff time (min only)</span>
          <span class="calc-result-value" style="color:var(--ff-rust)">${yrs} years</span>
        </div>
        <div class="calc-result-row">
          <span class="calc-result-label">Total interest (min only)</span>
          <span class="calc-result-value" style="color:var(--ff-rust)">${fmt.format(minResult.totalInterest)}</span>
        </div>
        ${extraResult ? `
        <div class="calc-result-row" style="border-top:1px solid var(--color-border);padding-top:var(--space-2);margin-top:var(--space-1)">
          <span class="calc-result-label">With +${fmt.format(extra)}/mo: payoff</span>
          <span class="calc-result-value" style="color:var(--ff-green)">${(extraResult.periodsToPayoff / 12).toFixed(1)} years</span>
        </div>
        <div class="calc-result-row">
          <span class="calc-result-label">Interest saved</span>
          <span class="calc-result-value" style="color:var(--ff-green)">${fmt.format(saved)} · ${mosSaved} months sooner</span>
        </div>` : ''}
      `;
    };

    wrap.querySelectorAll('input').forEach((i) => i.addEventListener('input', recalc));
    recalc();
    return wrap;
  }

  private cardAvalancheVsSnowball(): HTMLElement {
    const card = this.makeCard('🧊', 'Avalanche vs. Snowball');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Two popular strategies for knockin' out multiple debts:</p>
        <p><strong>Avalanche:</strong> Pay minimums on everything, then throw every extra dollar at the <strong>highest-APR card first</strong>. You pay the least interest overall. Mathematically optimal.</p>
        <p><strong>Snowball:</strong> Pay minimums on everything, then attack the <strong>smallest balance first</strong>. You get a quick win, then roll that payment into the next card. Builds momentum.</p>
        <p>The math says avalanche wins. But the best strategy is the one you'll <strong>actually stick to</strong>. If you need that early win to stay motivated, snowball is right for you. Head to the <em>Debt & Cards</em> page to run your numbers on both.</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
        <div class="calc-result good" style="border-left-color:var(--ff-navy)">
          <div style="font-weight:700;color:var(--ff-navy);margin-bottom:var(--space-1)">🧊 Avalanche</div>
          <div class="text-sm text-muted">Best for: saving money</div>
          <div class="text-sm text-muted">Requires: patience</div>
        </div>
        <div class="calc-result good" style="border-left-color:var(--ff-green)">
          <div style="font-weight:700;color:var(--ff-green);margin-bottom:var(--space-1)">⛄ Snowball</div>
          <div class="text-sm text-muted">Best for: motivation</div>
          <div class="text-sm text-muted">Requires: quick wins</div>
        </div>
      </div>
    `;
    return card;
  }

  // ── Budgeting topic ────────────────────────────────────────────────────

  private renderBudgetingCards(grid: HTMLElement): void {
    grid.appendChild(this.card5030());
    grid.appendChild(this.cardEmergencyFund());
    grid.appendChild(this.cardZeroBased());
  }

  private card5030(): HTMLElement {
    const card = this.makeCard('📊', 'The 50/30/20 Rule');
    const income = this.monthlyIncome;
    const expenses = this.monthlyExpenses;
    const surplus = income - expenses;
    const hasData = income > 0;

    const needsPct  = hasData ? Math.round(expenses / income * 100) : 50;
    const savingsPct = hasData ? Math.round(Math.max(0, surplus) / income * 100) : 20;
    const wantsPct  = hasData ? Math.max(0, 100 - needsPct - savingsPct) : 30;

    card.innerHTML += `
      <div class="edu-card-voice">
        <p>A popular starting guideline: spend <strong>50% on needs</strong> (rent, food, utilities, transport), <strong>30% on wants</strong> (dining out, entertainment, subscriptions), and put <strong>20% toward savings and debt repayment</strong>.</p>
        <p>It's not gospel, and life doesn't always fit neatly into thirds. But it's a decent compass when you're figurin' out where your money oughta go.</p>
        ${hasData ? `<p>Your current split (recurring expenses vs. income):</p>` : '<p>Add income and recurring expenses to see your split.</p>'}
      </div>
      ${hasData ? `
      <div class="rule-bar">
        <div class="rule-bar-segment" style="width:${needsPct}%;background:var(--ff-rust)">${needsPct > 8 ? needsPct + '% needs' : ''}</div>
        <div class="rule-bar-segment" style="width:${wantsPct}%;background:var(--ff-gold)">${wantsPct > 8 ? wantsPct + '% wants' : ''}</div>
        <div class="rule-bar-segment" style="width:${savingsPct}%;background:var(--ff-green)">${savingsPct > 8 ? savingsPct + '% surplus' : ''}</div>
      </div>
      <div class="rule-legend">
        <div class="rule-legend-item"><span class="rule-legend-dot" style="background:var(--ff-rust)"></span><span>Expenses ${needsPct}% (guideline: 50%)</span></div>
        <div class="rule-legend-item"><span class="rule-legend-dot" style="background:var(--ff-gold)"></span><span>Wants ${wantsPct}%</span></div>
        <div class="rule-legend-item"><span class="rule-legend-dot" style="background:var(--ff-green)"></span><span>Surplus ${savingsPct}% (guideline: 20%)</span></div>
      </div>` : ''}
    `;
    return card;
  }

  private cardEmergencyFund(): HTMLElement {
    const card = this.makeCard('🏦', 'Emergency Fund');
    const monthlyExpenses = this.monthlyExpenses;

    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Life's got a sense of humor. Car breaks down, water heater quits, somebody loses a job — these things cost money on short notice. An <strong>emergency fund</strong> is 3–6 months of living expenses, kept somewhere liquid (savings account, money market) — not investments, not a CD.</p>
        <p>It's not exciting. But havin' one means you don't have to put the emergency on a credit card and pay interest on top of the stress.</p>
      </div>
      <div class="calc-section">
        <div>
          <label for="ef-months">Months to cover</label>
          <select id="ef-months">
            <option value="3">3 months (minimum)</option>
            <option value="4">4 months</option>
            <option value="5">5 months</option>
            <option value="6" selected>6 months (recommended)</option>
          </select>
        </div>
        <div>
          <label for="ef-expenses">Monthly expenses ($)</label>
          <input id="ef-expenses" type="number" min="0" step="100"
            value="${monthlyExpenses > 0 ? Math.round(monthlyExpenses) : ''}"
            placeholder="${monthlyExpenses > 0 ? '' : 'Enter your monthly expenses'}" />
        </div>
        <div id="ef-result" class="calc-result good"></div>
      </div>
    `;

    const recalc = () => {
      const months   = parseInt(card.querySelector<HTMLSelectElement>('#ef-months')!.value);
      const expenses = parseFloat(card.querySelector<HTMLInputElement>('#ef-expenses')!.value) || 0;
      const result   = card.querySelector<HTMLElement>('#ef-result')!;
      if (!expenses) { result.innerHTML = '<em class="text-muted">Enter your monthly expenses.</em>'; return; }
      const target = expenses * months;
      result.innerHTML = `
        <div class="calc-result-row">
          <span class="calc-result-label">Target emergency fund</span>
          <span class="calc-result-value" style="color:var(--ff-green)">${fmt.format(target)}</span>
        </div>
        <div class="calc-result-row">
          <span class="calc-result-label">Saving $200/month, you'd get there in</span>
          <span class="calc-result-value">${Math.ceil(target / 200)} months</span>
        </div>
      `;
    };

    card.querySelector('#ef-months')!.addEventListener('change', recalc);
    card.querySelector('#ef-expenses')!.addEventListener('input', recalc);
    recalc();
    return card;
  }

  private cardZeroBased(): HTMLElement {
    const card = this.makeCard('0️⃣', 'Zero-Based Budgeting');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>The idea is simple: give <strong>every dollar a job</strong> before the month starts. Income minus all your planned expenses, savings, and debt payments should equal zero — not because you spent everything, but because everything is accounted for.</p>
        <p>The "zero" doesn't mean broke. It means intentional. When something unexpected comes up, you move money from one category to another. The budget bends; it doesn't break.</p>
        <p>A lot of folks find this approach more freeing than restrictive — because when you've planned for everything, you can spend guilt-free on what you've budgeted for wants.</p>
      </div>
    `;
    return card;
  }

  // ── Credit topic ───────────────────────────────────────────────────────

  private renderCreditCards(grid: HTMLElement): void {
    grid.appendChild(this.cardUtilization());
    grid.appendChild(this.cardCreditScore());
    grid.appendChild(this.cardBalanceTransfer());
  }

  private cardUtilization(): HTMLElement {
    const card = this.makeCard('📈', 'Credit Utilization');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Your credit utilization ratio is how much of your available credit you're currently using. It's one of the most important factors in your credit score — accounting for roughly <strong>30% of your FICO score</strong>.</p>
        <p>The rule of thumb: <strong>keep utilization below 30%</strong> on each card and in total. Below <strong>10% is even better</strong>. On a $5,000 limit, that means keeping the balance under $500 if you want the best scoring impact.</p>
        <p>Paying your balance early in the billing cycle — not just by the due date — can lower the balance that gets reported to the credit bureaus.</p>
      </div>
      <div class="calc-section">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
          <div>
            <label for="util-balance">Current balance ($)</label>
            <input id="util-balance" type="number" min="0" step="100" value="2500" />
          </div>
          <div>
            <label for="util-limit">Credit limit ($)</label>
            <input id="util-limit" type="number" min="1" step="100" value="5000" />
          </div>
        </div>
        <div id="util-result" class="calc-result"></div>
      </div>
    `;

    const recalc = () => {
      const balance = parseFloat(card.querySelector<HTMLInputElement>('#util-balance')!.value) || 0;
      const limit   = parseFloat(card.querySelector<HTMLInputElement>('#util-limit')!.value) || 1;
      const util    = balance / limit * 100;
      const result  = card.querySelector<HTMLElement>('#util-result')!;
      const rating  = util <= 10 ? { label: 'Excellent', color: 'var(--ff-green)' }
                    : util <= 30 ? { label: 'Good', color: 'var(--ff-gold-dark)' }
                    : util <= 50 ? { label: 'Fair', color: 'var(--ff-rust)' }
                    : { label: 'High — pay this down', color: 'var(--color-danger)' };
      result.className = util <= 30 ? 'calc-result good' : 'calc-result';
      result.innerHTML = `
        <div class="calc-result-row">
          <span class="calc-result-label">Utilization</span>
          <span class="calc-result-value" style="color:${rating.color}">${util.toFixed(1)}% — ${rating.label}</span>
        </div>
        <div class="calc-result-row">
          <span class="calc-result-label">To reach 30%</span>
          <span class="calc-result-value">${fmt.format(Math.max(0, balance - limit * 0.3))} reduction needed</span>
        </div>
        <div class="calc-result-row">
          <span class="calc-result-label">To reach 10% (optimal)</span>
          <span class="calc-result-value">${fmt.format(Math.max(0, balance - limit * 0.1))} reduction needed</span>
        </div>
      `;
    };

    card.querySelectorAll('input').forEach((i) => i.addEventListener('input', recalc));
    recalc();
    return card;
  }

  private cardCreditScore(): HTMLElement {
    const card = this.makeCard('🔢', 'What Makes a Credit Score?');
    const factors = [
      { label: 'Payment history',     pct: 35, color: 'var(--ff-navy)',   desc: 'Pay on time, every time. This is the biggest factor.' },
      { label: 'Credit utilization',  pct: 30, color: 'var(--ff-rust)',   desc: 'Keep balances below 30% of your limit.' },
      { label: 'Length of history',   pct: 15, color: 'var(--ff-gold)',   desc: 'Older accounts help. Don\'t close your oldest card.' },
      { label: 'Credit mix',          pct: 10, color: 'var(--ff-green)',  desc: 'A mix of credit cards, loans, etc. shows you can handle different types.' },
      { label: 'New credit inquiries', pct: 10, color: 'var(--ff-sage)',  desc: 'Hard inquiries (loan/card applications) dip your score temporarily.' },
    ];
    let inner = '<div class="edu-card-voice">';
    inner += '<p>FICO scores (the most common type) are calculated from five factors. Here\'s what moves the needle most:</p></div>';
    inner += '<div style="display:flex;flex-direction:column;gap:var(--space-3)">';
    factors.forEach((f) => {
      inner += `
        <div>
          <div style="display:flex;justify-content:space-between;margin-bottom:var(--space-1)">
            <span class="text-sm font-bold">${f.label}</span>
            <span class="text-sm font-bold" style="color:${f.color}">${f.pct}%</span>
          </div>
          <div style="height:8px;background:var(--color-bg-sunken);border-radius:var(--radius-full);overflow:hidden;margin-bottom:4px">
            <div style="width:${f.pct}%;height:100%;background:${f.color};border-radius:var(--radius-full)"></div>
          </div>
          <div class="text-xs text-muted">${f.desc}</div>
        </div>
      `;
    });
    inner += '</div>';
    card.innerHTML += inner;
    return card;
  }

  private cardBalanceTransfer(): HTMLElement {
    const card = this.makeCard('🔄', 'Balance Transfers');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>A balance transfer means moving debt from a high-APR card to one offering a <strong>0% introductory APR</strong> for a limited time (usually 12–21 months). Done right, it can save you hundreds or thousands in interest.</p>
        <p>The fine print to watch: <strong>transfer fees</strong> (typically 3–5% of the balance), the <strong>go-to rate</strong> after the promo ends (often high), and whether you'll realistically <strong>pay it off</strong> before the clock runs out.</p>
        <p>The trap: people transfer, feel relief, and then keep spending on the old card. Then they have two problems instead of one. Transfer with a payoff plan already in hand.</p>
      </div>
    `;
    return card;
  }

  // ── Savings topic ──────────────────────────────────────────────────────

  private renderSavingsCards(grid: HTMLElement): void {
    grid.appendChild(this.cardCompoundInterest());
    grid.appendChild(this.cardSavingsRate());
    grid.appendChild(this.cardOpportunityCost());
  }

  private cardCompoundInterest(): HTMLElement {
    const card = this.makeCard('📈', 'Compound Interest — The Double Edge');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Compound interest is often called <strong>the eighth wonder of the world</strong>. When you're investing, it works for you — your earnings earn earnings. When you're in debt, it works against you — your interest charges earn interest charges.</p>
        <p>The chart below shows $5,000 left to grow (or fester) over time. Same amount, opposite directions.</p>
      </div>
      <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap">
        <label class="text-xs font-bold text-muted" style="text-transform:uppercase;letter-spacing:.05em">Years:</label>
        <input id="compound-years" type="range" min="1" max="30" value="10" style="flex:1;min-width:100px" />
        <span id="compound-years-label" class="text-sm font-bold">10</span>
      </div>
      <div class="compound-chart-wrap">
        <canvas id="compound-canvas"></canvas>
      </div>
      <div id="compound-stats" style="display:flex;gap:var(--space-4);flex-wrap:wrap"></div>
    `;

    requestAnimationFrame(() => {
      const slider = card.querySelector<HTMLInputElement>('#compound-years')!;
      const label  = card.querySelector<HTMLElement>('#compound-years-label')!;
      let chart: Chart | null = null;

      const buildChart = (years: number) => {
        const canvas = card.querySelector<HTMLCanvasElement>('#compound-canvas')!;
        const stats  = card.querySelector<HTMLElement>('#compound-stats')!;
        chart?.destroy();

        const debtAPR = 0.22;
        const invRate = 0.08;
        const principal = 5000;

        const debtData: number[] = [];
        const invData: number[] = [];
        const labels: string[] = [];

        for (let y = 0; y <= years; y++) {
          labels.push(`Yr ${y}`);
          debtData.push(principal * Math.pow(1 + debtAPR, y));
          invData.push(principal * Math.pow(1 + invRate, y));
        }

        const finalDebt = debtData[debtData.length - 1] ?? 0;
        const finalInv  = invData[invData.length - 1] ?? 0;

        stats.innerHTML = `
          <div class="calc-result" style="flex:1;border-left-color:var(--ff-rust)">
            <div class="calc-result-row">
              <span class="calc-result-label">$5k debt at 22% APR (unpaid)</span>
              <span class="calc-result-value" style="color:var(--ff-rust)">${fmt.format(finalDebt)}</span>
            </div>
          </div>
          <div class="calc-result good" style="flex:1">
            <div class="calc-result-row">
              <span class="calc-result-label">$5k invested at 8% avg return</span>
              <span class="calc-result-value" style="color:var(--ff-green)">${fmt.format(finalInv)}</span>
            </div>
          </div>
        `;

        chart = new Chart(canvas, {
          type: 'line',
          data: {
            labels,
            datasets: [
              { label: 'Debt (22% APR)', data: debtData, borderColor: 'var(--ff-rust)',  backgroundColor: 'rgba(180,83,9,0.08)',  fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
              { label: 'Investment (8%)', data: invData, borderColor: 'var(--ff-green)', backgroundColor: 'rgba(45,90,39,0.08)',  fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
              tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmt.format(ctx.parsed.y as number)}` } },
            },
            scales: {
              x: { grid: { display: false }, ticks: { font: { size: 10 } } },
              y: { ticks: { callback: (v) => fmt.format(v as number), font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
            },
          },
        });
      };

      slider.addEventListener('input', () => {
        const y = parseInt(slider.value);
        label.textContent = String(y);
        buildChart(y);
      });

      buildChart(10);
    });

    return card;
  }

  private cardSavingsRate(): HTMLElement {
    const card = this.makeCard('💰', 'Why Your Savings Rate Matters More Than Returns');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Most people obsess over investment returns. But here's the thing: <strong>your savings rate is the biggest lever you control</strong>. A 1% improvement in returns on a small portfolio barely moves the needle. Saving an extra $100/month moves it a lot.</p>
        <p>The math is unforgiving early in life when your portfolio is small. The math becomes generous later when compounding has had years to work. The goal is to get to "later" with as much invested as possible.</p>
        <p>Even automating <strong>1% of your income</strong> — then raising it by 1% each year — compounds into something significant without ever feeling like a sacrifice.</p>
      </div>
    `;
    return card;
  }

  private cardOpportunityCost(): HTMLElement {
    const card = this.makeCard('⚖️', 'The Opportunity Cost of Debt');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Every dollar you pay in credit card interest is a dollar that <strong>can't grow for you</strong> in savings or investments. If your card charges 22% APR and the market returns 8% historically, you're losing 14% every year you carry that balance instead of paying it off.</p>
        <p>That's why financial folks say: <strong>paying off high-interest debt is the best guaranteed return available to you</strong>. There's no investment that reliably beats a 22% savings rate with zero risk.</p>
        <p>Low-interest debt (under 4–5%) is a different conversation — you might genuinely come out ahead investing rather than paying it off aggressively. But credit card debt at current rates? Pay that down first.</p>
      </div>
    `;
    return card;
  }

  // ── Security topic ─────────────────────────────────────────────────────

  private renderSecurityCards(grid: HTMLElement): void {
    grid.appendChild(this.cardKeyPairBasics());
    grid.appendChild(this.cardHowFFUsesKeys());
    grid.appendChild(this.cardPassphrase());
    grid.appendChild(this.cardSecurityInTheWild());
  }

  private cardKeyPairBasics(): HTMLElement {
    const card = this.makeCard('🔑', 'Public & Private Keys — The Lock and the Key');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Imagine a padlock you can hand to anyone. They can lock a box with it, but only <em>you</em> hold the key that opens it. That's the core idea behind <strong>asymmetric cryptography</strong> — and it's one of the most powerful ideas in computer security.</p>
        <p>You have two mathematically linked pieces:</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);margin-bottom:var(--space-4)">
        <div class="calc-result good" style="border-left-color:var(--ff-navy)">
          <div style="font-weight:700;color:var(--ff-navy);margin-bottom:var(--space-2)">🔓 Public Key</div>
          <ul style="margin:0;padding-left:var(--space-4);font-size:var(--text-sm);line-height:1.7">
            <li>Safe to share with anyone</li>
            <li>Encrypts data or verifies a signature</li>
            <li>Cannot decrypt what it encrypted</li>
          </ul>
        </div>
        <div class="calc-result" style="border-left-color:var(--ff-rust)">
          <div style="font-weight:700;color:var(--ff-rust);margin-bottom:var(--space-2)">🔒 Private Key</div>
          <ul style="margin:0;padding-left:var(--space-4);font-size:var(--text-sm);line-height:1.7">
            <li>Never leaves your possession</li>
            <li>Decrypts data or creates a signature</li>
            <li>The only thing that can undo the lock</li>
          </ul>
        </div>
      </div>
      <div class="edu-card-voice">
        <p>The magic: even if someone intercepts everything encrypted with your public key, they cannot read it. The math connecting the two keys is a one-way function — trivial in one direction, computationally impossible to reverse without the private key.</p>
        <p>This asymmetry is what lets you prove identity, share secrets, and communicate privately without ever meeting in person to agree on a shared password first.</p>
      </div>
    `;
    return card;
  }

  private cardHowFFUsesKeys(): HTMLElement {
    const card = this.makeCard('🐷', 'How Financial Finger Uses Your Keys');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>When you set up Financial Finger, it generates an <strong>OpenPGP key pair</strong> on your device and never transmits either key anywhere. Here's exactly what happens each time:</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);margin-bottom:var(--space-4)">
        <div style="display:flex;gap:var(--space-3);align-items:flex-start;padding:var(--space-3);background:var(--color-bg-sunken);border-radius:var(--radius-md)">
          <span style="font-size:1.4rem;flex-shrink:0">1️⃣</span>
          <div class="text-sm"><strong>Setup:</strong> A random <em>vault key</em> is generated — a short, powerful AES symmetric key that encrypts all of your financial records. That vault key is then encrypted with your public key and stored in extension storage.</div>
        </div>
        <div style="display:flex;gap:var(--space-3);align-items:flex-start;padding:var(--space-3);background:var(--color-bg-sunken);border-radius:var(--radius-md)">
          <span style="font-size:1.4rem;flex-shrink:0">2️⃣</span>
          <div class="text-sm"><strong>Your private key</strong> is encrypted with your passphrase and stored locally. It never exists in plain form on disk — only in memory, briefly, while the vault is unlocked.</div>
        </div>
        <div style="display:flex;gap:var(--space-3);align-items:flex-start;padding:var(--space-3);background:var(--color-bg-sunken);border-radius:var(--radius-md)">
          <span style="font-size:1.4rem;flex-shrink:0">3️⃣</span>
          <div class="text-sm"><strong>Unlock:</strong> You enter your passphrase → it decrypts your private key → your private key decrypts the vault key → the vault key decrypts your financial records into memory for the session.</div>
        </div>
        <div style="display:flex;gap:var(--space-3);align-items:flex-start;padding:var(--space-3);background:var(--color-bg-sunken);border-radius:var(--radius-md)">
          <span style="font-size:1.4rem;flex-shrink:0">4️⃣</span>
          <div class="text-sm"><strong>Lock or close:</strong> The vault key is wiped from memory. Your data goes back to being encrypted blobs that are useless without the private key and passphrase.</div>
        </div>
      </div>
      <div class="edu-card-voice">
        <p>The result: <strong>no service, no server, no cloud account can read your data</strong> — because they never have your private key or passphrase. Even if someone grabbed every byte stored by this extension, they'd have an encrypted mess with no way in.</p>
        <p>That's the whole point. Your financial life stays yours.</p>
      </div>
    `;
    return card;
  }

  private cardPassphrase(): HTMLElement {
    const card = this.makeCard('🛡️', 'Passphrases — The Key to Your Key');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>A <strong>passphrase</strong> is the human-memorable secret that protects your private key when it's stored at rest. Think of it as the combination on the safe that holds the master key to your vault.</p>
        <p>Why a <em>passphrase</em> and not a <em>password</em>? Length is the biggest factor in how hard something is to crack. Four random words strung together — <em>"correct horse battery staple"</em> — give you more entropy than a short jumble of symbols most people can barely remember.</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);margin-bottom:var(--space-4)">
        <div class="calc-result" style="border-left-color:var(--color-danger)">
          <div style="font-weight:700;color:var(--color-danger);margin-bottom:var(--space-2)">❌ Weak approach</div>
          <div class="text-sm text-muted" style="font-family:monospace">P@ssw0rd1!</div>
          <div class="text-sm text-muted" style="margin-top:var(--space-1)">Short, predictable substitutions. Cracked in seconds by modern tools.</div>
        </div>
        <div class="calc-result good">
          <div style="font-weight:700;color:var(--ff-green);margin-bottom:var(--space-2)">✓ Strong approach</div>
          <div class="text-sm text-muted" style="font-family:monospace">purple-anvil-river-66</div>
          <div class="text-sm text-muted" style="margin-top:var(--space-1)">Long, random words with a number. Orders of magnitude harder to crack.</div>
        </div>
      </div>
      <div class="edu-card-voice">
        <p>Under the hood, your passphrase isn't used directly — it's run through a <strong>key derivation function</strong> (KDF) like Argon2 or bcrypt, which is deliberately slow and memory-intensive to compute. Even if an attacker gets your encrypted private key file, each guess costs them real time and hardware. A strong passphrase makes that cost astronomical.</p>
        <p><strong>The non-negotiable:</strong> write your passphrase down and keep it somewhere physically secure, separate from your device. Forgetting it means your private key — and everything it protects — is permanently inaccessible. There is no "reset password" for a key pair.</p>
      </div>
    `;
    return card;
  }

  private cardSecurityInTheWild(): HTMLElement {
    const card = this.makeCard('🌐', 'The Same Ideas, Everywhere You Look');
    card.innerHTML += `
      <div class="edu-card-voice">
        <p>Once you understand public/private keys and passphrases, you start recognizing them everywhere in the technology you already use:</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-3);margin-bottom:var(--space-4)">
        <div style="padding:var(--space-3);background:var(--color-bg-sunken);border-radius:var(--radius-md)">
          <div style="font-weight:700;margin-bottom:var(--space-1)">🔐 HTTPS / TLS (every website with a padlock)</div>
          <div class="text-sm text-muted">When your browser connects to a secure site, the server presents a certificate containing its public key. Your browser uses it to negotiate a shared session key — all without ever transmitting that session key in the open. The padlock means your connection is encrypted end-to-end.</div>
        </div>
        <div style="padding:var(--space-3);background:var(--color-bg-sunken);border-radius:var(--radius-md)">
          <div style="font-weight:700;margin-bottom:var(--space-1)">💻 SSH Keys (connecting to servers)</div>
          <div class="text-sm text-muted">Developers and sysadmins authenticate to remote servers using key pairs instead of passwords. You put your public key on the server; it challenges you to prove you hold the matching private key. No password ever travels over the network.</div>
        </div>
        <div style="padding:var(--space-3);background:var(--color-bg-sunken);border-radius:var(--radius-md)">
          <div style="font-weight:700;margin-bottom:var(--space-1)">✉️ PGP / GPG Email Encryption</div>
          <div class="text-sm text-muted">The same OpenPGP standard this app uses. You publish your public key so others can send you encrypted email that only you can read. You sign outgoing messages with your private key so recipients can verify the message genuinely came from you.</div>
        </div>
        <div style="padding:var(--space-3);background:var(--color-bg-sunken);border-radius:var(--radius-md)">
          <div style="font-weight:700;margin-bottom:var(--space-1)">💬 End-to-End Encrypted Messaging (Signal, WhatsApp)</div>
          <div class="text-sm text-muted">Each device generates a key pair. Messages are encrypted with the recipient's public key before leaving your phone. Even the app's own servers see only ciphertext. The company literally cannot read your messages — the keys are only on the devices.</div>
        </div>
        <div style="padding:var(--space-3);background:var(--color-bg-sunken);border-radius:var(--radius-md)">
          <div style="font-weight:700;margin-bottom:var(--space-1)">🔏 Code Signing & Software Updates</div>
          <div class="text-sm text-muted">When your OS installs an update, it verifies the package was signed with the software vendor's private key. That signature proves the code wasn't tampered with in transit. Your device already knew the vendor's public key and trusts it to verify the signature.</div>
        </div>
      </div>
      <div class="edu-card-voice">
        <p>The pattern is always the same: <strong>public key locks or verifies, private key unlocks or signs, passphrase protects the private key</strong>. Once you internalize that triangle, a huge swath of how the modern internet works — and why certain attacks succeed while others don't — snaps into focus.</p>
        <p>You're not just protecting your budget. You're practicing the same discipline that secures banks, hospitals, and governments.</p>
      </div>
    `;
    return card;
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private makeCard(icon: string, title: string): HTMLElement {
    const card = document.createElement('div');
    card.className = 'edu-card';
    card.innerHTML = `
      <div class="edu-card-icon">${icon}</div>
      <h3>${title}</h3>
    `;
    return card;
  }
}
