import { applyUiTheme } from './theme';
import type { ToastView } from '../toast-windows';
declare global {
  interface Window { petToast: {
    get(): Promise<ToastView>; onUpdate(listener: (value: ToastView) => void): () => void;
    dismiss(): void; pause(paused: boolean): void; open(): Promise<void>;
    drag(action: 'start' | 'move' | 'end' | 'cancel', x: number, y: number): void;
    onDragProgress(listener: (progress: { opacity: number; animate: boolean }) => void): () => void;
    size(height: number): void;
  }; }
}
const open = document.getElementById('open') as HTMLButtonElement;
function fitHeight() { window.petToast.size(Math.ceil(document.querySelector('main')!.getBoundingClientRect().height) + 16); }
new ResizeObserver(fitHeight).observe(document.querySelector('main')!);
void document.fonts.ready.then(fitHeight);
window.petToast.onDragProgress(({ opacity, animate }) => {
  document.body.style.transition = animate ? '' : 'none';
  document.body.style.opacity = String(opacity);
});
function render(view: ToastView) {
  applyUiTheme(view.theme);
  document.querySelector('main')!.dataset.kind = view.notice.kind;
  document.getElementById('title')!.textContent = view.notice.title;
  document.getElementById('description')!.textContent = view.notice.body;
  document.getElementById('status-mark')!.setAttribute('d', view.notice.kind === 'Turn finished' ? 'm8 12 3 3 5-6' : view.notice.kind === 'test' ? 'M12 11v5m0-9h.01' : 'M12 8v5m0 3h.01');
  open.textContent = view.test ? 'Open settings' : 'Open chat';
}
window.petToast.onUpdate(render);
void window.petToast.get().then(render);
document.getElementById('dismiss')!.addEventListener('click', () => window.petToast.dismiss());
open.addEventListener('click', async () => {
  open.disabled = true;
  try { await window.petToast.open(); }
  catch (error) {
    const message = document.getElementById('open-error')!;
    message.textContent = error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Could not open this chat. Reopen T3 Code and try again.';
    message.hidden = false;
  } finally { open.disabled = false; }
});
let hovered = false;
function pause() { window.petToast.pause(hovered || document.hasFocus()); }
document.addEventListener('mouseenter', () => { hovered = true; pause(); });
document.addEventListener('mouseleave', () => { hovered = false; pause(); });
window.addEventListener('focus', pause);
window.addEventListener('blur', pause);
document.addEventListener('keydown', event => { if (event.key === 'Escape') window.petToast.dismiss(); });

const panel = document.querySelector('main')!;
let dragPointer: number | null = null;
panel.addEventListener('pointerdown', event => {
  if (event.button !== 0 || dragPointer !== null || (event.target as Element).closest('button')) return;
  dragPointer = event.pointerId;
  panel.dataset.dragging = '';
  panel.setPointerCapture(event.pointerId);
  window.petToast.drag('start', event.screenX, event.screenY);
});
panel.addEventListener('pointermove', event => {
  if (event.pointerId === dragPointer) window.petToast.drag('move', event.screenX, event.screenY);
});
function finishDrag(event: PointerEvent, action: 'end' | 'cancel') {
  if (event.pointerId !== dragPointer) return;
  dragPointer = null;
  delete panel.dataset.dragging;
  window.petToast.drag(action, event.screenX, event.screenY);
  if (panel.hasPointerCapture(event.pointerId)) panel.releasePointerCapture(event.pointerId);
  pause();
}
panel.addEventListener('pointerup', event => finishDrag(event, 'end'));
panel.addEventListener('pointercancel', event => finishDrag(event, 'cancel'));
panel.addEventListener('lostpointercapture', event => finishDrag(event, 'cancel'));
