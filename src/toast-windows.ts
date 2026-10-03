import { BrowserWindow, screen, type WebContents } from 'electron';
import { join } from 'node:path';
import type { ChatNotification } from './notifications';
import type { UiTheme } from './t3-theme';
import { ToastState } from './toast-state';

export interface ToastView { notice: ChatNotification; test: boolean; theme: UiTheme; }
export class ToastWindows {
  readonly state = new ToastState();
  readonly windows = new Map<number, BrowserWindow>();
  private ticker?: ReturnType<typeof setInterval>;
  private drags = new Map<number, { bounds: Electron.Rectangle; x: number; y: number; axis?: 'x' | 'y' }>();
  private fades = new Map<number, ReturnType<typeof setTimeout>>();
  private heights = new Map<number, number>();
  constructor(private pet: () => BrowserWindow | null, private theme: () => UiTheme,
    private open: (threadId: string, test: boolean) => Promise<void>, private failure: (error: unknown) => void) {}

  show(notice: ChatNotification, test = false) {
    const entry = this.state.add(notice, test);
    this.sync();
    const win = new BrowserWindow({ width: 376, height: 96, show: false, frame: false,
      transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false,
      minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
      webPreferences: { preload: join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    this.windows.set(entry.id, win);
    win.setMenu(null);
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    win.on('closed', () => { this.windows.delete(entry.id); this.drags.delete(entry.id); this.heights.delete(entry.id); this.stopFade(entry.id); this.state.dismiss(entry.id); this.sync(); });
    void win.loadFile(join(__dirname, 'renderer', 'notification.html')).then(() => {
      if (win.isDestroyed() || !this.state.entries.includes(entry)) return;
      this.publish(); this.position(); win.showInactive();
    }).catch(error => {
      if (!this.state.entries.includes(entry)) return;
      this.dismiss(entry.id); this.failure(error);
    });
    this.position();
    if (!this.ticker) this.ticker = setInterval(() => { this.state.expire(); this.sync(); }, 250);
    return win;
  }
  entryFor(sender: WebContents) {
    const id = [...this.windows].find(([, win]) => !win.isDestroyed() && win.webContents === sender)?.[0];
    return this.state.entries.find(entry => entry.id === id);
  }
  view(sender: WebContents): ToastView {
    const entry = this.entryFor(sender);
    if (!entry) throw new Error('Unknown notification.');
    return { notice: entry.notice, test: entry.test, theme: this.theme() };
  }
  async activate(sender: WebContents) {
    const entry = this.entryFor(sender);
    if (!entry) throw new Error('This notification has expired.');
    await this.open(entry.notice.threadId, entry.test);
    // Let the invoke response reach the renderer before disposing its frame.
    setTimeout(() => this.dismiss(entry.id), 25);
  }
  dismiss(id: number) { this.state.dismiss(id); this.sync(); }
  pause(sender: WebContents, paused: boolean) {
    const entry = this.entryFor(sender);
    if (entry) this.state.pause(entry.id, paused || this.drags.has(entry.id));
  }
  resize(sender: WebContents, height: number) {
    const entry = this.entryFor(sender);
    if (!entry) return;
    this.heights.set(entry.id, Math.max(40, Math.min(400, Math.ceil(height))));
    this.position();
  }
  drag(sender: WebContents, action: 'start' | 'move' | 'end' | 'cancel', x: number, y: number) {
    const entry = this.entryFor(sender);
    if (!entry) return;
    if (this.fades.has(entry.id)) return;
    const win = this.windows.get(entry.id)!;
    if (action === 'start') {
      if (!this.drags.has(entry.id)) this.drags.set(entry.id, { bounds: win.getBounds(), x, y });
      this.state.pause(entry.id, true);
      return;
    }
    const drag = this.drags.get(entry.id);
    if (!drag) return;
    let dx = Math.round(x - drag.x), dy = Math.round(y - drag.y);
    if (!drag.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 4) drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    dx = drag.axis === 'x' ? dx : 0;
    dy = drag.axis === 'y' ? dy : 0;
    const distance = Math.abs(dx || dy);
    const fullDistance = drag.axis === 'y' ? drag.bounds.height : drag.bounds.width;
    const opacity = Math.max(0, 1 - distance / fullDistance);
    if (action === 'move') {
      win.setPosition(drag.bounds.x + dx, drag.bounds.y + dy);
      win.webContents.send('toast:drag-progress', { opacity, animate: false });
      return;
    }
    if (action === 'end' && distance >= 40) this.fadeDismiss(entry.id, win, drag.bounds, dx, dy);
    else {
      this.drags.delete(entry.id);
      win.setBounds(drag.bounds);
      this.position();
      win.webContents.send('toast:drag-progress', { opacity: 1, animate: true });
    }
  }
  private fadeDismiss(id: number, win: BrowserWindow, origin: Electron.Rectangle, dx: number, dy: number) {
    if (this.fades.has(id)) return;
    this.state.pause(id, true);
    const vertical = dy !== 0;
    const fullDistance = vertical ? origin.height : origin.width;
    const from = vertical ? dy : dx;
    const target = Math.sign(from) * fullDistance;
    const started = Date.now();
    win.setPosition(origin.x + dx, origin.y + dy);
    this.fades.set(id, setInterval(() => {
      if (win.isDestroyed()) { this.stopFade(id); return; }
      const progress = Math.min(1, (Date.now() - started) / 400);
      const offset = from + (target - from) * (1 - (1 - progress) ** 2);
      win.setPosition(origin.x + (vertical ? 0 : Math.round(offset)), origin.y + (vertical ? Math.round(offset) : 0));
      win.webContents.send('toast:drag-progress', { opacity: Math.max(0, 1 - Math.abs(offset) / fullDistance), animate: false });
      if (progress === 1) this.dismiss(id);
    }, 16));
  }
  private stopFade(id: number) {
    const timer = this.fades.get(id);
    if (timer) clearTimeout(timer);
    this.fades.delete(id);
  }
  publish() {
    for (const win of this.windows.values()) if (!win.isDestroyed() && this.entryFor(win.webContents)) {
      win.webContents.send('toast:update', this.view(win.webContents));
    }
  }
  position() {
    if (!this.state.entries.length) return;
    const candidate = this.pet();
    const pet = candidate && !candidate.isDestroyed() ? candidate : null;
    const area = pet ? screen.getDisplayMatching(pet.getBounds()).workArea : screen.getPrimaryDisplay().workArea;
    const width = Math.min(376, area.width - 32);
    const heightFor = (id: number) => Math.min(this.heights.get(id) ?? 96, Math.floor((area.height - 48) / 3));
    const bounds = pet?.getBounds();
    const right = bounds ? bounds.x + bounds.width + 8 : area.x + area.width - width - 16;
    const x = Math.max(area.x + 16, Math.min(bounds && right + width > area.x + area.width - 16 ? bounds.x - width - 8 : right, area.x + area.width - width - 16));
    const stackHeight = this.state.entries.reduce((height, entry) => height + heightFor(entry.id) + 8, -8);
    let y = Math.max(area.y + 16 + stackHeight, Math.min(bounds ? bounds.y + bounds.height : area.y + area.height - 16, area.y + area.height - 16));
    for (const entry of [...this.state.entries].reverse()) {
      const height = heightFor(entry.id);
      y -= height;
      if (!this.drags.has(entry.id)) this.windows.get(entry.id)?.setBounds({ x, y, width, height });
      y -= 8;
    }
  }
  private sync() {
    for (const [id, win] of [...this.windows]) if (!this.state.entries.some(entry => entry.id === id)) {
      this.windows.delete(id);
      this.drags.delete(id);
      this.heights.delete(id);
      this.stopFade(id);
      if (!win.isDestroyed()) win.destroy();
    }
    this.position();
    if (!this.state.entries.length && this.ticker) { clearInterval(this.ticker); this.ticker = undefined; }
  }
  clear() { this.state.clear(); this.sync(); }
}
