import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unsettledChats } from '../src/unsettled';
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
  ], now).map(r=>r.status), ['Error','Completed','Stopped','Stopped']);
});
test('startup, active turns and recent errors remain visible', () => {
  assert.deepEqual(unsettledChats([
    thread({id:'start',sessionStatus:'starting'}), thread({id:'run',turnState:'running'}),
    thread({id:'error',turnState:'error'}),
  ], now).map(r=>r.status), ['Error','Starting','Working']);
});
