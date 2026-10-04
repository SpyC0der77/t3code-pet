import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToastState } from '../src/toast-state';
import { defaults, validatePreferences } from '../src/preferences';
import type { ThreadStatus } from '../src/shared';
const notice = (threadId: string, kind = 'Approval needed') => ({ threadId, kind, title: kind, body: 'Example chat' });

test('completion lasts five seconds, attention persists, and previews still expire', () => {
  const state = new ToastState();
  state.add(notice('done', 'Turn finished'), false, 0);
  const approval = state.add(notice('approval'), false, 0);
  state.add(notice('input', 'Input needed'), false, 0);
  state.expire(5000);
  assert.deepEqual(state.entries.map(entry => entry.notice.threadId), ['approval', 'input']);
  state.pause(approval.id, true, 6000); state.pause(approval.id, false, 7000);
  state.expire(1_000_000);
  assert.equal(state.entries.length, 2);
  state.add(notice('preview'), true, 1_000_000);
  state.expire(1_010_000);
  assert.equal(state.entries.length, 2);
});

test('resolved attention disappears and an offline snapshot preserves it', () => {
  const state = new ToastState();
  const thread: ThreadStatus = { id:'a', title:'Chat', project:'Project', provider:'test', sessionStatus:null, turnId:'turn', turnState:'running', completedAt:null, updatedAt:'', pendingApproval:1, pendingInput:0 };
  const snapshot = { connected:true, message:'', checkedAt:0, threads:[thread] };
  state.add(notice('a'), false, 0);
  state.reconcile(snapshot); assert.equal(state.entries.length, 1);
  state.reconcile({...snapshot, connected:false, threads:[]}); assert.equal(state.entries.length, 1);
  thread.pendingApproval = 0;
  state.reconcile(snapshot); assert.equal(state.entries.length, 0);
  state.add(notice('a', 'Input needed'), false, 0);
  thread.pendingInput = 1;
  state.reconcile(snapshot); assert.equal(state.entries.length, 1);
  state.reconcile({...snapshot, threads:[]}); assert.equal(state.entries.length, 0);
});

test('notification style upgrades to OS and rejects invalid values without changing other preferences', () => {
  const current = defaults();
  assert.equal(validatePreferences({ notificationsEnabled: true }, current).notificationStyle, 'os');
  const custom = validatePreferences({ notificationStyle: 'custom' }, current);
  assert.equal(custom.notificationStyle, 'custom');
  assert.equal(custom.notificationSound, current.notificationSound);
  assert.equal(custom.notificationsEnabled, current.notificationsEnabled);
  assert.equal(validatePreferences({size:96}, custom).notificationStyle, 'custom');
  assert.throws(() => validatePreferences({notificationStyle:'both'}, custom), /Invalid notification style/);
});

test('toast bursts retain three newest alerts and replace outdated alerts for the same chat', () => {
  const state = new ToastState();
  const first = state.add(notice('a'), false, 0);
  state.add(notice('b'), false, 0);
  state.add(notice('c'), false, 0);
  state.add(notice('d'), false, 0);
  assert.equal(state.entries.length, 3);
  assert.ok(!state.entries.includes(first));
  state.add(notice('b', 'Turn finished'), false, 500);
  assert.equal(state.entries.length, 3);
  assert.equal(state.entries.filter(entry => entry.notice.threadId === 'b').length, 1);
  assert.equal(state.entries.at(-1)!.notice.kind, 'Turn finished');
});

test('hover or keyboard focus pauses expiry and resumes only the remaining time', () => {
  const state = new ToastState();
  const entry = state.add(notice('a', 'Turn finished'), false, 0);
  state.pause(entry.id, true, 2000);
  state.pause(entry.id, true, 3000);
  state.expire(100_000);
  assert.equal(state.entries.length, 1);
  assert.equal(entry.remaining, 3000);
  state.pause(entry.id, false, 100_000);
  state.expire(102_999);
  assert.equal(state.entries.length, 1);
  state.expire(103_000);
  assert.equal(state.entries.length, 0);
});

test('dismissal and clearing remove alerts including paused entries', () => {
  const state = new ToastState();
  const a = state.add(notice('a'), false, 0);
  const b = state.add(notice('b'), false, 0);
  state.dismiss(a.id);
  assert.deepEqual(state.entries.map(entry => entry.id), [b.id]);
  state.pause(b.id, true, 100);
  state.clear();
  assert.equal(state.entries.length, 0);
});
