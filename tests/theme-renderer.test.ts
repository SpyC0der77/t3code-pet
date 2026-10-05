import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyUiTheme } from '../src/renderer/theme';
import { resolveUiTheme } from '../src/t3-theme';
import { defaultUiPalette, palettes } from '../src/t3-palettes';

const roles: Record<string, string> = {
  canvas: 'canvas', chrome: 'panel', surface: 'surface', surfaceOverlay: 'overlay',
  text: 'text', mutedForeground: 'muted', border: 'border', input: 'input-border',
  messageAction: 'accent', messageActionForeground: 'on-accent', messageActionHover: 'accent-hover',
  accentSurface: 'selected', errorForeground: 'error',
};

test('renderer maps dark colors, preserves custom colors and resets them on a light switch', t => {
  const properties = new Map<string, string>();
  const root = { style: { colorScheme: '', setProperty: (name: string, value: string) => properties.set(name, value) }, dataset: { theme: '' } };
  for (const [name, value] of Object.entries({
    document: { documentElement: root },
    CSS: { supports: (_property: string, value: string) => !!value && value !== 'invalid-color' },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const dark = resolveUiTheme({ 't3code:theme': 'iris', 't3code:theme-appearance-mode': 'dark' }, false);
  applyUiTheme(dark);
  assert.equal(root.style.colorScheme, 'dark');
  assert.equal(root.dataset.theme, 'iris');
  for (const [role, variable] of Object.entries(roles)) assert.equal(properties.get(`--${variable}`), dark.colors[role]);
  assert.equal(properties.get('--success'), '#a5b29a');
  assert.equal(properties.get('--warning'), '#c2ad83');

  applyUiTheme({ ...dark, id: 'custom', colors: { ...dark.colors, canvas: '#121314', surfaceOverlay: 'invalid-color', warningForeground: '#c8b790' } });
  assert.equal(properties.get('--canvas'), '#121314');
  assert.equal(properties.get('--overlay'), palettes['t3-chat'].dark.surfaceOverlay);
  assert.equal(properties.get('--warning'), '#c8b790');

  const light = resolveUiTheme({ 't3code:theme': 'light' }, true);
  applyUiTheme(light);
  assert.equal(root.style.colorScheme, 'light');
  for (const [role, variable] of Object.entries(roles)) assert.equal(properties.get(`--${variable}`), light.colors[role]);
  assert.equal(properties.get('--success'), '#047857');
  assert.equal(properties.get('--warning'), '#bb4d00');
});

test('preload CSS uses the same default light and dark colors as the resolver', () => {
  const css = readFileSync(new URL('../src/renderer/theme.css', import.meta.url), 'utf8');
  const [light, dark] = css.split('@media (prefers-color-scheme: dark)');
  for (const [appearance, block] of [['light', light], ['dark', dark]] as const) {
    assert.ok(block, `missing ${appearance} fallback`);
    const properties = new Map([...block.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map(match => [match[1], match[2]]));
    for (const [role, variable] of Object.entries(roles)) {
      const color = properties.get(variable);
      const expanded = color === '#fff' ? '#ffffff' : color;
      assert.equal(expanded, (defaultUiPalette[appearance] as Record<string, string>)[role], `${appearance} ${variable}`);
    }
  }
});
