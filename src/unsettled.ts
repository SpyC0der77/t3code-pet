import type { ThreadStatus } from './shared';

export type SettlementMetadata = Pick<ThreadStatus, 'id' | 'parentThreadId' | 'settledOverride' | 'snoozedUntil'>;
function settlementOwner(thread: SettlementMetadata, byId: Map<string, SettlementMetadata>): SettlementMetadata {
  let owner = thread;
  const seen = new Set([thread.id]);
  while (owner.parentThreadId) {
    if (seen.has(owner.parentThreadId)) return thread;
    const parent = byId.get(owner.parentThreadId);
    if (!parent) break;
    seen.add(parent.id); owner = parent;
  }
  return owner;
}

// Resolve this before chat filters remove parents from a snapshot.
export function inheritSubagentSettlement(threads: ThreadStatus[], ancestors: SettlementMetadata[] = threads) {
  const byId = new Map(ancestors.map(thread => [thread.id, thread]));
  return threads.map(thread => {
    const owner = settlementOwner(thread, byId);
    return owner === thread ? thread : { ...thread, settledOverride: owner.settledOverride, snoozedUntil: owner.snoozedUntil };
  });
}

export function unsettledChats(threads: ThreadStatus[], now = Date.now()) {
  const byId = new Map(threads.map(thread => [thread.id, thread]));
  return threads.flatMap(thread => {
    // Subagents share their parent's settlement and snooze state. Do not hide
    // a completed child independently while its parent is still in the list.
    const settlement = settlementOwner(thread, byId);
    if (settlement.settledOverride === 'settled' || (settlement.snoozedUntil && Date.parse(settlement.snoozedUntil) > now)) return [];
    let status = '';
    let priority = 3;
    if (thread.pendingApproval > 0) { status = 'Approval needed'; priority = 0; }
    else if (thread.pendingInput > 0) { status = 'Input needed'; priority = 0; }
    else if (thread.sessionStatus === 'starting') status = 'Starting';
    else if (thread.sessionStatus === 'running' || (thread.turnState === 'running' && !['stopped', 'interrupted', 'error'].includes(thread.sessionStatus ?? ''))) status = 'Working';
    else if (thread.sessionStatus === 'error' || thread.turnState === 'error') {
      status = 'Error'; priority = now - Date.parse(thread.completedAt ?? thread.updatedAt) < 300_000 ? 1 : 4;
    } else {
      status = thread.turnState === 'completed' ? 'Completed' : thread.sessionStatus === 'interrupted' || thread.sessionStatus === 'stopped' ? 'Stopped' : 'Ready';
      priority = 4;
    }
    return status ? [{ thread, status, priority }] : [];
  }).sort((a, b) => a.priority - b.priority || b.thread.updatedAt.localeCompare(a.thread.updatedAt));
}

export function hoverChats(threads: ThreadStatus[], now = Date.now()) {
  const rows = unsettledChats(threads, now);
  type Row = typeof rows[number];
  const byId = new Map(rows.map(row => [row.thread.id, row]));
  const children = new Map<string, Row[]>();
  const urgency = new Map(rows.map(row => [row.thread.id, { priority: row.priority, updatedAt: row.thread.updatedAt }]));
  for (const row of rows) {
    const parent = row.thread.parentThreadId;
    if (parent && parent !== row.thread.id && byId.has(parent)) {
      children.set(parent, [...children.get(parent) ?? [], row]);
    }
    let ancestor = parent;
    const seen = new Set([row.thread.id]);
    while (ancestor && byId.has(ancestor) && !seen.has(ancestor)) {
      seen.add(ancestor);
      const rank = urgency.get(ancestor)!;
      rank.priority = Math.min(rank.priority, row.priority);
      if (row.thread.updatedAt > rank.updatedAt) rank.updatedAt = row.thread.updatedAt;
      ancestor = byId.get(ancestor)!.thread.parentThreadId;
    }
  }
  const sort = (items: Row[]) => items.sort((a, b) => {
    const first = urgency.get(a.thread.id)!, second = urgency.get(b.thread.id)!;
    return first.priority - second.priority || second.updatedAt.localeCompare(first.updatedAt) || a.thread.id.localeCompare(b.thread.id);
  });
  const result: (Row & { depth: number; parentTitle: string | null })[] = [];
  const visited = new Set<string>();
  const append = (root: Row) => {
    const stack = [{ row: root, depth: 0 }];
    while (stack.length) {
      const { row, depth } = stack.pop()!;
      if (visited.has(row.thread.id)) continue;
      visited.add(row.thread.id);
      const parent = row.thread.parentThreadId;
      result.push({ ...row, depth,
        parentTitle: parent ? byId.get(parent)?.thread.title || row.thread.parentTitle || 'Unavailable chat' : null });
      for (const child of sort(children.get(row.thread.id) ?? []).reverse()) stack.push({ row: child, depth: depth + 1 });
    }
  };
  for (const root of sort(rows.filter(row => !row.thread.parentThreadId || !byId.has(row.thread.parentThreadId)))) append(root);
  // A malformed or partially removed lineage must never hide chats or loop.
  for (const row of sort(rows)) if (!visited.has(row.thread.id)) append(row);
  return result;
}
