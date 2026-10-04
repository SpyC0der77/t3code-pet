import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import type { Snapshot, ThreadStatus } from './shared';
import { inheritSubagentSettlement } from './unsettled';

export function readThreads(databasePath: string): ThreadStatus[] {
  // Never create a missing database or issue writes against T3 Code's data.
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 300;');
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'orchestration_v2_projection_threads'").get()) return readV2Threads(db);
    const columns = new Set((db.prepare('PRAGMA table_info(projection_threads)').all() as { name: string }[]).map(c => c.name));
    for (const required of ['thread_id', 'latest_turn_id', 'pending_approval_count', 'pending_user_input_count']) {
      if (!columns.has(required)) throw new Error('Unsupported T3 Code database schema. Update T3 Pet to match your T3 Code version.');
    }
    // Only metadata. Message text, tool payloads, credentials and auth tables are never queried.
    const rows = db.prepare(`
      SELECT t.thread_id AS id, t.title, t.project_id AS projectId, COALESCE(p.title, '') AS project,
        COALESCE(s.provider_name, s.provider_instance_id, '') AS provider,
        s.status AS sessionStatus, t.latest_turn_id AS turnId,
        u.state AS turnState, u.completed_at AS completedAt, t.updated_at AS updatedAt,
        t.pending_approval_count AS pendingApproval, t.pending_user_input_count AS pendingInput
        ${columns.has('settled_override') ? ', t.settled_override AS settledOverride' : ''}
        ${columns.has('snoozed_until') ? ', t.snoozed_until AS snoozedUntil' : ''}
      FROM projection_threads t
      LEFT JOIN projection_projects p ON p.project_id = t.project_id
      LEFT JOIN projection_thread_sessions s ON s.thread_id = t.thread_id
      LEFT JOIN projection_turns u ON u.thread_id = t.thread_id AND u.turn_id = t.latest_turn_id
      WHERE t.deleted_at IS NULL AND t.archived_at IS NULL
      ORDER BY t.updated_at DESC
    `).all();
    return rows as unknown as ThreadStatus[];
  } finally {
    db.close();
  }
}

function readV2Threads(db: DatabaseSync): ThreadStatus[] {
  // V2 retains frozen legacy projections. Read current run and request metadata
  // instead; never load messages, request payloads or provider session secrets.
  const rows = db.prepare(`
    SELECT t.thread_id AS id, t.title, t.project_id AS projectId, COALESCE(p.title, '') AS project,
      COALESCE(t.default_provider, '') AS provider, r.run_id AS turnId,
      r.status AS runStatus, r.completed_at AS completedAt, t.updated_at AS updatedAt,
      json_extract(t.payload_json, '$.settledOverride') AS settledOverride,
      json_extract(t.payload_json, '$.snoozedUntil') AS snoozedUntil,
      CASE WHEN json_extract(t.payload_json, '$.lineage.relationshipToParent') = 'subagent'
        THEN json_extract(t.payload_json, '$.lineage.parentThreadId') END AS parentThreadId,
      parent.title AS parentTitle,
      (SELECT COUNT(*) FROM orchestration_v2_projection_runtime_requests q
        WHERE q.thread_id = t.thread_id AND q.status = 'pending'
          AND q.kind IN ('command', 'file-read', 'file-change', 'permission')) AS pendingApproval,
      (SELECT COUNT(*) FROM orchestration_v2_projection_runtime_requests q
        WHERE q.thread_id = t.thread_id AND q.status = 'pending'
          AND q.kind IN ('user_input', 'mcp-elicitation', 'auth_refresh')) AS pendingInput
    FROM orchestration_v2_projection_threads t
    LEFT JOIN orchestration_v2_projection_threads parent ON parent.thread_id =
      CASE WHEN json_extract(t.payload_json, '$.lineage.relationshipToParent') = 'subagent'
        THEN json_extract(t.payload_json, '$.lineage.parentThreadId') END
    LEFT JOIN projection_projects p ON p.project_id = t.project_id
    LEFT JOIN orchestration_v2_projection_runs r ON r.run_id = (
      SELECT candidate.run_id FROM orchestration_v2_projection_runs candidate
      WHERE candidate.thread_id = t.thread_id AND candidate.status NOT IN ('queued', 'rolled_back')
      ORDER BY CASE WHEN candidate.status IN ('preparing', 'starting', 'running', 'waiting') THEN 0 ELSE 1 END,
        candidate.ordinal DESC, candidate.run_id DESC LIMIT 1
    )
    WHERE t.deleted_at IS NULL AND t.archived_at IS NULL
      AND json_extract(t.payload_json, '$.archivedAt') IS NULL
    ORDER BY t.updated_at DESC
  `).all() as unknown as (Omit<ThreadStatus, 'sessionStatus' | 'turnState'> & { runStatus: string | null })[];
  return inheritSubagentSettlement(rows.map(({ runStatus, ...thread }) => {
    const active = ['preparing', 'starting', 'running', 'waiting'].includes(runStatus ?? '');
    return { ...thread,
      sessionStatus: active ? runStatus === 'preparing' || runStatus === 'starting' ? 'starting' : 'running' :
        runStatus === 'interrupted' || runStatus === 'cancelled' ? 'stopped' : 'ready',
      turnState: active ? 'running' : runStatus === 'failed' ? 'error' : runStatus === 'cancelled' ? 'interrupted' : runStatus,
    };
  }));
}

export function readProjects(databasePath: string): { id: string; name: string }[] {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 300;');
    const columns = new Set((db.prepare('PRAGMA table_info(projection_projects)').all() as { name: string }[]).map(column => column.name));
    return db.prepare(`SELECT project_id AS id, COALESCE(title, '') AS name FROM projection_projects
      ${columns.has('deleted_at') ? 'WHERE deleted_at IS NULL' : ''} ORDER BY title, project_id`).all() as unknown as { id: string; name: string }[];
  } finally { db.close(); }
}

function portIsOpen(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection({ host, port });
    let finished = false;
    const finish = (alive: boolean) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve(alive);
    };
    socket.setTimeout(700);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

export async function readLocalSnapshot(dataDirectory: string): Promise<Snapshot> {
  const base = { threads: [], checkedAt: Date.now() };
  const v2Path = join(dataDirectory, 'statev2.sqlite');
  const databasePath = existsSync(v2Path) ? v2Path : join(dataDirectory, 'state.sqlite');
  if (!existsSync(databasePath)) return { ...base, connected: false, message: 'T3 Code data not found. Choose its userdata folder in settings.' };
  try {
    if (!statSync(databasePath).isFile()) throw new Error('The selected folder does not contain a database file.');
    const runtimePath = join(dataDirectory, 'server-runtime.json');
    if (!existsSync(runtimePath)) return { ...base, connected: false, message: 'Open T3 Code to connect your pet.' };
    const runtime: unknown = JSON.parse(readFileSync(runtimePath, 'utf8'));
    if (!runtime || typeof runtime !== 'object') throw new Error('Invalid T3 Code runtime file. Restart T3 Code.');
    const { host, port, pid } = runtime as Record<string, unknown>;
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535 ||
        typeof host !== 'string' || !['127.0.0.1', 'localhost', '::1', '0.0.0.0', '::'].includes(host)) {
      throw new Error('Unsupported local T3 Code runtime. This version follows local installations only.');
    }
    if (typeof pid === 'number' && Number.isInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); } catch { return { ...base, connected: false, message: 'T3 Code is closed. Your pet will reconnect when it opens.' }; }
    }
    const connectHost = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '::1' : host;
    if (!await portIsOpen(connectHost, port)) return { ...base, connected: false, message: 'Waiting for T3 Code. Reconnecting automatically.' };
    return { connected: true, message: 'Connected to local T3 Code', threads: readThreads(databasePath), projects: readProjects(databasePath), checkedAt: Date.now() };
  } catch (error) {
    const text = error instanceof Error ? error.message : '';
    const message = text.includes('locked') || text.includes('busy')
      ? 'T3 Code is busy. Retrying automatically.'
      : text.includes('no such') ? 'This T3 Code database version is not supported yet.'
      : text.includes('permission') || text.includes('EACCES') ? 'Cannot read this folder. Choose an accessible T3 Code userdata folder.'
      : text || 'Cannot read T3 Code status. Check the data folder.';
    return { ...base, connected: false, message };
  }
}
