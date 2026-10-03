import type { ChatNotification } from './notifications';

export interface ToastEntry {
  id: number;
  notice: ChatNotification;
  test: boolean;
  remaining: number;
  resumedAt: number | null;
}

// Keep bursts bounded and replace outdated alerts for the same chat.
export class ToastState {
  entries: ToastEntry[] = [];
  private nextId = 0;
  add(notice: ChatNotification, test = false, now = Date.now()) {
    this.entries = this.entries.filter(entry => !notice.threadId || entry.notice.threadId !== notice.threadId);
    const entry: ToastEntry = { id: ++this.nextId, notice, test, remaining: 10_000, resumedAt: now };
    this.entries.push(entry);
    this.entries = this.entries.slice(-3);
    return entry;
  }
  dismiss(id: number) { this.entries = this.entries.filter(entry => entry.id !== id); }
  pause(id: number, paused: boolean, now = Date.now()) {
    const entry = this.entries.find(entry => entry.id === id);
    if (!entry || paused === (entry.resumedAt === null)) return;
    if (paused) { entry.remaining -= now - entry.resumedAt!; entry.resumedAt = null; }
    else entry.resumedAt = now;
  }
  expire(now = Date.now()) {
    this.entries = this.entries.filter(entry => entry.remaining > (entry.resumedAt === null ? 0 : now - entry.resumedAt));
  }
  clear() { this.entries = []; }
}
