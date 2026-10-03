import type { AppState, NotificationSetup } from '../shared';
import { createNotificationChoices, notificationAction } from './notification-choices';

export function createNotificationModal(state: () => AppState, updated: (state: AppState) => void) {
  const dialog = document.getElementById('notification-dialog') as HTMLDialogElement;
  const choicesHost = document.getElementById('notification-choices')!;
  const choices = createNotificationChoices(choicesHost);
  const heading = choicesHost.querySelector('h1')!;
  heading.id = 'notification-dialog-title';
  const error = document.getElementById('notification-error')!;
  const action = document.getElementById('notification-action-label')!;
  let busy = false;
  let checking = false;
  let setup: NotificationSetup | null = null;
  function showError(value: unknown) {
    error.textContent = value instanceof Error ? value.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Could not update notifications. Try again.';
    error.hidden = false;
  }
  function render() {
    for (const control of dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button')) control.disabled = busy;
    if (setup) choices.render(setup, busy, state().preferences.notificationsEnabled, state().notificationsSupported);
    else for (const radio of choicesHost.querySelectorAll<HTMLInputElement>('input')) radio.disabled = true;
    (document.getElementById('notification-apply') as HTMLButtonElement).disabled = busy || !setup;
    action.textContent = busy ? checking ? 'Checking…' : 'Applying…' : notificationAction(choices.choice());
  }
  async function check() {
    busy = true; checking = true; error.hidden = true; render();
    try { setup = await window.pet.notificationSetup(); }
    catch (value) { showError(value); }
    finally { busy = false; checking = false; render(); }
  }
  function close() { if (!busy) dialog.close(); }
  document.getElementById('notification-close')!.addEventListener('click', close);
  document.getElementById('notification-cancel')!.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  choicesHost.addEventListener('change', render);
  choicesHost.querySelector('#retry')!.addEventListener('click', () => { if (!busy) void check(); });
  document.getElementById('notification-form')!.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !setup) return;
    busy = true; error.hidden = true; render();
    try {
      const result = await window.pet.finishOnboarding(choices.choice(), choices.style());
      setup = result;
      if (result.outcome === 'cancelled') { error.textContent = result.message; error.hidden = false; return; }
      updated(await window.pet.getState());
      dialog.close();
    } catch (value) { showError(value); }
    finally { busy = false; render(); }
  });
  return {
    async open() {
      if (dialog.open) return;
      setup = null; choices.reset(state().preferences.notificationStyle); error.hidden = true;
      dialog.showModal(); heading.focus();
      await check();
    },
  };
}
