import { saveCustomNotification, deleteCustomNotification, createCustomNotification } from '@/db';
import { openFormModal } from '@/components/Modal';
import type { CustomNotification, NotificationTriggerType, Expense } from '@/types';

export function buildNotificationsSection(
  initialNotifications: CustomNotification[],
  expenses: Expense[],
  showToast: (msg: string) => void,
): HTMLElement {
  let notifications = initialNotifications;

  const wrap = document.createElement('div');
  wrap.className = 'settings-group';

  const titleRow = document.createElement('div');
  titleRow.className = 'settings-group-title-row';
  const titleText = document.createElement('span');
  titleText.textContent = 'Reminders';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-secondary';
  addBtn.style.fontSize = 'var(--text-xs)';
  addBtn.textContent = '+ Add reminder';
  titleRow.appendChild(titleText);
  titleRow.appendChild(addBtn);
  wrap.appendChild(titleRow);

  const infoRow = document.createElement('div');
  infoRow.className = 'setting-row';
  infoRow.innerHTML = `
    <div class="setting-row-info">
      <span class="setting-row-label">Custom notifications</span>
      <span class="setting-row-desc">Your mascot will appear with a bell chime on the chosen day. Manually dismiss each reminder.</span>
    </div>
  `;
  wrap.appendChild(infoRow);

  const list = document.createElement('div');
  list.className = 'notif-list';

  const triggerDescription = (n: CustomNotification): string => {
    let base: string;
    if (n.triggerType === 'bill-before') {
      const expense = expenses.find((e) => e.id === n.expenseId);
      const expName = expense?.description ?? 'a bill';
      base = `${n.daysBefore ?? '?'} day${(n.daysBefore ?? 0) !== 1 ? 's' : ''} before ${expName}`;
    } else if (n.triggerType === 'monthly-day') {
      const d = n.monthlyDay ?? 1;
      const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th';
      base = `Every month on the ${d}${suffix}`;
    } else if (n.triggerType === 'one-time' && n.triggerDate) {
      base = `On ${new Date(n.triggerDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
    } else {
      return 'Unknown trigger';
    }
    if (n.triggerTime) {
      const [hh, mm] = n.triggerTime.split(':');
      const d = new Date();
      d.setHours(parseInt(hh ?? '0', 10), parseInt(mm ?? '0', 10), 0, 0);
      base += ` at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    }
    return base;
  };

  const renderList = () => {
    list.innerHTML = '';
    if (notifications.length === 0) {
      const empty = document.createElement('p');
      empty.style.cssText = 'font-size:var(--text-sm);color:var(--color-text-muted);padding:var(--space-1) var(--space-5)';
      empty.textContent = 'No reminders yet. Add one to get notified by your mascot.';
      list.appendChild(empty);
      return;
    }
    notifications.forEach((n) => {
      const card = document.createElement('div');
      card.className = 'notif-card';

      const info = document.createElement('div');
      info.className = 'notif-card-info';

      const labelEl = document.createElement('span');
      labelEl.className = 'notif-card-label';
      labelEl.textContent = n.label;

      const triggerEl = document.createElement('span');
      triggerEl.className = 'notif-card-trigger';
      triggerEl.textContent = triggerDescription(n);

      info.appendChild(labelEl);
      info.appendChild(triggerEl);

      if (n.customMessage) {
        const msgEl = document.createElement('span');
        msgEl.className = 'notif-card-msg';
        msgEl.textContent = `"${n.customMessage}"`;
        info.appendChild(msgEl);
      }

      const badge = document.createElement('span');
      badge.className = `notif-badge ${n.active ? 'notif-badge--active' : 'notif-badge--inactive'}`;
      badge.textContent = n.active ? 'Active' : 'Paused';

      const actions = document.createElement('div');
      actions.className = 'notif-card-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-secondary';
      editBtn.style.fontSize = 'var(--text-xs)';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        openNotifModal(n, expenses, async (updated) => {
          await saveCustomNotification(updated);
          notifications = notifications.map((x) => (x.id === updated.id ? updated : x));
          renderList();
          showToast('Reminder updated!');
        });
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-secondary';
      delBtn.style.cssText = 'font-size:var(--text-xs);color:var(--color-danger)';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Delete reminder "${n.label}"?`)) return;
        await deleteCustomNotification(n.id);
        notifications = notifications.filter((x) => x.id !== n.id);
        renderList();
      });

      actions.appendChild(badge);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      card.appendChild(info);
      card.appendChild(actions);
      list.appendChild(card);
    });
  };

  renderList();
  wrap.appendChild(list);

  addBtn.addEventListener('click', () => {
    openNotifModal(null, expenses, async (created) => {
      await saveCustomNotification(created);
      notifications.push(created);
      renderList();
      showToast('Reminder added!');
    });
  });

  return wrap;
}

function openNotifModal(
  existing: CustomNotification | null,
  expenses: Expense[],
  onSave: (n: CustomNotification) => Promise<void>,
): void {
  const isEdit = existing !== null;
  const body = document.createElement('div');
  body.className = 'export-import-form';

  const labelLabel = document.createElement('label');
  labelLabel.className = 'export-import-label';
  labelLabel.textContent = 'Reminder label';
  body.appendChild(labelLabel);

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.placeholder = 'e.g. Electric bill coming up';
  labelInput.maxLength = 80;
  labelInput.style.cssText = 'width:100%;box-sizing:border-box';
  labelInput.value = existing?.label ?? '';
  body.appendChild(labelInput);

  const triggerLabel = document.createElement('label');
  triggerLabel.className = 'export-import-label';
  triggerLabel.textContent = 'When to remind me';
  body.appendChild(triggerLabel);

  const triggerSelect = document.createElement('select');
  triggerSelect.style.cssText = 'width:100%;box-sizing:border-box';
  [
    { value: 'bill-before', label: 'Days before a bill\'s due date' },
    { value: 'monthly-day', label: 'Monthly on a specific day' },
    { value: 'one-time',    label: 'One-time on a specific date' },
  ].forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    opt.selected = (existing?.triggerType ?? 'bill-before') === value;
    triggerSelect.appendChild(opt);
  });
  body.appendChild(triggerSelect);

  const condWrap = document.createElement('div');
  condWrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-3)';
  body.appendChild(condWrap);

  const buildBillBeforeFields = (): HTMLElement => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-2)';

    const expLabel = document.createElement('label');
    expLabel.className = 'export-import-label';
    expLabel.textContent = 'Which expense / bill';
    wrap.appendChild(expLabel);

    const expSelect = document.createElement('select');
    expSelect.name = 'cond-expenseId';
    expSelect.style.cssText = 'width:100%;box-sizing:border-box';
    const billedExpenses = expenses.filter((e) => e.dueDay != null);
    if (billedExpenses.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No expenses with a due date yet';
      expSelect.appendChild(opt);
      expSelect.disabled = true;
    } else {
      billedExpenses.forEach((e) => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = `${e.description} (due day ${e.dueDay})`;
        opt.selected = existing?.expenseId === e.id;
        expSelect.appendChild(opt);
      });
    }
    wrap.appendChild(expSelect);

    const daysLabel = document.createElement('label');
    daysLabel.className = 'export-import-label';
    daysLabel.textContent = 'Days before the due date';
    wrap.appendChild(daysLabel);

    const daysInput = document.createElement('input');
    daysInput.name = 'cond-daysBefore';
    daysInput.type = 'number';
    daysInput.min = '1';
    daysInput.max = '60';
    daysInput.value = String(existing?.daysBefore ?? 7);
    daysInput.style.cssText = 'width:100px';
    wrap.appendChild(daysInput);

    return wrap;
  };

  const buildMonthlyDayFields = (): HTMLElement => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-2)';

    const dayLabel = document.createElement('label');
    dayLabel.className = 'export-import-label';
    dayLabel.textContent = 'Day of the month (1–31)';
    wrap.appendChild(dayLabel);

    const dayInput = document.createElement('input');
    dayInput.name = 'cond-monthlyDay';
    dayInput.type = 'number';
    dayInput.min = '1';
    dayInput.max = '31';
    dayInput.value = String(existing?.monthlyDay ?? 1);
    dayInput.style.cssText = 'width:100px';
    wrap.appendChild(dayInput);

    const hint = document.createElement('span');
    hint.style.cssText = 'font-size:var(--text-xs);color:var(--color-text-muted)';
    hint.textContent = 'Days 29–31 fire on the last day of shorter months.';
    wrap.appendChild(hint);

    return wrap;
  };

  const buildOneTimeFields = (): HTMLElement => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-2)';

    const dtLabel = document.createElement('label');
    dtLabel.className = 'export-import-label';
    dtLabel.textContent = 'Date';
    wrap.appendChild(dtLabel);

    const dtInput = document.createElement('input');
    dtInput.name = 'cond-triggerDate';
    dtInput.type = 'date';
    dtInput.style.cssText = 'width:180px';
    if (existing?.triggerDate) {
      const d = new Date(existing.triggerDate);
      dtInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    wrap.appendChild(dtInput);

    return wrap;
  };

  const refreshCondFields = () => {
    condWrap.innerHTML = '';
    const t = triggerSelect.value as NotificationTriggerType;
    if (t === 'bill-before') condWrap.appendChild(buildBillBeforeFields());
    else if (t === 'monthly-day') condWrap.appendChild(buildMonthlyDayFields());
    else condWrap.appendChild(buildOneTimeFields());
  };
  refreshCondFields();
  triggerSelect.addEventListener('change', refreshCondFields);

  const timeRow = document.createElement('div');
  timeRow.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-1)';

  const timeLbl = document.createElement('label');
  timeLbl.className = 'export-import-label';
  timeLbl.textContent = 'Time of day (optional)';
  timeRow.appendChild(timeLbl);

  const timeInputRow = document.createElement('div');
  timeInputRow.style.cssText = 'display:flex;align-items:center;gap:var(--space-3)';

  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.style.cssText = 'width:130px';
  timeInput.value = existing?.triggerTime ?? '';
  timeInputRow.appendChild(timeInput);

  const timeHint = document.createElement('span');
  timeHint.style.cssText = 'font-size:var(--text-xs);color:var(--color-text-muted)';
  timeHint.textContent = 'Leave blank to fire whenever you open the app that day.';
  timeInputRow.appendChild(timeHint);

  timeRow.appendChild(timeInputRow);
  body.appendChild(timeRow);

  const msgLabel = document.createElement('label');
  msgLabel.className = 'export-import-label';
  msgLabel.textContent = 'Custom message (optional)';
  body.appendChild(msgLabel);

  const msgArea = document.createElement('textarea');
  msgArea.rows = 2;
  msgArea.placeholder = 'e.g. Remember to collect Venmo from Alex before paying.';
  msgArea.style.cssText = 'width:100%;box-sizing:border-box';
  msgArea.value = existing?.customMessage ?? '';
  body.appendChild(msgArea);

  const activeWrap = document.createElement('label');
  activeWrap.style.cssText = 'display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);cursor:pointer';
  const activeCheck = document.createElement('input');
  activeCheck.type = 'checkbox';
  activeCheck.checked = existing?.active ?? true;
  activeWrap.appendChild(activeCheck);
  activeWrap.appendChild(document.createTextNode('Active'));
  body.appendChild(activeWrap);

  const errMsg = document.createElement('p');
  errMsg.className = 'export-import-error';
  errMsg.style.display = 'none';
  body.appendChild(errMsg);

  openFormModal({
    title: isEdit ? 'Edit Reminder' : 'Add Reminder',
    body,
    submitLabel: isEdit ? 'Save' : 'Add',
    onSubmit: async (close) => {
      errMsg.style.display = 'none';
      const label = labelInput.value.trim();
      if (!label) {
        errMsg.textContent = 'Please enter a label for this reminder.';
        errMsg.style.display = '';
        labelInput.focus();
        return;
      }

      const triggerType = triggerSelect.value as NotificationTriggerType;
      let expenseId: string | undefined;
      let daysBefore: number | undefined;
      let monthlyDay: number | undefined;
      let triggerDate: number | undefined;

      if (triggerType === 'bill-before') {
        const expSel = condWrap.querySelector<HTMLSelectElement>('[name="cond-expenseId"]');
        const daysSel = condWrap.querySelector<HTMLInputElement>('[name="cond-daysBefore"]');
        expenseId = expSel?.value || undefined;
        daysBefore = parseInt(daysSel?.value ?? '7', 10) || 7;
        if (!expenseId) {
          errMsg.textContent = 'Please select an expense with a due date.';
          errMsg.style.display = '';
          return;
        }
      } else if (triggerType === 'monthly-day') {
        const dayInp = condWrap.querySelector<HTMLInputElement>('[name="cond-monthlyDay"]');
        monthlyDay = Math.max(1, Math.min(31, parseInt(dayInp?.value ?? '1', 10) || 1));
      } else {
        const dtInp = condWrap.querySelector<HTMLInputElement>('[name="cond-triggerDate"]');
        if (!dtInp?.value) {
          errMsg.textContent = 'Please choose a date.';
          errMsg.style.display = '';
          return;
        }
        triggerDate = new Date(dtInp.value + 'T00:00:00').getTime();
      }

      const base = existing ?? createCustomNotification(label, triggerType);
      const notif = { ...base } as CustomNotification;
      notif.label = label;
      notif.triggerType = triggerType;
      notif.active = activeCheck.checked;
      notif.updatedAt = Date.now();
      delete notif.expenseId;
      delete notif.daysBefore;
      delete notif.monthlyDay;
      delete notif.triggerDate;
      delete notif.triggerTime;
      delete notif.customMessage;
      delete notif.lastFiredAt;
      if (expenseId !== undefined) notif.expenseId = expenseId;
      if (daysBefore !== undefined) notif.daysBefore = daysBefore;
      if (monthlyDay !== undefined) notif.monthlyDay = monthlyDay;
      if (triggerDate !== undefined) notif.triggerDate = triggerDate;
      const triggerTime = timeInput.value || undefined;
      if (triggerTime !== undefined) notif.triggerTime = triggerTime;
      const customMessage = msgArea.value.trim();
      if (customMessage) notif.customMessage = customMessage;

      close();
      await onSave(notif);
    },
  });
}
