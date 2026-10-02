import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import type { Preferences } from './shared';
import { isPetId } from './pets';

export function defaults(): Preferences {
  return { petId: 'lfg', onboardingCompleted: false, notificationsEnabled: false, notificationSound: true,
    dataDirectory: join(homedir(), '.t3', 'userdata'), followThreadId: null, blockedProjects: [],
    projectFilter: { mode: 'blocklist', selected: [] }, chatFilter: { mode: 'blocklist', selected: [] }, size: 128,
    reducedMotion: false, showLabel: true, launchAtLogin: false, position: null };
}

export function validatePreferences(input: unknown, current: Preferences): Preferences {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid settings.');
  const raw = input as Record<string, unknown>;
  const next = { ...current };
  if ('petId' in raw) {
    if (!isPetId(raw.petId)) throw new Error('Invalid pet.');
    next.petId = raw.petId;
  }
  if ('blockedProjects' in raw) {
    if (!Array.isArray(raw.blockedProjects) || raw.blockedProjects.length > 1000) throw new Error('Invalid project blocklist.');
    const projects = raw.blockedProjects.map(project => {
      if (!project || typeof project !== 'object' || typeof project.id !== 'string' || !project.id.trim() || project.id.length > 500 ||
          typeof project.name !== 'string' || project.name.length > 4096) throw new Error('Invalid blocked project.');
      return { id: project.id, name: project.name };
    });
    next.blockedProjects = [...new Map(projects.map(project => [project.id, project])).values()];
  }
  if ('dataDirectory' in raw) {
    if (typeof raw.dataDirectory !== 'string' || !isAbsolute(raw.dataDirectory) || raw.dataDirectory.length > 4096) throw new Error('Choose an absolute data-folder path.');
    next.dataDirectory = raw.dataDirectory;
  }
  if ('followThreadId' in raw) {
    if (raw.followThreadId !== null && (typeof raw.followThreadId !== 'string' || raw.followThreadId.length > 500)) throw new Error('Invalid chat.');
    next.followThreadId = raw.followThreadId as string | null;
  }
  for (const key of ['projectFilter', 'chatFilter'] as const) {
    if (!(key in raw)) continue;
    const filter = raw[key] as Preferences[typeof key];
    if (!filter || !['blocklist', 'whitelist'].includes(filter.mode) || !Array.isArray(filter.selected) || filter.selected.length > 1000) throw new Error('Invalid filter.');
    const selected = filter.selected.map(item => {
      if (!item || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 500 || typeof item.name !== 'string' || item.name.length > 4096) throw new Error('Invalid filter selection.');
      return { id: item.id, name: item.name };
    });
    next[key] = { mode: filter.mode, selected: [...new Map(selected.map(item => [item.id, item])).values()] };
  }
  // Upgrade saved single-chat and project exclusions without changing their effect.
  if ('blockedProjects' in raw && !('projectFilter' in raw)) next.projectFilter = { mode: 'blocklist', selected: next.blockedProjects.map(p => ({ ...p })) };
  if ('followThreadId' in raw && !('chatFilter' in raw)) next.chatFilter = next.followThreadId
    ? { mode: 'whitelist', selected: [{ id: next.followThreadId, name: 'Previously selected chat' }] }
    : { mode: 'blocklist', selected: [] };
  next.blockedProjects = next.projectFilter.mode === 'blocklist' ? next.projectFilter.selected.map(p => ({ ...p })) : [];
  next.followThreadId = next.chatFilter.mode === 'whitelist' && next.chatFilter.selected.length === 1 ? next.chatFilter.selected[0].id : null;
  if ('size' in raw) {
    if (typeof raw.size !== 'number' || ![96, 128, 160].includes(raw.size)) throw new Error('Invalid pet size.');
    next.size = raw.size;
  }
  for (const key of ['reducedMotion', 'showLabel', 'launchAtLogin', 'onboardingCompleted', 'notificationsEnabled', 'notificationSound'] as const) {
    if (key in raw) {
      if (typeof raw[key] !== 'boolean') throw new Error('Invalid preference.');
      next[key] = raw[key];
    }
  }
  if ('position' in raw) {
    const pos = raw.position as { x?: unknown; y?: unknown } | null;
    if (pos === null) next.position = null;
    else if (pos && typeof pos.x === 'number' && typeof pos.y === 'number' && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      next.position = { x: Math.round(pos.x), y: Math.round(pos.y) };
    } else throw new Error('Invalid pet position.');
  }
  return next;
}

export function loadPreferences(file: string): Preferences {
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    // Retired characters must not reset unrelated settings on upgrade.
    if (saved && typeof saved === 'object' && ['bella', 'aetherwing', 'aethercore', 'aethermite', 'aetherbite', 'calian', 'scarlet', 'airi'].includes(saved.petId)) saved.petId = 'lfg';
    return validatePreferences(saved, defaults());
  }
  catch { return defaults(); }
}

export function storePreferences(file: string, preferences: Preferences): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(preferences, null, 2), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}
