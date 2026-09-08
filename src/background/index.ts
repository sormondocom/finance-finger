import browser from 'webextension-polyfill';
import { takeSnapshot } from '@/utils/snapshot';

browser.action.onClicked.addListener(() => {
  browser.tabs.create({ url: browser.runtime.getURL('src/app/index.html') });
});

// Register the repeating snapshot alarm on first install (alarm persists across SW restarts).
browser.runtime.onInstalled.addListener(async () => {
  const existing = await browser.alarms.get('ff-auto-snapshot');
  if (!existing) {
    await browser.alarms.create('ff-auto-snapshot', { periodInMinutes: 30 });
  }
});

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'ff-auto-snapshot') return;
  const result = await browser.storage.local.get('vaultConfig');
  const config = result['vaultConfig'] as { setupComplete?: boolean } | undefined;
  if (!config?.setupComplete) return;
  try {
    await takeSnapshot('Auto');
  } catch {
    // Swallow — DB may be mid-transaction or extension freshly installed
  }
});
