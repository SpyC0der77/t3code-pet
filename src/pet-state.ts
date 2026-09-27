import type { PetStatus, Snapshot, ThreadStatus } from './shared';

const isWorking = (thread: ThreadStatus) =>
  thread.sessionStatus === 'starting' || thread.sessionStatus === 'running' ||
  (thread.turnState === 'running' && !['stopped', 'interrupted', 'error'].includes(thread.sessionStatus ?? ''));

export class PetStateMachine {
  private previous = new Map<string, ThreadStatus>();
  private completed: { thread: ThreadStatus; expiresAt: number } | null = null;
  private initialized = false;
  private following: string | null = null;

  reset() {
    this.previous.clear();
    this.completed = null;
    this.initialized = false;
  }

  update(snapshot: Snapshot, followThreadId: string | null, now = Date.now()): PetStatus {
    const base = { threadId: null, threadTitle: null, workingCount: 0, waitingCount: 0 };
    if (!snapshot.connected) {
      this.reset();
      return { ...base, mood: 'offline', label: 'T3 Code offline' };
    }
    if (followThreadId !== this.following) {
      this.reset();
      this.following = followThreadId;
    }
    const threads = snapshot.threads.filter(t => !followThreadId || t.id === followThreadId);
    const waiting = threads.filter(t => t.pendingApproval > 0 || t.pendingInput > 0);
    const working = threads.filter(isWorking);
    const errors = threads.filter(t => t.sessionStatus === 'error' ||
      (t.turnState === 'error' && now - Date.parse(t.completedAt ?? t.updatedAt) < 300_000));
    for (const thread of threads) {
      const previous = this.previous.get(thread.id);
      // Baseline first: opening the app must never celebrate old completed turns.
      if (this.initialized && previous && thread.turnState === 'completed' &&
          (previous.turnId !== thread.turnId || previous.turnState !== 'completed')) {
        this.completed = { thread, expiresAt: now + 8_000 };
      }
    }
    this.previous = new Map(threads.map(t => [t.id, t]));
    this.initialized = true;
    if (this.completed && (this.completed.expiresAt <= now || !threads.some(t => t.id === this.completed!.thread.id))) {
      this.completed = null;
    }
    const count = { workingCount: working.length, waitingCount: waiting.length };
    const make = (mood: PetStatus['mood'], label: string, thread?: ThreadStatus): PetStatus => ({
      ...base, ...count, mood, label, threadId: thread?.id ?? null, threadTitle: thread?.title ?? null,
    });
    if (waiting[0]) return make('waiting', waiting[0].pendingApproval > 0 ? 'Approval needed' : 'Answer needed', waiting[0]);
    if (errors[0]) return make('error', 'A chat hit an error', errors[0]);
    if (this.completed) return make('done', 'Turn finished', this.completed.thread);
    if (working[0]) return make('working', working.length > 1 ? `${working.length} chats working` : 'Working', working[0]);
    if (followThreadId && !threads.length) return make('idle', 'Chat unavailable');
    return make('idle', 'Resting', threads[0]);
  }
}
