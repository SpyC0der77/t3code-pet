import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { buildSync } from 'esbuild';

const source = buildSync({ entryPoints: ['src/renderer/pet.ts'], bundle: true, write: false,
  platform: 'browser', format: 'iife' }).outputFiles[0].text;

test('pet hit testing follows cursor coordinates without native enter/leave feedback', () => {
  const decisions: boolean[] = [];
  let position: (point: { x: number; y: number }) => void;
  let alpha = 255;
  const events = new Map<string, () => void>();
  const canvas = { width: 288, height: 288, addEventListener() {},
    getBoundingClientRect: () => ({ left: 8, top: 8, width: 144, height: 144 }),
    getContext: () => ({ getImageData: () => ({ data: [0, 0, 0, alpha] }) }) };
  runInNewContext(source, {
    document: { querySelector: () => canvas, createElement: () => canvas,
      addEventListener: (name: string, listener: () => void) => events.set(name, listener) },
    window: { addEventListener() {}, pet: {
      onState() {}, onNotificationSound() {}, getState: () => new Promise(() => {}),
      onCursorPosition: (listener: typeof position) => { position = listener; },
      mousePassthrough: (ignore: boolean) => decisions.push(ignore),
    } },
    Audio: class { preload = ''; }, Image: class { decode() { return Promise.resolve(); } },
    performance: { now: () => 0 }, matchMedia: () => ({ matches: false }),
    requestAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {},
  });
  for (let i = 0; i < 20; i++) position!({ x: 80, y: 80 });
  events.get('mouseleave')?.();
  position!({ x: 80, y: 80 });
  assert.deepEqual(decisions, [false], 'Native leave must not switch a pet under the cursor to pass-through.');
  alpha = 0;
  position!({ x: 80, y: 80 });
  alpha = 255;
  position!({ x: 80, y: 80 });
  position!({ x: -1, y: 80 });
  assert.deepEqual(decisions, [false, true, false, true]);
});
