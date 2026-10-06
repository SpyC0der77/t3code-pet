import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alertsPaused, pauseUntil } from '../src/notification-policy';
import { defaults, loadPreferences, storePreferences, validatePreferences } from '../src/preferences';

test('pause deadlines use elapsed minutes or the next local midnight and expire automatically', () => {
  const now = new Date(2026, 9, 5, 23, 45).getTime();
  assert.equal(pauseUntil('30-minutes', now), now + 30 * 60_000);
  assert.equal(pauseUntil('1-hour', now), now + 60 * 60_000);
  assert.equal(pauseUntil('tomorrow', now), new Date(2026, 9, 6).getTime());
  assert.equal(pauseUntil('resume', now), null);
  assert.throws(() => pauseUntil('forever', now), /Choose/);
  assert.equal(alertsPaused({notificationsPausedUntil:now+1}, now), true);
  assert.equal(alertsPaused({notificationsPausedUntil:now}, now), false);
});

test('existing preferences retain all event types and pause settings persist across restarts', () => {
  const dir = mkdtempSync(join(tmpdir(), 't3pet-pause-'));
  try {
    const upgraded = validatePreferences({ notificationsEnabled:true }, defaults());
    assert.ok(upgraded.notificationAttention && upgraded.notificationCompletion && upgraded.notificationError);
    assert.equal(upgraded.notificationsPausedUntil, null);
    const saved = validatePreferences({notificationsPausedUntil:Date.now()+60_000, notificationCompletion:false}, upgraded);
    storePreferences(join(dir, 'prefs.json'), saved);
    assert.deepEqual(loadPreferences(join(dir, 'prefs.json')), saved);
    for (const value of [-1, NaN, Infinity, 'tomorrow', 0.5, 8.64e15+1]) assert.throws(() => validatePreferences({notificationsPausedUntil:value}, saved));
    assert.throws(() => validatePreferences({notificationAttention:'true'}, saved));
  } finally { rmSync(dir, {recursive:true, force:true}); }
});
