import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import type { Preferences } from './shared';

export function defaults(): Preferences {
  return { dataDirectory: join(homedir(), '.t3', 'userdata'), followThreadId: null, size: 128,
    reducedMotion: false, showLabel: true, launchAtLogin: false, position: null };
}

export function validatePreferences(input: unknown, current: Preferences): Preferences {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid settings.');
  const raw = input as Record<string, unknown>;
  const next = { ...current };
  if ('dataDirectory' in raw) {
    if (typeof raw.dataDirectory !== 'string' || !isAbsolute(raw.dataDirectory) || raw.dataDirectory.length > 4096) throw new Error('Choose an absolute data-folder path.');
    next.dataDirectory = raw.dataDirectory;
  }
  if ('followThreadId' in raw) {
    if (raw.followThreadId !== null && (typeof raw.followThreadId !== 'string' || raw.followThreadId.length > 500)) throw new Error('Invalid chat.');
    next.followThreadId = raw.followThreadId as string | null;
  }
  if ('size' in raw) {
    if (typeof raw.size !== 'number' || ![96, 128, 160].includes(raw.size)) throw new Error('Invalid pet size.');
    next.size = raw.size;
  }
  for (const key of ['reducedMotion', 'showLabel', 'launchAtLogin'] as const) {
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
  try { return validatePreferences(JSON.parse(readFileSync(file, 'utf8')), defaults()); }
  catch { return defaults(); }
}

export function storePreferences(file: string, preferences: Preferences): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(preferences, null, 2), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}
