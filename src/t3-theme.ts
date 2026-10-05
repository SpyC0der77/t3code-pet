import { existsSync, readFileSync, watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import { defaultUiPalette, palettes } from './t3-palettes';
import { ThemeStorage } from './theme-storage';

export interface UiTheme {
  appearance: 'light' | 'dark';
  source: 'light' | 'dark' | 'system';
  id: string;
  colors: Record<string, string>;
  previewColors?: { light: Record<string, string>; dark: Record<string, string> };
  fontFamily: string;
  fontSize: number;
}
const stock = defaultUiPalette;
const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
function json(raw: string | undefined, fallback: any): any { try { return JSON.parse(raw ?? ''); } catch { return fallback; } }
const record = (value: any): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
function overrides(value: unknown) {
  if (!record(value)) return {};
  return Object.fromEntries([...Object.keys(stock.light), 'warningForeground'].filter(key => typeof value[key] === 'string' && value[key].length <= 200).map(key => [key, value[key]]));
}
export function resolveUiTheme(values: Record<string, string>, systemDark: boolean, settings: Record<string, unknown> = {}): UiTheme {
  const custom = json(values['t3code:themes:v1'], []);
  const definitions: Record<string, any> = Object.assign(Object.create(null), Object.fromEntries(Object.entries(palettes).map(([id, variants]) => [id, { appearance: 'light', colors: variants.light, variants: { dark: variants.dark } }])));
  if (Array.isArray(custom)) for (const theme of custom) {
    if (record(theme) && typeof theme.id === 'string' && !['light', 'dark', 'system', 't3-chat-dark'].includes(theme.id) && !(theme.id in definitions) && ['light', 'dark'].includes(theme.appearance)) definitions[theme.id] = theme;
  }
  const aliases: Record<string, string> = { 't3-chat-dark': 't3-chat', 't3-grove': 'grove', 't3-ocean': 'ocean', 't3-ember': 'ember', 't3-iris': 'iris' };
  const alias = (id: string) => Object.hasOwn(aliases, id) ? aliases[id] : id;
  const stored = values['t3code:theme'] ?? 'system';
  const raw = ['system', 'light', 'dark'].includes(stored) || definitions[alias(stored)] ? stored : 'system', selected = alias(raw);
  const theme = definitions[selected];
  const requestedMode = values['t3code:theme-appearance-mode'];
  const mode = ['light', 'dark', 'system'].includes(requestedMode) ? requestedMode
    : values['t3code:theme-follow-system'] === 'true' || (values['t3code:theme-follow-system'] !== 'false' && raw === 'system') ? 'system'
    : raw === 'dark' || raw === 't3-chat-dark' ? 'dark' : theme?.appearance ?? 'light';
  let appearance: 'light' | 'dark' = mode === 'system' ? systemDark ? 'dark' : 'light' : mode as 'light' | 'dark';
  const halves = json(values['t3code:theme-halves:v1'], {});
  const half = record(halves) && typeof halves[appearance] === 'string' ? definitions[alias(halves[appearance])] : null;
  const usableHalf = half && (half.appearance === appearance || record(half.variants?.[appearance]));
  if (!usableHalf && theme && theme.appearance !== appearance && !record(theme.variants?.[appearance])) appearance = theme.appearance;
  const active = usableHalf ? half : theme;
  const colors = active ? { ...palettes['t3-chat'][appearance], ...overrides(active.appearance === appearance ? active.colors : active.variants?.[appearance]) } : stock[appearance];
  const supports = (mode: 'light' | 'dark') => {
    const half = record(halves) && typeof halves[mode] === 'string' ? definitions[alias(halves[mode])] : null;
    return !theme || theme.appearance === mode || record(theme.variants?.[mode]) || !!(half && (half.appearance === mode || record(half.variants?.[mode])));
  };
  const preview = (variant: 'light' | 'dark') => {
    const half = record(halves) && typeof halves[variant] === 'string' ? definitions[alias(halves[variant])] : null;
    const candidate = half && (half.appearance === variant || record(half.variants?.[variant])) ? half : theme;
    return candidate && (candidate.appearance === variant || record(candidate.variants?.[variant]))
      ? { ...palettes['t3-chat'][variant], ...overrides(candidate.appearance === variant ? candidate.colors : candidate.variants[variant]) }
      : stock[variant];
  };
  return { appearance, source: mode === 'system' && supports('light') && supports('dark') ? 'system' : appearance, id: usableHalf ? halves[appearance] : selected, colors,
    previewColors: { light: preview('light'), dark: preview('dark') },
    fontFamily: typeof settings.fontFamilySans === 'string' && settings.fontFamilySans.trim() && settings.fontFamilySans.length <= 500 ? settings.fontFamilySans : font,
    fontSize: typeof settings.fontSizeInterface === 'number' && settings.fontSizeInterface >= 10 && settings.fontSizeInterface <= 24 ? settings.fontSizeInterface : 14 };
}

export function t3ProfileDirectory(appData: string) {
  // The status-data folder is user-selectable and does not identify a desktop
  // channel. Use T3's actual profile identities, honoring its legacy migration.
  const stable = join(appData, 't3code');
  for (const name of ['T3 Code (Alpha)', 't3code', 'T3 Code (Dev)', 't3code-dev']) {
    const profile = join(appData, name);
    if (existsSync(profile)) return profile;
  }
  return stable;
}
export class T3ThemeSync {
  private storage = new ThemeStorage();
  private watcher?: FSWatcher;
  private directory = '';
  private timer?: ReturnType<typeof setInterval>;
  private debounce?: ReturnType<typeof setTimeout>;
  private previous = '';
  constructor(private profile: () => string, private data: () => string, private systemDark: () => boolean, private changed: (theme: UiTheme) => void, refreshIntervalMs: number | null = 1000) {
    this.refresh();
    // Retry missing profiles and racing atomic replacements, and observe font settings.
    if (refreshIntervalMs !== null) this.timer = setInterval(() => this.refresh(), refreshIntervalMs);
  }
  refresh = () => {
    const directory = join(this.profile(), 'Local Storage', 'leveldb');
    if (directory !== this.directory || !this.watcher) {
      this.watcher?.close(); this.directory = directory;
      try {
        this.watcher = watch(directory, () => {
          if (this.debounce) clearTimeout(this.debounce);
          this.debounce = setTimeout(this.refresh, 40);
        });
        this.watcher.on('error', () => { this.watcher?.close(); this.watcher = undefined; });
      } catch { this.watcher = undefined; }
    }
    let values: Record<string, string> = {};
    try { values = this.storage.read(directory); }
    catch { if (existsSync(directory) && this.previous) return; }
    let settings = {};
    try { const document = JSON.parse(readFileSync(join(this.data(), 'client-settings.json'), 'utf8')); settings = document.settings ?? document; } catch { /* Missing settings use T3 defaults. */ }
    const theme = resolveUiTheme(values, this.systemDark(), record(settings) ? settings : {}), signature = JSON.stringify(theme);
    if (signature !== this.previous) { this.previous = signature; this.changed(theme); }
  };
  dispose() { clearInterval(this.timer); clearTimeout(this.debounce); this.watcher?.close(); }
}
