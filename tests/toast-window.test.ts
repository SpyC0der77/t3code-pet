import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import type { ToastWindows } from '../src/toast-windows';

const source = buildSync({ entryPoints: ['src/toast-windows.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['electron'] }).outputFiles[0].text;

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
