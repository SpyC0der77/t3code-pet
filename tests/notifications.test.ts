import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatNotifications } from '../src/notifications';
import type { Snapshot, ThreadStatus } from '../src/shared';

const thread = (patch: Partial<ThreadStatus> = {}): ThreadStatus => ({ id: 'a', title: 'Example chat', project: '', provider: 'anything', sessionStatus: 'running', turnId: 'turn', turnState: 'running', completedAt: null, updatedAt: '2026-09-30', pendingApproval: 0, pendingInput: 0, ...patch });
const snapshot = (...threads: ThreadStatus[]): Snapshot => ({ connected: true, message: '', checkedAt: Date.now(), threads });
test('alerts only on new events, without repeats on polling or reconnection', () => {
  const engine = new ChatNotifications();
  assert.deepEqual(engine.update(snapshot(thread({ turnState: 'completed' })), true, null, false), []);
  engine.update(snapshot(thread()), true, null, false);
  assert.equal(engine.update(snapshot(thread({ pendingApproval: 1 })), true, null, false)[0].title, 'Approval needed');
  assert.deepEqual(engine.update(snapshot(thread({ pendingApproval: 1 })), true, null, false), []);
  engine.update({ ...snapshot(), connected: false }, true, null, false);
  assert.deepEqual(engine.update(snapshot(thread({ pendingApproval: 1 })), true, null, false), []);
  assert.equal(engine.update(snapshot(thread({ pendingInput: 1 })), true, null, false)[0].title, 'Input needed');
  assert.equal(engine.update(snapshot(thread({ turnState: 'completed' })), true, null, false)[0].title, 'Turn finished');
});
test('fullscreen queues only still-relevant alerts', () => {
  const engine = new ChatNotifications();
  engine.update(snapshot(thread()), true, null, false);
  assert.deepEqual(engine.update(snapshot(thread({ pendingInput: 1 })), true, null, true), []);
  assert.equal(engine.update(snapshot(thread({ pendingInput: 1 })), true, null, false).length, 1);
  engine.update(snapshot(thread({ pendingInput: 2 })), true, null, true);
  assert.deepEqual(engine.update(snapshot(thread()), true, null, false), []);
  engine.update(snapshot(thread({ turnState: 'completed' })), true, null, true);
  assert.deepEqual(engine.update(snapshot(thread({ turnId: 'new' })), true, null, false), []);
});
test('filter changes and enabling baseline historical state', () => {
  const engine = new ChatNotifications();
  engine.update(snapshot(thread()), false, null, false);
  assert.deepEqual(engine.update(snapshot(thread({ pendingApproval: 1 })), true, 'a', false), []);
  assert.deepEqual(engine.update(snapshot(thread({ id: 'b', pendingApproval: 1 })), true, 'a', false), []);
  assert.deepEqual(engine.update(snapshot(thread({ id: 'b', turnState: 'completed' })), true, 'b', false), []);
});
test('alerts per chat, completion turns, and failures independent of provider', () => {
  const engine = new ChatNotifications();
  engine.update(snapshot(thread(), thread({ id: 'b' })), true, null, false);
  const events = engine.update(snapshot(thread({ turnState: 'error' }), thread({ id: 'b', pendingInput: 1, provider: 'new-provider' })), true, null, false);
  assert.deepEqual(events.map(e => e.title), ['Chat failed', 'Input needed']);
  engine.update(snapshot(thread({ turnState: 'completed' })), true, null, false);
  assert.equal(engine.update(snapshot(thread({ turnId: 'second', turnState: 'completed' })), true, null, false)[0].title, 'Turn finished');
});

test('pending counts do not repeat attention alerts, but a new turn or attention kind does', () => {
  const engine = new ChatNotifications();
  engine.update(snapshot(thread()), true, null, false);
  assert.equal(engine.update(snapshot(thread({ pendingApproval: 1 })), true, null, false).length, 1);
  assert.deepEqual(engine.update(snapshot(thread({ pendingApproval: 2 })), true, null, false), []);
  assert.equal(engine.update(snapshot(thread({ pendingApproval: 2, turnId: 'next' })), true, null, false).length, 1);
  assert.equal(engine.update(snapshot(thread({ pendingInput: 1, turnId: 'next' })), true, null, false)[0].kind, 'Input needed');
});

test('newly discovered chats establish a baseline instead of alerting on historical attention', () => {
  const engine = new ChatNotifications();
  engine.update(snapshot(thread()), true, null, false);
  assert.deepEqual(engine.update(snapshot(thread(), thread({ id: 'b', pendingInput: 1 })), true, null, false), []);
  assert.equal(engine.update(snapshot(thread(), thread({ id: 'b', pendingInput: 1, turnId: 'next' })), true, null, false)[0].threadId, 'b');
});
