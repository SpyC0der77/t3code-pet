import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Preferences, Snapshot } from './shared';
import { alertsPaused } from './notification-policy';

export function inspectSchema(dataDirectory: string): string {
  const v2 = join(dataDirectory, 'statev2.sqlite');
  const file = existsSync(v2) ? v2 : join(dataDirectory, 'state.sqlite');
  if (!existsSync(file)) return 'not-found';
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 300;');
    // Inspect table names only. Never load rows, messages, or auth data.
    const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(row => row.name));
    if (tables.has('orchestration_v2_projection_threads')) return 'v2';
    if (tables.has('projection_threads')) return 'legacy';
    return 'unrecognized';
  } catch { return 'unreadable'; }
  finally { db?.close(); }
}

export function diagnostics(input: {
  version: string; platform: string; architecture: string; osRelease: string;
  electron: string; node: string; chrome: string; schema: string;
  snapshot: Snapshot; preferences: Preferences; fullscreen: boolean; fullscreenReady: boolean;
}, now = Date.now()): string {
  // Construct an allowlisted report. Do not serialize state or raw errors:
  // they can contain chat titles, IDs, private paths, or runtime details.
  return JSON.stringify({
    app: 'T3 Pet', version: input.version,
    platform: input.platform, architecture: input.architecture, osRelease: input.osRelease,
    runtime: { electron: input.electron, node: input.node, chrome: input.chrome },
    connection: input.snapshot.connected ? 'connected' : 'disconnected',
    databaseSchema: input.schema,
    lastCheckedAt: new Date(input.snapshot.checkedAt).toISOString(),
    notifications: {
      enabled: input.preferences.notificationsEnabled, style: input.preferences.notificationStyle,
      sound: input.preferences.notificationSound, attention: input.preferences.notificationAttention,
      completion: input.preferences.notificationCompletion, error: input.preferences.notificationError,
      paused: alertsPaused(input.preferences, now),
    },
    fullscreen: { active: input.fullscreen, detectorReady: input.fullscreenReady },
  }, null, 2);
}
