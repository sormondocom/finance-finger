import { getCustomNotifications, saveCustomNotification, getExpenses } from '@/db';
import { showBellNotification } from '@/mascot/Mascot';
import type { CustomNotification, Expense } from '@/types';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function shouldFireBillBefore(notif: CustomNotification, expenses: Expense[]): boolean {
  if (!notif.expenseId || !notif.daysBefore) return false;
  const expense = expenses.find((e) => e.id === notif.expenseId);
  if (!expense?.dueDay) return false;

  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();
  const dueDay = expense.dueDay;
  const daysBefore = notif.daysBefore;

  // Find the next occurrence of dueDay on or after today
  let nextDueYear = todayYear;
  let nextDueMonth = todayMonth;
  let nextDueDay = Math.min(dueDay, daysInMonth(todayYear, todayMonth));

  if (nextDueDay < todayDay) {
    // dueDay already passed this month — roll to next month
    nextDueMonth += 1;
    if (nextDueMonth > 11) { nextDueMonth = 0; nextDueYear += 1; }
    nextDueDay = Math.min(dueDay, daysInMonth(nextDueYear, nextDueMonth));
  }

  // Compute fire date: nextDue - daysBefore calendar days
  const nextDue = new Date(nextDueYear, nextDueMonth, nextDueDay);
  const fireDate = new Date(nextDue);
  fireDate.setDate(fireDate.getDate() - daysBefore);

  return (
    today.getDate()     === fireDate.getDate() &&
    today.getMonth()    === fireDate.getMonth() &&
    today.getFullYear() === fireDate.getFullYear()
  );
}

function shouldFireMonthlyDay(notif: CustomNotification): boolean {
  if (!notif.monthlyDay) return false;
  const today = new Date();
  // Clamp to last day of month if monthlyDay > days in month
  const maxDay = daysInMonth(today.getFullYear(), today.getMonth());
  const effectiveDay = Math.min(notif.monthlyDay, maxDay);
  return today.getDate() === effectiveDay;
}

function shouldFireOneTime(notif: CustomNotification): boolean {
  if (!notif.triggerDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const trigger = new Date(notif.triggerDate);
  trigger.setHours(0, 0, 0, 0);
  // Fire on or after the trigger date (catches cases where the app wasn't open on that exact day)
  return today.getTime() >= trigger.getTime();
}

function isTimeReached(triggerTime: string | undefined): boolean {
  if (!triggerTime) return true; // no time set → fire whenever app opens
  const [hh, mm] = triggerTime.split(':').map(Number);
  const now = new Date();
  return now.getHours() > (hh ?? 0) || (now.getHours() === (hh ?? 0) && now.getMinutes() >= (mm ?? 0));
}

export async function checkAndFireNotifications(): Promise<void> {
  try {
    const [notifications, expenses] = await Promise.all([
      getCustomNotifications(),
      getExpenses(),
    ]);

    const today = todayStr();

    const toFire = notifications.filter((n) => {
      if (!n.active) return false;
      if (n.lastFiredAt === today) return false;
      if (!isTimeReached(n.triggerTime)) return false;
      switch (n.triggerType) {
        case 'bill-before': return shouldFireBillBefore(n, expenses);
        case 'monthly-day': return shouldFireMonthlyDay(n);
        case 'one-time':    return shouldFireOneTime(n);
        default:            return false;
      }
    });

    if (toFire.length === 0) return;

    // Mark all as fired before showing so a crash mid-queue doesn't double-fire
    await Promise.all(
      toFire.map((n) =>
        saveCustomNotification({ ...n, lastFiredAt: today, updatedAt: Date.now() }),
      ),
    );

    // One-time notifications deactivate themselves after firing
    const oneTimeToDeactivate = toFire.filter((n) => n.triggerType === 'one-time');
    if (oneTimeToDeactivate.length > 0) {
      await Promise.all(
        oneTimeToDeactivate.map((n) =>
          saveCustomNotification({ ...n, active: false, lastFiredAt: today, updatedAt: Date.now() }),
        ),
      );
    }

    // Show overlays sequentially — each must be dismissed before the next appears
    for (const notif of toFire) {
      await showBellNotification(notif);
    }
  } catch (err) {
    // Notification failures must never crash the app, but log so they aren't invisible
    console.error('[FinancialFinger] checkAndFireNotifications error:', err);
  }
}
