import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activateSettingsWindow } from '../src/settings-window';

const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));

test('settings activation waits for menu dismissal and restores before showing and focusing', async () => {
  const events = ['menu dismissed'];
  activateSettingsWindow({
    isDestroyed: () => false, isMinimized: () => true,
    restore: () => events.push('restored'), show: () => events.push('shown'), focus: () => events.push('focused'),
  });
  assert.deepEqual(events, ['menu dismissed']);
  events.push('menu focus released');
  await nextTurn();
  assert.deepEqual(events, ['menu dismissed', 'menu focus released', 'restored', 'shown', 'focused']);
});

test('closing settings before queued activation does not show a destroyed window', async () => {
  let destroyed = false;
  let touched = false;
  activateSettingsWindow({
    isDestroyed: () => destroyed,
    isMinimized: () => { touched = true; return false; },
    restore: () => { touched = true; }, show: () => { touched = true; }, focus: () => { touched = true; },
  });
  destroyed = true;
  await nextTurn();
  assert.equal(touched, false);
});
