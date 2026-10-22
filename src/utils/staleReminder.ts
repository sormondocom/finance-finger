// Pure decision logic for the "haven't seen you in a while" background
// notification, extracted from src/background/index.ts so it can be unit
// tested without mocking the browser.notifications/storage APIs.

export interface StaleReminderCheck {
  shouldNudge: boolean;
  daysSince: number;
}

// Nudges once staleReminderDays have passed since lastOpenedAt, then re-nudges
// every staleReminderDays while still stale. `lastStaleNudgeAt` resets the
// cadence automatically once the user reopens the app and lastOpenedAt
// advances past it.
export function checkStaleReminder(
  now: number,
  lastOpenedAt: number | undefined,
  staleReminderDays: number,
  lastStaleNudgeAt: number | undefined,
): StaleReminderCheck {
  if (!lastOpenedAt || staleReminderDays <= 0) return { shouldNudge: false, daysSince: 0 };

  const thresholdMs = staleReminderDays * 86_400_000;
  const daysSince = Math.floor((now - lastOpenedAt) / 86_400_000);

  if (now - lastOpenedAt < thresholdMs) return { shouldNudge: false, daysSince };

  // Already nudged for this staleness episode and not due for a repeat yet.
  if (lastStaleNudgeAt && lastStaleNudgeAt > lastOpenedAt && now - lastStaleNudgeAt < thresholdMs) {
    return { shouldNudge: false, daysSince };
  }

  return { shouldNudge: true, daysSince };
}
