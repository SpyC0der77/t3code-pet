import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import type { HoverPanel } from '../src/hover-panel';

const source = buildSync({ entryPoints: ['src/hover-panel.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['electron'] }).outputFiles[0].text;

function fixture() {
  let finishLoading!: () => void;
  let allowed = true;
  const windows: Window[] = [];
  class Window {
    visible = false;
    destroyed = false;
    bounds = { x: 0, y: 0, width: 300, height: 250 };
    events = new Map<string, () => void>();
    webContents = { setWindowOpenHandler() {}, on() {}, send() {} };
    constructor() { windows.push(this); }
    setMenu() {}
    on(event: string, callback: () => void) { this.events.set(event, callback); }
    once(event: string, callback: () => void) { this.events.set(event, callback); }
    loadFile() { return new Promise<void>(resolve => { finishLoading = resolve; }); }
    isDestroyed() { return this.destroyed; }
    isVisible() { return this.visible; }
    setBounds(bounds: typeof this.bounds) { this.bounds = bounds; }
    getBounds() { return this.bounds; }
    showInactive() { this.visible = true; }
    hide() { this.visible = false; }
    destroy() { this.destroyed = true; this.events.get('closed')?.(); }
  }
  const module = { exports: {} as { HoverPanel: typeof HoverPanel } };
  const require = createRequire(import.meta.url);
  runInNewContext(source, { module, exports: module.exports, __dirname: 'dist',
    require: (name: string) => name === 'electron' ? { BrowserWindow: Window,
      screen: { getCursorScreenPoint: () => ({ x: 100, y: 100 }),
        getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) } } : require(name),
    setInterval, clearInterval });
  const pet = { getBounds: () => ({ x: 50, y: 50, width: 210, height: 206 }) };
  const panel = new module.exports.HoverPanel(() => pet as never, () => ({} as never), () => allowed);
  return { panel, windows, finish: () => finishLoading(), block: () => { allowed = false; } };
}

test('first hover opens a loaded hidden window without relying on ready-to-show', async t => {
  const { panel, windows, finish } = fixture();
  t.after(() => panel.dispose());
  panel.show();
  assert.equal(windows[0].visible, false);
  finish();
  await panel.prepare();
  assert.equal(windows[0].visible, true);
  panel.hide();
  panel.show();
  assert.equal(windows[0].visible, true, 'subsequent hover reuses the loaded panel');
});

test('warmup stays hidden and a cancelled hover cannot reopen after loading', async t => {
  const { panel, windows, finish, block } = fixture();
  t.after(() => panel.dispose());
  const loaded = panel.prepare();
  panel.show();
  panel.hide();
  finish();
  await loaded;
  assert.equal(windows[0].visible, false);
  block();
  panel.show();
  assert.equal(windows[0].visible, false);
});
