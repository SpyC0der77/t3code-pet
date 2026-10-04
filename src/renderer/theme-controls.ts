// Adapted from T3 Code ThemeSettings, ThemeWireframe and ThemePreviewCircles.
// MIT copyright (c) 2026 T3 Tools Inc. See docs/T3-THEME-LICENSE.txt.
import { themeChoices } from '../theme-options';
import { defaultUiPalette, palettes } from '../t3-palettes';
import type { Preferences } from '../shared';

type Colors = typeof defaultUiPalette.light;
type Mode = 'light' | 'dark';
const colorsFor = (id: string, mode: Mode): Colors => id in palettes
  ? palettes[id as keyof typeof palettes][mode] : defaultUiPalette[mode];
const span = (className: string) => {
  const node = document.createElement('span'); node.className = className; return node;
};

// Upstream's percentage-based miniature, sized down for the companion dialog.
function wireframe(colors: Colors, half?: 'left' | 'right') {
  const pane = span('theme-wireframe-pane');
  if (half) pane.dataset.half = half;
  for (const [name, value] of Object.entries({ canvas: colors.canvas, sidebar: colors.chrome,
    surface: colors.surface, selected: colors.accentSurface, action: colors.messageAction, message: colors.border })) {
    pane.style.setProperty(`--preview-${name}`, value);
  }
  for (const name of ['sidebar', 'search', 'thread selected', 'thread second', 'thread third', 'message', 'line first', 'line second', 'composer', 'send']) {
    pane.append(span(`wireframe-${name.replaceAll(' ', ' wireframe-')}`));
  }
  return pane;
}

function circle(colors: Colors, mode: Mode) {
  const node = span('theme-swatch'); node.dataset.mode = mode;
  const artwork = span('theme-swatch-artwork');
  // Same oklab blend, corner positions and falloff as upstream themePreview.ts.
  const base = `color-mix(in oklab, ${colors.canvas} 80%, ${mode === 'light' ? '#ffffff' : '#09090b'})`;
  const accentPosition = mode === 'light' ? '72% 22%' : '28% 78%';
  const actionPosition = mode === 'light' ? '18% 82%' : '82% 18%';
  artwork.style.backgroundColor = base;
  artwork.style.backgroundImage = `radial-gradient(circle at ${accentPosition} in oklab, ${colors.accentSurface} 0%, color-mix(in oklab, ${colors.accentSurface} ${mode === 'light' ? 72 : 62}%, transparent) 28%, transparent 58%), radial-gradient(circle at ${actionPosition} in oklab, color-mix(in oklab, ${colors.messageAction} 45%, transparent) 0%, transparent 55%)`;
  node.append(artwork); return node;
}

export function createThemeControls() {
  const theme = document.getElementById('ui-theme') as HTMLSelectElement;
  const appearance = document.getElementById('theme-appearance') as HTMLSelectElement;
  const follow = document.getElementById('follow-t3-theme') as HTMLInputElement;
  const modeGrid = document.getElementById('theme-modes')!;
  const styleGrid = document.getElementById('theme-styles')!;
  let independent: Preferences['theme'] = 'default';
  let busy = false;
  const modes: { input: HTMLInputElement; frame: HTMLElement }[] = [];
  const styles: HTMLInputElement[] = [];
  for (const [id, label] of themeChoices) theme.add(new Option(label, id));
  const choose = (select: HTMLSelectElement, value: string) => {
    select.value = value; update(busy);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  for (const [id, name] of [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]) {
    const label = document.createElement('label'); label.className = 'theme-mode-choice';
    const input = document.createElement('input'); input.type = 'radio'; input.name = 'theme-mode'; input.value = id!;
    const frame = span('theme-wireframe'); frame.setAttribute('aria-hidden', 'true');
    const text = span('theme-choice-name'); text.textContent = name!;
    label.append(input, frame, text); modeGrid.append(label); modes.push({ input, frame });
    input.addEventListener('change', () => { if (input.checked) choose(appearance, input.value); });
  }
  for (const [id, name] of themeChoices) {
    if (id === 'follow-t3-code') continue;
    const label = document.createElement('label'); label.className = 'theme-style-choice';
    const input = document.createElement('input'); input.type = 'radio'; input.name = 'theme-style'; input.value = id;
    const swatches = span('theme-style-swatches'); swatches.setAttribute('aria-hidden', 'true');
    swatches.append(circle(colorsFor(id, 'light'), 'light'), circle(colorsFor(id, 'dark'), 'dark'));
    const text = span('theme-choice-name'); text.textContent = name;
    label.append(input, swatches, text); styleGrid.append(label); styles.push(input);
    input.addEventListener('change', () => { if (input.checked) choose(theme, input.value); });
  }
  follow.addEventListener('change', () => choose(theme, follow.checked ? 'follow-t3-code' : independent));
  let previewId = '';
  function update(saving = false) {
    busy = saving;
    const following = theme.value === 'follow-t3-code';
    if (!following) independent = theme.value as Preferences['theme'];
    follow.checked = following; follow.disabled = busy;
    theme.disabled = busy; appearance.disabled = busy || following;
    for (const input of styles) { input.checked = input.value === theme.value; input.disabled = busy; }
    for (const { input } of modes) { input.checked = input.value === appearance.value; input.disabled = busy || following; }
    const id = following ? document.documentElement.dataset.theme ?? 'default' : theme.value;
    if (previewId === id) return;
    previewId = id;
    for (const { input, frame } of modes) frame.replaceChildren(...(input.value === 'system'
      ? [wireframe(colorsFor(id, 'light'), 'left'), wireframe(colorsFor(id, 'dark'), 'right')]
      : [wireframe(colorsFor(id, input.value as Mode))]));
  }
  theme.addEventListener('change', () => update(busy));
  appearance.addEventListener('change', () => update(busy));
  return {
    update,
    read: () => ({ theme: theme.value as Preferences['theme'], themeAppearance: appearance.value as Preferences['themeAppearance'] }),
    hydrate: (preferences: Preferences) => {
      theme.value = preferences.theme; appearance.value = preferences.themeAppearance; update();
    },
  };
}
