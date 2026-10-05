import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import type { ToastWindows } from '../src/toast-windows';

const source = buildSync({ entryPoints: ['src/toast-windows.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['electron'] }).outputFiles[0].text;

test('notification capture restores pass-through and never forwards competing cursor events', () => {
  const module = { exports: {} as { ToastWindows: new (...args: unknown[]) => ToastWindows } };
  const require = createRequire(import.meta.url);
  const cursor = { x: 50, y: 50 };
  const calls: { ignore: boolean; options: unknown }[] = [];
  const sender = { send() {} };
  runInNewContext(source, { module, exports: module.exports, __dirname: '.',
    require: (name: string) => name === 'electron' ? { screen: { getCursorScreenPoint: () => cursor } } : require(name) });
  const toasts = new module.exports.ToastWindows(() => null, () => ({}), () => {}, () => {});
  Object.assign(toasts, { ready: true, window: {
    isDestroyed: () => false, getBounds: () => ({ x: 0, y: 0 }), webContents: sender,
    setIgnoreMouseEvents: (ignore: boolean, options?: unknown) => calls.push({ ignore, options }),
  } });
  const wc = sender as unknown as Parameters<ToastWindows['hitTest']>[0];
  const area = [{ x: 40, y: 40, width: 20, height: 20 }];
  for (let i = 0; i < 20; i++) toasts.hitTest(wc, area);
  assert.deepEqual(calls.map(c => c.ignore), [false]);
  cursor.x = 100;
  toasts.capture(wc, true);
  toasts.hitTest(wc, []);
  assert.deepEqual(calls.map(c => c.ignore), [false]);
  toasts.capture(wc, false);
  assert.deepEqual(calls.map(c => c.ignore), [false, true]);
  toasts.capture(wc, true);
  toasts.capture(wc, false);
  assert.deepEqual(calls.map(c => c.ignore), [false, true, false, true]);
  assert.ok(calls.every(c => c.options === undefined));
});

test('display changes reposition notifications safely after the pet is destroyed', () => {
  const area = { x: 0, y: 0, width: 1280, height: 900 };
  const module = { exports: {} as { ToastWindows: new (...args: unknown[]) => ToastWindows } };
  const require = createRequire(import.meta.url);
  const screen = {
    getAllDisplays: () => [{ workArea: area }],
    getPrimaryDisplay: () => ({ workArea: area }),
    getDisplayMatching: () => { throw new Error('Destroyed pet must not be used.'); },
  };
  runInNewContext(source, { module, exports: module.exports, __dirname: '.',
    require: (name: string) => name === 'electron' ? { screen } : require(name) });
  const pet = { isDestroyed: () => true, getBounds: () => { throw new Error('Object has been destroyed'); } };
  const toasts = new module.exports.ToastWindows(() => pet, () => ({}), () => {}, () => {});
  let moved: typeof area | undefined;
  Object.assign(toasts, {
    window: { isDestroyed: () => false, getBounds: () => ({ ...area, x: 2000 }), setBounds: (bounds: typeof area) => { moved = bounds; } },
    placement: {},
  });
  toasts.position();
  assert.ok(moved);
  assert.ok(moved.x >= area.x && moved.y >= area.y);
  assert.ok(moved.x + moved.width <= area.width && moved.y + moved.height <= area.height);
});
