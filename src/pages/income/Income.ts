import './income.css';
import {
  getMembers, saveMember, deleteMember, createMember,
  getIncomeSources, saveIncomeSource, deleteIncomeSource, createIncomeSource,
} from '@/db';
import { openFormModal } from '@/components/Modal';
import { toMonthly, sourceMonthly, fmt, fmtCents, FREQUENCY_LABELS, FREQUENCY_OPTIONS } from '@/utils/finance';
import { showMascot } from '@/mascot/Mascot';
import type { HouseholdMember, IncomeSource, IncomeFrequency } from '@/types';

export class IncomePage {
  private members: HouseholdMember[] = [];
  private sources: IncomeSource[] = [];
  private container!: HTMLElement;

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'income-page';
    this.load();
    return this.container;
  }

  private async load(): Promise<void> {
    [this.members, this.sources] = await Promise.all([getMembers(), getIncomeSources()]);
    this.members.sort((a, b) => {
      const kidTypes = new Set(['child', 'baby-male', 'baby-female', 'child-male', 'child-female', 'teen-male', 'teen-female']);
      const aChild = kidTypes.has(a.avatarType ?? '') ? 1 : 0;
      const bChild = kidTypes.has(b.avatarType ?? '') ? 1 : 0;
      if (aChild !== bChild) return aChild - bChild;
      return a.createdAt - b.createdAt;
    });
    this.paint();
  }

  private paint(): void {
    const monthlyTotal = this.sources
      .filter((s) => s.active)
      .reduce((sum, s) => sum + sourceMonthly(s), 0);

    this.container.innerHTML = '';

    // ── Header ──────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'income-header';
    header.innerHTML = `
      <div>
        <h1 class="font-serif">Income</h1>
        <p class="text-muted text-sm">Manage household members and income sources.</p>
      </div>
      <div class="income-total">
        <div class="income-total-label">Monthly total</div>
        <div class="income-total-value" data-testid="income-monthly-total">${this.sources.length ? fmt.format(monthlyTotal) : '—'}</div>
      </div>
    `;
    this.container.appendChild(header);

    // ── Members card ────────────────────────────────────────────────────
    this.container.appendChild(this.buildMembersCard());

    // ── Source groups ────────────────────────────────────────────────────
    if (this.members.length > 0) {
      this.container.appendChild(this.buildSourcesCard());
    }
  }

  // ── Members ────────────────────────────────────────────────────────────

  private buildMembersCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card';

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4)';
    titleRow.innerHTML = '<h2 class="font-serif" style="font-size:var(--text-xl)">Household Members</h2>';

    const list = document.createElement('div');
    list.className = 'members-list';

    this.members.forEach((m) => {
      const chip = document.createElement('div');
      chip.className = 'member-chip';
      chip.setAttribute('data-testid', 'member-chip');
      chip.setAttribute('data-member-id', m.id);
      chip.innerHTML = `
        <span>${m.name}</span>
        <button class="member-chip-remove" aria-label="Remove ${m.name}" data-id="${m.id}" data-testid="member-remove" title="Remove">✕</button>
      `;
      chip.querySelector<HTMLButtonElement>('.member-chip-remove')!.addEventListener('click', async () => {
        if (!confirm(`Remove "${m.name}"? Their income sources will also be removed.`)) return;
        const toDelete = this.sources.filter((s) => s.memberId === m.id);
        await Promise.all(toDelete.map((s) => deleteIncomeSource(s.id)));
        await deleteMember(m.id);
        await this.load();
      });
      list.appendChild(chip);
    });

    // Add member row
    const addRow = document.createElement('div');
    addRow.className = 'add-member-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Member name...';
    input.maxLength = 48;
    input.setAttribute('data-testid', 'add-member-input');
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-secondary';
    addBtn.style.whiteSpace = 'nowrap';
    addBtn.setAttribute('data-testid', 'add-member-btn');
    addBtn.textContent = '+ Add member';

    const doAdd = async () => {
      const name = input.value.trim();
      if (!name) return;
      const member = createMember(name);
      await saveMember(member);
      input.value = '';
      await this.load();
    };

    addBtn.addEventListener('click', doAdd);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
    addRow.appendChild(input);
    addRow.appendChild(addBtn);

    card.appendChild(titleRow);
    card.appendChild(list);
    card.appendChild(addRow);
    return card;
  }

  // ── Income Sources ─────────────────────────────────────────────────────

  private buildSourcesCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card';

    const titleRow = document.createElement('div');
    titleRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-6)';
    titleRow.innerHTML = '<h2 class="font-serif" style="font-size:var(--text-xl)">Income Sources</h2>';

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.setAttribute('data-testid', 'add-source-btn');
    addBtn.textContent = '+ Add source';
    addBtn.addEventListener('click', () => this.openSourceForm());
    titleRow.appendChild(addBtn);
    card.appendChild(titleRow);

    if (this.sources.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `
        <span class="empty-state-icon">💰</span>
        <h3>No income sources yet</h3>
        <p>Add your salary, wages, side income — anything that brings money in.</p>
      `;
      card.appendChild(empty);
      return card;
    }

    this.members.forEach((member) => {
      const memberSources = this.sources.filter((s) => s.memberId === member.id);
      if (memberSources.length === 0) return;

      const memberMonthly = memberSources
        .filter((s) => s.active)
        .reduce((sum, s) => sum + sourceMonthly(s), 0);

      const group = document.createElement('div');
      group.className = 'source-group';

      const groupHeader = document.createElement('div');
      groupHeader.className = 'source-group-header';
      groupHeader.innerHTML = `
        <span>${member.name}</span>
        <span style="color:var(--ff-green)">${fmt.format(memberMonthly)}<span class="text-xs text-muted">/mo</span></span>
      `;
      group.appendChild(groupHeader);

      memberSources.forEach((source) => {
        group.appendChild(this.buildSourceRow(source));
      });

      card.appendChild(group);
    });

    return card;
  }

  private buildSourceRow(source: IncomeSource): HTMLElement {
    const row = document.createElement('div');
    row.className = 'source-row';
    row.setAttribute('data-testid', 'source-row');
    row.setAttribute('data-source-id', source.id);

    const isOnce = source.frequency === 'once';
    const isUnequal = source.frequency === 'semimonthly' && source.amount2 != null;
    const monthly = sourceMonthly(source);
    const dateStr = isOnce && source.date
      ? new Date(source.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null;
    const amountDisplay = isUnequal
      ? `${fmtCents.format(source.amount)} / ${fmtCents.format(source.amount2!)}`
      : fmtCents.format(source.amount);

    row.innerHTML = `
      <div class="source-row-name">
        ${source.name}
        ${!source.active && !isOnce ? '<span class="inactive-badge">Inactive</span>' : ''}
        ${isOnce ? '<span class="inactive-badge one-time-badge">One-time</span>' : ''}
      </div>
      <div class="source-row-amount">${amountDisplay}</div>
      <div class="source-row-freq">${dateStr ?? FREQUENCY_LABELS[source.frequency]}</div>
      <div class="source-row-monthly">${isOnce ? '' : `≈ ${fmt.format(monthly)}/mo`}</div>
      <div class="source-row-actions">
        <button class="icon-btn" data-action="edit" data-testid="source-edit" title="Edit">✏️</button>
        ${!isOnce ? `<button class="icon-btn" data-action="toggle" data-testid="source-toggle" title="${source.active ? 'Deactivate' : 'Activate'}">${source.active ? '⏸' : '▶️'}</button>` : ''}
        <button class="icon-btn danger" data-action="delete" data-testid="source-delete" title="Delete">🗑️</button>
      </div>
    `;

    row.querySelector('[data-action="edit"]')!.addEventListener('click', () =>
      this.openSourceForm(source),
    );

    if (!isOnce) {
      row.querySelector('[data-action="toggle"]')!.addEventListener('click', async () => {
        await saveIncomeSource({ ...source, active: !source.active, updatedAt: Date.now() });
        await this.load();
      });
    }

    row.querySelector('[data-action="delete"]')!.addEventListener('click', async () => {
      if (!confirm(`Delete "${source.name}"?`)) return;
      await deleteIncomeSource(source.id);
      await this.load();
    });

    return row;
  }

  // ── Source form modal ──────────────────────────────────────────────────

  private openSourceForm(existing?: IncomeSource): void {
    const isEdit = !!existing;
    const body = document.createElement('div');
    body.className = 'source-form';

    const memberOptions = this.members
      .map((m) => `<option value="${m.id}" ${existing?.memberId === m.id ? 'selected' : ''}>${m.name}</option>`)
      .join('');

    const freqOptions = FREQUENCY_OPTIONS.map(
      (f) => `<option value="${f.value}" ${(existing?.frequency ?? 'monthly') === f.value ? 'selected' : ''}>${f.label}</option>`,
    ).join('');

    const initFreq = existing?.frequency ?? 'monthly';
    const today = new Date().toISOString().split('T')[0]!;
    const existingDate = existing?.date
      ? new Date(existing.date).toISOString().split('T')[0]!
      : today;

    body.innerHTML = `
      <div class="form-group">
        <label class="form-label" for="sf-member">Household member</label>
        <select id="sf-member">${memberOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label" for="sf-name">Source name</label>
        <input id="sf-name" type="text" value="${existing?.name ?? ''}"
          placeholder="e.g. Day job, Freelance, Rental income" maxlength="64" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label" id="sf-amount-label" for="sf-amount">Amount</label>
          <input id="sf-amount" type="number" min="0" step="0.01"
            value="${existing?.amount ?? ''}" placeholder="0.00" />
        </div>
        <div class="form-group">
          <label class="form-label" for="sf-freq">Frequency</label>
          <select id="sf-freq">${freqOptions}</select>
        </div>
      </div>
      <div id="sf-date-row" class="form-group" style="display:none">
        <label class="form-label" for="sf-date">Date received</label>
        <input id="sf-date" type="date" value="${existingDate}" />
      </div>
      <div id="sf-active-row" class="form-group" style="display:none;flex-direction:row;align-items:center;gap:var(--space-3)">
        <input id="sf-active" type="checkbox" style="width:auto" ${!isEdit || existing?.active ? 'checked' : ''} />
        <label for="sf-active" style="text-transform:none;letter-spacing:0;font-size:var(--text-sm)">Active (included in totals)</label>
      </div>
      <div id="sf-payday-row" class="form-group" style="display:none">
        <label class="form-label" for="sf-payday">Payday <span style="font-weight:400;opacity:0.65">(optional)</span></label>
        <input id="sf-payday" type="date" value="${existing?.paydayRef ? new Date(existing.paydayRef).toISOString().split('T')[0] : ''}" />
        <span class="form-hint">Enter any upcoming payday to show it on your calendar.</span>
      </div>
      <div id="sf-error" class="form-error" style="display:none"></div>
    `;

    const amountLabel = body.querySelector<HTMLElement>('#sf-amount-label')!;
    const freqSel = body.querySelector<HTMLSelectElement>('#sf-freq')!;
    const dateRow = body.querySelector<HTMLElement>('#sf-date-row')!;
    const activeRow = body.querySelector<HTMLElement>('#sf-active-row')!;

    // ── Unequal paychecks checkbox (semi-monthly only) ───────────────────
    const unequalRow = document.createElement('div');
    unequalRow.className = 'form-group';
    unequalRow.style.cssText = 'display:none;flex-direction:row;align-items:center;gap:var(--space-3)';
    const unequalCheck = document.createElement('input');
    unequalCheck.type = 'checkbox';
    unequalCheck.id = 'sf-unequal';
    unequalCheck.style.width = 'auto';
    const unequalLabel = document.createElement('label');
    unequalLabel.htmlFor = 'sf-unequal';
    unequalLabel.style.cssText = 'text-transform:none;letter-spacing:0;font-size:var(--text-sm)';
    unequalLabel.textContent = 'Paychecks are different amounts';
    unequalRow.appendChild(unequalCheck);
    unequalRow.appendChild(unequalLabel);

    // ── Second paycheck amount (semi-monthly + unequal only) ────────────
    const amount2Row = document.createElement('div');
    amount2Row.className = 'form-group';
    amount2Row.style.display = 'none';
    const amount2Label = document.createElement('label');
    amount2Label.className = 'form-label';
    amount2Label.htmlFor = 'sf-amount2';
    amount2Label.textContent = '2nd paycheck';
    const amount2Input = document.createElement('input');
    amount2Input.type = 'number';
    amount2Input.id = 'sf-amount2';
    amount2Input.min = '0';
    amount2Input.step = '0.01';
    amount2Input.placeholder = '0.00';
    if (existing?.amount2 != null) amount2Input.value = String(existing.amount2);
    amount2Row.appendChild(amount2Label);
    amount2Row.appendChild(amount2Input);

    // Insert: formRow → unequalRow → amount2Row → dateRow → …
    const formRow = body.querySelector<HTMLElement>('.form-row')!;
    formRow.insertAdjacentElement('afterend', amount2Row);
    formRow.insertAdjacentElement('afterend', unequalRow);

    const syncUnequalUI = () => {
      const unequal = unequalCheck.checked;
      amount2Row.style.display = unequal ? '' : 'none';
      amountLabel.textContent = unequal ? '1st paycheck' : 'Amount';
    };

    const paydayRow = body.querySelector<HTMLElement>('#sf-payday-row')!;

    const syncFreqUI = (freq: string) => {
      const once = freq === 'once';
      const semi = freq === 'semimonthly';
      dateRow.style.display = once ? '' : 'none';
      activeRow.style.display = once ? 'none' : '';
      paydayRow.style.display = once ? 'none' : '';
      unequalRow.style.display = semi ? '' : 'none';
      if (!semi) {
        unequalCheck.checked = false;
        syncUnequalUI();
      }
    };

    unequalCheck.addEventListener('change', syncUnequalUI);
    freqSel.addEventListener('change', () => syncFreqUI(freqSel.value));

    // Initialize display from existing values
    syncFreqUI(initFreq);
    if (initFreq === 'semimonthly' && existing?.amount2 != null) {
      unequalCheck.checked = true;
      syncUnequalUI();
    }

    openFormModal({
      title: isEdit ? 'Edit Income Source' : 'Add Income Source',
      body,
      submitLabel: isEdit ? 'Save changes' : 'Add source',
      onSubmit: async (close) => {
        const memberId = body.querySelector<HTMLSelectElement>('#sf-member')!.value;
        const name = body.querySelector<HTMLInputElement>('#sf-name')!.value.trim();
        const amount = parseFloat(body.querySelector<HTMLInputElement>('#sf-amount')!.value);
        const frequency = freqSel.value as IncomeFrequency;
        const active = frequency === 'once' || body.querySelector<HTMLInputElement>('#sf-active')!.checked;
        const dateStr = body.querySelector<HTMLInputElement>('#sf-date')!.value;
        const errEl = body.querySelector<HTMLElement>('#sf-error')!;
        const isUnequal = frequency === 'semimonthly' && unequalCheck.checked;

        errEl.style.display = 'none';
        if (!name) { errEl.textContent = 'Name is required.'; errEl.style.display = 'block'; return; }
        if (isNaN(amount) || amount < 0) { errEl.textContent = 'Enter a valid amount.'; errEl.style.display = 'block'; return; }
        if (frequency === 'once' && !dateStr) { errEl.textContent = 'Date is required for one-time income.'; errEl.style.display = 'block'; return; }

        let amount2: number | undefined;
        if (isUnequal) {
          amount2 = parseFloat(amount2Input.value);
          if (isNaN(amount2) || amount2 < 0) {
            errEl.textContent = '2nd paycheck amount is required.';
            errEl.style.display = 'block';
            return;
          }
        }

        const source: IncomeSource = existing
          ? { ...existing, memberId, name, amount, frequency, active, updatedAt: Date.now() }
          : { ...createIncomeSource(memberId, name, amount, frequency), active };

        if (frequency === 'once') {
          source.date = new Date(dateStr).getTime();
        } else {
          delete source.date;
        }

        const paydayStr = body.querySelector<HTMLInputElement>('#sf-payday')!.value;
        if (frequency !== 'once' && paydayStr) {
          source.paydayRef = new Date(paydayStr + 'T00:00:00').getTime();
        } else {
          delete source.paydayRef;
        }

        if (isUnequal && amount2 != null) {
          source.amount2 = amount2;
        } else {
          delete source.amount2;
        }

        await saveIncomeSource(source);
        close();
        await this.load();

        if (!isEdit) {
          showMascot('greeting', {}, 4000);
        }
      },
    });
  }
}
