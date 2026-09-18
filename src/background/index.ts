import browser from 'webextension-polyfill';
import { takeSnapshot } from '@/utils/snapshot';

browser.action.onClicked.addListener(() => {
  void browser.tabs.create({ url: browser.runtime.getURL('src/app/index.html') });
});

// Register repeating alarms on first install (alarms persist across SW restarts).
browser.runtime.onInstalled.addListener(async () => {
  const [existingSnapshot, existingPayday] = await Promise.all([
    browser.alarms.get('ff-auto-snapshot'),
    browser.alarms.get('ff-payday-check'),
  ]);
  if (!existingSnapshot) {
    await browser.alarms.create('ff-auto-snapshot', { periodInMinutes: 30 });
  }
  if (!existingPayday) {
    // Fire once a day. The foreground does the actual recording (requires vault key);
    // the alarm sets a flag so the next popup open knows to run autoRecordPaydays().
    await browser.alarms.create('ff-payday-check', { periodInMinutes: 1440 });
  }
});

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'ff-payday-check') {
    // Signal the foreground app that a payday check is due. The background cannot
    // decrypt IndexedDB data (vault key lives only in the popup's memory), so the
    // actual bank-credit entries are written by autoRecordPaydays() on next popup open.
    await browser.storage.local.set({ pendingPaydayCheck: true });
    return;
  }

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
});
