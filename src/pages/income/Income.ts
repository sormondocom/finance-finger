import './income.css';
import {
  getMembers, saveMember, deleteMember, createMember,
  getIncomeSources, saveIncomeSource, deleteIncomeSource, createIncomeSource,
  getBankAccounts, saveBankAccount,
  getExpenses, saveExpense,
} from '@/db';
import { openFormModal } from '@/components/Modal';
import { navigate } from '@/app/router';
import { toMonthly, sourceMonthly, fmt, fmtCents, FREQUENCY_LABELS, FREQUENCY_OPTIONS, MONTHLY_FACTORS } from '@/utils/finance';
import { showMascot } from '@/mascot/Mascot';
import { openAddNotificationModal, buildLinkedRemindersSection } from '@/utils/notificationModal';
import type { HouseholdMember, IncomeSource, IncomeFrequency, BankAccount } from '@/types';

export class IncomePage {
  private members: HouseholdMember[] = [];
  private sources: IncomeSource[] = [];
  private bankAccounts: BankAccount[] = [];
  private container!: HTMLElement;

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'income-page';
    this.load();
    return this.container;
  }

  private async load(): Promise<void> {
    [this.members, this.sources, this.bankAccounts] = await Promise.all([getMembers(), getIncomeSources(), getBankAccounts()]);
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
        const [allAccounts, allExpenses] = await Promise.all([getBankAccounts(), getExpenses()]);
        await Promise.all([
          ...toDelete.map((s) => deleteIncomeSource(s.id)),
          ...allAccounts.filter((a) => a.memberId === m.id).map((a) => saveBankAccount({ ...a, memberId: undefined })),
          ...allExpenses.filter((e) => e.memberId === m.id).map((e) => saveExpense({ ...e, memberId: undefined })),
        ]);
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
    const amountDisplay = source.payType === 'hourly' && source.hourlyRate && source.hoursPerWeek
      ? `${fmtCents.format(source.hourlyRate)}/hr · ${source.hoursPerWeek}h/wk`
      : isUnequal
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
        <button class="icon-btn" data-action="notif" title="Add reminder">🔔</button>
        <button class="icon-btn" data-action="edit" data-testid="source-edit" title="Edit">✏️</button>
        ${!isOnce ? `<button class="icon-btn" data-action="toggle" data-testid="source-toggle" title="${source.active ? 'Deactivate' : 'Activate'}">${source.active ? '⏸' : '▶️'}</button>` : ''}
        <button class="icon-btn danger" data-action="delete" data-testid="source-delete" title="Delete">🗑️</button>
      </div>
    `;

    row.querySelector('[data-action="notif"]')!.addEventListener('click', () => {
      openAddNotificationModal({ label: source.name, defaultTrigger: 'monthly-day' });
    });
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
        <label class="form-label" for="sf-name">Source name <span class="req">*</span></label>
        <input id="sf-name" type="text" value="${existing?.name ?? ''}"
          placeholder="e.g. Day job, Freelance, Rental income" maxlength="64" />
      </div>
      <div class="form-group">
        <label class="form-label" for="sf-freq">Frequency</label>
        <select id="sf-freq">${freqOptions}</select>
      </div>
      <div id="sf-paytype-row" class="form-group" style="display:none">
        <label class="form-label">Pay type</label>
        <div style="display:flex;gap:var(--space-5)">
          <label style="display:flex;align-items:center;gap:var(--space-2);cursor:pointer;font-size:var(--text-sm)">
            <input type="radio" name="sf-paytype" value="salary" ${existing?.payType !== 'hourly' ? 'checked' : ''} />
            Salary / fixed amount
          </label>
          <label style="display:flex;align-items:center;gap:var(--space-2);cursor:pointer;font-size:var(--text-sm)">
            <input type="radio" name="sf-paytype" value="hourly" ${existing?.payType === 'hourly' ? 'checked' : ''} />
            Hourly rate
          </label>
        </div>
      </div>
      <div id="sf-salary-row" class="form-group" style="display:none">
        <label class="form-label" id="sf-amount-label" for="sf-amount">Amount <span class="req">*</span></label>
        <input id="sf-amount" type="number" min="0" step="0.01"
          value="${existing?.payType !== 'hourly' ? (existing?.amount ?? '') : ''}" placeholder="0.00" />
      </div>
      <div id="sf-hourly-row" class="form-group" style="display:none">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="sf-hourly-rate">Hourly rate <span class="req">*</span></label>
            <input id="sf-hourly-rate" type="number" min="0" step="0.01" placeholder="25.00"
              value="${existing?.hourlyRate ?? ''}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="sf-hours-week">Hrs / week <span class="req">*</span></label>
            <input id="sf-hours-week" type="number" min="1" max="168" step="0.5" placeholder="40"
              value="${existing?.hoursPerWeek ?? ''}" />
          </div>
        </div>
        <span class="form-hint" id="sf-hourly-preview"></span>
      </div>
      <div id="sf-date-row" class="form-group" style="display:none">
        <label class="form-label" for="sf-date">Date received <span class="req">*</span></label>
        <input id="sf-date" type="date" value="${existingDate}" />
      </div>
      <div id="sf-active-row" class="form-group" style="display:none;flex-direction:row;align-items:center;gap:var(--space-3)">
        <input id="sf-active" type="checkbox" style="width:auto" ${!isEdit || existing?.active ? 'checked' : ''} />
        <label for="sf-active" style="text-transform:none;letter-spacing:0;font-size:var(--text-sm)">Active (included in totals)</label>
      </div>
      <div id="sf-payday-row" class="form-group" style="display:none">
        <label class="form-label" for="sf-payday">Payday reference date</label>
        <input id="sf-payday" type="date" value="${existing?.paydayRef ? new Date(existing.paydayRef).toISOString().split('T')[0] : today}" />
        <span class="form-hint">Your next (or most recent) payday — used to show payday chips on the calendar.</span>
      </div>
      <div id="sf-error" class="form-error" style="display:none"></div>
    `;

    const amountLabel     = body.querySelector<HTMLElement>('#sf-amount-label')!;
    const freqSel         = body.querySelector<HTMLSelectElement>('#sf-freq')!;
    const paytypeRow      = body.querySelector<HTMLElement>('#sf-paytype-row')!;
    const salaryRow       = body.querySelector<HTMLElement>('#sf-salary-row')!;
    const hourlyRow       = body.querySelector<HTMLElement>('#sf-hourly-row')!;
    const hourlyRateInput = hourlyRow.querySelector<HTMLInputElement>('#sf-hourly-rate')!;
    const hoursWeekInput  = hourlyRow.querySelector<HTMLInputElement>('#sf-hours-week')!;
    const hourlyPreview   = hourlyRow.querySelector<HTMLElement>('#sf-hourly-preview')!;
    const dateRow         = body.querySelector<HTMLElement>('#sf-date-row')!;
    const activeRow       = body.querySelector<HTMLElement>('#sf-active-row')!;

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
    amount2Label.innerHTML = '2nd paycheck <span class="req">*</span>';
    const amount2Input = document.createElement('input');
    amount2Input.type = 'number';
    amount2Input.id = 'sf-amount2';
    amount2Input.min = '0';
    amount2Input.step = '0.01';
    amount2Input.placeholder = '0.00';
    if (existing?.amount2 != null) amount2Input.value = String(existing.amount2);
    amount2Row.appendChild(amount2Label);
    amount2Row.appendChild(amount2Input);

    // ── Semi-monthly schedule selector ──────────────────────────────────
    const semiScheduleRow = document.createElement('div');
    semiScheduleRow.className = 'form-group';
    semiScheduleRow.style.display = 'none';
    semiScheduleRow.innerHTML = `
      <label class="form-label" for="sf-semi-schedule">Payday schedule</label>
      <select id="sf-semi-schedule">
        <option value="1-15">1st and 15th of each month</option>
        <option value="15-end">15th and last day of each month</option>
      </select>
      <span class="form-hint">When do your two monthly paychecks land?</span>
    `;
    const semiScheduleSel = semiScheduleRow.querySelector<HTMLSelectElement>('#sf-semi-schedule')!;
    if (existing?.semimonthlySchedule) semiScheduleSel.value = existing.semimonthlySchedule;

    // Insert after salary row: unequalRow → amount2Row → semiScheduleRow
    salaryRow.insertAdjacentElement('afterend', amount2Row);
    salaryRow.insertAdjacentElement('afterend', unequalRow);
    amount2Row.insertAdjacentElement('afterend', semiScheduleRow);

    const syncUnequalUI = () => {
      const unequal = unequalCheck.checked;
      amount2Row.style.display = unequal ? '' : 'none';
      amountLabel.textContent = unequal ? '1st paycheck' : 'Amount';
    };

    // ── Bank account dropdown ────────────────────────────────────────────
    const sourceModalRef: { close?: () => void } = {};
    const accountGroup = document.createElement('div');
    accountGroup.className = 'form-group';
    const accountLabel = document.createElement('label');
    accountLabel.className = 'form-label';
    accountLabel.textContent = 'Deposit to account';
    accountGroup.appendChild(accountLabel);

    let sfAccountSel: HTMLSelectElement | null = null;
    if (this.bankAccounts.length > 0) {
      sfAccountSel = document.createElement('select');
      sfAccountSel.id = 'sf-account';
      sfAccountSel.setAttribute('data-testid', 'sf-account-select');
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '— No account —';
      sfAccountSel.appendChild(noneOpt);
      this.bankAccounts.forEach((a) => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.name;
        opt.selected = a.id === (existing?.bankAccountId ?? '');
        sfAccountSel!.appendChild(opt);
      });
      accountGroup.appendChild(sfAccountSel);
    } else {
      const hint = document.createElement('span');
      hint.className = 'form-hint';
      hint.innerHTML = 'No bank accounts set up yet. ';
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = 'Add one in Accounts →';
      link.addEventListener('click', (e) => {
        e.preventDefault();
        sourceModalRef.close?.();
        navigate('/accounts');
      });
      hint.appendChild(link);
      accountGroup.appendChild(hint);
    }

    const paydayRow = body.querySelector<HTMLElement>('#sf-payday-row')!;

    const getPayType = (): 'salary' | 'hourly' => {
      const checked = body.querySelector<HTMLInputElement>('input[name="sf-paytype"]:checked');
      return checked?.value === 'hourly' ? 'hourly' : 'salary';
    };

    const syncHourlyPreview = () => {
      const rate   = parseFloat(hourlyRateInput.value);
      const hours  = parseFloat(hoursWeekInput.value);
      const freq   = freqSel.value as IncomeFrequency;
      const factor = MONTHLY_FACTORS[freq] || 1;
      if (rate > 0 && hours > 0) {
        const perPeriod = (rate * hours * 52 / 12) / factor;
        hourlyPreview.textContent = `≈ ${fmtCents.format(perPeriod)} per pay period`;
      } else {
        hourlyPreview.textContent = '';
      }
    };

    const syncFreqUI = (freq: string) => {
      const once   = freq === 'once';
      const semi   = freq === 'semimonthly';
      const hourly = !once && getPayType() === 'hourly';
      paytypeRow.style.display      = once ? 'none' : '';
      salaryRow.style.display       = (!once && !hourly) ? '' : 'none';
      hourlyRow.style.display       = hourly ? '' : 'none';
      dateRow.style.display         = once ? '' : 'none';
      activeRow.style.display       = once ? 'none' : '';
      paydayRow.style.display       = (once || semi) ? 'none' : '';
      semiScheduleRow.style.display = semi ? '' : 'none';
      unequalRow.style.display      = (semi && !hourly) ? '' : 'none';
      if (!semi || hourly) {
        unequalCheck.checked = false;
        syncUnequalUI();
      }
      syncHourlyPreview();
    };

    unequalCheck.addEventListener('change', syncUnequalUI);
    body.querySelectorAll<HTMLInputElement>('input[name="sf-paytype"]').forEach((r) =>
      r.addEventListener('change', () => syncFreqUI(freqSel.value)),
    );
    freqSel.addEventListener('change', () => syncFreqUI(freqSel.value));
    hourlyRateInput.addEventListener('input', syncHourlyPreview);
    hoursWeekInput.addEventListener('input', syncHourlyPreview);

    // Initialize display from existing values
    syncFreqUI(initFreq);
    if (initFreq === 'semimonthly' && existing?.payType !== 'hourly' && existing?.amount2 != null) {
      unequalCheck.checked = true;
      syncUnequalUI();
    }

    // Insert account group before error div
    const errDiv = body.querySelector<HTMLElement>('#sf-error')!;
    body.insertBefore(accountGroup, errDiv);

    let flushReminders: (finalItemId: string) => Promise<void> = async () => {};
    if (isEdit && existing) {
      const { element, flush } = buildLinkedRemindersSection(existing.id, 'income', existing.name);
      body.appendChild(element);
      flushReminders = flush;
    } else {
      const nameInput = body.querySelector<HTMLInputElement>('#sf-name')!;
      const { element, flush } = buildLinkedRemindersSection('', 'income', 'Income source', {
        deferred: true,
        getLabel: () => nameInput.value.trim() || 'Income source',
      });
      body.appendChild(element);
      flushReminders = flush;
    }

    const { close: closeSourceModal } = openFormModal({
      title: isEdit ? 'Edit Income Source' : 'Add Income Source',
      body,
      submitLabel: isEdit ? 'Save changes' : 'Add source',
      onSubmit: async (close) => {
        const memberId  = body.querySelector<HTMLSelectElement>('#sf-member')!.value;
        const name      = body.querySelector<HTMLInputElement>('#sf-name')!.value.trim();
        const frequency = freqSel.value as IncomeFrequency;
        const payType   = getPayType();
        const active    = frequency === 'once' || body.querySelector<HTMLInputElement>('#sf-active')!.checked;
        const dateStr   = body.querySelector<HTMLInputElement>('#sf-date')!.value;
        const errEl     = body.querySelector<HTMLElement>('#sf-error')!;
        const isUnequal = frequency === 'semimonthly' && payType === 'salary' && unequalCheck.checked;

        errEl.style.display = 'none';
        const missing: string[] = [];
        if (!name)                            missing.push('Source name');
        if (frequency === 'once' && !dateStr) missing.push('Date received');

        let amount: number;
        if (payType === 'hourly') {
          const rate   = parseFloat(hourlyRateInput.value);
          const hrs    = parseFloat(hoursWeekInput.value);
          const factor = MONTHLY_FACTORS[frequency] || 1;
          if (isNaN(rate)  || rate  <= 0) missing.push('Hourly rate');
          if (isNaN(hrs)   || hrs   <= 0) missing.push('Hours per week');
          amount = (rate * hrs * 52 / 12) / factor;
        } else {
          amount = parseFloat(body.querySelector<HTMLInputElement>('#sf-amount')!.value);
          if (isNaN(amount) || amount < 0) missing.push('Amount');
        }

        let amount2: number | undefined;
        if (isUnequal) {
          amount2 = parseFloat(amount2Input.value);
          if (isNaN(amount2) || amount2 < 0) missing.push('2nd paycheck amount');
        }

        if (missing.length > 0) {
          errEl.textContent = missing.length === 1
            ? `${missing[0]} is required.`
            : `Fill in all required fields: ${missing.join(', ')}.`;
          errEl.style.display = 'block';
          return;
        }

        const source: IncomeSource = existing
          ? { ...existing, memberId, name, amount, frequency, active, updatedAt: Date.now() }
          : { ...createIncomeSource(memberId, name, amount, frequency), active };

        if (frequency === 'once') {
          source.date = new Date(dateStr + 'T00:00:00').getTime();
          delete source.payType;
        } else {
          delete source.date;
          source.payType = payType;
        }
        if (payType === 'hourly') {
          source.hourlyRate   = parseFloat(hourlyRateInput.value);
          source.hoursPerWeek = parseFloat(hoursWeekInput.value);
        } else {
          delete source.hourlyRate;
          delete source.hoursPerWeek;
        }

        if (frequency === 'semimonthly') {
          source.semimonthlySchedule = semiScheduleSel.value as '1-15' | '15-end';
          delete source.paydayRef;
        } else {
          delete source.semimonthlySchedule;
          const paydayStr = body.querySelector<HTMLInputElement>('#sf-payday')!.value;
          if (frequency !== 'once' && paydayStr) {
            source.paydayRef = new Date(paydayStr + 'T00:00:00').getTime();
          } else {
            delete source.paydayRef;
          }
        }

        if (isUnequal && amount2 != null) {
          source.amount2 = amount2;
        } else {
          delete source.amount2;
        }

        const bankAccountId = sfAccountSel?.value || undefined;
        if (bankAccountId) source.bankAccountId = bankAccountId;
        else delete source.bankAccountId;

        await saveIncomeSource(source);
        await flushReminders(source.id);
        close();
        await this.load();

        if (!isEdit) {
          showMascot('greeting', {}, 4000);
        }
      },
    });
    sourceModalRef.close = closeSourceModal;
  }
}
