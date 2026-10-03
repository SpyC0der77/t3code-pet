import type { NotificationSetup } from '../shared';

export type NotificationChoice = 'keep' | 'enable' | 'migrate';

export function createNotificationChoices(host: HTMLElement) {
  host.innerHTML = `<h1 tabindex="-1">Choose your notifications</h1><p class="step-copy">Decide which app sends desktop alerts.</p>
      <div class="notification-check"><span id="notification-check">Checking notifications…</span><button id="retry" class="text-button" type="button">Check again</button></div>
      <p id="notification-detail" class="help" role="status"></p>
      <fieldset><legend class="sr-only">Desktop alerts</legend>
        <label class="notification-option" id="migrate-option"><input type="radio" name="notification-choice" value="migrate"><span><strong>Switch to T3 Pet</strong><span>With your permission, Pet closes T3 Code and switches its desktop alerts to Pet. Reopen T3 Code afterward.</span></span></label>
        <label class="notification-option" id="enable-option" hidden><input type="radio" name="notification-choice" value="enable"><span><strong>Enable Pet notifications</strong><span>Get alerts for approval, input, completion, and errors.</span></span></label>
        <label class="notification-option"><input type="radio" name="notification-choice" value="keep" checked><span><strong id="keep-label">Keep my current setup</strong><span id="keep-detail">Leave notification settings unchanged.</span></span></label>
      </fieldset>
      <p class="help">T3 Code's in-app and mobile notices stay unchanged. Alerts pause during fullscreen use where supported.</p>`;
  const element = (id: string) => host.querySelector<HTMLElement>('#' + id)!;
  const radio = (value: string) => host.querySelector<HTMLInputElement>('input[value=' + value + ']')!;
  return {
    choice() { return host.querySelector<HTMLInputElement>('input[name=notification-choice]:checked')!.value as NotificationChoice; },
    reset() { radio('keep').checked = true; },
    render(setup: NotificationSetup, busy: boolean, enabled: boolean) {
      element('notification-check').textContent = setup.status === 'enabled' ? 'T3 Code alerts are on' : setup.status === 'off' ? 'T3 Code alerts are off' : 'Notification settings unavailable';
      element('notification-detail').textContent = setup.supported ? setup.message : 'Desktop notifications are unavailable on this system. You can still use your pet.';
      element('migrate-option').hidden = setup.status !== 'enabled';
      element('enable-option').hidden = setup.status === 'enabled';
      const migrate = radio('migrate'); const enable = radio('enable');
      migrate.disabled = busy || !setup.supported || setup.status !== 'enabled';
      enable.disabled = busy || !setup.supported || setup.status !== 'off';
      if (!busy && ((migrate.checked && migrate.disabled) || (enable.checked && enable.disabled))) radio('keep').checked = true;
      element('keep-detail').textContent = enabled ? 'Keep your existing Pet and T3 Code notification preferences.' : 'Leave T3 Code as it is. Pet notifications will stay off.';
    },
  };
}

export function notificationAction(choice: NotificationChoice) {
  return choice === 'migrate' ? 'Switch notifications' : choice === 'enable' ? 'Enable notifications' : 'Continue';
}
