import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readThreads, readLocalSnapshot } from '../src/t3-local';
import { defaults, validatePreferences, storePreferences, loadPreferences } from '../src/preferences';

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
