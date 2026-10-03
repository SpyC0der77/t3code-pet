import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { animations, frameAt, moodAnimation } from '../src/animations';
import { pets, petAnimation } from '../src/pets';

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

test('every pet supplies complete transparent frames with valid looping and still poses', () => {
  for (const pet of pets) {
    for (const name of new Set(Object.values(moodAnimation))) {
      const animation = petAnimation(pet.id, name);
      const sheet = PNG.sync.read(readFileSync(`assets/${animation.file}`));
      assert.equal(sheet.width, animation.width * animation.columns);
      assert.equal(sheet.height, ((animation.row ?? 0) + Math.ceil(animation.durations.length / animation.columns)) * animation.height);
      assert.ok(animation.durations.length > 1);
      assert.ok(animation.durations.every(duration => Number.isFinite(duration) && duration > 0));
      const total = animation.durations.reduce((sum, duration) => sum + duration, 0);
      assert.equal(frameAt(animation, total - 1), animation.durations.length - 1);
      assert.equal(frameAt(animation, total), 0);
      assert.equal(frameAt(animation, total / 2, true), 0);
      assert.ok(animation.x >= 0 && animation.y >= 0);
      assert.ok(animation.x + animation.width * animation.scale <= 256);
      assert.ok(animation.y + animation.height * animation.scale <= 256);
      for (let frame = 0; frame < animation.durations.length; frame++) {
        const left = frame % animation.columns * animation.width;
        const top = ((animation.row ?? 0) + Math.floor(frame / animation.columns)) * animation.height;
        let visible = 0, transparent = 0;
        for (let y = top; y < top + animation.height; y++) {
          for (let x = left; x < left + animation.width; x++) {
            const alpha = sheet.data[(y * sheet.width + x) * 4 + 3];
            if (alpha === 0) transparent++;
            else visible++;
          }
        }
        assert.ok(visible > 0 && transparent > 0, `${pet.id}/${name} frame ${frame} needs artwork and transparency`);
      }
    }
  }
});
