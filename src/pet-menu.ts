import { BrowserWindow, screen, type WebContents } from 'electron';
import { join } from 'node:path';
import type { AppState, PetMood } from './shared';
import { menuPlacement } from './menu-layout';

export type MenuAction = 'visibility' | 'settings' | 'notifications' | 'preview' | 'reset' | 'quit';
export interface PetMenuData { state: AppState; hidden: boolean; previewMood: PetMood | null; }
export interface PetMenuView extends PetMenuData { layout: ReturnType<typeof menuPlacement>; sequence: number; }
export class PetMenu {
  window: BrowserWindow | null = null;
  private loading?: Promise<void>;
  private point = { x: 0, y: 0 };
  private area = { x: 0, y: 0, width: 1920, height: 1080 };
  private heights = { main: 320, sub: 0, top: 0 };
  private requested = false;
  private ready = false;
  private sequence = 0;
  private opening?: { sequence: number; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; revealing?: boolean };
  private blurTimer?: ReturnType<typeof setTimeout>;
  private pointerTimer?: ReturnType<typeof setInterval>;
  private interactive = false;
  constructor(private data: () => PetMenuData, private action: (action: MenuAction, mood: PetMood | null) => void) {}
  get visible() { return this.requested; }
  private prepare() {
    if (this.window && !this.window.isDestroyed()) return this.loading!;
    const win = this.window = new BrowserWindow({ width: 264, height: 320, frame: false, show: false,
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      // Linux needs a focusable native window at creation. Hide it between
      // openings instead of leaving a focusable empty canvas.
      skipTaskbar: true, alwaysOnTop: true, focusable: process.platform === 'linux', transparent: true, backgroundColor: '#00000000', hasShadow: false,
      webPreferences: { preload: join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    win.setMenu(null); win.setAlwaysOnTop(true, 'pop-up-menu');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    win.on('blur', () => {
      if (this.blurTimer) clearTimeout(this.blurTimer);
      // Windows can briefly deactivate a transparent popup during mouse
      // activation. Let the click finish before dismissing an unfocused menu.
      this.blurTimer = setTimeout(() => {
        this.blurTimer = undefined;
        if (this.requested && !this.opening && !win.isDestroyed() && !win.isFocused()) this.hide();
      }, 150);
    });
    win.on('closed', () => { this.hide(); this.window = null; this.ready = false; this.loading = undefined; });
    win.setIgnoreMouseEvents(true, {forward:true});
    this.loading = win.loadFile(join(__dirname, 'renderer', 'menu.html')).then(async () => {
      this.ready = true;
      // Warm the native compositor with an empty, non-interactive canvas.
      // Menu openings reveal HTML, avoiding Windows' popup show/hide fade.
      win.showInactive();
      await new Promise(resolve => setTimeout(resolve, 200));
    });
    return this.loading;
  }
  async show(point = screen.getCursorScreenPoint()) {
    this.hide();
    this.requested = true; this.point = point;
    this.area = screen.getDisplayNearestPoint(point).workArea;
    this.heights.sub = 0; this.sequence++;
    const sequence = this.sequence;
    await this.prepare();
    if (!this.requested || !this.window || sequence !== this.sequence) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { if (this.opening?.sequence !== sequence) return; this.opening = undefined; this.hide(); reject(new Error('Menu layout did not become ready.')); }, 3000);
      this.opening = { sequence, resolve, reject, timer };
      this.position(); this.publish();
    });
  }
  painted(sequence: number, layout: string) {
    if (!this.opening || this.opening.revealing || this.opening.sequence !== sequence || !this.requested || !this.window || layout !== JSON.stringify(this.view().layout)) return;
    const opening = this.opening, win = this.window;
    opening.revealing = true;
    void this.reveal(opening, win);
  }
  private async reveal(opening: NonNullable<PetMenu['opening']>, win: BrowserWindow) {
    if (process.platform === 'linux') {
      // X11 window managers can reposition a newly mapped window before
      // acknowledging Electron's requested bounds. Keep the HTML hidden
      // through mapping and focus, and reveal only after bounds settle.
      win.setFocusable(true);
      win.setSkipTaskbar(true);
      if (!win.isVisible()) win.showInactive();
      win.focus();
      const deadline = Date.now() + 500;
      let stableSince = Date.now(), last = JSON.stringify(win.getBounds());
      let corrected = false;
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 20));
        if (win.isDestroyed() || this.opening !== opening || !this.requested) return;
        const bounds = JSON.stringify(win.getBounds());
        if (bounds !== last) stableSince = Date.now();
        last = bounds;
        if (Date.now() - stableSince < 80) continue;
        if (bounds === JSON.stringify(this.view().layout.bounds)) {
          if (win.isFocused()) break;
        } else if (!corrected) {
          // Correct placement once after native mapping has stopped moving.
          // Give the window manager time to acknowledge that request.
          corrected = true;
          this.position();
          last = JSON.stringify(win.getBounds()); stableSince = Date.now();
        }
      }
      if (!win.isFocused() || Date.now() - stableSince < 80 || JSON.stringify(win.getBounds()) !== JSON.stringify(this.view().layout.bounds)) {
        this.opening = undefined; clearTimeout(opening.timer);
        this.hide();
        opening.reject(new Error('Menu window did not settle or receive focus.'));
        return;
      }
    }
    if (this.opening !== opening || win.isDestroyed() || !this.requested) return;
    this.opening = undefined; clearTimeout(opening.timer);
    win.setFocusable(true);
    // On Windows, changing focusability resets the native taskbar policy.
    // Restore it before focusing so keyboard navigation has no taskbar entry.
    win.setSkipTaskbar(true);
    this.checkPointer();
    this.pointerTimer = setInterval(() => this.checkPointer(), 10);
    win.webContents.send('menu:visible', true);
    if (!win.isVisible()) win.showInactive();
    if (process.platform !== 'linux') win.focus();
    opening.resolve();
  }
  isSender(sender: WebContents) { return !!this.window && !this.window.isDestroyed() && this.window.webContents === sender; }
  checkPointer() {
    if (!this.requested || this.opening || !this.window || this.window.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint(), layout = menuPlacement(this.area, this.point, this.heights);
    const x = cursor.x - layout.bounds.x, y = cursor.y - layout.bounds.y;
    const panels = layout.stacked && layout.sub ? [layout.sub] : [layout.main, layout.sub];
    const inside = panels.some(rect => rect && x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height);
    if (inside === this.interactive) return;
    this.interactive = inside;
    this.window.setIgnoreMouseEvents(!inside, { forward: true });
  }
  view(): PetMenuView { return { ...this.data(), layout: menuPlacement(this.area, this.point, this.heights), sequence: this.sequence }; }
  resize(main: number, sub: number, top: number) {
    if (!this.requested) return;
    const next = { main: Math.ceil(main), sub: Math.ceil(sub), top: Math.ceil(top) };
    if (JSON.stringify(next) === JSON.stringify(this.heights)) return;
    this.heights = next; this.position(); this.publish(); this.checkPointer();
  }
  private position() {
    if (!this.window) return;
    const next = this.view().layout.bounds, current = this.window.getBounds();
    if (next.x !== current.x || next.y !== current.y || next.width !== current.width || next.height !== current.height) this.window.setBounds(next);
  }
  publish() { if (this.ready && this.requested) this.window?.webContents.send('menu:update', this.view()); }
  activate(action: MenuAction, mood: PetMood | null) { this.hide(); this.action(action, mood); }
  hide() {
    if (this.blurTimer) clearTimeout(this.blurTimer);
    this.blurTimer = undefined;
    this.requested = false;
    if (this.pointerTimer) clearInterval(this.pointerTimer);
    this.pointerTimer = undefined; this.interactive = false;
    if (this.opening) { clearTimeout(this.opening.timer); this.opening.resolve(); this.opening = undefined; }
    if (this.window && !this.window.isDestroyed()) {
      if(this.ready) this.window.webContents.send('menu:visible', false);
      this.window.setFocusable(false);
      this.window.setSkipTaskbar(true);
      this.window.setIgnoreMouseEvents(true, {forward:true});
      if (process.platform === 'linux') this.window.hide();
    }
  }
  dispose() { this.hide(); this.window?.destroy(); }
}
