import type { ChatNotification } from './notifications';
import type { Snapshot } from './shared';

function lifetime(notice: ChatNotification, test: boolean) {
  if (test) return 10_000;
  if (notice.kind === 'Approval needed' || notice.kind === 'Input needed') return Infinity;
  return notice.kind === 'Turn finished' ? 5000 : 10_000;
}

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
    const previous = notice.threadId ? this.entries.find(entry => entry.notice.threadId === notice.threadId) : undefined;
    this.entries = this.entries.filter(entry => entry !== previous);
    const entry: ToastEntry = previous ?? { id: ++this.nextId, notice, test, remaining: 10_000, resumedAt: now };
    Object.assign(entry, { notice, test, remaining: lifetime(notice, test), resumedAt: now });
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
  reconcile(snapshot: Snapshot) {
    if (!snapshot.connected) return;
    this.entries = this.entries.filter(entry => {
      if (entry.test || !['Approval needed', 'Input needed'].includes(entry.notice.kind)) return true;
      const thread = snapshot.threads.find(thread => thread.id === entry.notice.threadId);
      return !!thread && (entry.notice.kind === 'Approval needed' ? thread.pendingApproval > 0 : thread.pendingInput > 0);
    });
  }
}
