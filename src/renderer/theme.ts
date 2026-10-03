import type { UiTheme } from '../t3-theme';
import { palettes } from '../t3-palettes';
const roles: Record<string, string> = { canvas: 'canvas', chrome: 'panel', surface: 'surface', surfaceOverlay: 'overlay', text: 'text', mutedForeground: 'muted', border: 'border', input: 'input-border', messageAction: 'accent', messageActionForeground: 'on-accent', messageActionHover: 'accent-hover', accentSurface: 'selected', errorForeground: 'error' };
let previous = '';
export function applyUiTheme(theme: UiTheme) {
  const signature = JSON.stringify(theme);
  if (previous === signature) return;
  previous = signature;
  const root = document.documentElement;
  root.style.colorScheme = theme.appearance;
  root.dataset.theme = theme.id;
  for (const [role, variable] of Object.entries(roles)) {
    const color = theme.colors[role];
    const fallback = (palettes['t3-chat'][theme.appearance] as Record<string, string>)[role];
    root.style.setProperty(`--${variable}`, CSS.supports('color', color) ? color : fallback);
  }
  root.style.setProperty('--divider', 'var(--border)');
  if (CSS.supports('font-family', theme.fontFamily)) root.style.setProperty('--ui-font', theme.fontFamily);
  root.style.setProperty('--ui-font-size', `${theme.fontSize}px`);
}
