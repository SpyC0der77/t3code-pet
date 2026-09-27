import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PetStateMachine } from '../src/pet-state';
import type { Snapshot, ThreadStatus } from '../src/shared';

const now = 1_800_000_000_000;
const thread = (patch: Partial<ThreadStatus> = {}): ThreadStatus => ({
  id: 'one', title: 'Test chat', project: 'Fixture', provider: 'any-provider', sessionStatus: 'ready',
  turnId: 'turn-1', turnState: 'completed', completedAt: new Date(now - 60_000).toISOString(),
  updatedAt: new Date(now).toISOString(), pendingApproval: 0, pendingInput: 0, ...patch,
});
const snapshot = (...threads: ThreadStatus[]): Snapshot => ({ connected: true, message: 'Connected', threads, checkedAt: now });

test('initial snapshot does not celebrate historical completions', () => {
  assert.equal(new PetStateMachine().update(snapshot(thread()), null, now).mood, 'idle');
});
test('all provider names use the same working state', () => {
  for (const provider of ['codex', 'claude', 'opencode', 'future-provider']) {
    assert.equal(new PetStateMachine().update(snapshot(thread({ provider, sessionStatus: 'running', turnState: 'running' })), null, now).mood, 'working');
  }
});
test('attention wins over running chats and counts both', () => {
  const value = new PetStateMachine().update(snapshot(thread({ id: 'busy', sessionStatus: 'running' }), thread({ id: 'waiting', pendingInput: 1 })), null, now);
  assert.equal(value.mood, 'waiting'); assert.equal(value.threadId, 'waiting');
  assert.equal(value.workingCount, 1); assert.equal(value.waitingCount, 1);
});
test('new completion celebrates once and expires', () => {
  const machine = new PetStateMachine();
  machine.update(snapshot(thread({ turnState: 'running', sessionStatus: 'running' })), null, now);
  assert.equal(machine.update(snapshot(thread()), null, now + 10).mood, 'done');
  assert.equal(machine.update(snapshot(thread()), null, now + 4000).mood, 'done');
  assert.equal(machine.update(snapshot(thread()), null, now + 8010).mood, 'idle');
});
test('a fast turn completed between polls still celebrates', () => {
  const machine = new PetStateMachine(); machine.update(snapshot(thread()), null, now);
  assert.equal(machine.update(snapshot(thread({ turnId: 'turn-2' })), null, now + 1000).mood, 'done');
});
test('reconnect resets history, not replaying old completions', () => {
  const machine = new PetStateMachine(); machine.update(snapshot(thread({ turnState: 'running' })), null, now);
  assert.equal(machine.update({ ...snapshot(), connected: false }, null, now).mood, 'offline');
  assert.equal(machine.update(snapshot(thread()), null, now + 1000).mood, 'idle');
});
test('following one chat ignores other chats requiring attention', () => {
  const value = new PetStateMachine().update(snapshot(thread({ id: 'one' }), thread({ id: 'two', pendingApproval: 1 })), 'one', now);
  assert.equal(value.mood, 'idle'); assert.equal(value.waitingCount, 0);
});
test('stopped sessions do not stay working because of an old turn', () => {
  assert.equal(new PetStateMachine().update(snapshot(thread({ turnState: 'running', sessionStatus: 'stopped' })), null, now).mood, 'idle');
});
test('historical turn errors do not monopolize the pet', () => {
  assert.equal(new PetStateMachine().update(snapshot(thread({ turnState: 'error', sessionStatus: 'stopped', completedAt: new Date(now - 3600_000).toISOString() })), null, now).mood, 'idle');
});
test('missing selected chat is explicit and does not follow another chat', () => {
  assert.equal(new PetStateMachine().update(snapshot(thread()), 'missing', now).label, 'Chat unavailable');
});
test('changing followed chat cancels an unrelated celebration', () => {
  const machine = new PetStateMachine();
  machine.update(snapshot(thread({ turnState: 'running' })), null, now);
  machine.update(snapshot(thread()), null, now + 100);
  assert.equal(machine.update(snapshot(thread(), thread({ id: 'two' })), 'two', now + 200).mood, 'idle');
});
