import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import type { AppState } from './shared';

export class HoverPanel {
  window: BrowserWindow | null = null;
  private ready = false;
  private requested = false;
  private timer?: ReturnType<typeof setInterval>;
  private outsideSince = 0;
  private contentHeight = 1;
  constructor(private pet: () => BrowserWindow | null, private state: () => AppState, private allowed: () => boolean) {}

  private loading?: Promise<void>;
  prepare(): Promise<void> {
    if (!this.window) {
      const win = this.window = new BrowserWindow({
        width: 300, height: 250, frame: false, show: false, resizable: false,
        focusable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
        transparent: true, backgroundColor: '#00000000',
        webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      win.setMenu(null);
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', event => event.preventDefault());
      win.once('ready-to-show', () => { this.ready = true; if (this.requested) this.show(); });
      win.on('closed', () => { this.window = null; this.ready = false; });
      this.loading = win.loadFile(join(__dirname, 'renderer', 'hover.html'));
    }
    return this.loading ?? Promise.resolve();
  }

  show() {
    if (!this.allowed()) return;
    this.requested = true;
    this.outsideSince = 0;
    if (this.window?.isVisible()) return;
    void this.prepare();
    if (!this.ready || !this.pet() || !this.window) return;
    this.position();
    this.publish();
    this.window.showInactive();
    if (!this.timer) this.timer = setInterval(() => this.checkPointer(), 40);
  }
  resize(height: number) {
    if (height <= 0) {
      // The renderer can report zero before its first state arrives.
      return;
    }
    this.contentHeight = Math.max(1, Math.min(400, Math.ceil(height)));
    this.position();
  }
  private position() {
    if (!this.pet() || !this.window) return;
    const pet = this.pet()!.getBounds();
    const area = screen.getDisplayMatching(pet).workArea;
    const width = Math.min(300, area.width);
    const height = Math.min(this.contentHeight, area.height);
    const right = pet.x + pet.width - 14;
    const x = right + width <= area.x + area.width ? right : pet.x - width + 14;
    this.window.setBounds({ x: Math.max(area.x, Math.min(x, area.x + area.width - width)),
      y: Math.max(area.y, Math.min(pet.y + pet.height - height - 12, area.y + area.height - height)), width, height });
  }
  publish() { if (this.ready) this.window?.webContents.send('pet:state', this.state()); }
  hide() {
    this.requested = false;
    this.window?.hide();
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
  private checkPointer() {
    if (!this.allowed() || !this.pet() || !this.window) { this.hide(); return; }
    const point = screen.getCursorScreenPoint();
    const pet = this.pet()!.getBounds(), panel = this.window.getBounds();
    const inside = [pet, panel].some(r => point.x >= r.x && point.x < r.x + r.width && point.y >= r.y && point.y < r.y + r.height);
    if (inside) this.outsideSince = 0;
    else if (!this.outsideSince) this.outsideSince = Date.now();
    else if (Date.now() - this.outsideSince >= 200) this.hide();
  }
  dispose() { this.hide(); this.window?.destroy(); }
}
