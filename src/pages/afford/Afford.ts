import './afford.css';
import {
  getIncomeSources,
  getExpenses,
  getScenarios,
  saveScenario,
  deleteScenario as dbDeleteScenario,
  createScenario,
} from '@/db';
import { toMonthly, sourceMonthly, fmt, fmtCents, FREQUENCY_OPTIONS, FREQUENCY_LABELS } from '@/utils/finance';
import { openFormModal } from '@/components/Modal';
import type { Scenario, ScenarioItem, IncomeFrequency } from '@/types';

const SCENARIO_COLORS = [
  '#7C3AED', '#0891B2', '#D97706', '#059669',
  '#DC2626', '#2563EB', '#DB2777', '#64748B',
];

const ONE_TIME = 'one-time';

type AddingState = { scenarioId: string; type: 'income' | 'expense' } | null;

export class AffordPage {
  private scenarios: Scenario[] = [];
  private realIncome   = 0;
  private realExpenses = 0;
  private container!: HTMLElement;
  private expandedId: string | null = null;
  private adding: AddingState = null;

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'afford-page';
    this.load();
    return this.container;
  }

  private async load(): Promise<void> {
    const [sources, expenses, scenarios] = await Promise.all([
      getIncomeSources(),
      getExpenses(),
      getScenarios(),
    ]);
    this.realIncome   = sources.filter(s => s.active)
      .reduce((sum, s) => sum + sourceMonthly(s), 0);
    this.realExpenses = expenses.filter(e => e.recurring)
      .reduce((sum, e) => sum + toMonthly(e.amount, e.recurringFrequency ?? 'monthly'), 0);
    this.scenarios = scenarios;
    this.paint();
  }

  private async refresh(): Promise<void> {
    this.scenarios = await getScenarios();
    this.paint();
  }

  private paint(): void {
    this.container.innerHTML = '';

    const hdr = document.createElement('div');
    hdr.innerHTML = `
      <h1 class="font-serif">Can I Afford This?</h1>
      <p class="afford-intro">Build "scenario films" — overlays of hypothetical income and expenses — and layer them on top of your real budget to see what would happen. Your actual data is never touched. Save films for long-term planning, layer multiple at once, or remove them entirely.</p>
    `;
    this.container.appendChild(hdr);
    this.container.appendChild(this.buildRealityPanel());

    const active = this.scenarios.filter(s => s.active);
    if (active.length > 0) this.container.appendChild(this.buildProjectionPanel(active));

    this.container.appendChild(this.buildShelf());
  }

  // ── Baseline ──────────────────────────────────────────────────────

  private buildRealityPanel(): HTMLElement {
    const surplus  = this.realIncome - this.realExpenses;
    const hasData  = this.realIncome > 0;
    const el       = document.createElement('div');
    el.className   = 'reality-panel';
    el.innerHTML   = `
      <div class="reality-panel-label">Your Reality (Baseline)</div>
      <div class="reality-stats">
        <div>
          <span class="reality-stat-label">Monthly Income</span>
          <span class="reality-stat-value">${hasData ? fmt.format(this.realIncome) : '—'}</span>
        </div>
        <div>
          <span class="reality-stat-label">Monthly Expenses</span>
          <span class="reality-stat-value">${hasData ? fmt.format(this.realExpenses) : '—'}</span>
        </div>
        <div>
          <span class="reality-stat-label">${surplus >= 0 ? 'Surplus' : 'Shortfall'}</span>
          <span class="reality-stat-value"
            style="color:${surplus >= 0 ? 'var(--ff-green)' : 'var(--color-danger)'}">
            ${hasData ? fmt.format(Math.abs(surplus)) : '—'}
          </span>
        </div>
      </div>
    `;
    return el;
  }

  // ── Active overlay projection ──────────────────────────────────────

  private buildProjectionPanel(active: Scenario[]): HTMLElement {
    const eff         = this.calcTotalEffect(active);
    const adjIncome   = this.realIncome   + eff.incomeAdj;
    const adjExpenses = this.realExpenses + eff.expenseAdj;
    const adjSurplus  = adjIncome - adjExpenses;
    const delta       = adjSurplus - (this.realIncome - this.realExpenses);

    const verdict = adjSurplus >= 200 ? 'can-afford'
                  : adjSurplus >= 0   ? 'tight'
                  :                     'cannot-afford';
    const verdictLine = verdict === 'can-afford'
      ? `✅ Yes — you'd still have ${fmt.format(adjSurplus)}/mo left over`
      : verdict === 'tight'
      ? `⚠️ Tight — only ${fmt.format(adjSurplus)}/mo would remain`
      : `❌ This would put you ${fmt.format(Math.abs(adjSurplus))}/mo in the red`;

    const nameList = active
      .map(s => `<span style="color:${s.color};font-weight:700">${s.name}</span>`)
      .join(', ');

    const el = document.createElement('div');
    el.className = 'projection-panel';
    el.innerHTML = `
      <div class="projection-label">🎬 With ${active.length} active film${active.length !== 1 ? 's' : ''}: ${nameList}</div>
      <div class="projection-stats">
        <div>
          <span class="projection-stat-label">Adj. Income</span>
          <span class="projection-stat-value">${fmt.format(adjIncome)}</span>
          <span class="projection-delta">${eff.incomeAdj !== 0
            ? (eff.incomeAdj > 0 ? '+' : '') + fmt.format(eff.incomeAdj) + '/mo'
            : 'unchanged'}</span>
        </div>
        <div>
          <span class="projection-stat-label">Adj. Expenses</span>
          <span class="projection-stat-value">${fmt.format(adjExpenses)}</span>
          <span class="projection-delta">${eff.expenseAdj !== 0
            ? '+' + fmt.format(eff.expenseAdj) + '/mo'
            : 'unchanged'}</span>
        </div>
        <div>
          <span class="projection-stat-label">Adj. Surplus</span>
          <span class="projection-stat-value"
            style="color:${adjSurplus >= 0 ? 'var(--ff-green)' : 'var(--color-danger)'}">
            ${fmt.format(adjSurplus)}
          </span>
          <span class="projection-delta" style="color:${delta >= 0 ? 'var(--ff-green)' : 'var(--color-danger)'}">
            ${delta >= 0 ? '+' : ''}${fmt.format(delta)} vs. baseline
          </span>
        </div>
      </div>
      <div class="afford-verdict ${verdict}">
        <span>${verdictLine}</span>
        ${eff.oneTimeNet !== 0
          ? `<span class="afford-verdict-sub">Plus a one-time ${eff.oneTimeNet > 0 ? 'gain' : 'cost'} of ${fmt.format(Math.abs(eff.oneTimeNet))}</span>`
          : ''}
      </div>
    `;
    return el;
  }

  // ── Scenario shelf ─────────────────────────────────────────────────

  private buildShelf(): HTMLElement {
    const wrap = document.createElement('div');

    const hdr = document.createElement('div');
    hdr.className = 'shelf-header';

    const titleBlock = document.createElement('div');
    titleBlock.innerHTML = `
      <div class="shelf-title">Your Scenario Films</div>
      <div class="shelf-subtitle">${this.scenarios.length} saved · toggle to overlay · layer multiple at once</div>
    `;

    const newBtn = document.createElement('button');
    newBtn.className = 'btn btn-primary';
    newBtn.textContent = '+ New Film';
    newBtn.addEventListener('click', () => this.openNewScenarioModal());

    hdr.appendChild(titleBlock);
    hdr.appendChild(newBtn);
    wrap.appendChild(hdr);

    if (this.scenarios.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'afford-empty';
      empty.innerHTML = `
        <span class="afford-empty-icon">🎬</span>
        <h3 style="margin-bottom:var(--space-2)">No scenario films yet</h3>
        <p class="text-sm" style="max-width:400px;margin:0 auto">
          Create your first film to start exploring what-ifs. Each one is a transparent overlay on your real budget — layer as many as you like at once.
        </p>
      `;
      wrap.appendChild(empty);
      return wrap;
    }

    const cards = document.createElement('div');
    cards.className = 'scenario-cards';
    this.scenarios.forEach(s => cards.appendChild(this.buildScenarioCard(s)));
    wrap.appendChild(cards);
    return wrap;
  }

  // ── Scenario card ──────────────────────────────────────────────────

  private buildScenarioCard(s: Scenario): HTMLElement {
    const isExpanded = this.expandedId === s.id;
    const effect     = this.calcEffect(s);
    const metaNet    = s.items.length === 0
      ? 'no items yet'
      : `${s.items.length} item${s.items.length !== 1 ? 's' : ''} · ${effect.monthlyNet >= 0 ? '+' : ''}${fmt.format(effect.monthlyNet)}/mo`;

    const card = document.createElement('div');
    card.className = 'scenario-card';
    card.setAttribute('data-active',   String(s.active));
    card.setAttribute('data-expanded', String(isExpanded));
    card.style.setProperty('--scenario-color', s.color);

    // Header
    const header = document.createElement('div');
    header.className = 'scenario-card-header';

    const dot = document.createElement('span');
    dot.className = 'scenario-color-dot';
    dot.style.background = s.color;

    const info = document.createElement('div');
    info.className = 'scenario-card-info';
    info.innerHTML = `
      <span class="scenario-card-name">${s.name}</span>
      <span class="scenario-card-meta">${metaNet}${s.description ? ' · ' + s.description : ''}</span>
    `;

    // Toggle switch
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'scenario-toggle';
    toggleLabel.title = s.active ? 'Remove from projection' : 'Layer onto your budget';
    toggleLabel.innerHTML = `
      <input type="checkbox" ${s.active ? 'checked' : ''} />
      <span class="toggle-track"></span>
      <span class="toggle-thumb"></span>
    `;
    toggleLabel.addEventListener('click', e => e.stopPropagation());
    toggleLabel.querySelector<HTMLInputElement>('input')!.addEventListener('change', async (e) => {
      s.active = (e.target as HTMLInputElement).checked;
      s.updatedAt = Date.now();
      await saveScenario(s);
      await this.refresh();
    });

    const chevron = document.createElement('span');
    chevron.className = 'scenario-chevron';
    chevron.textContent = '▼';

    header.append(dot, info, toggleLabel, chevron);
    header.addEventListener('click', () => {
      this.expandedId = isExpanded ? null : s.id;
      if (!isExpanded) this.adding = null;
      this.paint();
    });
    card.appendChild(header);

    if (isExpanded) card.appendChild(this.buildScenarioBody(s));
    return card;
  }

  // ── Expanded body ──────────────────────────────────────────────────

  private buildScenarioBody(s: Scenario): HTMLElement {
    const body = document.createElement('div');
    body.className = 'scenario-body';

    // Items list
    if (s.items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'items-empty';
      empty.textContent = 'No items yet — add income or expense hypotheticals below.';
      body.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'scenario-items-list';

      s.items.forEach(item => {
        const tagKey    = !item.recurring ? 'onetime' : item.type;
        const tagLabel  = !item.recurring ? 'one-time' : item.type;
        const sign      = item.type === 'income' ? '+' : '-';
        const color     = item.type === 'income' ? 'var(--ff-green)' : 'var(--ff-rust)';
        const freqLabel = item.recurring ? FREQUENCY_LABELS[item.frequency] : 'one-time';

        const row = document.createElement('div');
        row.className = 'scenario-item-row';
        row.innerHTML = `
          <span class="item-type-tag ${tagKey}">${tagLabel}</span>
          <span class="scenario-item-desc">${item.description}</span>
          <span class="scenario-item-freq">${freqLabel}</span>
          <span class="scenario-item-amount" style="color:${color}">${sign}${fmtCents.format(item.amount)}</span>
        `;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'item-remove-btn';
        removeBtn.setAttribute('aria-label', 'Remove item');
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', async () => {
          s.items = s.items.filter(i => i.id !== item.id);
          s.updatedAt = Date.now();
          await saveScenario(s);
          await this.refresh();
        });
        row.appendChild(removeBtn);
        list.appendChild(row);
      });

      body.appendChild(list);

      // Net effect
      const eff       = this.calcEffect(s);
      const netClass  = eff.monthlyNet > 0 ? 'positive' : eff.monthlyNet < 0 ? 'negative' : 'neutral';
      const netRow    = document.createElement('div');
      netRow.className = `scenario-net-row ${netClass}`;
      netRow.innerHTML = `
        <span>Net monthly effect</span>
        <span class="scenario-net-value">
          ${eff.monthlyNet !== 0
            ? (eff.monthlyNet > 0 ? '+' : '') + fmt.format(eff.monthlyNet) + '/mo'
            : '$0/mo (neutral)'}
        </span>
      `;
      if (eff.oneTimeNet !== 0) {
        const sub = document.createElement('span');
        sub.style.cssText = 'font-size:var(--text-xs);color:var(--color-text-muted);margin-top:3px;display:block;font-weight:normal';
        sub.textContent = `+ one-time ${eff.oneTimeNet > 0 ? 'gain' : 'cost'}: ${fmt.format(Math.abs(eff.oneTimeNet))}`;
        netRow.appendChild(sub);
      }
      body.appendChild(netRow);
    }

    // Inline add-item form
    if (this.adding?.scenarioId === s.id) {
      body.appendChild(this.buildAddItemForm(s, this.adding.type));
    }

    // Footer
    body.appendChild(this.buildCardFooter(s));
    return body;
  }

  private buildCardFooter(s: Scenario): HTMLElement {
    const footer = document.createElement('div');
    footer.className = 'scenario-card-footer';

    const addBtns = document.createElement('div');
    addBtns.className = 'scenario-add-btns';

    const mkAddBtn = (type: 'income' | 'expense') => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary';
      btn.style.fontSize = 'var(--text-xs)';
      btn.style.color = type === 'income' ? 'var(--ff-green)' : 'var(--ff-rust)';
      btn.style.borderColor = type === 'income' ? 'var(--ff-green)' : 'var(--ff-rust)';
      btn.textContent = type === 'income' ? '+ Income' : '+ Expense';
      btn.addEventListener('click', () => {
        const isOpen = this.adding?.scenarioId === s.id && this.adding.type === type;
        this.adding = isOpen ? null : { scenarioId: s.id, type };
        this.paint();
      });
      return btn;
    };

    addBtns.appendChild(mkAddBtn('income'));
    addBtns.appendChild(mkAddBtn('expense'));

    const actions = document.createElement('div');
    actions.className = 'scenario-actions';

    const renameBtn = document.createElement('button');
    renameBtn.className = 'btn btn-secondary';
    renameBtn.style.fontSize = 'var(--text-xs)';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', () => this.openRenameModal(s));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger';
    deleteBtn.style.fontSize = 'var(--text-xs)';
    deleteBtn.textContent = 'Delete film';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return;
      await dbDeleteScenario(s.id);
      if (this.expandedId === s.id) this.expandedId = null;
      this.adding = null;
      await this.refresh();
    });

    actions.append(renameBtn, deleteBtn);
    footer.append(addBtns, actions);
    return footer;
  }

  // ── Add-item inline form ───────────────────────────────────────────

  private buildAddItemForm(s: Scenario, type: 'income' | 'expense'): HTMLElement {
    const accent = type === 'income' ? 'var(--ff-green)' : 'var(--ff-rust)';
    const title  = type === 'income' ? 'New Income Item' : 'New Expense Item';

    const form = document.createElement('div');
    form.className = 'add-item-form';
    form.style.borderColor = accent;

    form.innerHTML = `
      <div class="add-item-form-title" style="color:${accent}">${title}</div>
      <div class="add-item-fields">
        <div class="add-item-desc-row">
          <label>Description</label>
          <input id="aif-desc" type="text"
            placeholder="${type === 'income' ? 'e.g. Freelance side gig' : 'e.g. Car payment'}"
            style="width:100%" />
        </div>
        <div>
          <label>Amount ($)</label>
          <input id="aif-amount" type="number" min="0" step="0.01" placeholder="0.00" />
        </div>
        <div>
          <label>Frequency</label>
          <select id="aif-freq">
            <option value="${ONE_TIME}">One-time (lump sum)</option>
            ${FREQUENCY_OPTIONS.map(f => `<option value="${f.value}"${f.value === 'monthly' ? ' selected' : ''}>${f.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="add-item-actions">
        <button id="aif-cancel" class="btn btn-secondary">Cancel</button>
        <button id="aif-add" class="btn btn-primary"
          style="background:${accent};border-color:${accent}">Add</button>
      </div>
    `;

    form.querySelector('#aif-cancel')!.addEventListener('click', () => {
      this.adding = null;
      this.paint();
    });

    form.querySelector('#aif-add')!.addEventListener('click', async () => {
      const desc   = form.querySelector<HTMLInputElement>('#aif-desc')!.value.trim();
      const amount = parseFloat(form.querySelector<HTMLInputElement>('#aif-amount')!.value);
      const freq   = form.querySelector<HTMLSelectElement>('#aif-freq')!.value;

      if (!desc)             { form.querySelector<HTMLInputElement>('#aif-desc')!.focus();   return; }
      if (!amount || amount <= 0) { form.querySelector<HTMLInputElement>('#aif-amount')!.focus(); return; }

      const recurring = freq !== ONE_TIME;
      const item: ScenarioItem = {
        id: crypto.randomUUID(),
        type,
        description: desc,
        amount,
        frequency: recurring ? (freq as IncomeFrequency) : 'monthly',
        recurring,
      };

      s.items.push(item);
      s.updatedAt = Date.now();
      await saveScenario(s);
      this.adding = null;
      await this.refresh();
    });

    return form;
  }

  // ── Modals ─────────────────────────────────────────────────────────

  private openNewScenarioModal(): void {
    const nextColor = SCENARIO_COLORS[this.scenarios.length % SCENARIO_COLORS.length]!;
    let selectedColor = nextColor;

    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';
    body.innerHTML = `
      <div>
        <label style="display:block;font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);margin-bottom:var(--space-1)">Film name</label>
        <input id="ns-name" type="text" placeholder='e.g. "Buy a house" or "Side hustle income"' style="width:100%" />
      </div>
      <div>
        <label style="display:block;font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);margin-bottom:var(--space-1)">
          Description <span style="font-weight:400">(optional)</span>
        </label>
        <input id="ns-desc" type="text" placeholder="What are you exploring?" style="width:100%" />
      </div>
      <div>
        <label style="display:block;font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);margin-bottom:var(--space-2)">Color</label>
        <div id="ns-colors" style="display:flex;gap:10px;flex-wrap:wrap">
          ${SCENARIO_COLORS.map(c => `
            <div data-color="${c}" style="
              width:26px;height:26px;border-radius:50%;background:${c};cursor:pointer;
              box-shadow:${c === nextColor ? '0 0 0 2px #fff,0 0 0 4px ' + c : 'none'};
              transition:box-shadow 0.15s
            "></div>
          `).join('')}
        </div>
      </div>
    `;

    body.querySelectorAll<HTMLElement>('#ns-colors [data-color]').forEach(sw => {
      sw.addEventListener('click', () => {
        selectedColor = sw.dataset['color']!;
        body.querySelectorAll<HTMLElement>('#ns-colors [data-color]').forEach(o => {
          o.style.boxShadow = o === sw
            ? `0 0 0 2px #fff, 0 0 0 4px ${selectedColor}`
            : 'none';
        });
      });
    });

    openFormModal({
      title: 'New Scenario Film',
      body,
      submitLabel: 'Create',
      onSubmit: async (close) => {
        const name = body.querySelector<HTMLInputElement>('#ns-name')!.value.trim();
        const desc = body.querySelector<HTMLInputElement>('#ns-desc')!.value.trim();
        if (!name) { body.querySelector<HTMLInputElement>('#ns-name')!.focus(); return; }
        const scenario = createScenario(name, desc, selectedColor);
        await saveScenario(scenario);
        this.expandedId = scenario.id;
        this.adding = null;
        close();
        await this.refresh();
      },
    });

    requestAnimationFrame(() =>
      body.querySelector<HTMLInputElement>('#ns-name')?.focus(),
    );
  }

  private openRenameModal(s: Scenario): void {
    const body = document.createElement('div');
    body.innerHTML = `
      <div>
        <label style="display:block;font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--color-text-muted);margin-bottom:var(--space-1)">Film name</label>
        <input id="rn-name" type="text" value="${s.name}" style="width:100%" />
      </div>
    `;

    openFormModal({
      title: 'Rename Film',
      body,
      submitLabel: 'Save',
      onSubmit: async (close) => {
        const name = body.querySelector<HTMLInputElement>('#rn-name')!.value.trim();
        if (!name) return;
        s.name = name;
        s.updatedAt = Date.now();
        await saveScenario(s);
        close();
        await this.refresh();
      },
    });

    requestAnimationFrame(() => {
      const inp = body.querySelector<HTMLInputElement>('#rn-name');
      inp?.focus();
      inp?.select();
    });
  }

  // ── Calculations ───────────────────────────────────────────────────

  private calcEffect(s: Scenario): { monthlyNet: number; oneTimeNet: number } {
    let monthlyNet = 0;
    let oneTimeNet = 0;
    for (const item of s.items) {
      const sign = item.type === 'income' ? 1 : -1;
      if (!item.recurring) {
        oneTimeNet += sign * item.amount;
      } else {
        monthlyNet += sign * toMonthly(item.amount, item.frequency);
      }
    }
    return { monthlyNet, oneTimeNet };
  }

  private calcTotalEffect(active: Scenario[]): {
    incomeAdj:  number;
    expenseAdj: number;
    oneTimeNet: number;
  } {
    let incomeAdj  = 0;
    let expenseAdj = 0;
    let oneTimeNet = 0;
    for (const s of active) {
      for (const item of s.items) {
        if (!item.recurring) {
          oneTimeNet += item.type === 'income' ? item.amount : -item.amount;
        } else {
          const monthly = toMonthly(item.amount, item.frequency);
          if (item.type === 'income') incomeAdj  += monthly;
          else                        expenseAdj += monthly;
        }
      }
    }
    return { incomeAdj, expenseAdj, oneTimeNet };
  }
}
