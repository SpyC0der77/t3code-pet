import { BrowserWindow, screen, type WebContents } from 'electron';
import { join } from 'node:path';
import type { ChatNotification } from './notifications';
import type { UiTheme } from './t3-theme';
import type { Snapshot } from './shared';
import { ToastState } from './toast-state';
import { toastPlacement, type ToastRect } from './toast-layout';

export interface ToastView {
  entries: { id: number; notice: ChatNotification; test: boolean }[];
  theme: UiTheme;
  side: 'left' | 'right';
  vertical: 'top' | 'bottom';
  cardLeft: number;
  anchor: number;
}
// One compositor owns the cards, gestures, and stack motion. Native bounds stay
// fixed for this stack's lifetime; transparent space passes through to desktop.
export class ToastWindows {
  readonly state = new ToastState();
  readonly windows = new Map<number, BrowserWindow>();
  pointerTracking = true;
  private window: BrowserWindow | null = null;
  private ready = false;
  private placement?: ReturnType<typeof toastPlacement>;
  private ticker?: ReturnType<typeof setInterval>;
  private closing?: ReturnType<typeof setTimeout>;
  private hitAreas: ToastRect[] = [];
  private inside = false;
  private paused = false;
  private captured = false;

  constructor(private pet: () => BrowserWindow | null, private theme: () => UiTheme,
    private open: (threadId: string, test: boolean) => Promise<void>, private failure: (error: unknown) => void) {}

  show(notice: ChatNotification, test = false) {
    if (this.closing) clearTimeout(this.closing);
    this.closing = undefined;
    const entry = this.state.add(notice, test);
    this.state.pause(entry.id, !this.ready || this.paused);
    const win = this.prepare();
    this.sync();
    if (!this.ticker) this.ticker = setInterval(() => {
      const count = this.state.entries.length;
      this.state.expire();
      if (count !== this.state.entries.length) this.sync();
      this.checkPointer();
    }, 40);
    return win;
  }
  private prepare() {
    if (this.window && !this.window.isDestroyed()) return this.window;
    const candidate = this.pet();
    const bounds = candidate && !candidate.isDestroyed() ? candidate.getBounds() : undefined;
    const area = bounds ? screen.getDisplayMatching(bounds).workArea : screen.getPrimaryDisplay().workArea;
    this.placement = toastPlacement(area, bounds);
    const win = new BrowserWindow({ ...this.placement.bounds, show: false, frame: false,
      transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false,
      minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
      webPreferences: { preload: join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    this.window = win;
    win.setMenu(null);
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    win.setIgnoreMouseEvents(true, { forward: true });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    win.on('closed', () => {
      if (this.window !== win) return;
      this.window = null; this.ready = false; this.windows.clear(); this.state.clear();
      this.hitAreas = []; this.inside = false; this.paused = false; this.captured = false;
      if (this.ticker) clearInterval(this.ticker);
      this.ticker = undefined;
    });
    void win.loadFile(join(__dirname, 'renderer', 'notification.html')).then(() => {
      if (win.isDestroyed()) return;
      this.ready = true; this.publish(); win.showInactive();
      for (const entry of this.state.entries) this.state.pause(entry.id, this.paused);
    }).catch(error => { if (!win.isDestroyed() && this.window === win) { this.clear(); this.failure(error); } });
    return win;
  }
  isSender(sender: WebContents) { return !!this.window && !this.window.isDestroyed() && this.window.webContents === sender; }
  entryFor(sender: WebContents, id?: number) {
    if (!this.isSender(sender)) return;
    return id === undefined ? this.state.entries.at(-1) : this.state.entries.find(entry => entry.id === id);
  }
  view(sender: WebContents): ToastView {
    if (!this.isSender(sender) || !this.placement) throw new Error('Unknown notification window.');
    return { entries: this.state.entries.map(({ id, notice, test }) => ({ id, notice, test })),
      theme: this.theme(), side: this.placement.side, vertical: this.placement.vertical,
      cardLeft: this.placement.cardLeft, anchor: this.placement.anchor };
  }
  async activate(sender: WebContents, id: number) {
    const entry = this.entryFor(sender, id);
    if (!entry) throw new Error('This notification has expired.');
    await this.open(entry.notice.threadId, entry.test);
    this.dismiss(id);
  }
  dismiss(id: number) { this.state.dismiss(id); this.sync(); }
  reconcile(snapshot: Snapshot) { const count = this.state.entries.length; this.state.reconcile(snapshot); if (count !== this.state.entries.length) this.sync(); }
  pause(sender: WebContents, paused: boolean) {
    if (!this.isSender(sender)) return;
    this.paused = paused;
    for (const entry of this.state.entries) this.state.pause(entry.id, paused);
  }
  hitTest(sender: WebContents, areas: ToastRect[]) {
    if (!this.isSender(sender)) return;
    this.hitAreas = areas;
    this.checkPointer();
  }
  capture(sender: WebContents, active: boolean) {
    if (!this.isSender(sender)) return;
    this.captured = active;
    if (active) this.window!.setIgnoreMouseEvents(false);
    else this.checkPointer();
  }
  private checkPointer() {
    const win = this.window;
    if (this.captured || !this.pointerTracking || !win || win.isDestroyed() || !this.ready) return;
    const point = screen.getCursorScreenPoint(), bounds = win.getBounds();
    const inside = this.hitAreas.some(r => point.x >= bounds.x + r.x && point.x < bounds.x + r.x + r.width &&
      point.y >= bounds.y + r.y && point.y < bounds.y + r.y + r.height);
    if (inside === this.inside) return;
    this.inside = inside;
    win.setIgnoreMouseEvents(!inside, { forward: true });
    win.webContents.send('toast:pointer', inside);
  }
  publish() {
    if (this.ready && this.window && !this.window.isDestroyed()) this.window.webContents.send('toast:update', this.view(this.window.webContents));
  }
  position() {
    if (!this.window || this.window.isDestroyed() || !this.placement) return;
    const bounds = this.window.getBounds();
    const fits = screen.getAllDisplays().some(({ workArea: a }) => bounds.x >= a.x && bounds.y >= a.y && bounds.x + bounds.width <= a.x + a.width && bounds.y + bounds.height <= a.y + a.height);
    if (fits) return;
    const pet = this.pet()?.getBounds();
    const area = pet ? screen.getDisplayMatching(pet).workArea : screen.getPrimaryDisplay().workArea;
    this.placement = toastPlacement(area, pet);
    this.window.setBounds(this.placement.bounds);
    this.publish();
  }
  private sync() {
    this.windows.clear();
    if (this.window) for (const entry of this.state.entries) this.windows.set(entry.id, this.window);
    this.publish();
    if (!this.state.entries.length && !this.closing) this.closing = setTimeout(() => {
      this.closing = undefined;
      if (!this.state.entries.length) this.clear();
    }, 550);
  }
  clear() {
    if (this.closing) clearTimeout(this.closing);
    this.closing = undefined;
    this.state.clear(); this.windows.clear();
    this.window?.destroy();
  }
}
