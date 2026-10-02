import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pets, petAnimation } from '../src/pets';
import { moodAnimation } from '../src/animations';
import { defaults, loadPreferences, storePreferences, validatePreferences } from '../src/preferences';

test('only the original pet remains and imports are absent from the build', () => {
  assert.deepEqual(pets.map(pet => pet.id), ['lfg']);
  assert.equal(existsSync('assets/pets'), false);
  assert.equal(existsSync('dist/renderer/pets'), false);
  for (const name of Object.values(moodAnimation)) {
    assert.match(petAnimation('lfg', name).file, /^lfg\//);
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
    for (const petId of ['bella', 'aetherwing', 'aethercore', 'aethermite', 'aetherbite', 'calian', 'scarlet', 'airi', 'jadebyte', 'lunari', 'kerno', 'aion', 'floppy', 'oscillo', 'caspian', 'cinder', 'hoggie', 'cat-stack']) {
      assert.throws(() => validatePreferences({ petId }, defaults()), /Invalid pet/);
      const saved = { ...defaults(), petId, size: 160, reducedMotion: true, onboardingCompleted: true, notificationsEnabled: true };
      writeFileSync(file, JSON.stringify(saved));
      assert.deepEqual(loadPreferences(file), { ...saved, petId: 'lfg' });
    }
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
