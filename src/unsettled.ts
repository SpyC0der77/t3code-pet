import type { ThreadStatus } from './shared';

export function unsettledChats(threads: ThreadStatus[], now = Date.now()) {
  return threads.flatMap(thread => {
    let status = '';
    let priority = 3;
    if (thread.pendingApproval > 0) { status = 'Approval needed'; priority = 0; }
    else if (thread.pendingInput > 0) { status = 'Input needed'; priority = 0; }
    else if (thread.sessionStatus === 'starting') status = 'Starting';
    else if (thread.sessionStatus === 'running' || (thread.turnState === 'running' && !['stopped', 'interrupted', 'error'].includes(thread.sessionStatus ?? ''))) status = 'Working';
    else if (thread.settledOverride === 'settled' || (thread.snoozedUntil && Date.parse(thread.snoozedUntil) > now)) return [];
    else if (thread.sessionStatus === 'error' || (thread.turnState === 'error' && now - Date.parse(thread.completedAt ?? thread.updatedAt) < 300_000)) {
      status = 'Error'; priority = 1;
    } else if (thread.settledOverride !== undefined) {
      status = thread.turnState === 'completed' ? 'Completed' : thread.sessionStatus === 'interrupted' || thread.sessionStatus === 'stopped' ? 'Stopped' : 'Ready';
      priority = 4;
    }
    return status ? [{ thread, status, priority }] : [];
  }).sort((a, b) => a.priority - b.priority || b.thread.updatedAt.localeCompare(a.thread.updatedAt));
}
