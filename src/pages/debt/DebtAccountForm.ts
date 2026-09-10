import { saveDebtAccount, createDebtAccount } from '@/db';
import { openFormModal } from '@/components/Modal';
import { buildLinkedRemindersSection } from '@/utils/notificationModal';
import type { DebtAccount, DebtAccountType, PaymentCycle } from '@/types';

const PAYMENT_CYCLE_LABELS: Record<PaymentCycle, string> = {
  weekly: 'Weekly', biweekly: 'Every 2 weeks', semimonthly: 'Twice monthly', monthly: 'Monthly',
};

const DEBT_TYPE_LABELS: Record<DebtAccountType, string> = {
  card:     '💳 Credit Card',
  mortgage: '🏠 Mortgage',
  medical:  '🏥 Medical Debt',
  loan:     '💼 Personal / Student Loan',
  vehicle:  '🚗 Vehicle Loan',
};

export function openDebtForm(
  existing: DebtAccount | undefined,
  showPaymentDetails: boolean,
  onSaved: (account: DebtAccount, wasPaidOff: boolean) => Promise<void>,
): void {
  const isEdit = !!existing;
  const initialType: DebtAccountType = existing?.type ?? 'card';
  const showMinPayment = isEdit || showPaymentDetails;
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:var(--space-4)';

  const cycleOptions = (Object.keys(PAYMENT_CYCLE_LABELS) as PaymentCycle[])
    .map((c) => `<option value="${c}" ${(existing?.paymentCycle ?? 'monthly') === c ? 'selected' : ''}>${PAYMENT_CYCLE_LABELS[c]}</option>`)
    .join('');

  const typeOptions = (Object.keys(DEBT_TYPE_LABELS) as DebtAccountType[])
    .map((t) => `<option value="${t}" ${initialType === t ? 'selected' : ''}>${DEBT_TYPE_LABELS[t]}</option>`)
    .join('');

  const minTypeChecked = existing?.minimumPaymentType ?? 'percentage';

  const dueDateDefaultStr = (() => {
    if (existing?.nextDueDateMs) {
      return new Date(existing.nextDueDateMs).toISOString().split('T')[0];
    }
    if (existing?.dueDay) {
      const n = new Date();
      const day = existing.dueDay;
      const curMaxDay = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
      const clamped = Math.min(day, curMaxDay);
      if (n.getDate() < clamped) {
        return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
      }
      const next = new Date(n.getFullYear(), n.getMonth() + 1, 1);
      const nextMaxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(Math.min(day, nextMaxDay)).padStart(2, '0')}`;
    }
    return '';
  })();

  body.innerHTML = `
    <div class="form-group" id="da-type-row">
      <label class="form-label" for="da-type">Debt type</label>
      <select id="da-type" ${isEdit ? 'disabled' : ''}>${typeOptions}</select>
      ${isEdit ? '<span class="form-hint">Type cannot be changed after creation.</span>' : ''}
    </div>
    <div class="form-group">
      <label class="form-label" for="da-name">Name / Lender <span class="req">*</span></label>
      <input id="da-name" type="text" value="${existing?.name ?? ''}"
        placeholder="e.g. Chase Sapphire, Wells Fargo Mortgage" maxlength="48" />
    </div>
    <div class="form-group">
      <label class="form-label" for="da-url">Billing portal URL <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>
      <input id="da-url" type="url" placeholder="https://billing.example.com" maxlength="512" />
      <span class="form-hint">Opens as a quick link on your debt list and calendar.</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
      <div class="form-group">
        <label class="form-label" for="da-balance">Current balance <span class="req">*</span></label>
        <input id="da-balance" type="number" min="0" step="0.01"
          value="${existing?.balance ?? ''}" placeholder="0.00"
          title="Your current outstanding balance on this account" />
      </div>
      <div class="form-group">
        <label class="form-label" for="da-apr">APR (%) <span class="req" id="da-apr-req">*</span></label>
        <input id="da-apr" type="number" min="0" max="100" step="0.01"
          value="${existing?.apr ?? ''}" placeholder="e.g. 22.99"
          title="Annual Percentage Rate — your yearly interest rate, used to calculate monthly interest charges" />
        <span class="form-hint" id="da-apr-hint">Annual percentage rate</span>
      </div>
    </div>
    <div class="form-group" id="da-row-limit">
      <label class="form-label" for="da-limit">Credit limit</label>
      <input id="da-limit" type="number" min="0" step="1"
        value="${existing?.creditLimit ?? ''}" placeholder="0"
        title="Your total credit limit — used to calculate utilization percentage (balance ÷ limit)" />
    </div>
    <div id="da-row-loan-details" style="display:none;grid-template-columns:1fr 1fr;gap:var(--space-4)">
      <div class="form-group">
        <label class="form-label" for="da-original">Original amount</label>
        <input id="da-original" type="number" min="0" step="1"
          value="${existing?.originalAmount ?? ''}" placeholder="0"
          title="The original loan amount when you first borrowed — helps track payoff progress" />
      </div>
      <div class="form-group">
        <label class="form-label" for="da-term">Term (years)</label>
        <input id="da-term" type="number" min="1" max="50" step="1"
          value="${existing?.termMonths ? Math.round(existing.termMonths / 12) : ''}" placeholder="e.g. 30"
          title="Loan term in years — used to project your amortization schedule and monthly payment estimate" />
      </div>
    </div>
    <div id="da-row-cycle" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
      <div class="form-group">
        <label class="form-label" for="da-cycle">Payment cycle</label>
        <select id="da-cycle">${cycleOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label" for="da-duedate">Next payment due date</label>
        <input id="da-duedate" type="date"
          value="${dueDateDefaultStr}"
          title="The date your next payment is due — determines past-due and due-soon status badges and calendar reminders" />
        <span class="form-hint">Pick your next payment due date</span>
      </div>
    </div>
    <div id="da-section-intro-apr" style="display:none">
      <fieldset style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:var(--space-4)">
        <legend class="form-label" style="padding:0 var(--space-2)">0% Intro APR</legend>
        <label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);cursor:pointer;margin-bottom:var(--space-3)">
          <input type="checkbox" id="da-intro-checked" ${existing?.introAprEndDate ? 'checked' : ''} />
          This card has a 0% intro APR period
        </label>
        <div id="da-intro-date-wrap" style="${existing?.introAprEndDate ? '' : 'display:none'}">
          <div class="form-group">
            <label class="form-label" for="da-intro-end">Intro APR ends on</label>
            <input id="da-intro-end" type="date"
              value="${existing?.introAprEndDate ? new Date(existing.introAprEndDate).toISOString().split('T')[0] : ''}"
              title="When the 0% intro period ends — after this date, the APR above applies and interest accrues" />
            <span class="form-hint">After this date, the APR above applies. Balance isn't interest-free — it still must be paid down.</span>
          </div>
        </div>
      </fieldset>
    </div>
    <div id="da-section-card-payment">
      ${showMinPayment ? `
      <fieldset style="border:1px solid var(--color-border);border-radius:var(--radius-md);padding:var(--space-4)">
        <legend class="form-label" style="padding:0 var(--space-2)">Minimum payment</legend>
        <div style="display:flex;gap:var(--space-4);margin-bottom:var(--space-3)">
          <label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);cursor:pointer">
            <input type="radio" name="da-min-type" value="percentage"
              ${minTypeChecked === 'percentage' ? 'checked' : ''} />
            % of balance
          </label>
          <label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);cursor:pointer">
            <input type="radio" name="da-min-type" value="fixed"
              ${minTypeChecked === 'fixed' ? 'checked' : ''} />
            Fixed amount
          </label>
        </div>
        <div class="form-group">
          <input id="da-min-value" type="number" min="0" step="0.01"
            value="${existing?.minimumPaymentValue ?? ''}" placeholder="e.g. 2 or 25.00"
            title="For % of balance: enter the percentage (e.g. 2 for 2%), floored at $25. For fixed: enter the dollar amount per cycle." />
          <span class="form-hint" id="da-min-hint">
            ${minTypeChecked === 'fixed' ? 'Fixed amount paid each cycle' : 'Percentage of balance, floored at $25'}
          </span>
        </div>
      </fieldset>
      ` : `<p class="form-hint" style="margin:0">You can add minimum payment details later via "Complete setup →" on the account.</p>`}
    </div>
    <div id="da-section-fixed-payment" style="display:none" class="form-group">
      <label class="form-label" for="da-payment-fixed">Monthly payment</label>
      <input id="da-payment-fixed" type="number" min="0" step="0.01"
        value="${existing?.minimumPaymentValue ?? ''}" placeholder="0.00"
        title="Your regular monthly payment — used to track whether you've met your payment obligation each cycle" />
      <span class="form-hint">Your regular monthly payment amount</span>
    </div>
    <div id="da-error" class="form-error" style="display:none"></div>
  `;

  if (showMinPayment) {
    body.querySelectorAll<HTMLInputElement>('[name="da-min-type"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const hint = body.querySelector<HTMLElement>('#da-min-hint')!;
        hint.textContent = radio.value === 'fixed'
          ? 'Fixed amount paid each cycle'
          : 'Percentage of balance, floored at $25';
      });
    });
  }

  const syncTypeUI = (type: DebtAccountType) => {
    const set = (id: string, display: string) => {
      const el = body.querySelector<HTMLElement>(id);
      if (el) el.style.display = display;
    };
    const isCard = type === 'card';
    const isMedical = type === 'medical';
    const isLoanOrMortgage = type === 'mortgage' || type === 'loan' || type === 'vehicle';

    set('#da-row-limit', isCard ? 'block' : 'none');
    set('#da-row-loan-details', isLoanOrMortgage ? 'grid' : 'none');
    set('#da-row-cycle', isMedical ? 'none' : 'grid');
    set('#da-section-intro-apr', isCard ? 'block' : 'none');
    set('#da-section-card-payment', isCard ? 'block' : 'none');
    set('#da-section-fixed-payment', isCard ? 'none' : 'block');

    const aprHint = body.querySelector<HTMLElement>('#da-apr-hint');
    if (aprHint) {
      aprHint.textContent = isMedical ? 'Often 0% for interest-free medical plans' : 'Annual percentage rate';
    }
    const aprReq = body.querySelector<HTMLElement>('#da-apr-req');
    if (aprReq) aprReq.style.display = isMedical ? 'none' : '';
  };

  if (existing?.url) body.querySelector<HTMLInputElement>('#da-url')!.value = existing.url;

  syncTypeUI(initialType);

  body.querySelector<HTMLInputElement>('#da-intro-checked')?.addEventListener('change', (e) => {
    const wrap = body.querySelector<HTMLElement>('#da-intro-date-wrap');
    if (wrap) wrap.style.display = (e.target as HTMLInputElement).checked ? '' : 'none';
  });

  if (!isEdit) {
    body.querySelector<HTMLSelectElement>('#da-type')!.addEventListener('change', (e) => {
      syncTypeUI((e.target as HTMLSelectElement).value as DebtAccountType);
    });
  }

  const getDebtTypeLabel = (): string => {
    const t = (body.querySelector<HTMLSelectElement>('#da-type')!.value as DebtAccountType);
    return DEBT_TYPE_LABELS[t].replace(/^[^ ]+ /, '');
  };

  let flushReminders: (finalItemId: string) => Promise<void> = async () => {};
  if (!showPaymentDetails) {
    if (isEdit && existing) {
      const { element, flush } = buildLinkedRemindersSection(existing.id, 'debt', existing.name);
      body.appendChild(element);
      flushReminders = flush;
    } else if (!isEdit) {
      const nameInput = body.querySelector<HTMLInputElement>('#da-name')!;
      const { element, flush } = buildLinkedRemindersSection('', 'debt', 'Debt', {
        deferred: true,
        getLabel: () => nameInput.value.trim() || 'Debt',
      });
      body.appendChild(element);
      flushReminders = flush;
    }
  }

  openFormModal({
    title: showPaymentDetails ? 'Complete Account Setup' : isEdit ? `Edit ${DEBT_TYPE_LABELS[initialType].replace(/^[^ ]+ /, '')}` : 'Add Debt',
    body,
    submitLabel: showPaymentDetails ? 'Save payment details' : isEdit ? 'Save changes' : `Add ${getDebtTypeLabel()}`,
    onSubmit: async (close) => {
      const type = body.querySelector<HTMLSelectElement>('#da-type')!.value as DebtAccountType;
      const isCard = type === 'card';
      const isMedical = type === 'medical';
      const name = body.querySelector<HTMLInputElement>('#da-name')!.value.trim();
      const balance = parseFloat(body.querySelector<HTMLInputElement>('#da-balance')!.value);
      const apr = parseFloat(body.querySelector<HTMLInputElement>('#da-apr')!.value);
      const creditLimitRaw = parseFloat(body.querySelector<HTMLInputElement>('#da-limit')!.value || '');
      const creditLimit = isNaN(creditLimitRaw) ? 0 : creditLimitRaw;
      const originalAmountRaw = parseFloat(body.querySelector<HTMLInputElement>('#da-original')!.value || '');
      const originalAmount = isNaN(originalAmountRaw) || originalAmountRaw <= 0 ? undefined : originalAmountRaw;
      const termYearsRaw = parseInt(body.querySelector<HTMLInputElement>('#da-term')!.value || '');
      const termMonths = isNaN(termYearsRaw) || termYearsRaw <= 0 ? undefined : termYearsRaw * 12;
      const cycleEl = body.querySelector<HTMLSelectElement>('#da-cycle');
      const paymentCycle = ((cycleEl?.value ?? 'monthly') as PaymentCycle);
      const dueDateVal = body.querySelector<HTMLInputElement>('#da-duedate')?.value ?? '';
      const dueDateMs = dueDateVal ? new Date(dueDateVal + 'T00:00:00').getTime() : undefined;
      const dueDay = dueDateVal ? parseInt(dueDateVal.split('-')[2]!, 10) : undefined;
      const nextDueDateMs = dueDateMs && !isNaN(dueDateMs) ? dueDateMs : undefined;

      const minTypeEl = body.querySelector<HTMLInputElement>('[name="da-min-type"]:checked');
      const minType = (minTypeEl?.value ?? 'percentage') as 'fixed' | 'percentage';
      let minValue: number | undefined;
      if (isCard) {
        const raw = parseFloat(body.querySelector<HTMLInputElement>('#da-min-value')?.value ?? '');
        minValue = isNaN(raw) || raw <= 0 ? undefined : raw;
      } else {
        const raw = parseFloat(body.querySelector<HTMLInputElement>('#da-payment-fixed')!.value ?? '');
        minValue = isNaN(raw) || raw <= 0 ? undefined : raw;
      }

      const introChecked = isCard && !!(body.querySelector<HTMLInputElement>('#da-intro-checked')?.checked);
      const introEndStr = body.querySelector<HTMLInputElement>('#da-intro-end')?.value ?? '';
      let introAprEndDate: number | undefined;
      if (introChecked && introEndStr) {
        introAprEndDate = new Date(introEndStr + 'T23:59:59Z').getTime();
      }
      const url = body.querySelector<HTMLInputElement>('#da-url')!.value.trim() || undefined;

      const errEl = body.querySelector<HTMLElement>('#da-error')!;
      const missing: string[] = [];
      if (!name)                                   missing.push('Name / Lender');
      if (isNaN(balance) || balance < 0)           missing.push('Current balance');
      if (isNaN(apr) || (!isMedical && apr <= 0))  missing.push('APR');
      if (showMinPayment && isCard && minValue == null) missing.push('Minimum payment');
      if (introChecked && !introEndStr)             missing.push('Intro APR end date');
      if (missing.length > 0) {
        errEl.textContent = missing.length === 1
          ? `${missing[0]} is required.`
          : `Fill in all required fields: ${missing.join(', ')}.`;
        errEl.style.display = 'block';
        return;
      }

      const now = Date.now();
      const { introAprEndDate: _prevIntro, ...existingBase } = existing ?? {} as DebtAccount;
      const account: DebtAccount = existing
        ? {
            ...existingBase, id: existing.id, createdAt: existing.createdAt,
            type, name, balance, apr, paymentCycle, updatedAt: now,
            ...(isCard && creditLimit > 0 ? { creditLimit } : {}),
            ...(originalAmount != null ? { originalAmount } : {}),
            ...(termMonths != null ? { termMonths } : {}),
            ...(dueDay != null ? { dueDay } : {}),
            ...(nextDueDateMs != null ? { nextDueDateMs } : {}),
            ...(minValue != null ? { minimumPaymentType: isCard ? minType : 'fixed', minimumPaymentValue: minValue } : {}),
            ...(introAprEndDate != null ? { introAprEndDate } : {}),
            ...(url != null ? { url } : {}),
          }
        : {
            ...createDebtAccount(type, name, balance, apr),
            paymentCycle,
            ...(isCard && creditLimit > 0 ? { creditLimit } : {}),
            ...(originalAmount != null ? { originalAmount } : {}),
            ...(termMonths != null ? { termMonths } : {}),
            ...(dueDay != null ? { dueDay } : {}),
            ...(nextDueDateMs != null ? { nextDueDateMs } : {}),
            ...(minValue != null ? { minimumPaymentType: isCard ? minType : 'fixed', minimumPaymentValue: minValue } : {}),
            ...(introAprEndDate != null ? { introAprEndDate } : {}),
            ...(url != null ? { url } : {}),
          };

      const wasPaidOff = !!(existing && existing.balance > 0 && balance === 0);

      await saveDebtAccount(account);
      await flushReminders(account.id);

      close();
      await onSaved(account, wasPaidOff);
    },
  });
}
