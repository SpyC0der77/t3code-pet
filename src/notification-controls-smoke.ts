import { clipboard, ClipboardItem, type BrowserWindow } from 'electron';

export async function runNotificationControlsSmoke(win: BrowserWindow) {
  // Snapshot every representation before exercising the native bridge.
  const originalClipboard = await Promise.all((await clipboard.read()).map(async item => new ClipboardItem(
    Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)]))),
  )));
  try {
    const checks = await win.webContents.executeJavaScript(`(async () => {
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const until = async predicate => { for (let i=0;i<200;i++) { if (await predicate()) return; await wait(10); } throw Error('Notification control timed out'); };
      const original = (await window.pet.getState()).preferences;
      document.getElementById('notifications-tab').click();
      await window.pet.savePreferences({notificationsEnabled:true,notificationStyle:'custom'});
      await until(() => document.getElementById('notifications').checked);
      document.getElementById('notification-completion').click();
      document.getElementById('notification-error').click();
      const dirty = !document.getElementById('save').disabled;
      document.getElementById('pause-notifications').click();
      await until(async () => (await window.pet.getState()).preferences.notificationsPausedUntil > Date.now());
      const paused = (await window.pet.getState()).preferences.notificationsPausedUntil;
      const pause30 = paused-Date.now()>29*60*1000 && paused-Date.now()<=30*60*1000;
      await until(() => !document.getElementById('resume-notifications').disabled);
      const draftKept = !document.getElementById('notification-completion').checked && !document.getElementById('notification-error').checked && !document.getElementById('save').disabled;
      document.getElementById('settings-form').requestSubmit();
      await until(async () => !(await window.pet.getState()).preferences.notificationCompletion && document.getElementById('save').disabled);
      const state = await window.pet.getState();
      const saved = !state.preferences.notificationCompletion && !state.preferences.notificationError && state.preferences.notificationAttention;
      const pauseKept = state.preferences.notificationsPausedUntil === paused;
      document.getElementById('resume-notifications').click();
      await until(async () => (await window.pet.getState()).preferences.notificationsPausedUntil === null);
      await until(() => !document.getElementById('pause-notifications').disabled);
      const resumed = document.getElementById('resume-notifications').hidden;
      const select = document.getElementById('notification-pause');
      select.value='1-hour';select.dispatchEvent(new Event('change',{bubbles:true}));
      document.getElementById('pause-notifications').click();
      await until(async () => (await window.pet.getState()).preferences.notificationsPausedUntil > Date.now()+59*60*1000);
      await until(() => !document.getElementById('pause-notifications').disabled);
      const pauseHour = true;
      select.value='tomorrow';select.dispatchEvent(new Event('change',{bubbles:true}));
      document.getElementById('pause-notifications').click();
      const tomorrow=new Date();tomorrow.setHours(24,0,0,0);
      await until(async () => (await window.pet.getState()).preferences.notificationsPausedUntil===tomorrow.getTime());
      await until(() => !document.getElementById('pause-notifications').disabled);
      const pauseTomorrow=true;
      await window.pet.pauseNotifications('resume');
      document.getElementById('general-tab').click();document.getElementById('data-folder').open=true;document.getElementById('data-folder').scrollIntoView({block:'start'});
      document.getElementById('copy-diagnostics').click();
      await until(() => document.getElementById('diagnostics-status').textContent.startsWith('Diagnostics copied'));
      await window.pet.savePreferences({notificationsEnabled:original.notificationsEnabled,notificationStyle:original.notificationStyle,
        notificationAttention:original.notificationAttention,notificationCompletion:original.notificationCompletion,notificationError:original.notificationError});
      return {dirty,pause30,draftKept,saved,pauseKept,resumed,pauseHour,pauseTomorrow,copied:true};
    })()`);
    const report = JSON.parse(await clipboard.readText());
    return { ...checks, clipboard: report.app === 'T3 Pet' && !!report.runtime.electron && !!report.databaseSchema,
      privateFieldsOmitted: !('threads' in report) && !('message' in report) && !('dataDirectory' in report) };
  } finally { await clipboard.write(originalClipboard); }
}
