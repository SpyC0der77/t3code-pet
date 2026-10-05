import { drawSprite, loadSprites } from './sprite';
import { moodAnimation, type AnimationName } from '../animations';
import type { AppState } from '../shared';

const cat = document.querySelector<HTMLCanvasElement>('#cat')!;
let current: AppState | null = null;
const notificationAudio = {
  completion: new Audio('notification-completion.mp3'),
  input: new Audio('notification-input.mp3'),
};
for (const audio of Object.values(notificationAudio)) audio.preload = 'auto';
window.pet.onNotificationSound((kind, test) => {
  if (!current?.preferences.notificationSound || (!test && !current.preferences.notificationsEnabled)) return;
  // A burst should play one cue, rather than several sounds over each other.
  for (const audio of Object.values(notificationAudio)) { audio.pause(); audio.currentTime = 0; }
  void notificationAudio[kind].play().catch(error => console.error('Notification sound could not play', error));
});
let dragging = false;
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
let hoverSent = false;
function cancelHover() {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = undefined;
  hoverSent = false;
}
let passthrough: boolean | null = null;
let spriteReady = false;
let animation: AnimationName = 'ready';
let animatedPet = 'lfg';
let animationStarted = performance.now();
let animationTime = animationStarted;
const motion = matchMedia('(prefers-reduced-motion: reduce)');

function render(state: AppState) {
  current = state;
  if (!state.preferences.notificationsEnabled || !state.preferences.notificationSound) {
    for (const audio of Object.values(notificationAudio)) audio.pause();
  }
  // Keep the artwork at the selected size, with room for its thin outline.
  cat.style.width = `${state.preferences.size * 288 / 256}px`;
  cat.style.height = `${state.preferences.size * 288 / 256}px`;
  cat.setAttribute('aria-label', `T3 Pet: ${state.pet.label}. Press Enter for the menu.`);
  paint();
}

function paint() {
  if (!current || !spriteReady) return;
  const still = current.preferences.reducedMotion || motion.matches || current.pet.mood === 'offline';
  if (!dragging) animationTime = performance.now();
  const next = dragging ? animation : moodAnimation[current.pet.mood];
  if (next !== animation || animatedPet !== current.preferences.petId) {
    animation = next; animatedPet = current.preferences.petId; animationStarted = animationTime;
  }
  drawSprite(cat, animation, animationTime - animationStarted, still, current.darkBackground, animatedPet);
}

// Timestamp-based sampling preserves the source sheets' variable frame durations.
function animate() { if (!document.hidden) paint(); requestAnimationFrame(animate); }
void loadSprites().then(() => { spriteReady = true; paint(); requestAnimationFrame(animate); }).catch(error => console.error('Animation could not load', error));
window.pet.onState(render);
void window.pet.getState().then(render);
cat.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) { event.preventDefault(); window.pet.showMenu(); }
});
cat.addEventListener('contextmenu', event => { event.preventDefault(); window.pet.showMenu({ x: event.screenX, y: event.screenY }); });
cat.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  cancelHover();
  dragging = true;
  cat.setPointerCapture(event.pointerId);
  window.pet.drag('start');
});
function stop() {
  if (dragging) {
    animationStarted += performance.now() - animationTime;
    dragging = false;
    window.pet.drag('stop');
  }
}
cat.addEventListener('pointerup', stop);
cat.addEventListener('pointercancel', stop);
cat.addEventListener('lostpointercapture', stop);
window.addEventListener('blur', stop);
function ignore(value: boolean) {
  if (dragging || value === passthrough) return;
  passthrough = value;
  window.pet.mousePassthrough(value);
}
function checkPointer(point: { x: number; y: number }) {
  if (dragging) return;
  // Pixels outside the pet and its outline pass clicks through to the desktop.
  const rect = cat.getBoundingClientRect();
  const x = Math.floor((point.x - rect.left) * cat.width / rect.width);
  const y = Math.floor((point.y - rect.top) * cat.height / rect.height);
  const opaque = x >= 0 && x < cat.width && y >= 0 && y < cat.height && cat.getContext('2d')!.getImageData(x, y, 1, 1).data[3] > 0;
  ignore(!opaque);
  if (opaque && !dragging) {
    if (!hoverTimer && !hoverSent) hoverTimer = setTimeout(() => {
      hoverTimer = undefined;
      hoverSent = true;
      window.pet.hover();
    }, 150);
  } else cancelHover();
}
window.pet.onCursorPosition(checkPointer);
