import type { Preferences } from './shared';

export type PauseChoice = '30-minutes' | '1-hour' | 'tomorrow' | 'resume';
export function pauseUntil(choice: unknown, now = Date.now()): number | null {
  if (choice === 'resume') return null;
  if (choice === '30-minutes') return now + 30 * 60_000;
  if (choice === '1-hour') return now + 60 * 60_000;
  if (choice === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);
    return tomorrow.getTime();
  }
  throw new Error('Choose a notification pause.');
}
export function alertsPaused(preferences: Pick<Preferences, 'notificationsPausedUntil'>, now = Date.now()) {
  return (preferences.notificationsPausedUntil ?? 0) > now;
}
export function isAttention(kind: string) {
  return kind === 'Approval needed' || kind === 'Input needed';
}
export interface NotificationPolicy { attention: boolean; completion: boolean; error: boolean; paused: boolean; }
export function notificationPolicy(preferences: Preferences): NotificationPolicy {
  return { attention: preferences.notificationAttention, completion: preferences.notificationCompletion,
    error: preferences.notificationError, paused: alertsPaused(preferences) };
}
export function eventEnabled(kind: string, policy: NotificationPolicy) {
  return isAttention(kind) ? policy.attention : kind === 'Turn finished' ? policy.completion : policy.error;
}
