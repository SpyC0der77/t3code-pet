import type { Snapshot, ThreadStatus } from './shared';
import { eventEnabled, isAttention, type NotificationPolicy } from './notification-policy';

export interface ChatNotification { threadId: string; title: string; body: string; kind: string; }
function attention(thread: ThreadStatus) {
  return thread.pendingApproval > 0 ? 'Approval needed' : thread.pendingInput > 0 ? 'Input needed' : null;
}
export class ChatNotifications {
  private previous = new Map<string, ThreadStatus>();
  private queued = new Map<string, ChatNotification>();
  private initialized = false;
  private selection: string | null | undefined;
  reset() { this.previous.clear(); this.queued.clear(); this.initialized = false; }
  update(snapshot: Snapshot, enabled: boolean, follow: string | null, suppressed: boolean,
    policy: NotificationPolicy = { attention: true, completion: true, error: true, paused: false }): ChatNotification[] {
    if (!enabled || this.selection !== follow) { this.reset(); this.selection = follow; }
    if (!enabled || !snapshot.connected) return [];
    const threads = snapshot.threads.filter(t => !follow || t.id === follow);
    for (const t of threads) {
      const prior = this.previous.get(t.id);
      const waiting = attention(t);
      let kind: string | null = null;
      if (this.initialized && prior) {
        if (waiting && (attention(prior) !== waiting || prior.turnId !== t.turnId)) kind = waiting;
        else if (!waiting && prior && (t.turnId !== prior.turnId || t.turnState !== prior.turnState) && t.turnState === 'completed') kind = 'Turn finished';
        else if (!waiting && prior && ((t.turnState === 'error' && (prior.turnState !== 'error' || t.turnId !== prior.turnId)) ||
          (t.sessionStatus === 'error' && prior.sessionStatus !== 'error'))) kind = 'Chat failed';
      }
      // During an explicit pause, keep only requests that still need action.
      // Include existing requests so clearing visible alerts does not lose them.
      if (policy.paused && waiting) kind = waiting;
      if (kind && eventEnabled(kind, policy) && (!policy.paused || isAttention(kind))) this.queued.set(t.id, { threadId: t.id, title: kind, body: t.title, kind });
    }
    this.previous = new Map(threads.map(t => [t.id, { ...t }]));
    this.initialized = true;
    for (const [id, notice] of this.queued) {
      const thread = this.previous.get(id);
      if (!thread || !eventEnabled(notice.kind, policy) || (policy.paused && !isAttention(notice.kind)) || (isAttention(notice.kind) && attention(thread) !== notice.kind) ||
        (notice.kind === 'Turn finished' && thread.turnState !== 'completed') ||
        (notice.kind === 'Chat failed' && thread.turnState !== 'error' && thread.sessionStatus !== 'error')) this.queued.delete(id);
    }
    if (suppressed || policy.paused) return [];
    const result = [...this.queued.values()];
    this.queued.clear();
    return result;
  }
}
