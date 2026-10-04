import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unsettledChats, hoverChats, inheritSubagentSettlement } from '../src/unsettled';
import type { ThreadStatus } from '../src/shared';
const now = Date.now();
const thread = (patch: Partial<ThreadStatus>): ThreadStatus => ({ id: 'chat', title: 'Chat', project: '', provider: 'any', sessionStatus: 'ready', turnId: 'turn', turnState: 'completed', completedAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), pendingApproval: 0, pendingInput: 0, ...patch });
test('completed and idle chats remain listed until explicitly settled', () => {
  assert.deepEqual(unsettledChats([
    thread({id:'done',settledOverride:null}),
    thread({id:'ready',settledOverride:'active',turnState:null}),
    thread({id:'legacy-done'}),
    thread({id:'legacy-ready',turnState:null}),
    thread({id:'settled',settledOverride:'settled'}),
    thread({id:'snoozed',settledOverride:null,snoozedUntil:new Date(now+60_000).toISOString()}),
  ],now).map(r=>r.status), ['Completed','Ready','Completed','Ready']);
});
test('explicitly settled chats stay excluded even with stale activity', () => {
  assert.deepEqual(unsettledChats([thread({settledOverride:'settled',pendingInput:1}),
    thread({settledOverride:'settled',sessionStatus:'running'})],now), []);
});
test('unsettled list prioritizes attention and errors across providers', () => {
  const rows = unsettledChats([
    thread({id:'work',provider:'future',sessionStatus:'running'}),
    thread({id:'error',sessionStatus:'error'}),
    thread({id:'input',pendingInput:1}),
    thread({id:'approval',pendingApproval:1,pendingInput:1}),
    thread({id:'done'}),
  ], now);
  assert.deepEqual(rows.map(r=>[r.thread.id,r.status]), [['input','Input needed'],['approval','Approval needed'],['error','Error'],['work','Working'],['done','Completed']]);
});
test('unsettled stopped and old error chats remain visible', () => {
  assert.deepEqual(unsettledChats([
    thread({}), thread({sessionStatus:'stopped',turnState:'running'}),
    thread({sessionStatus:'interrupted',turnState:'running'}),
    thread({turnState:'error',completedAt:new Date(now-600_000).toISOString()}),
  ], now).map(r=>r.status), ['Completed','Stopped','Stopped','Error']);
});
test('startup, active turns and recent errors remain visible', () => {
  assert.deepEqual(unsettledChats([
    thread({id:'start',sessionStatus:'starting'}), thread({id:'run',turnState:'running'}),
    thread({id:'error',turnState:'error'}),
  ], now).map(r=>r.status), ['Error','Starting','Working']);
});

test('old errors remain visible without outranking active work', () => {
  const old = new Date(now - 300_000).toISOString();
  const rows = unsettledChats([
    thread({id:'old-turn',turnState:'error',completedAt:old,updatedAt:old}),
    thread({id:'old-session',sessionStatus:'error',completedAt:null,updatedAt:old}),
    thread({id:'work',sessionStatus:'running'}),
    thread({id:'recent-error',turnState:'error'}),
  ], now);
  assert.deepEqual(rows.map(row => [row.thread.id, row.priority]), [['recent-error',1],['work',3],['old-turn',4],['old-session',4]]);
});

test('hover keeps nested subagents under their parent and ranks the group by urgent children', () => {
  const rows = hoverChats([
    thread({ id: 'other', sessionStatus: 'running' }),
    thread({ id: 'root', title: 'Parent' }),
    thread({ id: 'child', title: 'Review', parentThreadId: 'root', settledOverride: 'settled' }),
    thread({ id: 'nested', title: 'Check', parentThreadId: 'child', pendingInput: 1 }),
  ], now);
  assert.deepEqual(rows.map(row => [row.thread.id, row.depth, row.parentTitle]), [
    ['root', 0, null], ['child', 1, 'Parent'], ['nested', 2, 'Review'], ['other', 0, null],
  ]);
});

test('subagent settlement and snoozing follow ancestors even when filters remove the parent', () => {
  for (const patch of [{ settledOverride: 'settled' }, { snoozedUntil: new Date(now + 60_000).toISOString() }]) {
    const threads = [thread({ id: 'root', ...patch }), thread({ id: 'child', parentThreadId: 'root' }),
      thread({ id: 'nested', parentThreadId: 'child', pendingApproval: 1 })];
    assert.equal(hoverChats(threads, now).length, 0);
    assert.equal(unsettledChats(inheritSubagentSettlement(threads).filter(thread => thread.id !== 'root'), now).length, 0);
  }
});

test('missing and cyclic lineage never drops or duplicates chats', () => {
  const rows = hoverChats([thread({ id: 'orphan', parentThreadId: 'filtered', parentTitle: 'Filtered parent' }),
    thread({ id: 'a', parentThreadId: 'b' }), thread({ id: 'b', parentThreadId: 'a' }),
    thread({ id: 'self', parentThreadId: 'self' })], now);
  assert.equal(rows.length, 4);
  assert.equal(new Set(rows.map(row => row.thread.id)).size, 4);
  assert.equal(rows.find(row => row.thread.id === 'orphan')?.parentTitle, 'Filtered parent');
});
