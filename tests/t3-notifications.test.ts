import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectNotifications, migrateNotifications, consentedSwitch } from '../src/t3-notifications';

function fixture(t: { after(fn: () => void): void }, value: unknown) {
  const folder = mkdtempSync(join(tmpdir(), 't3pet-notifications-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const path = join(folder, 'client-settings.json');
  writeFileSync(path, JSON.stringify(value));
  return { folder, path };
}
test('detects current and wrapped legacy preferences without writes', t => {
  for (const mode of ['off', 'notifications', 'sound', 'notifications-and-sound']) {
    const f = fixture(t, { settings: { notificationMode: mode } });
    const before = readFileSync(f.path);
    assert.equal(inspectNotifications(f.folder).status, mode === 'off' ? 'off' : 'enabled');
    assert.deepEqual(readFileSync(f.path), before);
  }
});
test('unknown versions and malformed settings never get overwritten', async t => {
  const f = fixture(t, { notificationMode: 'future-mode' });
  const before = readFileSync(f.path);
  assert.equal(inspectNotifications(f.folder).status, 'unknown');
  await assert.rejects(migrateNotifications(f.folder, f.folder, () => assert.fail(), async () => false), /Unsupported/);
  assert.deepEqual(readFileSync(f.path), before);
  writeFileSync(f.path, 'invalid');
  assert.equal(inspectNotifications(f.folder).status, 'unknown');
});
test('migration waits for process exit and preserves unrelated preferences', async t => {
  const original = { settings: { notificationMode: 'notifications-and-sound', inAppNotificationsEnabled: true, favorites: [{ model: 'example' }], futureSetting: { value: 42 } }, version: 8 };
  const f = fixture(t, original);
  const before = readFileSync(f.path, 'utf8');
  assert.equal(await migrateNotifications(f.folder, f.folder, () => assert.fail(), async () => true), 'waiting');
  assert.equal(readFileSync(f.path, 'utf8'), before);
  let sound: boolean | undefined;
  assert.equal(await migrateNotifications(f.folder, f.folder, value => { sound = value; }, async () => false), 'complete');
  assert.equal(sound, true);
  assert.deepEqual(JSON.parse(readFileSync(f.path, 'utf8')), { ...original, settings: { ...original.settings, notificationMode: 'off' } });
  const backup = readdirSync(f.folder).find(n => n.startsWith('t3-notifications-'))!;
  assert.equal(readFileSync(join(f.folder, backup), 'utf8'), before);
});
test('failed Pet save rolls back T3 preferences exactly', async t => {
  const f = fixture(t, { notificationMode: 'notifications', futureSetting: 'unchanged' });
  const before = readFileSync(f.path, 'utf8');
  await assert.rejects(migrateNotifications(f.folder, f.folder, () => { throw new Error('disk full'); }, async () => false), /disk full/);
  assert.equal(readFileSync(f.path, 'utf8'), before);
});
test('concurrent file edits or a restarted T3 prevent migration', async t => {
  const f = fixture(t, { notificationMode: 'notifications' });
  let checks = 0;
  await assert.rejects(migrateNotifications(f.folder, f.folder, () => assert.fail(), async () => {
    if (++checks === 2) writeFileSync(f.path, JSON.stringify({ notificationMode: 'sound', newerSetting: true }));
    return false;
  }), /changed during setup/);
  assert.equal(JSON.parse(readFileSync(f.path, 'utf8')).newerSetting, true);
});
test('declining close permission performs no close or settings mutations', async () => {
  const result = await consentedSwitch(async () => false, async () => assert.fail('closed without consent'), async () => { assert.fail('migrated without consent'); return 'complete'; });
  assert.equal(result, 'cancelled');
});
test('approved close must succeed before migration; refused exit leaves settings alone', async () => {
  const actions: string[] = [];
  await assert.rejects(consentedSwitch(async () => true, async () => { throw new Error('still open'); }, async () => { assert.fail(); return 'complete'; }), /still open/);
  assert.equal(await consentedSwitch(async () => { actions.push('consent'); return true; }, async () => { actions.push('close'); }, async () => { actions.push('migrate'); return 'complete'; }), 'complete');
  assert.deepEqual(actions, ['consent', 'close', 'migrate']);
  await assert.rejects(consentedSwitch(async () => true, async () => {}, async () => 'waiting'), /still closing/);
});
