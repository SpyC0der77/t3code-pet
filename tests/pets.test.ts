import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pets, petAnimation } from '../src/pets';
import { frameAt, moodAnimation } from '../src/animations';
import { defaults, loadPreferences, storePreferences, validatePreferences } from '../src/preferences';

test('every imported mood references populated atlas cells and unchanged source artwork', () => {
  const sources = JSON.parse(readFileSync('assets/pets/sources.json', 'utf8')) as {
    id: string; file: string; sha256: string; width: number; height: number;
  }[];
  const expectedIds = ['lfg', 'jadebyte', 'lunari', 'kerno', 'aion', 'floppy', 'oscillo', 'caspian', 'cinder', 'hoggie', 'cat-stack'];
  assert.equal(sources.length, expectedIds.length - 1);
  assert.deepEqual(pets.map(pet => pet.id), expectedIds);
  for (const folder of ['assets/pets', 'dist/renderer/pets']) {
    assert.deepEqual(readdirSync(folder, { withFileTypes: true }).filter(entry => entry.isDirectory() && entry.name !== 'licenses').map(entry => entry.name).sort(), expectedIds.filter(id => id !== 'lfg').sort());
  }
  for (const source of sources) {
    assert.ok(pets.some(pet => pet.id === source.id));
    const bytes = readFileSync(`assets/pets/${source.file}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
    const expected = source.id === 'kerno' ? 6 : 7;
    for (const [mood, row, count] of [['idle', 0, expected], ['offline', 0, expected], ['working', 7, 6], ['waiting', 6, 6], ['error', 5, 8], ['done', 4, 5]] as const) {
      const animation = petAnimation(source.id, moodAnimation[mood]);
      assert.equal(animation.row, row);
      assert.equal(animation.durations.length, count);
      assert.equal(animation.width * animation.columns, source.width);
      assert.ok((row + 1) * animation.height <= source.height);
      assert.ok(animation.durations.every(time => time > 0));
      const total = animation.durations.reduce((a, b) => a + b, 0);
      assert.equal(frameAt(animation, total - 1), count - 1);
      assert.equal(frameAt(animation, total), 0);
    }
  }
});

test('pet choice survives restart and partial updates; unknown asset paths are rejected', () => {
  const folder = mkdtempSync(join(tmpdir(), 't3pet-pet-choice-'));
  try {
    const file = join(folder, 'preferences.json');
    assert.equal(defaults().petId, 'lfg');
    assert.equal(pets.find(pet => pet.id === 'lfg')?.name, "Lil' Finder Guy");
    for (const pet of pets) {
      const chosen = validatePreferences({ petId: pet.id }, defaults());
      storePreferences(file, chosen);
      assert.equal(loadPreferences(file).petId, pet.id);
      assert.equal(validatePreferences({ size: 96 }, chosen).petId, pet.id);
    }
    const legacy = defaults();
    const { petId: _, ...oldPreferences } = legacy;
    assert.equal(validatePreferences(oldPreferences, defaults()).petId, 'lfg');
    for (const petId of [null, 1, '', '../lfg', 'https://example.com/pet', 'kiro', 'spark', 'demir']) {
      assert.throws(() => validatePreferences({ petId }, defaults()), /Invalid pet/);
    }
    for (const petId of ['bella', 'aetherwing', 'aethercore', 'aethermite', 'aetherbite', 'calian', 'scarlet', 'airi']) {
      assert.throws(() => validatePreferences({ petId }, defaults()), /Invalid pet/);
      const saved = { ...defaults(), petId, size: 160, reducedMotion: true, onboardingCompleted: true, notificationsEnabled: true };
      writeFileSync(file, JSON.stringify(saved));
      assert.deepEqual(loadPreferences(file), { ...saved, petId: 'lfg' });
    }
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
