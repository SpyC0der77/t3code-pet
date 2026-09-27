import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PetVisibility, FullscreenStabilizer, parseForegroundSample } from '../src/fullscreen';

test('startup stays hidden until the same window is stable for 400 ms', () => {
  const gate = new FullscreenStabilizer();
  const window = { kind: 'windowed', windowId: '100' } as const;
  assert.equal(gate.sample(window, 0), true);
  assert.equal(gate.sample(window, 399), true);
  assert.equal(gate.sample(window, 400), false);
});
test('rapid Alt+Tab between a game, switcher, and normal windows never briefly reveals', () => {
  const gate = new FullscreenStabilizer();
  for (const [kind, windowId, time] of [
    ['fullscreen', 'game', 0], ['transition', '0', 100], ['windowed', 'editor', 200],
    ['transition', '0', 300], ['fullscreen', 'game', 400], ['windowed', 'editor', 500],
    ['windowed', 'browser', 700], ['windowed', 'browser', 1000],
  ] as const) assert.equal(gate.sample({kind, windowId}, time), true);
  assert.equal(gate.sample({ kind: 'windowed', windowId: 'browser' }, 1100), false);
});
test('a new fullscreen sample cancels a pending reveal without a stale timer', () => {
  const gate = new FullscreenStabilizer();
  gate.sample({ kind: 'windowed', windowId: 'editor' }, 0);
  assert.equal(gate.sample({ kind: 'fullscreen', windowId: 'game' }, 399), true);
  assert.equal(gate.sample({ kind: 'fullscreen', windowId: 'game' }, 900), true);
  assert.equal(gate.sample({ kind: 'windowed', windowId: 'editor' }, 1000), true);
  assert.equal(gate.sample({ kind: 'windowed', windowId: 'editor' }, 1400), false);
});
test('the switcher preserves visible state until a real fullscreen window is selected', () => {
  const gate = new FullscreenStabilizer();
  gate.sample({ kind: 'windowed', windowId: 'editor' }, 0);
  gate.sample({ kind: 'windowed', windowId: 'editor' }, 400);
  assert.equal(gate.sample({ kind: 'transition', windowId: '0' }, 401), false);
  assert.equal(gate.sample({ kind: 'transition', windowId: '0' }, 900), false);
  assert.equal(gate.sample({ kind: 'windowed', windowId: 'editor' }, 1000), false);
  assert.equal(gate.sample({ kind: 'fullscreen', windowId: 'game' }, 1400), true);
});
test('pet focus preserves visibility while dragging and never reveals a hidden pet', () => {
  const gate = new FullscreenStabilizer();
  assert.equal(gate.sample({ kind: 'pet', windowId: 'pet' }, 0), true);
  gate.sample({ kind: 'windowed', windowId: 'editor' }, 100);
  gate.sample({ kind: 'windowed', windowId: 'editor' }, 500);
  assert.equal(gate.sample({ kind: 'pet', windowId: 'pet' }, 600), false);
});
test('repeated samples of the same window cannot hide a visible pet', () => {
  const gate = new FullscreenStabilizer();
  const window = { kind: 'windowed', windowId: 'editor' } as const;
  gate.sample(window, 0);
  gate.sample(window, 400);
  for (let time = 500; time < 5000; time += 100) {
    assert.equal(gate.sample(window, time), false);
  }
});
test('native protocol keeps window identity and rejects malformed samples', () => {
  assert.deepEqual(parseForegroundSample('0:123'), { kind: 'windowed', windowId: '123' });
  assert.deepEqual(parseForegroundSample('?:0'), { kind: 'transition', windowId: '0' });
  assert.deepEqual(parseForegroundSample('S:123'), { kind: 'pet', windowId: '123' });
  assert.equal(parseForegroundSample('0:undefined'), null);
  assert.equal(parseForegroundSample('1'), null);
});

test('foreground fullscreen hides the pet and leaving restores it', () => {
  const visibility = new PetVisibility(); assert.equal(visibility.visible, true);
  visibility.fullscreen = true; assert.equal(visibility.visible, false);
  visibility.fullscreen = false; assert.equal(visibility.visible, true);
});
test('manual hiding survives a fullscreen cycle', () => {
  const visibility = new PetVisibility(); visibility.manualHidden = true;
  visibility.fullscreen = true; visibility.fullscreen = false;
  assert.equal(visibility.visible, false);
});
test('asking to show the pet cannot override foreground fullscreen', () => {
  const visibility = new PetVisibility(); visibility.fullscreen = true;
  visibility.manualHidden = true; visibility.manualHidden = false;
  assert.equal(visibility.visible, false);
});
test('native geometry handles secondary monitors and excludes work-area-only windows', { skip: process.platform !== 'win32' }, () => {
  const result = execFileSync(resolve('dist/native/foreground-monitor.exe'), ['--self-test'], { encoding: 'utf8', windowsHide: true });
  assert.match(result, /checks passed/);
});

