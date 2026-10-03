import { pets } from '../pets';
import { moodAnimation } from '../animations';
import type { PetMood } from '../shared';
import { createSpriteRenderer } from './sprite';

export function createPetGallery(host: HTMLElement, panel: HTMLElement, choose: (id: string) => void) {
  let mood: PetMood = 'idle';
  let still = false;
  let started = performance.now();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const entries = pets.map(pet => {
    const label = document.createElement('label'); label.className = 'pet-choice';
    const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'character'; radio.value = pet.id;
    radio.setAttribute('aria-label', pet.name);
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128; canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.character = pet.id;
    const name = document.createElement('span'); name.className = 'pet-choice-name'; name.textContent = pet.name;
    const error = document.createElement('span'); error.className = 'pet-preview-error'; error.hidden = true; error.textContent = 'Preview unavailable';
    const renderer = createSpriteRenderer();
    radio.addEventListener('change', () => { if (radio.checked) choose(pet.id); });
    label.append(radio, canvas, name, error);
    return { pet, label, radio, canvas, renderer, error, visible: false };
  });
  host.replaceChildren(...entries.map(entry => entry.label));
  const observer = new IntersectionObserver(changes => {
    for (const change of changes) {
      const entry = entries.find(entry => entry.label === change.target)!;
      entry.visible = change.isIntersecting;
      if (entry.visible) {
        void entry.renderer.loadSprites(entry.pet.id).then(() => { entry.error.hidden = true; }).catch(() => { entry.error.hidden = false; });
      } else entry.renderer.release();
    }
  }, { root: panel });
  for (const entry of entries) observer.observe(entry.label);
  function animate(now: number) {
    if (!document.hidden && !panel.hidden) for (const entry of entries) {
      if (entry.visible && entry.error.hidden) {
        const resolution = Math.round(128 * window.devicePixelRatio);
        if (entry.canvas.width !== resolution) entry.canvas.width = entry.canvas.height = resolution;
        entry.renderer.drawSprite(entry.canvas, moodAnimation[mood], now - started,
          still || motion.matches || mood === 'offline', false, entry.pet.id, true);
      }
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
  return {
    select(id: string) { for (const entry of entries) entry.radio.checked = entry.pet.id === id; },
    preview(value: PetMood, reduced: boolean) {
      if (mood !== value) started = performance.now();
      mood = value; still = reduced;
    },
  };
}
