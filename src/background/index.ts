import browser from 'webextension-polyfill';
import { takeSnapshot } from '@/utils/snapshot';

browser.action.onClicked.addListener(async () => {
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
});
