import { openFormModal } from '@/components/Modal';
import { saveCustomNotification, createCustomNotification, deleteCustomNotification, getCustomNotifications, getExpenses } from '@/db';
import type { CustomNotification, NotificationTriggerType, NotifLinkedItemType, Expense } from '@/types';

export interface NotifModalCtx {
  label: string;
  defaultTrigger?: NotificationTriggerType;
  defaultExpenseId?: string;
  linkedItemId?: string;
  linkedItemType?: NotifLinkedItemType;
  /** When true, skip saving to DB — caller receives the built notif via onSaved and flushes later. */
  deferSave?: boolean;
}

function showToast(msg: string): void {
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed;bottom:var(--space-6);right:var(--space-6);
    padding:var(--space-3) var(--space-5);
    background:var(--ff-navy);color:#fff;
    border-radius:var(--radius-lg);
    font-size:var(--text-sm);font-weight:700;
    box-shadow:var(--shadow-lg);z-index:9999;
    animation:fade-in 0.2s ease;
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function describeTrigger(n: CustomNotification, expenses: Expense[]): string {
  if (n.triggerType === 'bill-before') {
    const exp = expenses.find((e) => e.id === n.expenseId);
    const name = exp?.description ?? 'bill';
    return `${n.daysBefore ?? '?'} day${(n.daysBefore ?? 0) !== 1 ? 's' : ''} before ${name}`;
  }
  if (n.triggerType === 'monthly-day') {
    const d = n.monthlyDay ?? 1;
    const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th';
    return `Every month on the ${d}${suffix}`;
  }
  if (n.triggerType === 'one-time' && n.triggerDate) {
    return `On ${new Date(n.triggerDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
  }
  return 'Unknown trigger';
}

// ── Shared modal form builder ──────────────────────────────────────────────────

export function openAddNotificationModal(
  ctx: NotifModalCtx,
  onSaved?: (notif: CustomNotification) => void,
): void {
  const body = document.createElement('div');
  body.className = 'export-import-form';

  const labelLabel = document.createElement('label');
  labelLabel.className = 'export-import-label';
  labelLabel.textContent = 'Reminder label';
  body.appendChild(labelLabel);

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.value = ctx.label;
  labelInput.maxLength = 80;
  labelInput.style.cssText = 'width:100%;box-sizing:border-box';
  body.appendChild(labelInput);

  const triggerLabel = document.createElement('label');
  triggerLabel.className = 'export-import-label';
  triggerLabel.textContent = 'When to remind me';
  body.appendChild(triggerLabel);

  const defaultTrigger = ctx.defaultTrigger ?? 'monthly-day';
  const triggerSelect = document.createElement('select');
  triggerSelect.style.cssText = 'width:100%;box-sizing:border-box';
  [
    { value: 'bill-before', label: "Days before a bill's due date" },
    { value: 'monthly-day', label: 'Monthly on a specific day' },
    { value: 'one-time',    label: 'One-time on a specific date' },
  ].forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    opt.selected = value === defaultTrigger;
    triggerSelect.appendChild(opt);
  });
  body.appendChild(triggerSelect);

  const condWrap = document.createElement('div');
  condWrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-3)';
  body.appendChild(condWrap);

  let cachedExpenses: Expense[] | null = null;

  const buildBillBeforeFields = async (): Promise<HTMLElement> => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-2)';

    const expLabel = document.createElement('label');
    expLabel.className = 'export-import-label';
    expLabel.textContent = 'Which bill';
    wrap.appendChild(expLabel);

    const expSelect = document.createElement('select');
    expSelect.name = 'cond-expenseId';
    expSelect.style.cssText = 'width:100%;box-sizing:border-box';

    const loadingOpt = document.createElement('option');
    loadingOpt.textContent = 'Loading bills…';
    loadingOpt.disabled = true;
    expSelect.appendChild(loadingOpt);
    wrap.appendChild(expSelect);

    if (!cachedExpenses) {
      const all = await getExpenses();
      cachedExpenses = all.filter((e) => e.dueDay != null);
    }

    expSelect.innerHTML = '';
    if (cachedExpenses.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No bills with a due date configured yet';
      opt.disabled = true;
      expSelect.appendChild(opt);
      expSelect.disabled = true;
    } else {
      cachedExpenses.forEach((e) => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = `${e.description} (due day ${e.dueDay})`;
        opt.selected = ctx.defaultExpenseId === e.id;
        expSelect.appendChild(opt);
      });
    }

    const daysLabel = document.createElement('label');
    daysLabel.className = 'export-import-label';
    daysLabel.textContent = 'Days before due date';
    wrap.appendChild(daysLabel);

    const daysInput = document.createElement('input');
    daysInput.name = 'cond-daysBefore';
    daysInput.type = 'number';
    daysInput.min = '1';
    daysInput.max = '60';
    daysInput.value = '7';
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
    dayInput.value = '1';
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
    wrap.appendChild(dtInput);

    return wrap;
  };

  const refreshCondFields = async () => {
    condWrap.innerHTML = '';
    const t = triggerSelect.value as NotificationTriggerType;
    if (t === 'bill-before') condWrap.appendChild(await buildBillBeforeFields());
    else if (t === 'monthly-day') condWrap.appendChild(buildMonthlyDayFields());
    else condWrap.appendChild(buildOneTimeFields());
  };

  if (defaultTrigger === 'bill-before') {
    void refreshCondFields();
  } else if (defaultTrigger === 'monthly-day') {
    condWrap.appendChild(buildMonthlyDayFields());
  } else {
    condWrap.appendChild(buildOneTimeFields());
  }

  triggerSelect.addEventListener('change', () => { void refreshCondFields(); });

  // Time of day
  const timeRow = document.createElement('div');
  timeRow.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-1)';

  const timeLabel = document.createElement('label');
  timeLabel.className = 'export-import-label';
  timeLabel.textContent = 'Time of day (optional)';
  timeRow.appendChild(timeLabel);

  const timeInputRow = document.createElement('div');
  timeInputRow.style.cssText = 'display:flex;align-items:center;gap:var(--space-3)';

  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.style.cssText = 'width:130px';
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
  msgArea.placeholder = 'e.g. Remember to transfer funds before auto-pay runs.';
  msgArea.style.cssText = 'width:100%;box-sizing:border-box';
  body.appendChild(msgArea);

  const errMsg = document.createElement('p');
  errMsg.className = 'export-import-error';
  errMsg.style.display = 'none';
  body.appendChild(errMsg);

  openFormModal({
    title: 'Add Reminder',
    body,
    submitLabel: 'Add Reminder',
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
        const daysInp = condWrap.querySelector<HTMLInputElement>('[name="cond-daysBefore"]');
        expenseId = expSel?.value || undefined;
        daysBefore = parseInt(daysInp?.value ?? '7', 10) || 7;
        if (!expenseId) {
          errMsg.textContent = 'Please select a bill.';
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

      const notif = createCustomNotification(label, triggerType);
      if (expenseId !== undefined) notif.expenseId = expenseId;
      if (daysBefore !== undefined) notif.daysBefore = daysBefore;
      if (monthlyDay !== undefined) notif.monthlyDay = monthlyDay;
      if (triggerDate !== undefined) notif.triggerDate = triggerDate;
      const triggerTime = timeInput.value || undefined;
      if (triggerTime !== undefined) notif.triggerTime = triggerTime;
      const customMessage = msgArea.value.trim();
      if (customMessage) notif.customMessage = customMessage;
      if (ctx.linkedItemId !== undefined) notif.linkedItemId = ctx.linkedItemId;
      if (ctx.linkedItemType !== undefined) notif.linkedItemType = ctx.linkedItemType;

      if (!ctx.deferSave) {
        await saveCustomNotification(notif);
        close();
        showToast('Reminder added! Manage all reminders in Settings → Reminders.');
      } else {
        close();
      }
      onSaved?.(notif);
    },
  });
}

// ── Inline reminders section (for create and edit forms) ──────────────────────

export function buildLinkedRemindersSection(
  itemId: string,
  itemType: NotifLinkedItemType,
  itemLabel: string,
  opts: {
    defaultTrigger?: NotificationTriggerType;
    defaultExpenseId?: string;
    /** When true, reminders are buffered in memory. Call flush(finalItemId) after saving the item. */
    deferred?: boolean;
    /** Called each time the user opens the Add Reminder modal to read the current item label. */
    getLabel?: () => string;
  } = {},
): { element: HTMLElement; flush: (finalItemId: string) => Promise<void> } {
  const { defaultTrigger = 'monthly-day', defaultExpenseId, deferred = false, getLabel } = opts;
  const pending: CustomNotification[] = [];

  const wrap = document.createElement('div');
  wrap.className = 'linked-reminders-section';
  wrap.style.cssText = 'border-top:1px solid var(--color-border);padding-top:var(--space-4);margin-top:var(--space-2);display:flex;flex-direction:column;gap:var(--space-3)';

  const refresh = async () => {
    if (deferred) {
      if (pending.length === 0) { render([], []); return; }
      const expenses = await getExpenses();
      render(pending, expenses);
      return;
    }
    const [allNotifs, allExpenses] = await Promise.all([getCustomNotifications(), getExpenses()]);
    const linked = allNotifs.filter((n) => n.linkedItemId === itemId);
    render(linked, allExpenses);
  };

  const render = (notifications: CustomNotification[], expenses: Expense[]) => {
    wrap.innerHTML = '';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between';

    const title = document.createElement('span');
    title.style.cssText = 'font-size:var(--text-xs);font-weight:var(--weight-bold);text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-muted)';
    title.textContent = 'Reminders';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-secondary';
    addBtn.style.cssText = 'font-size:var(--text-xs);padding:var(--space-1) var(--space-3)';
    addBtn.textContent = '+ Add reminder';
    addBtn.addEventListener('click', () => {
      const label = getLabel?.() || itemLabel || 'Reminder';
      if (deferred) {
        // In deferred mode: buffer the reminder, don't save to DB yet
        const addCtx: NotifModalCtx = { label, defaultTrigger, deferSave: true };
        if (defaultExpenseId !== undefined) addCtx.defaultExpenseId = defaultExpenseId;
        openAddNotificationModal(addCtx, (notif) => {
          pending.push(notif);
          void refresh();
        });
      } else {
        const addCtx: NotifModalCtx = { label, defaultTrigger, linkedItemId: itemId, linkedItemType: itemType };
        if (defaultExpenseId !== undefined) addCtx.defaultExpenseId = defaultExpenseId;
        openAddNotificationModal(addCtx, async () => { await refresh(); });
      }
    });

    header.appendChild(title);
    header.appendChild(addBtn);
    wrap.appendChild(header);

    if (notifications.length === 0) {
      const empty = document.createElement('p');
      empty.style.cssText = 'font-size:var(--text-xs);color:var(--color-text-muted);margin:0';
      empty.textContent = 'No reminders yet.';
      wrap.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-2)';

    notifications.forEach((n) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:var(--space-2);padding:var(--space-2) var(--space-3);background:var(--color-bg-sunken);border:1px solid var(--color-border);border-radius:var(--radius-md)';

      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px';

      const labelEl = document.createElement('span');
      labelEl.style.cssText = 'font-size:var(--text-sm);font-weight:var(--weight-semibold);color:var(--color-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      labelEl.textContent = n.label;

      const trigEl = document.createElement('span');
      trigEl.style.cssText = 'font-size:var(--text-xs);color:var(--color-text-muted)';
      trigEl.textContent = describeTrigger(n, expenses);

      info.appendChild(labelEl);
      info.appendChild(trigEl);

      const badge = document.createElement('span');
      badge.style.cssText = `font-size:var(--text-xs);font-weight:var(--weight-bold);padding:1px var(--space-2);border-radius:9999px;flex-shrink:0;${
        n.active
          ? 'background:rgba(34,197,94,0.12);color:var(--ff-green);border:1px solid rgba(34,197,94,0.3)'
          : 'background:var(--color-bg-elevated);color:var(--color-text-muted);border:1px solid var(--color-border)'
      }`;
      badge.textContent = n.active ? 'On' : 'Off';

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.style.cssText = 'flex-shrink:0;background:none;border:none;cursor:pointer;font-size:var(--text-sm);color:var(--color-text-muted);padding:2px 4px;line-height:1;opacity:0.6';
      delBtn.title = 'Delete reminder';
      delBtn.textContent = '✕';
      delBtn.addEventListener('mouseenter', () => { delBtn.style.opacity = '1'; delBtn.style.color = 'var(--color-danger)'; });
      delBtn.addEventListener('mouseleave', () => { delBtn.style.opacity = '0.6'; delBtn.style.color = 'var(--color-text-muted)'; });
      delBtn.addEventListener('click', async () => {
        if (deferred) {
          const idx = pending.findIndex((p) => p.id === n.id);
          if (idx !== -1) pending.splice(idx, 1);
          void refresh();
          return;
        }
        if (!confirm(`Delete reminder "${n.label}"?`)) return;
        await deleteCustomNotification(n.id);
        await refresh();
      });

      row.appendChild(info);
      row.appendChild(badge);
      row.appendChild(delBtn);
      list.appendChild(row);
    });

    wrap.appendChild(list);
  };

  // Bootstrap: show a loading placeholder, then replace with actual content.
  // Deferred mode renders synchronously with empty pending; edit mode loads from DB.
  const loading = document.createElement('p');
  loading.style.cssText = 'font-size:var(--text-xs);color:var(--color-text-muted);margin:0';
  loading.textContent = 'Loading reminders…';
  wrap.appendChild(loading);
  void refresh();

  const flush = async (finalItemId: string): Promise<void> => {
    if (!deferred || pending.length === 0) return;
    await Promise.all(pending.map((n) => {
      const notif = { ...n, linkedItemId: finalItemId, linkedItemType: itemType };
      return saveCustomNotification(notif);
    }));
    pending.length = 0;
  };

  return { element: wrap, flush };
}
