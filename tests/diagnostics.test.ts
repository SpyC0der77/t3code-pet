import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diagnostics, inspectSchema } from '../src/diagnostics';
import { defaults } from '../src/preferences';

test('diagnostics allowlist excludes private state and raw connection errors', () => {
  const secret = 'PRIVATE-DATA';
  const report = diagnostics({ version:'1.0', platform:'win32', architecture:'x64', osRelease:'10',
    electron:'44', node:'24', chrome:'140', schema:'v2', fullscreen:false, fullscreenReady:true,
    preferences:{...defaults(),dataDirectory:secret,followThreadId:secret,projectFilter:{mode:'blocklist',selected:[{id:secret,name:secret}]}},
    snapshot:{connected:false,message:secret,checkedAt:0,threads:[{id:secret,title:secret,project:secret,provider:secret,sessionStatus:null,turnId:secret,turnState:null,completedAt:null,updatedAt:secret,pendingApproval:0,pendingInput:0}]},
  });
  assert.ok(!report.includes(secret));
  assert.equal(JSON.parse(report).databaseSchema, 'v2');
  assert.equal(JSON.parse(report).connection, 'disconnected');
  assert.equal(JSON.parse(report).runtime.electron, '44');
});

test('schema diagnostics inspect metadata read-only, prefer v2, and never create a missing database', () => {
  const dir = mkdtempSync(join(tmpdir(), 't3pet-diagnostics-'));
  try {
    assert.equal(inspectSchema(dir), 'not-found');
    const file = join(dir,'state.sqlite');
    const db = new DatabaseSync(file);
    db.exec('CREATE TABLE projection_threads (id TEXT); CREATE TABLE credentials (secret TEXT);'); db.close();
    const before = readFileSync(file);
    assert.equal(inspectSchema(dir), 'legacy');
    assert.deepEqual(readFileSync(file), before);
    const v2 = new DatabaseSync(join(dir,'statev2.sqlite'));
    v2.exec('CREATE TABLE orchestration_v2_projection_threads (id TEXT)'); v2.close();
    assert.equal(inspectSchema(dir), 'v2');
  } finally { rmSync(dir, {recursive:true,force:true}); }
});
