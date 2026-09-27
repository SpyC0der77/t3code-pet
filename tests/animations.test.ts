import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { animations, frameAt, moodAnimation } from '../src/animations';

test('emotion timing preserves the original source loop lengths and closing frames', () => {
  for (const [name, duration] of [['ready', 3840], ['typing', 1920], ['waiting', 2880], ['broken', 2400]] as const) {
    const animation = animations[name];
    assert.equal(animation.durations.length, 49);
    assert.equal(animation.durations.reduce((a,b) => a+b, 0), duration);
    assert.equal(frameAt(animation, duration - 1), 48);
    assert.equal(frameAt(animation, duration), 0);
    assert.equal(frameAt(animation, animation.durations[0]), 1);
    assert.equal(frameAt(animation, 500, true), 0);
  }
});
test('sprite grids contain every referenced frame and transparency', () => {
  for (const animation of Object.values(animations)) {
    const sheet = PNG.sync.read(readFileSync(`assets/lfg/${animation.file}`));
    assert.equal(sheet.width, animation.width * animation.columns);
    assert.equal(sheet.height, Math.ceil(animation.durations.length / animation.columns) * animation.height);
    let transparent = 0, opaque = 0;
    for (let i = 3; i < sheet.data.length; i += 4) sheet.data[i] === 0 ? transparent++ : opaque++;
    assert.ok(transparent > 0 && opaque > 0);
    assert.ok(animation.x + animation.width * animation.scale <= 256);
    assert.ok(animation.y + animation.height * animation.scale <= 256);
  }
});
test('all six pet states map to supplied art', () => {
  assert.equal(moodAnimation.working, 'typing'); assert.equal(moodAnimation.waiting, 'waiting');
  assert.equal(moodAnimation.error, 'broken'); assert.equal(moodAnimation.done, 'jumping');
  assert.equal(moodAnimation.idle, 'ready'); assert.equal(moodAnimation.offline, 'ready');
});
