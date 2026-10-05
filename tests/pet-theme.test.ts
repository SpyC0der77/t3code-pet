import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaults, validatePreferences, storePreferences, loadPreferences } from '../src/preferences';
import { resolvePetTheme } from '../src/pet-theme';
import { resolveUiTheme } from '../src/t3-theme';
import { themeChoices } from '../src/theme-options';

const followed = resolveUiTheme({ 't3code:theme': 'iris', 't3code:theme-appearance-mode': 'dark' }, false,
  { fontFamilySans: 'DM Sans', fontSizeInterface: 16 });

test('upgrading existing preferences defaults to following T3 Code without losing settings', t => {
  const folder = mkdtempSync(join(tmpdir(), 't3pet-theme-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const file = join(folder, 'preferences.json');
  const { theme, themeAppearance, ...legacy } = defaults();
  writeFileSync(file, JSON.stringify({ ...legacy, size: 160, notificationStyle: 'custom' }));
  const loaded = loadPreferences(file);
  assert.equal(loaded.theme, 'follow-t3-code');
  assert.equal(loaded.themeAppearance, 'system');
  assert.equal(loaded.size, 160);
  assert.equal(loaded.notificationStyle, 'custom');
  storePreferences(file, validatePreferences({ theme: 'ember', themeAppearance: 'dark' }, loaded));
  assert.equal(loadPreferences(file).theme, 'ember');
  assert.equal(loadPreferences(file).themeAppearance, 'dark');
  assert.throws(() => validatePreferences({ theme: 'made-up' }, loaded), /Invalid theme/);
  assert.throws(() => validatePreferences({ themeAppearance: 'made-up' }, loaded), /Invalid theme appearance/);
});

test('following uses T3 colors and independent themes survive T3 changes', () => {
  assert.equal(resolvePetTheme(followed, 'follow-t3-code', 'light', false), followed);
  const changed = resolveUiTheme({ 't3code:theme': 'grove', 't3code:theme-appearance-mode': 'light' }, false);
  for (const [id] of themeChoices.filter(([id]) => id !== 'follow-t3-code')) {
    const local = resolvePetTheme(followed, id, 'dark', false);
    assert.equal(local.appearance, 'dark');
    assert.equal(local.id, id);
    assert.equal(local.fontFamily, 'DM Sans');
    assert.equal(local.fontSize, 16);
    assert.deepEqual(local.colors, resolvePetTheme(changed, id, 'dark', true).colors);
    assert.equal(resolvePetTheme(followed, id, 'light', true).appearance, 'light');
    assert.equal(resolvePetTheme(followed, id, 'system', true).appearance, 'dark');
    assert.equal(resolvePetTheme(followed, id, 'system', false).appearance, 'light');
  }
});
