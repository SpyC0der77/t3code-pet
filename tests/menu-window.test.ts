import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import type { PetMenu, PetMenuView } from '../src/pet-menu';

const source = buildSync({ entryPoints: ['src/pet-menu.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['electron'] }).outputFiles[0].text;

function fixture() {
  let menu: PetMenu;
  const windows: Window[] = [];
  class Window {
    skipTaskbar: boolean;
    focusable: boolean;
    focused = false;
    ignored = true;
    destroyed = false;
    calls: string[] = [];
    bounds = { x: 0, y: 0, width: 264, height: 320 };
    events = new Map<string, () => void>();
    webContents = {
      setWindowOpenHandler() {}, on() {},
      session: { setPermissionRequestHandler() {} },
      send: (channel: string, value: PetMenuView) => {
        if (channel === 'menu:update') queueMicrotask(() => menu.painted(value.sequence, JSON.stringify(value.layout)));
      },
    };
    constructor(options: { skipTaskbar: boolean; focusable: boolean }) {
      this.skipTaskbar = options.skipTaskbar; this.focusable = options.focusable;
      windows.push(this);
    }
    setMenu() {} setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {}
    setIgnoreMouseEvents(value: boolean) { this.ignored = value; this.calls.push(`ignored:${value}`); }
    on(event: string, callback: () => void) { this.events.set(event, callback); }
    isDestroyed() { return this.destroyed; }
    isFocused() { return this.focused; }
    getBounds() { return this.bounds; }
    setBounds(bounds: typeof this.bounds) { this.bounds = bounds; }
    async loadFile() {}
    showInactive() { assert.equal(this.skipTaskbar, true, 'compositor warmup must skip taskbar'); }
    setFocusable(value: boolean) {
      this.focusable = value;
      // Reproduce Electron's Windows side effect, rather than treating the
      // constructor's skipTaskbar option as a permanent guarantee.
      this.skipTaskbar = !value;
      this.calls.push(`focusable:${value}`);
    }
    setSkipTaskbar(value: boolean) { this.skipTaskbar = value; this.calls.push(`skipTaskbar:${value}`); }
    focus() { this.focused = true; assert.equal(this.ignored, false, 'first native click must be accepted before focus'); assert.equal(this.skipTaskbar, true, 'menu must skip taskbar before taking focus'); this.calls.push('focus'); }
    destroy() { this.destroyed = true; this.events.get('closed')?.(); }
  }
  const module = { exports: {} as { PetMenu: typeof PetMenu } };
  const require = createRequire(import.meta.url);
  runInNewContext(source, { module, exports: module.exports, __dirname: 'dist',
    require: (name: string) => name === 'electron' ? { BrowserWindow: Window,
      screen: { getCursorScreenPoint: () => ({ x: 100, y: 100 }),
        getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) } } : require(name),
    setTimeout, clearTimeout, setInterval, clearInterval });
  menu = new module.exports.PetMenu(() => ({} as ReturnType<PetMenu['view']>), () => {});
  return { menu, windows };
}

test('menu stays out of taskbar through warmup, keyboard focus, dismissal and repeated openings', async t => {
  const { menu, windows } = fixture();
  t.after(() => menu.dispose());
  for (let opening = 0; opening < 3; opening++) {
    await menu.show();
    const win = windows[0];
    assert.equal(windows.length, 1, 'reuse the warm compositor');
    assert.equal(menu.visible, true);
    assert.equal(win.focusable, true, 'keep keyboard navigation available');
    assert.equal(win.skipTaskbar, true);
    assert.equal(win.ignored, false, 'visible menu accepts input without a cursor poll');
    assert.deepEqual(win.calls.slice(-4), ['focusable:true', 'skipTaskbar:true', 'ignored:false', 'focus']);
    menu.hide();
    assert.equal(menu.visible, false);
    assert.equal(win.focusable, false);
    assert.equal(win.ignored, true, 'hidden canvas passes input through');
    assert.equal(win.skipTaskbar, true, 'hidden compositor must skip taskbar');
    assert.deepEqual(win.calls.slice(-3), ['focusable:false', 'skipTaskbar:true', 'ignored:true'], 'restore click-through after native focusability changes');
  }
});

test('transient Windows deactivation does not discard the first click', async t => {
  const { menu, windows } = fixture();
  t.after(() => menu.dispose());
  await menu.show();
  const win = windows[0];
  win.focused = false;
  win.events.get('blur')?.();
  assert.equal(menu.visible, true, 'keep the row present while native activation delivers the click');
  win.focused = true;
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(menu.visible, true, 'a recovered focus keeps the menu open');
  win.focused = false;
  win.events.get('blur')?.();
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(menu.visible, false, 'a genuine focus loss still dismisses it');
});

test('recreated menu applies the same taskbar policy after its native window closes', async t => {
  const { menu, windows } = fixture();
  t.after(() => menu.dispose());
  await menu.show();
  windows[0].destroy();
  assert.equal(menu.visible, false);
  await menu.show();
  assert.equal(windows.length, 2);
  assert.equal(windows[1].skipTaskbar, true);
  assert.equal(windows[1].focusable, true);
});
