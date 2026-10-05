import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';
import type { PetMenu, PetMenuView } from '../src/pet-menu';

const source = buildSync({ entryPoints: ['src/pet-menu.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['electron'] }).outputFiles[0].text;

function fixture(platform: NodeJS.Platform = 'win32', shiftOnMap = false) {
  let menu: PetMenu;
  const windows: Window[] = [];
  const cursor = { x: 100, y: 100 };
  class Window {
    skipTaskbar: boolean;
    focusable: boolean;
    focused = false;
    visible = false;
    ignored = true;
    destroyed = false;
    contentVisible = false;
    shiftedWhileVisible = false;
    calls: string[] = [];
    bounds = { x: 0, y: 0, width: 264, height: 320 };
    events = new Map<string, () => void>();
    webContents = {
      setWindowOpenHandler() {}, on() {},
      session: { setPermissionRequestHandler() {} },
      send: (channel: string, value: PetMenuView | boolean) => {
        if (channel === 'menu:update') { const view = value as PetMenuView; queueMicrotask(() => menu.painted(view.sequence, JSON.stringify(view.layout))); }
        if (channel === 'menu:visible') this.contentVisible = value === true;
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
    isVisible() { return this.visible; }
    showInactive() {
      this.visible = true; assert.equal(this.skipTaskbar, true, 'compositor warmup must skip taskbar');
      if (shiftOnMap) setTimeout(() => {
        if (this.destroyed) return;
        this.shiftedWhileVisible ||= this.contentVisible;
        this.bounds = { ...this.bounds, x: this.bounds.x - 120 };
      }, 30);
    }
    hide() { this.visible = false; this.focused = false; }
    setFocusable(value: boolean) {
      this.focusable = value;
      if (platform === 'linux') { if (!value) this.focused = false; return; }
      // Reproduce Electron's Windows side effect, rather than treating the
      // constructor's skipTaskbar option as a permanent guarantee.
      this.skipTaskbar = !value;
      this.calls.push(`focusable:${value}`);
    }
    setSkipTaskbar(value: boolean) { this.skipTaskbar = value; this.calls.push(`skipTaskbar:${value}`); }
    focus() { assert.equal(this.focusable, true, 'restore focusability before requesting native focus'); this.focused = true; if (platform !== 'linux') assert.equal(this.ignored, false, 'first native click must be accepted before focus'); assert.equal(this.skipTaskbar, true, 'menu must skip taskbar before taking focus'); this.calls.push('focus'); }
    destroy() { this.destroyed = true; this.events.get('closed')?.(); }
  }
  const module = { exports: {} as { PetMenu: typeof PetMenu } };
  const require = createRequire(import.meta.url);
  runInNewContext(source, { module, exports: module.exports, __dirname: 'dist',
    process: { platform },
    require: (name: string) => name === 'electron' ? { BrowserWindow: Window,
      screen: { getCursorScreenPoint: () => ({ ...cursor }),
        getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) } } : require(name),
    setTimeout, clearTimeout, setInterval, clearInterval });
  menu = new module.exports.PetMenu(() => ({} as ReturnType<PetMenu['view']>), () => {});
  return { menu, windows, cursor };
}

test('Windows menu stays out of taskbar through warmup, keyboard focus, dismissal and repeated openings', async t => {
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

test('only visible menu panels capture native clicks', async t => {
  const { menu, windows, cursor } = fixture();
  t.after(() => menu.dispose());
  await menu.show();
  const win = windows[0];
  const layout = menu.view().layout;
  cursor.x = layout.bounds.x + layout.main.x + 10;
  cursor.y = layout.bounds.y + 1;
  menu.checkPointer();
  assert.equal(win.ignored, true, 'transparent space passes through');
  assert.equal(win.focusable, true, 'keyboard navigation remains available');
  cursor.y = layout.bounds.y + layout.main.y + 10;
  menu.checkPointer();
  assert.equal(win.ignored, false, 'main panel receives clicks');
  menu.resize(320, 200, 80);
  const expanded = menu.view().layout;
  assert.ok(expanded.sub);
  cursor.x = expanded.bounds.x + expanded.sub.x + 10;
  cursor.y = expanded.bounds.y + expanded.sub.y + 10;
  menu.checkPointer();
  assert.equal(win.ignored, false, 'visible submenu receives clicks');
  menu.resize(320, 0, 80);
  menu.checkPointer();
  assert.equal(win.ignored, true, 'closed submenu area passes through');
});

test('Linux menu starts focusable and hides its native canvas between openings', async t => {
  const { menu, windows } = fixture('linux');
  t.after(() => menu.dispose());
  for (let opening = 0; opening < 2; opening++) {
    await menu.show();
    const win = windows[0];
    assert.equal(win.focusable, true, 'Linux opening restores focusability');
    assert.equal(win.visible, true);
    assert.equal(win.focused, true);
    menu.hide();
    assert.equal(win.visible, false, 'closed Linux menu cannot retain native focus');
    assert.equal(win.ignored, true);
  }
});

test('Linux mapping movement settles before menu content is revealed', async t => {
  const { menu, windows } = fixture('linux', true);
  t.after(() => menu.dispose());
  for (let opening = 0; opening < 2; opening++) {
    await menu.show();
    const win = windows[0];
    assert.equal(win.contentVisible, true);
    assert.equal(win.shiftedWhileVisible, false, 'mapping corrections must happen behind hidden content');
    assert.deepEqual(win.getBounds(), menu.view().layout.bounds);
    menu.hide();
    assert.equal(win.contentVisible, false);
  }
});

test('cancelling a Linux opening during mapping cannot reveal it later', async t => {
  const { menu, windows } = fixture('linux');
  t.after(() => menu.dispose());
  await menu.show(); menu.hide();
  const opening = menu.show();
  await new Promise(resolve => setTimeout(resolve, 30));
  menu.hide(); await opening;
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(windows[0].contentVisible, false);
  assert.equal(windows[0].visible, false);
});
