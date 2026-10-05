import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readThreads, readLocalSnapshot, readProjects } from '../src/t3-local';
import { defaults, validatePreferences, storePreferences, loadPreferences } from '../src/preferences';
import { createServer } from 'node:net';
import { PetStateMachine } from '../src/pet-state';

function createV2Database(file: string) {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE projection_projects(project_id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE orchestration_v2_projection_threads(thread_id TEXT PRIMARY KEY, project_id TEXT, title TEXT,
      default_provider TEXT, updated_at TEXT, archived_at TEXT, deleted_at TEXT, payload_json TEXT);
    CREATE TABLE orchestration_v2_projection_runs(run_id TEXT PRIMARY KEY, thread_id TEXT, ordinal INTEGER,
      status TEXT, completed_at TEXT);
    CREATE TABLE orchestration_v2_projection_runtime_requests(runtime_request_id TEXT PRIMARY KEY,
      thread_id TEXT, kind TEXT, status TEXT);
    INSERT INTO projection_projects VALUES('p', 'Example');
    INSERT INTO orchestration_v2_projection_threads VALUES('a','p','Active','future-provider',
      '2026-10-03T14:00:00Z',NULL,NULL,'{}');
    INSERT INTO orchestration_v2_projection_runs VALUES('r','a',1,'running',NULL);
    INSERT INTO orchestration_v2_projection_runs VALUES('queued','a',2,'queued',NULL);
  `);
  return db;
}

test('v2 metadata follows active runs, requests, completion and failure without reading payloads', t => {
  const folder = mkdtempSync(join(tmpdir(), 't3pet-v2-'));
  const file = join(folder, 'statev2.sqlite');
  const db = createV2Database(file);
  t.after(() => { db.close(); rmSync(folder, { recursive: true, force: true }); });
  const machine = new PetStateMachine();
  const mood = () => machine.update({ connected: true, message: '', checkedAt: 0, threads: readThreads(file) }, null, Date.parse('2026-10-03T14:00:01Z')).mood;
  assert.equal(mood(), 'working');
  assert.equal(readThreads(file)[0].turnId, 'r', 'queued runs must not mask ongoing work');
  db.exec("INSERT INTO orchestration_v2_projection_runtime_requests VALUES('q','a','permission','pending')");
  assert.equal(mood(), 'waiting');
  assert.equal(readThreads(file)[0].pendingApproval, 1);
  db.exec("UPDATE orchestration_v2_projection_runtime_requests SET status='resolved'; UPDATE orchestration_v2_projection_runs SET status='waiting' WHERE run_id='r'");
  assert.equal(mood(), 'working', 'background waiting is not a user input request');
  db.exec("INSERT INTO orchestration_v2_projection_runtime_requests VALUES('i','a','user_input','pending')");
  assert.equal(readThreads(file)[0].pendingInput, 1);
  assert.equal(mood(), 'waiting');
  db.exec("UPDATE orchestration_v2_projection_runtime_requests SET status='resolved'; UPDATE orchestration_v2_projection_runs SET status='completed',completed_at='2026-10-03T14:00:00Z' WHERE run_id='r'");
  assert.equal(mood(), 'done');
  db.exec("UPDATE orchestration_v2_projection_runs SET status='failed' WHERE run_id='r'");
  assert.equal(mood(), 'error');
  const before = readFileSync(file);
  assert.equal(readThreads(file)[0].projectId, 'p');
  assert.deepEqual(readFileSync(file), before);
  db.exec(`UPDATE orchestration_v2_projection_threads SET payload_json='{"archivedAt":"2026-10-03T14:00:00Z"}'`);
  assert.equal(readThreads(file).length, 0);
});

test('live snapshot prefers the v2 database over frozen legacy projections', async t => {
  const folder = mkdtempSync(join(tmpdir(), 't3pet-v2-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  new DatabaseSync(join(folder, 'state.sqlite')).close();
  const db = createV2Database(join(folder, 'statev2.sqlite')); db.close();
  const server = createServer(socket => socket.end());
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address() as { port: number };
  writeFileSync(join(folder, 'server-runtime.json'), JSON.stringify({ host: '127.0.0.1', port: address.port, pid: process.pid }));
  const before = readFileSync(join(folder, 'statev2.sqlite'));
  const snapshot = await readLocalSnapshot(folder);
  assert.equal(snapshot.connected, true);
  assert.equal(snapshot.threads[0].turnState, 'running');
  assert.deepEqual(readFileSync(join(folder, 'statev2.sqlite')), before);
});

test('v2 extracts subagent lineage metadata, inherits settlement, and keeps forks independent', t => {
  const folder = mkdtempSync(join(tmpdir(), 't3pet-lineage-'));
  const file = join(folder, 'statev2.sqlite');
  const db = createV2Database(file);
  t.after(() => { db.close(); rmSync(folder, { recursive: true, force: true }); });
  const insert = db.prepare('INSERT INTO orchestration_v2_projection_threads VALUES(?,?,?, ?,?,NULL,NULL,?)');
  for (const [id, parent, relationship] of [['child', 'a', 'subagent'], ['nested', 'child', 'subagent'], ['fork', 'a', 'fork']] as const) {
    insert.run(id, 'p', id, 'any', '2026-10-03T14:00:00Z', JSON.stringify({ lineage: { parentThreadId: parent, relationshipToParent: relationship } }));
  }
  db.exec(`UPDATE orchestration_v2_projection_threads SET payload_json='{"settledOverride":"settled"}' WHERE thread_id='a'`);
  const before = readFileSync(file);
  const rows = new Map(readThreads(file).map(thread => [thread.id, thread]));
  assert.equal(rows.get('child')?.parentThreadId, 'a');
  assert.equal(rows.get('child')?.parentTitle, 'Active');
  assert.equal(rows.get('nested')?.parentTitle, 'child');
  assert.equal(rows.get('nested')?.settledOverride, 'settled');
  assert.equal(rows.get('fork')?.parentThreadId, null);
  assert.equal(rows.get('fork')?.settledOverride, null);
  assert.deepEqual(readFileSync(file), before);
  for (const column of ['archived_at', 'deleted_at']) {
    db.exec(`UPDATE orchestration_v2_projection_threads SET ${column}='2026-10-03' WHERE thread_id IN ('a','child')`);
    const hidden = new Map(readThreads(file).map(thread => [thread.id, thread]));
    assert.equal(hidden.has('a'), false);
    assert.equal(hidden.has('child'), false);
    assert.equal(hidden.get('nested')?.settledOverride, 'settled');
    db.exec(`UPDATE orchestration_v2_projection_threads SET ${column}=NULL`);
  }
  db.prepare('UPDATE orchestration_v2_projection_threads SET payload_json=? WHERE thread_id=?')
    .run(JSON.stringify({ archivedAt: '2026-10-03', snoozedUntil: '2099-01-01T00:00:00Z' }), 'a');
  db.exec("INSERT INTO orchestration_v2_projection_threads VALUES('unrelated-history','p','Old','any','', '2026-10-03',NULL,'not-json')");
  const snoozed = new Map(readThreads(file).map(thread => [thread.id, thread]));
  assert.equal(snoozed.has('a'), false);
  assert.equal(snoozed.get('nested')?.snoozedUntil, '2099-01-01T00:00:00Z');
});

test('local adapter reads metadata without changing database bytes', t => {
  const folder = mkdtempSync(join(tmpdir(), 't3pet-test-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const file = join(folder, 'state.sqlite');
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE projection_threads(thread_id TEXT PRIMARY KEY, project_id TEXT, title TEXT, latest_turn_id TEXT, updated_at TEXT, pending_approval_count INTEGER, pending_user_input_count INTEGER, archived_at TEXT, deleted_at TEXT);
    CREATE TABLE projection_projects(project_id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE projection_thread_sessions(thread_id TEXT PRIMARY KEY, provider_name TEXT, provider_instance_id TEXT, status TEXT);
    CREATE TABLE projection_turns(thread_id TEXT, turn_id TEXT, state TEXT, completed_at TEXT);
    INSERT INTO projection_projects VALUES('p','Example');
    INSERT INTO projection_projects VALUES('empty','No chats yet');
    INSERT INTO projection_threads VALUES('a','p','Active','t','2026-09-27',1,0,NULL,NULL);
    INSERT INTO projection_threads VALUES('b','p','Archived',NULL,'2026-09-27',0,0,'2026-09-27',NULL);
    INSERT INTO projection_threads VALUES('c','p','Deleted',NULL,'2026-09-27',0,0,NULL,'2026-09-27');
    INSERT INTO projection_thread_sessions VALUES('a','future-provider','custom','running');
    INSERT INTO projection_turns VALUES('a','t','running',NULL);
  `);
  db.close();
  const before = readFileSync(file);
  const rows = readThreads(file);
  assert.equal(rows.length, 1); assert.equal(rows[0].provider, 'future-provider');
  assert.equal(rows[0].projectId, 'p');
  assert.deepEqual(readProjects(file).map(project => ({ ...project })), [{ id: 'p', name: 'Example' }, { id: 'empty', name: 'No chats yet' }]);
  assert.equal(rows[0].pendingApproval, 1); assert.equal(rows[0].turnState, 'running');
  assert.deepEqual(readFileSync(file), before);
});
test('missing folder is offline and never creates files', async t => {
  const folder = mkdtempSync(join(tmpdir(), 't3pet-test-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const result = await readLocalSnapshot(join(folder, 'missing'));
  assert.equal(result.connected, false); assert.equal(existsSync(join(folder, 'missing')), false);
});
test('unsupported schema fails clearly', t => {
  const folder = mkdtempSync(join(tmpdir(), 't3pet-test-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const file = join(folder, 'state.sqlite');
  new DatabaseSync(file).close();
  assert.throws(() => readThreads(file), /Unsupported T3 Code database schema/);
});
test('a missing runtime reports offline instead of stale work', async t => {
  const folder = mkdtempSync(join(tmpdir(), 't3pet-test-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  new DatabaseSync(join(folder, 'state.sqlite')).close();
  const result = await readLocalSnapshot(folder);
  assert.equal(result.connected, false); assert.match(result.message, /Open T3 Code/);
});
test('runtime discovery cannot connect to a remote host', async t => {
  const folder = mkdtempSync(join(tmpdir(), 't3pet-test-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  new DatabaseSync(join(folder, 'state.sqlite')).close();
  writeFileSync(join(folder, 'server-runtime.json'), JSON.stringify({ host: 'example.com', port: 80 }));
  const result = await readLocalSnapshot(folder);
  assert.equal(result.connected, false); assert.match(result.message, /local installations only/);
});
test('preferences reject invalid paths, size and booleans', () => {
  assert.throws(() => validatePreferences({ size: 9999 }, defaults()));
  assert.throws(() => validatePreferences({ dataDirectory: '../relative' }, defaults()));
  assert.throws(() => validatePreferences({ launchAtLogin: 'yes' }, defaults()));
  assert.throws(() => validatePreferences({ position: { x: Infinity, y: 5 } }, defaults()));
});
test('preferences persist and malformed files fall back to defaults', t => {
  const folder = mkdtempSync(join(tmpdir(), 't3pet-test-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const file = join(folder, 'preferences.json');
  const prefs = { ...defaults(), size: 160, reducedMotion: true };
  storePreferences(file, prefs); assert.deepEqual(loadPreferences(file), prefs);
  writeFileSync(file, 'not json'); assert.deepEqual(loadPreferences(file), defaults());
});
