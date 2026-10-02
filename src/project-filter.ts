import type { Preferences, Snapshot, ThreadStatus } from './shared';

export function allowedThreads(threads: ThreadStatus[], filters: Preferences | Preferences['blockedProjects']): ThreadStatus[] {
  const project = Array.isArray(filters) ? { mode: 'blocklist', selected: filters } : filters.projectFilter;
  const chat = Array.isArray(filters) ? { mode: 'blocklist', selected: [] } : filters.chatFilter;
  const projects = new Set(project.selected.map(item => item.id));
  const chats = new Set(chat.selected.map(item => item.id));
  return threads.filter(thread => {
    const projectSelected = !!thread.projectId && projects.has(thread.projectId);
    const chatSelected = chats.has(thread.id);
    return (project.mode === 'whitelist' ? projectSelected : !projectSelected) &&
      (chat.mode === 'whitelist' ? chatSelected : !chatSelected);
  });
}

export function allowedSnapshot(snapshot: Snapshot, filters: Preferences | Preferences['blockedProjects']): Snapshot {
  return { ...snapshot, threads: allowedThreads(snapshot.threads, filters) };
}
