import { navigate } from '@/app/router';
import type { BankAccount, DebtAccount } from '@/types';

export interface PaymentSourceSelectConfig {
  bankAccounts: BankAccount[];
  cardAccounts: DebtAccount[];
  /** Pre-selected value as "bank:ID" | "card:ID" | "" */
  defaultValue?: string;
  /** Label text before "(optional)". Defaults to "Pay from". */
  label?: string;
  testId?: string;
  /** Forward ref to the parent modal's close function — used by the empty-state nav links. */
  closeRef?: { close?: () => void };
}

export interface PaymentSourceSelectHandle {
  element: HTMLElement;
  getBankId(): string | null;
  getCardId(): string | null;
}

export function createPaymentSourceSelect(config: PaymentSourceSelectConfig): PaymentSourceSelectHandle {
  const { bankAccounts, cardAccounts, closeRef } = config;
  const defaultValue = config.defaultValue ?? '';
  const label = config.label ?? 'Pay from';
  const testId = config.testId ?? 'pay-source-select';
  const hasAnySources = bankAccounts.length > 0 || cardAccounts.length > 0;

  const container = document.createElement('div');
  container.className = 'form-group';

  const labelEl = document.createElement('label');
  labelEl.className = 'form-label';
  labelEl.htmlFor = 'pay-src';
  labelEl.innerHTML = `${label} <span class="text-muted" style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span>`;
  container.appendChild(labelEl);

  let selectEl: HTMLSelectElement | null = null;

  if (hasAnySources) {
    selectEl = document.createElement('select');
    selectEl.id = 'pay-src';
    selectEl.dataset['testid'] = testId;

    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '— Not specified —';
    selectEl.appendChild(noneOpt);

    if (bankAccounts.length > 0) {
      const bankGroup = document.createElement('optgroup');
      bankGroup.label = 'Accounts';
      bankAccounts.forEach((b) => {
        const opt = document.createElement('option');
        opt.value = `bank:${b.id}`;
        opt.textContent = b.name;
        opt.selected = defaultValue === `bank:${b.id}`;
        bankGroup.appendChild(opt);
      });
      selectEl.appendChild(bankGroup);
    }

    if (cardAccounts.length > 0) {
      const cardGroup = document.createElement('optgroup');
      cardGroup.label = 'Credit Cards';
      cardAccounts.forEach((a) => {
        const opt = document.createElement('option');
        opt.value = `card:${a.id}`;
        opt.textContent = a.name;
        opt.selected = defaultValue === `card:${a.id}`;
        cardGroup.appendChild(opt);
      });
      selectEl.appendChild(cardGroup);
    }

    container.appendChild(selectEl);
  } else {
    const hint = document.createElement('span');
    hint.className = 'form-hint';
    hint.textContent = 'No accounts or cards set up. ';

    const bankLink = document.createElement('a');
    bankLink.href = '#';
    bankLink.textContent = 'Add a bank account →';
    bankLink.addEventListener('click', (e) => {
      e.preventDefault();
      closeRef?.close?.();
      navigate('/accounts');
    });

    const cardLink = document.createElement('a');
    cardLink.href = '#';
    cardLink.textContent = 'Add a credit card →';
    cardLink.addEventListener('click', (e) => {
      e.preventDefault();
      closeRef?.close?.();
      navigate('/debt');
    });

    hint.appendChild(bankLink);
    hint.appendChild(document.createTextNode(' · '));
    hint.appendChild(cardLink);
    container.appendChild(hint);
  }

  return {
    element: container,
    getBankId(): string | null {
      const val = selectEl?.value ?? '';
      return val.startsWith('bank:') ? val.slice(5) : null;
    },
    getCardId(): string | null {
      const val = selectEl?.value ?? '';
      return val.startsWith('card:') ? val.slice(5) : null;
    },
  };
}
