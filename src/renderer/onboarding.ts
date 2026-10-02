import type { AppState, NotificationSetup } from '../shared';
import { loadSprites, drawSprite } from './sprite';
import { moodAnimation } from '../animations';

const element = (id: string) => document.getElementById(id)!;
const button = (id: string) => element(id) as HTMLButtonElement;
const directory = element('directory') as HTMLInputElement;
let step = 0;
let busy = false;
let initialized = false;
let state: AppState;
let setup: NotificationSetup | null = null;
let checkGeneration = 0;
const errorText = (error: unknown) => error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Could not finish setup. Try again.';
function showError(error: unknown) { element('setup-error').textContent = errorText(error); element('setup-error').hidden = false; }
function clearError() { element('setup-error').hidden = true; }
function actionLabel() {
  const choice = document.querySelector<HTMLInputElement>('input[name=notification-choice]:checked')!.value;
  element('action-label').textContent = busy ? step === 1 ? 'Applying…' : 'Checking…' : step === 2 ? 'Open settings' : step === 1 && choice === 'migrate' ? 'Switch notifications' : step === 1 && choice === 'enable' ? 'Enable notifications' : 'Continue';
}
function updateStepControls() {
  document.querySelectorAll<HTMLButtonElement>('.steps button').forEach((control, i) => {
    control.disabled = busy || step === 2 || i >= step;
  });
}
function setBusy(value: boolean) {
  busy = value;
  for (const control of document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('button,input,select')) control.disabled = value;
  actionLabel();
  renderSetup();
  updateStepControls();
}
function showStep(value: number) {
  step = value; clearError();
  ['connect-step', 'notifications-step', 'finish-step'].forEach((id, i) => { element(id).hidden = i !== value; });
  document.querySelectorAll('.steps button').forEach((item, i) => {
    if (i === value) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
    item.classList.toggle('complete', i < value);
    const number = item.querySelector('.step-number')!;
    if (i < value) number.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 8 2.5 2.5L12 5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
    else number.textContent = String(i + 1);
  });
  element('back').hidden = value !== 1;
  element('skip').hidden = value === 2;
  actionLabel();
  updateStepControls();
  document.querySelector<HTMLElement>(['#connect-step h1', '#notifications-step h1', '#finish-step h1'][value])!.focus();
}
function renderSetup() {
  if (!setup) return;
  element('notification-check').textContent = setup.status === 'enabled' ? 'T3 Code alerts are on' : setup.status === 'off' ? 'T3 Code alerts are off' : 'Notification settings unavailable';
  element('notification-detail').textContent = setup.supported ? setup.message : 'Desktop notifications are unavailable on this system. You can still use your pet.';
  element('migrate-option').hidden = setup.status !== 'enabled';
  element('enable-option').hidden = setup.status === 'enabled';
  const migrate = document.querySelector<HTMLInputElement>('input[value=migrate]')!;
  const enable = document.querySelector<HTMLInputElement>('input[value=enable]')!;
  migrate.disabled = busy || !setup.supported || setup.status !== 'enabled';
  enable.disabled = busy || !setup.supported || setup.status !== 'off';
  if ((migrate.checked && migrate.disabled && !busy) || (enable.checked && enable.disabled && !busy)) document.querySelector<HTMLInputElement>('input[value=keep]')!.checked = true;
  element('keep-detail').textContent = state?.preferences.notificationsEnabled ? 'Keep your existing Pet and T3 Code notification preferences.' : 'Leave T3 Code as it is. Pet notifications will stay off.';
  actionLabel();
}
async function checkSetup() {
  const generation = ++checkGeneration;
  const result = await window.pet.notificationSetup();
  if (generation !== checkGeneration) return;
  setup = result; renderSetup();
}
function render(value: AppState) {
  state = value;
  if (!initialized) { directory.value = value.preferences.dataDirectory; initialized = true; }
  element('connection').textContent = value.snapshot.connected ? 'Connected to T3 Code' : 'T3 Code is not connected';
  element('connection-detail').textContent = value.snapshot.message;
}
window.pet.onState(render);
void window.pet.getState().then(async value => { render(value); await checkSetup(); }).catch(showError);
void loadSprites().then(() => {
  const start = performance.now();
  const canvases = ['preview-pet'].map(id => element(id) as HTMLCanvasElement);
  function animate(now: number) {
    for (const canvas of canvases) drawSprite(canvas, moodAnimation[state?.pet.mood ?? 'idle'], now - start,
      state?.preferences.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches, false, state?.preferences.petId);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}).catch(showError);
button('browse').addEventListener('click', async () => {
  try { const path = await window.pet.chooseDirectory(); if (path) directory.value = path; } catch (error) { showError(error); }
});
button('back').addEventListener('click', () => showStep(0));
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
      const choice = document.querySelector<HTMLInputElement>('input[name=notification-choice]:checked')!.value as 'keep' | 'enable' | 'migrate';
      const result = await window.pet.finishOnboarding(choice);
      setup = result; renderSetup();
      if (result.outcome === 'cancelled') return;
      state = await window.pet.getState();
      element('finish-detail').textContent = choice === 'migrate' ? result.message : state.preferences.notificationsEnabled
        ? 'T3 Pet notifications are on. Your pet will alert you when a chat needs attention, finishes, or fails.'
        : 'Your pet is following local chat status. Your notification settings have not changed.';
      element('test-row').hidden = !state.preferences.notificationsEnabled;
      showStep(2);
    } else window.pet.showSettings();
  } catch (error) { showError(error); } finally {
    setBusy(false);
    if (step !== previousStep) document.querySelector<HTMLElement>(['#connect-step h1', '#notifications-step h1', '#finish-step h1'][step])!.focus();
  }
});
button('test-notification').addEventListener('click', async () => {
  button('test-notification').disabled = true;
  try {
    await window.pet.testNotification();
    element('test-result').textContent = 'Test requested. If no alert appears, allow T3 Pet in system notification settings.';
  } catch (error) { element('test-result').textContent = errorText(error); }
  finally { button('test-notification').disabled = false; }
});
