import browser from 'webextension-polyfill';
import { takeSnapshot } from '@/utils/snapshot';
import { checkStaleReminder } from '@/utils/staleReminder';

async function focusOrOpenAppTab(): Promise<void> {
  const appUrl = browser.runtime.getURL('src/app/index.html');
  const existing = await browser.tabs.query({ url: appUrl });
  if (existing.length > 0 && existing[0]!.id != null) {
    await browser.tabs.update(existing[0]!.id, { active: true });
    if (existing[0]!.windowId != null) {
      await browser.windows.update(existing[0]!.windowId, { focused: true });
    }
  } else {
    await browser.tabs.create({ url: appUrl });
  }
}

browser.action.onClicked.addListener(() => void focusOrOpenAppTab());

const STALE_NUDGE_ID = 'ff-stale-reminder';

browser.notifications.onClicked.addListener((notificationId) => {
  if (notificationId !== STALE_NUDGE_ID) return;
  void browser.notifications.clear(notificationId);
  void focusOrOpenAppTab();
});

// Register repeating alarms on first install (alarms persist across SW restarts).
browser.runtime.onInstalled.addListener(async () => {
  const existingSnapshot = await browser.alarms.get('ff-auto-snapshot');
  if (!existingSnapshot) {
    await browser.alarms.create('ff-auto-snapshot', { periodInMinutes: 30 });
  }
  // Clear legacy daily-check alarms — autoRecordPaydays/autoRecordAutoPay now run
  // unconditionally on every popup open, so the flag-based alarm pattern is unused.
  await browser.alarms.clear('ff-payday-check');
  await browser.alarms.clear('ff-autopay-check');
});

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'ff-auto-snapshot') return;
  const result = await browser.storage.local.get('vaultConfig');
  const config = result['vaultConfig'] as { setupComplete?: boolean } | undefined;
  if (!config?.setupComplete) return;

  try {
    await takeSnapshot('Auto');
    // Clear any previously recorded error now that a snapshot succeeded.
    await browser.storage.local.remove('lastSnapshotError');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during auto-snapshot';
    await browser.storage.local.set({ lastSnapshotError: { message, time: Date.now() } });
  }

  await maybeNudgeStaleUser();
});

function getLargestIconUrl(): string {
  const icons = browser.runtime.getManifest().icons as Record<string, string> | undefined;
  if (!icons || Object.keys(icons).length === 0) return '';
  const largestSize = Object.keys(icons).map(Number).sort((a, b) => b - a)[0]!;
  return browser.runtime.getURL(icons[String(largestSize)]!);
}

// Nudges the user with a browser notification once it's been at least
// staleReminderDays since the extension was last opened (lastOpenedAt is
// stamped by src/app/main.ts on every real launch). The actual decision logic
// lives in checkStaleReminder() (src/utils/staleReminder.ts) so it can be unit
// tested without mocking the browser APIs.
async function maybeNudgeStaleUser(): Promise<void> {
  const result = await browser.storage.local.get(['lastOpenedAt', 'staleReminderDays', 'lastStaleNudgeAt']);
  const lastOpenedAt = result['lastOpenedAt'] as number | undefined;
  const staleReminderDays = (result['staleReminderDays'] as number | undefined) ?? 7;
  const lastStaleNudgeAt = result['lastStaleNudgeAt'] as number | undefined;

  const now = Date.now();
  const { shouldNudge, daysSince } = checkStaleReminder(now, lastOpenedAt, staleReminderDays, lastStaleNudgeAt);
  if (!shouldNudge) return;

  await browser.notifications.create(STALE_NUDGE_ID, {
    type: 'basic',
    iconUrl: getLargestIconUrl(),
    title: "Haven't seen you in a while",
    message: `It's been ${daysSince} day${daysSince === 1 ? '' : 's'} since you opened Financial Finger. Come catch up on paydays and bills?`,
  });
  await browser.storage.local.set({ lastStaleNudgeAt: now });
}
