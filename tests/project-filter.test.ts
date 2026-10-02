import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { allowedThreads, allowedSnapshot } from '../src/project-filter';
import { defaults, validatePreferences, storePreferences, loadPreferences } from '../src/preferences';
import { PetStateMachine } from '../src/pet-state';
import { ChatNotifications } from '../src/notifications';
import { unsettledChats } from '../src/unsettled';
import type { ThreadStatus, Snapshot } from '../src/shared';

const blocked = [{ id: 'blocked', name: 'Same name' }];
const thread = (changes: Partial<ThreadStatus> = {}): ThreadStatus => ({
  id: 'one', title: 'Chat', projectId: 'blocked', project: 'Same name', provider: 'any', sessionStatus: 'ready',
  turnId: 'turn', turnState: null, completedAt: null, updatedAt: new Date().toISOString(), pendingApproval: 0, pendingInput: 0, ...changes,
});
const snapshot = (...threads: ThreadStatus[]): Snapshot => ({ connected: true, threads, checkedAt: Date.now(), message: 'Connected' });

test('block by stable ID, preserving namesakes and unassigned chats without mutating metadata', () => {
  const rows = [thread(), thread({ id: 'two', projectId: 'allowed' }), thread({ id: 'three', projectId: null })];
  assert.deepEqual(allowedThreads(rows, blocked).map(t => t.id), ['two', 'three']);
  assert.equal(rows.length, 3);
  assert.equal(allowedThreads([thread({ project: 'Renamed' })], blocked).length, 0);
});

test('blocked approval, error, work and completion do not affect the pet or hover list', () => {
  for (const changes of [{ pendingApproval: 1 }, { pendingInput: 1 }, { sessionStatus: 'error' }, { sessionStatus: 'running' }, { turnState: 'completed' }]) {
    const filtered = allowedSnapshot(snapshot(thread(changes)), blocked);
    assert.equal(new PetStateMachine().update(filtered, null).mood, 'idle');
    assert.deepEqual(unsettledChats(filtered.threads), []);
  }
  const filtered = allowedSnapshot(snapshot(thread({ pendingInput: 1 })), blocked);
  assert.equal(new PetStateMachine().update(filtered, 'one').mood, 'idle');
});

test('blocking discards a queued fullscreen alert, unblocking baselines old completions', () => {
  const engine = new ChatNotifications();
  engine.update(snapshot(thread()), true, null, false);
  engine.update(snapshot(thread({ pendingApproval: 1 })), true, null, true);
  assert.deepEqual(engine.update(allowedSnapshot(snapshot(thread({ pendingApproval: 1 })), blocked), true, null, false), []);
  engine.reset();
  assert.deepEqual(engine.update(snapshot(thread({ turnState: 'completed' })), true, null, false), []);
  const machine = new PetStateMachine();
  machine.update(snapshot(thread({ turnState: 'running' })), null);
  machine.reset();
  assert.equal(machine.update(snapshot(thread({ turnState: 'completed' })), null).mood, 'idle');
});

test('blocklist persists, deduplicates and validates, old preferences default to an empty list', t => {
  const folder = mkdtempSync(join(tmpdir(), 't3pet-blocklist-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const prefs = validatePreferences({ blockedProjects: [...blocked, ...blocked] }, defaults());
  assert.deepEqual(prefs.blockedProjects, blocked);
  const file = join(folder, 'preferences.json');
  storePreferences(file, prefs);
  assert.deepEqual(loadPreferences(file).blockedProjects, blocked);
  assert.deepEqual(validatePreferences({ size: 128 }, defaults()).blockedProjects, []);
  for (const value of [null, 'all', ['name'], [{ id: '', name: 'Project' }], [{ id: 'p' }], [{ id: 1, name: 'Project' }]]) {
    assert.throws(() => validatePreferences({ blockedProjects: value }, defaults()), /blocked project|blocklist/);
  }
});

test('project and chat blocklists/whitelists intersect by stable IDs', () => {
  const rows = [thread({id:'one',projectId:'p1'}),thread({id:'two',projectId:'p1'}),thread({id:'three',projectId:'p2'}),thread({id:'four',projectId:null})];
  const selectedProjects=[{id:'p1',name:'Same name'}];
  const selectedChats=[{id:'one',name:'Chat'},{id:'three',name:'Chat'}];
  for(const [projectMode,chatMode,expected] of [
    ['blocklist','blocklist',['four']],['blocklist','whitelist',['three']],
    ['whitelist','blocklist',['two']],['whitelist','whitelist',['one']],
  ] as const){
    const p=validatePreferences({projectFilter:{mode:projectMode,selected:selectedProjects},chatFilter:{mode:chatMode,selected:selectedChats}},defaults());
    assert.deepEqual(allowedThreads(rows,p).map(t=>t.id),expected);
    assert.equal(rows.length,4);
  }
});

test('empty whitelists allow nothing, empty blocklists allow all, and unavailable IDs do not broaden access', () => {
  const rows=[thread({projectId:null}),thread({id:'two',projectId:'p2'})];
  assert.equal(allowedThreads(rows,defaults()).length,2);
  for(const key of ['projectFilter','chatFilter']){
    const p=validatePreferences({[key]:{mode:'whitelist',selected:[]}},defaults());
    assert.deepEqual(allowedThreads(rows,p),[]);
    const unavailable=validatePreferences({[key]:{mode:'whitelist',selected:[{id:'missing',name:'Unavailable'}]}},defaults());
    assert.deepEqual(allowedThreads(rows,unavailable),[]);
  }
});

test('legacy exclusions and single chat migrate without changing selection semantics', t => {
  const folder=mkdtempSync(join(tmpdir(),'t3pet-filter-migration-'));
  t.after(()=>rmSync(folder,{recursive:true,force:true}));
  const p=validatePreferences({blockedProjects:blocked,followThreadId:'two'},defaults());
  assert.deepEqual(p.projectFilter,{mode:'blocklist',selected:blocked});
  assert.equal(p.chatFilter.mode,'whitelist');
  const rows=[thread(),thread({id:'two',projectId:'allowed'}),thread({id:'three',projectId:'allowed'})];
  assert.deepEqual(allowedThreads(rows,p).map(t=>t.id),['two']);
  const file=join(folder,'preferences.json');storePreferences(file,p);
  assert.deepEqual(loadPreferences(file),p);
  // Canonical filters take precedence over legacy compatibility fields.
  const updated=validatePreferences({...p,chatFilter:{mode:'blocklist',selected:[]}},defaults());
  assert.equal(updated.followThreadId,null);
  assert.equal(allowedThreads(rows,updated).length,2);
});

test('filter validation rejects invalid modes and entries while deduplicating IDs', () => {
  for(const key of ['projectFilter','chatFilter']){
    const p=validatePreferences({[key]:{mode:'whitelist',selected:[...blocked,...blocked]}},defaults());
    assert.equal(p[key as 'projectFilter'|'chatFilter'].selected.length,1);
    for(const value of [null,{}, {mode:'all',selected:[]},{mode:'blocklist',selected:null},{mode:'whitelist',selected:[{id:'',name:'bad'}]},{mode:'blocklist',selected:[{id:'one'}]}])
      assert.throws(()=>validatePreferences({[key]:value},defaults()),/filter/);
  }
});

test('filtered chats cannot animate the pet, enter the hover list, or release queued alerts', () => {
  const p=validatePreferences({chatFilter:{mode:'blocklist',selected:[{id:'one',name:'Chat'}]}},defaults());
  const engine=new ChatNotifications();
  engine.update(snapshot(thread()),true,null,false);
  engine.update(snapshot(thread({pendingInput:1})),true,null,true);
  const filtered=allowedSnapshot(snapshot(thread({pendingInput:1,sessionStatus:'running'})),p);
  assert.deepEqual(engine.update(filtered,true,null,false),[]);
  assert.equal(new PetStateMachine().update(filtered,null).mood,'idle');
  assert.deepEqual(unsettledChats(filtered.threads),[]);
});
