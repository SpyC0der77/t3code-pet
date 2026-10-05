import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toastPlacement } from '../src/toast-layout';
import { ToastState } from '../src/toast-state';

test('stack opens away from the pet and chooses vertical direction from its screen position', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1080 };
  assert.equal(toastPlacement(area, { x: 1800, y: 900, width: 100, height: 100 }).side, 'left');
  const upper = toastPlacement(area, { x: 400, y: 200, width: 100, height: 100 });
  assert.equal(upper.side, 'right'); assert.equal(upper.vertical, 'top');
  assert.equal(upper.bounds.x + 48, 508); assert.equal(upper.bounds.y + 48, 200);
  const lower = toastPlacement(area, { x: 400, y: 800, width: 100, height: 100 });
  assert.equal(lower.vertical, 'bottom');
  assert.equal(lower.bounds.y + lower.bounds.height - 48, 900);
  const edge = toastPlacement(area, { x: 1400, y: 800, width: 100, height: 100 });
  assert.equal(edge.bounds.x + edge.cardLeft, 1508);
});

test('the entire animation window fits small displays, monitor edges, and negative display origins', () => {
  for (const area of [{ x: -1280, y: -240, width: 1280, height: 720 }, { x: 0, y: 0, width: 320, height: 480 }]) {
    for (const x of [area.x, area.x + area.width - 100]) for (const y of [area.y, area.y + area.height - 100]) {
      const { bounds } = toastPlacement(area, { x, y, width: 100, height: 100 });
      assert.ok(bounds.x >= area.x && bounds.y >= area.y);
      assert.ok(bounds.x + bounds.width <= area.x + area.width && bounds.y + bounds.height <= area.y + area.height);
    }
  }
});

test('updating a chat keeps the card identity and renews its lifetime without creating another entry', () => {
  const state = new ToastState();
  const notice = { threadId: 'chat', title: 'Input needed', body: 'Example', kind: 'Input needed' };
  const first = state.add(notice, false, 0);
  state.pause(first.id, true, 4000);
  const updated = state.add({ ...notice, title: 'Turn finished', kind: 'Turn finished' }, false, 7000);
  assert.equal(updated, first); assert.equal(updated.id, first.id); assert.equal(updated.remaining, 5000);
  assert.equal(state.entries.length, 1);
});
