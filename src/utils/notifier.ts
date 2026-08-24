import browser from 'webextension-polyfill';
import { getDebtAccounts, getDebtPayments, getExpenses, getExpensePaidRecords } from '@/db';
import { computePaymentStatus, computeMinPayment } from '@/utils/paymentStatus';
import { computeBillStatus } from '@/utils/billStatus';
import type { Route } from '@/app/router';

// ── Public types ──────────────────────────────────────────────────────────────

export interface NotifierItem {
  text: string;
  route: Extract<Route, '/debt' | '/expenses'>;
  severity: 'critical' | 'warning';
  dueDate?: Date | null;
}

type AlertsCallback = (items: NotifierItem[]) => void;

// ── Module state ──────────────────────────────────────────────────────────────

let currentItems: NotifierItem[] = [];
let alertCallback: AlertsCallback | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

export function subscribeToAlerts(cb: AlertsCallback): void {
  alertCallback = cb;
}

export function getCurrentAlerts(): NotifierItem[] {
  return [...currentItems];
}

export async function refreshNotifier(): Promise<void> {
  currentItems = await computeAlertItems();
  alertCallback?.(currentItems);
  await updateBadge(currentItems);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function computeAlertItems(): Promise<NotifierItem[]> {
  const [cards, allPayments, expenses, paidRecords] = await Promise.all([
    getDebtAccounts(),
    getDebtPayments(),
    getExpenses(),
    getExpensePaidRecords(),
  ]);

  const items: NotifierItem[] = [];

  // Debt payment statuses
  cards
    .filter((c) => c.balance > 0 && computeMinPayment(c) != null)
    .forEach((c) => {
      const payments = allPayments.filter((p) => p.accountId === c.id);
      const { currentMonth, dueDayThisMonth } = computePaymentStatus(c, payments);
      if (currentMonth === 'past-due') {
        items.push({ text: `💳 ${c.name} — PAST DUE`, route: '/debt', severity: 'critical', dueDate: dueDayThisMonth });
      } else if (currentMonth === 'due-soon') {
        items.push({ text: `💳 ${c.name} — DUE SOON`, route: '/debt', severity: 'warning', dueDate: dueDayThisMonth });
      }
    });

  // Bill statuses
  expenses
    .filter((e) => e.recurring && !!e.dueDay)
    .forEach((e) => {
      const { status, dueDayThisMonth } = computeBillStatus(e);
      if (status === 'past-due') {
        items.push({ text: `🧾 ${e.description} — PAST DUE`, route: '/expenses', severity: 'critical', dueDate: dueDayThisMonth });
      } else if (status === 'due-soon') {
        items.push({ text: `🧾 ${e.description} — DUE SOON`, route: '/expenses', severity: 'warning', dueDate: dueDayThisMonth });
      }
    });

  // Threshold overage trends — flag bills that consistently exceed their target
  const sixMonthsAgo = Date.now() - 183 * 24 * 60 * 60 * 1000;
  expenses
    .filter((e) => e.recurring && e.threshold != null && e.threshold > 0)
    .forEach((e) => {
      const recent = paidRecords
        .filter((r) => r.expenseId === e.id && r.date >= sixMonthsAgo)
        .sort((a, b) => b.date - a.date)
        .slice(0, 6);
      if (recent.length < 2) return;
      const overCount = recent.filter((r) => r.amount > e.threshold!).length;
      if (overCount >= 3 || (recent.length >= 2 && overCount === recent.length)) {
        const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
        items.push({
          text: `📈 ${e.description} — over ${fmt.format(e.threshold!)} target ${overCount}× recently`,
          route: '/expenses',
          severity: 'warning',
        });
      }
    });

  // Critical first, then warnings; within each severity sort by due date ascending (most overdue first)
  return items.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity);
  });
}

// Returns overage trend info for a specific expense — used by the mark-paid flow
export async function getOverageTrend(expenseId: string, threshold: number): Promise<number> {
  const sixMonthsAgo = Date.now() - 183 * 24 * 60 * 60 * 1000;
  const recent = await getExpensePaidRecords(expenseId);
  return recent
    .filter((r) => r.date >= sixMonthsAgo)
    .slice(0, 6)
    .filter((r) => r.amount > threshold).length;
}

async function updateBadge(items: NotifierItem[]): Promise<void> {
  try {
    if (items.length === 0) {
      await browser.action.setBadgeText({ text: '' });
      return;
    }
    const hasCritical = items.some((i) => i.severity === 'critical');
    await browser.action.setBadgeText({ text: '!' });
    await browser.action.setBadgeBackgroundColor({ color: hasCritical ? '#dc2626' : '#f59e0b' });
  } catch {
    // browser.action unavailable in some extension contexts
  }
}
