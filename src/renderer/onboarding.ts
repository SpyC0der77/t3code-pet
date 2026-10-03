import { applyUiTheme } from './theme';
import { enhanceDropdowns, syncDropdowns, closeDropdowns } from './dropdown';
import type { AppState, NotificationSetup } from '../shared';
import { loadSprites, drawSprite } from './sprite';
import { moodAnimation } from '../animations';
import { createPetGallery } from './pet-gallery';
import { pets } from '../pets';
import { createNotificationChoices, notificationAction } from './notification-choices';

const element = (id: string) => document.getElementById(id)!;
const button = (id: string) => element(id) as HTMLButtonElement;
const directory = element('directory') as HTMLInputElement;
const notificationChoices = createNotificationChoices(element('notifications-step'));
enhanceDropdowns();
let step = 0;
let busy = false;
let initialized = false;
let state: AppState;
let setup: NotificationSetup | null = null;
let checkGeneration = 0;
const steps = ['connect-step', 'pet-step', 'notifications-step', 'finish-step'];
let selectedPet = 'lfg';
const petSize = element('pet-size') as HTMLSelectElement;
const petStill = element('pet-still') as HTMLInputElement;
const gallery = createPetGallery(element('pet-gallery'), element('pet-step'), id => {
  selectedPet = id; updatePet();
});
function updatePet() {
  gallery.select(selectedPet);
  gallery.preview('idle', petStill.checked);
  element('pet-credit').textContent = pets.find(pet => pet.id === selectedPet)!.credit;
}
const errorText = (error: unknown) => error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Could not finish setup. Try again.';
function showError(error: unknown) { element('setup-error').textContent = errorText(error); element('setup-error').hidden = false; }
function clearError() { element('setup-error').hidden = true; }
function actionLabel() {
  const choice = notificationChoices.choice();
  element('action-label').textContent = busy ? step === 2 ? 'Applying…' : step === 1 ? 'Saving…' : 'Checking…' : step === 3 ? 'Open settings' : step === 2 ? notificationAction(choice) : 'Continue';
}
function updateStepControls() {
  document.querySelectorAll<HTMLButtonElement>('.steps button').forEach((control, i) => {
    control.disabled = busy || step === 3 || i >= step;
  });
}
function setBusy(value: boolean) {
  busy = value;
  for (const control of document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('button,input,select')) control.disabled = value;
  actionLabel();
  renderSetup();
  updateStepControls();
  syncDropdowns();
}
function showStep(value: number) {
  closeDropdowns();
  step = value; clearError();
  steps.forEach((id, i) => { element(id).hidden = i !== value; });
  document.querySelectorAll('.steps button').forEach((item, i) => {
    if (i === value) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
    item.classList.toggle('complete', i < value);
    const number = item.querySelector('.step-number')!;
    if (i < value) number.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 8 2.5 2.5L12 5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
    else number.textContent = String(i + 1);
  });
  element('back').hidden = value === 0 || value === 3;
  element('skip').hidden = value === 3;
  actionLabel();
  updateStepControls();
  element(steps[value]).querySelector<HTMLElement>('h1')!.focus();
}
function renderSetup() {
  if (!setup) return;
  notificationChoices.render(setup, busy, state?.preferences.notificationsEnabled ?? false, state?.notificationsSupported ?? false);
  actionLabel();
}
async function checkSetup() {
  const generation = ++checkGeneration;
  const result = await window.pet.notificationSetup();
  if (generation !== checkGeneration) return;
  setup = result; renderSetup();
}
function render(value: AppState) {
  applyUiTheme(value.theme);
  state = value;
  if (!initialized) {
    directory.value = value.preferences.dataDirectory;
    selectedPet = value.preferences.petId;
    petSize.value = String(value.preferences.size);
    petStill.checked = value.preferences.reducedMotion;
    notificationChoices.reset(value.preferences.notificationStyle);
    updatePet(); initialized = true;
    syncDropdowns();
  }
  element('connection').textContent = value.snapshot.connected ? 'Connected to T3 Code' : 'T3 Code is not connected';
  element('connection-detail').textContent = value.snapshot.message;
}
window.pet.onState(render);
void window.pet.getState().then(async value => { render(value); await checkSetup(); }).catch(showError);
void loadSprites().then(() => {
  const start = performance.now();
  const canvases = ['preview-pet'].map(id => element(id) as HTMLCanvasElement);
  function animate(now: number) {
    for (const canvas of canvases) {
      const size = canvas.getBoundingClientRect().width;
      if (!size) continue;
      const resolution = Math.round(size * devicePixelRatio);
      if (canvas.width !== resolution) canvas.width = canvas.height = resolution;
      canvas.dataset.character = state?.preferences.petId ?? 'lfg';
      drawSprite(canvas, moodAnimation[state?.pet.mood ?? 'idle'], now - start,
        state?.preferences.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches, false, state?.preferences.petId, true);
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}).catch(showError);
button('browse').addEventListener('click', async () => {
  try { const path = await window.pet.chooseDirectory(); if (path) directory.value = path; } catch (error) { showError(error); }
});
button('back').addEventListener('click', () => showStep(step - 1));
petStill.addEventListener('change', updatePet);
document.querySelectorAll<HTMLButtonElement>('.steps button').forEach(control => {
  control.addEventListener('click', () => { if (!control.disabled) showStep(Number(control.dataset.step)); });
});
document.querySelectorAll('input[name=notification-choice]').forEach(control => control.addEventListener('change', actionLabel));
button('retry').addEventListener('click', async () => {
  clearError(); setBusy(true);
  try { await checkSetup(); } catch (error) { showError(error); } finally { setBusy(false); }
});
button('skip').addEventListener('click', async () => {
  if (busy) return;
  setBusy(true); clearError();
  try { await window.pet.finishOnboarding('keep'); window.pet.showSettings(); }
  catch (error) { showError(error); } finally { setBusy(false); }
});
element('onboarding-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  clearError(); setBusy(true);
  const previousStep = step;
  try {
    if (step === 0) {
      render(await window.pet.savePreferences({ dataDirectory: directory.value.trim() }));
      await checkSetup(); showStep(1);
    } else if (step === 1) {
      render(await window.pet.savePreferences({ petId: selectedPet, size: Number(petSize.value), reducedMotion: petStill.checked }));
      await checkSetup(); showStep(2);
    } else if (step === 2) {
      const choice = notificationChoices.choice();
      const result = await window.pet.finishOnboarding(choice, notificationChoices.style());
      setup = result; renderSetup();
      if (result.outcome === 'cancelled') return;
      state = await window.pet.getState();
      element('finish-detail').textContent = choice === 'migrate' ? result.message : state.preferences.notificationsEnabled
        ? 'T3 Pet notifications are on. Your pet will alert you when a chat needs attention, finishes, or fails.'
        : 'Your pet is following local chat status. Your notification settings have not changed.';
      element('test-row').hidden = !state.preferences.notificationsEnabled;
      showStep(3);
    } else window.pet.showSettings();
  } catch (error) { showError(error); } finally {
    setBusy(false);
    if (step !== previousStep) element(steps[step]).querySelector<HTMLElement>('h1')!.focus();
  }
});
button('test-notification').addEventListener('click', async () => {
  button('test-notification').disabled = true;
  try {
    await window.pet.testNotification();
    element('test-result').textContent = state.preferences.notificationStyle === 'custom' ? 'Test sent beside your pet.' : 'Test requested. If no alert appears, allow T3 Pet in system notification settings.';
  } catch (error) { element('test-result').textContent = errorText(error); }
  finally { button('test-notification').disabled = false; }
});
