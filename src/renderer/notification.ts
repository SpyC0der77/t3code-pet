import { applyUiTheme } from './theme';
import type { ToastView } from '../toast-windows';
import type { ToastRect } from '../toast-layout';

declare global {
  interface Window { petToast: {
    get(): Promise<ToastView>; onUpdate(listener: (value: ToastView) => void): () => void;
    dismiss(id: number): void; pause(paused: boolean): void; open(id: number): Promise<void>;
    hitTest(areas: ToastRect[]): void; capture(active: boolean): void;
    onPointer(listener: (inside: boolean) => void): () => void;
  }; }
}
const icons: Record<string, string> = {
  'Turn finished': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  'Approval needed': '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3m.1 3h.01"/>',
  'Input needed': '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/><path d="M9.1 8a3 3 0 0 1 5.8 1c0 2-3 3-3 3m.1 3h.01"/>',
  'Chat failed': '<circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>',
  test: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/>',
};
const stack = document.getElementById('stack')!;
const template = document.getElementById('toast-template') as HTMLTemplateElement;
const cards = new Map<number, { node: HTMLElement; y: number; height: number; entering: boolean; ending: boolean; dx: number; dy: number }>();
let view: ToastView | undefined;
let hovered = false;
let expanded = false;
let drag: { id: number; pointer: number; x: number; y: number; axis?: 'x' | 'y'; last: number; lastTime: number; velocity: number } | undefined;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let hitTimer: ReturnType<typeof setInterval> | undefined;
let hitStop: ReturnType<typeof setTimeout> | undefined;

function reportHitAreas() {
  const areas = [...cards.values()].filter(card => !card.ending).map(card => {
    const r = card.node.getBoundingClientRect();
    return { x: r.x - 1, y: r.y - 8, width: r.width + 10, height: r.height + 16 };
  });
  // The gaps belong to the expanded stack, so moving between cards cannot
  // collapse the stack underneath the pointer.
  if (expanded && areas.length) {
    const x = Math.min(...areas.map(r => r.x)), y = Math.min(...areas.map(r => r.y));
    const right = Math.max(...areas.map(r => r.x + r.width)), bottom = Math.max(...areas.map(r => r.y + r.height));
    window.petToast.hitTest([{ x, y, width: right - x, height: bottom - y }]);
  } else window.petToast.hitTest(areas);
}
function trackMotion() {
  reportHitAreas();
  if (!hitTimer) hitTimer = setInterval(reportHitAreas, 40);
  if (hitStop) clearTimeout(hitStop);
  hitStop = setTimeout(() => { clearInterval(hitTimer); hitTimer = undefined; reportHitAreas(); }, 550);
}
function transform(card: ReturnType<typeof cards.get>, scale = 1) {
  if (!card) return;
  card.node.style.transform = `translate(${card.dx}px, ${card.y + card.dy}px) scale(${scale})`;
}
function layout() {
  if (!view) return;
  stack.dataset.vertical = view.vertical;
  stack.dataset.expanded = String(expanded);
  stack.style.setProperty('--card-left', `${view.cardLeft}px`);
  const available = view.vertical === 'top' ? innerHeight - view.anchor - 8 : view.anchor - 8;
  stack.style.setProperty('--card-height', `${Math.max(60, (available - 24) / 3)}px`);
  const live = [...view.entries].reverse().map(entry => cards.get(entry.id)!).filter(Boolean);
  for (const card of live) card.height = card.node.querySelector<HTMLElement>('.toast-body')!.offsetHeight + 2;
  const frontHeight = live[0]?.height ?? 0;
  let offset = 0;
  live.forEach((card, index) => {
    const behind = index > 0 && !expanded;
    const height = behind ? frontHeight : card.height;
    card.node.toggleAttribute('data-behind', behind);
    card.node.inert = behind;
    card.node.style.zIndex = String(10 - index);
    card.node.style.height = `${height}px`;
    const scale = expanded ? 1 : 1 - index * .1;
    const slot = expanded ? offset : index * 12;
    if (drag?.id !== Number(card.node.dataset.id)) {
      card.y = view!.vertical === 'top' ? view!.anchor + slot : view!.anchor - height - slot;
      if (behind) card.y += (view!.vertical === 'top' ? 1 : -1) * index * .1 * height;
      card.dx = 0;
      card.dy = card.entering && !reduced.matches ? -32 : 0;
      transform(card, scale);
      card.node.style.opacity = card.entering ? '0' : '1';
    }
    offset += card.height + 12;
  });
  trackMotion();
}
function interaction() {
  const next = hovered || document.hasFocus() || !!drag;
  window.petToast.pause(next);
  if (expanded !== next) { expanded = next; layout(); }
}
function remove(id: number) {
  const card = cards.get(id);
  if (!card || card.ending) return;
  card.ending = true;
  if (drag?.id === id) { drag = undefined; window.petToast.capture(false); interaction(); }
  card.node.dataset.ending = '';
  card.node.inert = true;
  card.node.removeAttribute('data-dragging');
  if (card.dy) card.dy += Math.sign(card.dy) * (card.height + 48);
  else card.dx += (Math.sign(card.dx) || (view?.side === 'left' ? -1 : 1)) * (card.node.offsetWidth + 48);
  transform(card);
  card.node.style.opacity = '0';
  setTimeout(() => { card.node.remove(); cards.delete(id); reportHitAreas(); }, reduced.matches ? 0 : 500);
}
function render(next: ToastView) {
  view = next;
  applyUiTheme(next.theme);
  const ids = new Set(next.entries.map(entry => entry.id));
  for (const id of cards.keys()) if (!ids.has(id)) remove(id);
  for (const entry of next.entries) {
    let card = cards.get(entry.id);
    if (!card) {
      const node = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
      node.dataset.id = String(entry.id);
      // Place the new card just above its anchor before enabling its slide.
      // Otherwise CSS interpolates from the window's top-left corner.
      node.dataset.entering = '';
      card = { node, y: 0, height: 0, entering: true, ending: false, dx: 0, dy: 0 };
      cards.set(entry.id, card); stack.prepend(node);
      wire(node, entry.id);
      requestAnimationFrame(() => requestAnimationFrame(() => { const current = cards.get(entry.id); if (current && !current.ending) { current.node.removeAttribute('data-entering'); current.entering = false; layout(); } }));
    }
    const node = card.node;
    node.dataset.kind = entry.notice.kind;
    node.querySelector('.title')!.textContent = entry.notice.title;
    node.querySelector('.description')!.textContent = entry.notice.body;
    node.querySelector<HTMLElement>('.description')!.title = entry.notice.body;
    node.querySelector('.status-icon')!.innerHTML = icons[entry.notice.kind] ?? icons.test!;
    node.querySelector('.open')!.textContent = entry.test ? 'Open settings' : 'Open chat';
  }
  let previous: ChildNode | null = null;
  const reorder = stack as HTMLElement & { moveBefore?: (node: Node, reference: Node | null) => void };
  for (const entry of [...next.entries].reverse()) {
    const node = cards.get(entry.id)!.node;
    const reference: ChildNode | null = previous ? previous.nextSibling : stack.firstChild;
    if (node !== reference) {
      if (reorder.moveBefore) reorder.moveBefore(node, reference);
      else if (!node.contains(document.activeElement) && drag?.id !== entry.id) stack.insertBefore(node, reference);
    }
    previous = node;
  }
  layout();
}
function wire(node: HTMLElement, id: number) {
  node.querySelector('.dismiss')!.addEventListener('click', () => window.petToast.dismiss(id));
  const open = node.querySelector<HTMLButtonElement>('.open')!;
  open.addEventListener('click', async () => {
    open.disabled = true;
    const error = node.querySelector<HTMLElement>('.open-error')!;
    error.hidden = true;
    try { await window.petToast.open(id); }
    catch (value) {
      error.textContent = value instanceof Error ? value.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Could not open this chat. Reopen T3 Code and try again.';
      error.hidden = false; layout();
    } finally { open.disabled = false; }
  });
  node.addEventListener('pointerenter', () => { hovered = true; interaction(); });
  node.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag || node.hasAttribute('data-behind') || (event.target as Element).closest('button')) return;
    drag = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, last: 0, lastTime: performance.now(), velocity: 0 };
    node.dataset.dragging = '';
    node.setPointerCapture(event.pointerId);
    window.petToast.capture(true);
    interaction();
  });
  node.addEventListener('pointermove', event => {
    if (!drag || drag.id !== id || drag.pointer !== event.pointerId || !view) return;
    let dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 4) drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    dx = drag.axis === 'x' ? dx : 0; dy = drag.axis === 'y' ? dy : 0;
    const outward = drag.axis === 'x' ? view.side === 'right' ? 1 : -1 : view.vertical === 'top' ? -1 : 1;
    const distance = dx || dy;
    const resisted = distance * outward < 0 ? distance * .2 : distance;
    const now = performance.now();
    drag.velocity = (resisted - drag.last) / Math.max(1, now - drag.lastTime);
    drag.last = resisted; drag.lastTime = now;
    const card = cards.get(id)!;
    card.dx = drag.axis === 'x' ? resisted : 0; card.dy = drag.axis === 'y' ? resisted : 0;
    transform(card);
    node.style.opacity = String(Math.max(0, 1 - Math.abs(resisted) / (drag.axis === 'x' ? node.offsetWidth : card.height)));
    reportHitAreas();
  });
  const finish = (event: PointerEvent, cancel: boolean) => {
    if (!drag || drag.id !== id || drag.pointer !== event.pointerId) return;
    const card = cards.get(id)!;
    const outward = drag.axis === 'x' ? view!.side === 'right' ? 1 : -1 : view!.vertical === 'top' ? -1 : 1;
    const distance = card.dx || card.dy;
    const flick = performance.now() - drag.lastTime < 100 && drag.velocity * outward > .5 && distance * outward > 10;
    const dismiss = !cancel && (distance * outward >= 40 || flick);
    drag = undefined;
    node.removeAttribute('data-dragging');
    if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
    window.petToast.capture(false);
    if (dismiss) window.petToast.dismiss(id);
    else layout();
    interaction();
  };
  node.addEventListener('pointerup', event => finish(event, false));
  node.addEventListener('pointercancel', event => finish(event, true));
  node.addEventListener('lostpointercapture', event => finish(event, true));
}
window.petToast.onPointer(inside => { hovered = inside; interaction(); });
window.addEventListener('focus', interaction);
window.addEventListener('blur', () => {
  if (drag) {
    const { id, pointer } = drag;
    drag = undefined;
    const node = cards.get(id)?.node;
    node?.removeAttribute('data-dragging');
    if (node?.hasPointerCapture(pointer)) node.releasePointerCapture(pointer);
    window.petToast.capture(false); layout();
  }
  interaction();
});
window.addEventListener('resize', layout);
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const focused = (document.activeElement as HTMLElement)?.closest<HTMLElement>('.toast');
  const id = focused ? Number(focused.dataset.id) : view?.entries.at(-1)?.id;
  if (id !== undefined) window.petToast.dismiss(id);
});
void document.fonts.ready.then(layout);
reduced.addEventListener('change', layout);
window.petToast.onUpdate(render);
void window.petToast.get().then(render);
