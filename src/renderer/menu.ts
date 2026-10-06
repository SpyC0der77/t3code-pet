import { applyUiTheme } from './theme';
import type { MenuAction, PetMenuView } from '../pet-menu';
import { PREVIEW_DURATION_MS } from '../shared';
import type { PetMood } from '../shared';
import { headingToSubmenu } from '../menu-pointer';
import { alertsPaused } from '../notification-policy';

declare global { interface Window { petMenu: {
  onVisible(listener: (visible: boolean) => void): () => void;
  get(): Promise<PetMenuView>; onUpdate(listener: (view: PetMenuView) => void): () => void;
  size(main: number, sub: number, top: number): void;
  painted(sequence: number, layout: string): void;
  pointer(): void;
  action(action: MenuAction, mood?: PetMood | null): void; close(): void;
}; } }
const primary = document.getElementById('primary')!;
const submenu = document.getElementById('animations')!;
const trigger = document.getElementById('preview') as HTMLButtonElement;
const back = document.getElementById('back')!;
document.getElementById('preview-label')!.textContent = `Preview animation · ${PREVIEW_DURATION_MS / 1000}s`;
const moods: [PetMood | null, string][] = [['idle', 'Resting'], ['working', 'Working'], ['waiting', 'Needs attention'], ['done', 'Finished'], ['error', 'Error'], ['offline', 'Offline'], [null, 'Follow T3 Code']];
let view: PetMenuView | undefined;
let open = false;
let sequence = -1;
let focusSubmenu = false;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
let search = '', searchedAt = 0;
let corridorOrigin: { x: number; y: number } | undefined;
let previousPointer = { x: 0, y: 0 };
let pointerArmed = false;
let openingPointer: { x: number; y: number } | undefined;
function schedulePreview() {
  if (!pointerArmed || open || hoverTimer) return;
  hoverTimer = setTimeout(() => { hoverTimer = undefined; setOpen(true); }, 160);
}
function cancelClose() { if (closeTimer) clearTimeout(closeTimer); closeTimer = undefined; }
function closeAfter(delay: number) {
  cancelClose();
  closeTimer = setTimeout(() => {
    closeTimer = undefined;
    const target = document.elementFromPoint(previousPointer.x, previousPointer.y);
    if (!target?.closest('#animations, #preview')) setOpen(false);
  }, delay);
}
for (const [mood, label] of moods) {
  if (mood === null) { const separator = document.createElement('div'); separator.className = 'separator'; separator.role = 'separator'; submenu.append(separator); }
  const item = document.createElement('button'); item.type = 'button'; item.role = 'menuitemradio';
  item.dataset.mood = mood ?? 'follow'; item.setAttribute('aria-checked', 'false'); item.tabIndex = -1;
  const text = document.createElement('span'); text.textContent = label;
  const icon = document.createElement('span'); icon.className = 'indicator'; icon.innerHTML = '<svg class="check" viewBox="0 0 24 24"><path d="m6 12 4 4 8-8"/></svg>';
  item.append(text, icon); item.addEventListener('click', () => window.petMenu.action('preview', mood)); submenu.append(item);
}
const buttons = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLButtonElement>('button')].filter(node => !node.hidden);
function focus(item: HTMLButtonElement) {
  for (const node of [...buttons(primary), ...buttons(submenu)]) node.tabIndex = node === item ? 0 : -1;
  item.focus({ preventScroll: true });
  // Scroll only the list, never the transparent window's document. During
  // opening the canvas can still have its previous dimensions.
  const panel = item.closest<HTMLElement>('.popup');
  if (panel) {
    const top = item.offsetTop, bottom = top + item.offsetHeight;
    if (top < panel.scrollTop) panel.scrollTop = top;
    else if (bottom > panel.scrollTop + panel.clientHeight) panel.scrollTop = bottom - panel.clientHeight;
  }
}
function measure() {
  window.petMenu.size(Math.min(primary.scrollHeight + 2, view?.layout.availableHeight ?? 1000), open ? Math.min(submenu.scrollHeight + 2, view?.layout.availableHeight ?? 1000) : 0, trigger.offsetTop - primary.scrollTop);
}
function setOpen(value: boolean, keyboard = false) {
  if (hoverTimer) clearTimeout(hoverTimer); hoverTimer = undefined;
  if (closeTimer) clearTimeout(closeTimer);
  open = value; submenu.hidden = !open; trigger.setAttribute('aria-expanded', String(open));
  corridorOrigin = undefined;
  submenu.style.visibility = value && view?.layout.sub ? 'visible' : 'hidden';
  focusSubmenu = value && keyboard;
  if (!value) { primary.classList.remove('concealed'); primary.inert = false; }
  measure();
  if (focusSubmenu && view?.layout.sub && submenu.style.visibility === 'visible') {
    focusSubmenu = false; focus(buttons(submenu).find(node => node !== back) ?? buttons(submenu)[0]!);
  }
  if (keyboard && !value) focus(trigger);
}
function render(next: PetMenuView) {
  view = next; applyUiTheme(next.state.theme);
  document.documentElement.style.setProperty('--available-height', `${next.layout.availableHeight}px`);
  document.getElementById('visibility-label')!.textContent = next.hidden ? 'Show pet' : 'Hide pet';
  document.getElementById('pause-label')!.textContent = alertsPaused(next.state.preferences) ? 'Resume notifications' : 'Pause alerts for 30 min';
  for (const node of submenu.querySelectorAll<HTMLElement>('[data-mood]')) node.setAttribute('aria-checked', String(node.dataset.mood === (next.previewMood ?? 'follow')));
  const rect = (node: HTMLElement, r: { x: number; y: number; width: number }) => { node.style.left = `${r.x}px`; node.style.top = `${r.y}px`; node.style.width = `${r.width}px`; };
  rect(primary, next.layout.main);
  if (next.layout.sub) rect(submenu, next.layout.sub);
  submenu.style.visibility = open && next.layout.sub ? 'visible' : 'hidden';
  back.hidden = !next.layout.stacked;
  primary.classList.toggle('concealed', open && next.layout.stacked); primary.inert = open && next.layout.stacked;
  if (sequence !== next.sequence) {
    sequence = next.sequence; search = ''; pointerArmed = false; openingPointer = undefined; setOpen(false);
    requestAnimationFrame(() => focus(buttons(primary)[0]!));
  }
  if (open && next.layout.sub && focusSubmenu) {
    focusSubmenu = false; focus(buttons(submenu).find(node => node !== back) ?? buttons(submenu)[0]!);
  }
  void document.fonts.ready.then(() => requestAnimationFrame(() => {
    measure();
    requestAnimationFrame(() => { if (view === next) window.petMenu.painted(next.sequence, JSON.stringify(next.layout)); });
  }));
}
for (const node of primary.querySelectorAll<HTMLButtonElement>('[data-action]')) {
  node.tabIndex = -1;
  node.addEventListener('click', () => window.petMenu.action(node.dataset.action as MenuAction));
}
trigger.tabIndex = -1; back.tabIndex = -1;
trigger.addEventListener('click', () => setOpen(!open, true));
back.addEventListener('click', () => setOpen(false, true));
trigger.addEventListener('pointerenter', event => {
  if (closeTimer) clearTimeout(closeTimer);
  openingPointer ??= { x: event.screenX, y: event.screenY };
  schedulePreview();
});
trigger.addEventListener('pointerleave', event => {
  if (hoverTimer) clearTimeout(hoverTimer); hoverTimer = undefined;
  if (open) { corridorOrigin = { x: event.clientX, y: event.clientY }; previousPointer = corridorOrigin; closeAfter(400); }
});
submenu.addEventListener('pointerenter', () => { cancelClose(); corridorOrigin = undefined; });
submenu.addEventListener('pointerleave', () => { closeTimer = setTimeout(() => { if (!submenu.contains(document.activeElement)) setOpen(false); }, 220); });
for (const node of [...buttons(primary), ...buttons(submenu)]) node.addEventListener('pointermove', event => {
  if (!pointerArmed) return;
  // Hover highlights through focus, so pointer and keyboard share one active row.
  if (node === trigger && open && submenu.contains(document.activeElement)) return;
  if (open && corridorOrigin && node.closest('#primary') && node !== trigger && view?.layout.sub && headingToSubmenu(corridorOrigin, previousPointer, { x: event.clientX, y: event.clientY }, submenu.getBoundingClientRect(), view.layout.side)) return;
  focus(node);
  if (node.closest('#primary') && node !== trigger && open) { corridorOrigin = undefined; closeAfter(180); }
});
document.addEventListener('pointermove', event => {
  previousPointer = { x: event.clientX, y: event.clientY };
  openingPointer ??= { x: event.screenX, y: event.screenY };
  if (!pointerArmed && Math.hypot(event.screenX-openingPointer.x, event.screenY-openingPointer.y) >= 4) pointerArmed = true;
  if (pointerArmed && (event.target as Element).closest('#preview')) schedulePreview();
});
document.addEventListener('keydown', event => {
  const panel = submenu.contains(document.activeElement) ? submenu : primary;
  const items = buttons(panel), active = items.indexOf(document.activeElement as HTMLButtonElement);
  if (event.key === 'Escape') { event.preventDefault(); if (open) setOpen(false, true); else window.petMenu.close(); }
  else if (event.key === 'Tab') { event.preventDefault(); window.petMenu.close(); }
  else if (event.key === 'ArrowLeft' && open) { event.preventDefault(); setOpen(false, true); }
  else if (event.key === 'ArrowRight' && document.activeElement === trigger) { event.preventDefault(); setOpen(true, true); }
  else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    if (items[index]) focus(items[index]);
  } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ') {
    const now = performance.now(); search = now - searchedAt > 700 ? event.key : search + event.key; searchedAt = now;
    const ordered = [...items.slice(active + 1), ...items.slice(0, active + 1)];
    const found = ordered.find(node => node.textContent?.toLowerCase().startsWith(search.toLowerCase()));
    if (found) { event.preventDefault(); focus(found); }
  }
});
document.addEventListener('pointerdown', event => { if (!(event.target as Element).closest('.popup')) window.petMenu.close(); });
// Forwarded native mouse movement enables a panel before the next click.
document.addEventListener('pointermove', () => window.petMenu.pointer());
document.addEventListener('contextmenu', event => event.preventDefault());
new ResizeObserver(measure).observe(primary);
new ResizeObserver(measure).observe(submenu);
primary.addEventListener('scroll', measure);
void document.fonts.ready.then(measure);
window.petMenu.onUpdate(render);
window.petMenu.onVisible(visible => {
  document.body.toggleAttribute('data-closed', !visible);
  if(visible) focus(buttons(primary)[0]!);
  else { setOpen(false); pointerArmed = false; openingPointer = undefined; }
});
void window.petMenu.get().then(render);
