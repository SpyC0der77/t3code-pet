import { app, screen, type BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PetMenu } from './pet-menu';
import { taskbarWindowCount, checkWindowIcon } from './window-taskbar-smoke';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function runMenuSmoke(menu: PetMenu, pet: BrowserWindow, directory: string, theme: (appearance: 'light' | 'dark') => Promise<void>, settings: (onboarding?: boolean) => void, settingsWindow: () => BrowserWindow | null) {
  const checks: Record<string, boolean> = {};
  settingsWindow()?.hide();
  const petWasVisible = pet.isVisible();
  const area = screen.getDisplayMatching(pet.getBounds()).workArea;
  const point = { x: area.x + area.width - 24, y: area.y + area.height - 24 };
  const entranceBounds: unknown[] = [];
  const show = async () => {
    const opening = menu.show(point), win = menu.window!;
    let shownBounds = '', changed = false;
    const moved = () => { if (win.isVisible() && shownBounds && shownBounds !== JSON.stringify(win.getBounds())) changed = true; };
    win.on('move', moved); win.on('resize', moved);
    await opening; shownBounds = JSON.stringify(win.getBounds()); await wait(160);
    win.off('move', moved); win.off('resize', moved);
    checks.entryStable = (checks.entryStable ?? true) && !changed && !!shownBounds;
    entranceBounds.push({ shownBounds, finalBounds: win.getBounds(), changed });
    writeFileSync(join(directory, 'menu-entry-bounds.json'), JSON.stringify(entranceBounds, null, 2));
    return win;
  };
  for (const appearance of ['light', 'dark'] as const) {
    await theme(appearance);
    const win = await show();
    if (process.platform === 'win32') checks[appearance + 'MenuTaskbarHidden'] = await taskbarWindowCount() === 0;
    checks.canvasReady = win.isVisible();
    checks[appearance] = await win.webContents.executeJavaScript(`(() => {
      const panel=document.getElementById('primary'), r=panel.getBoundingClientRect(), text=panel.textContent;
      return !document.getElementById('status') && !document.getElementById('thread') && panel.firstElementChild.dataset.action==='settings' && document.documentElement.style.colorScheme==='${appearance}' && r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight && !/[\u00c2\u00c3]/.test(text) && document.querySelector('[data-action=settings]').textContent.trim()==='Settings\u2026' && document.querySelector('[data-action=notifications]').textContent.trim()==='Notifications\u2026';
    })()`);
    writeFileSync(join(directory, `context-menu-${appearance}.png`), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.getElementById('preview').focus()`);
    const nativeBounds = win.getBounds();
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Right'}); win.webContents.sendInputEvent({type:'keyUp',keyCode:'Right'});
    await wait(160);
    checks[appearance + 'StableBounds'] = JSON.stringify(nativeBounds) === JSON.stringify(win.getBounds());
    checks[appearance + 'Submenu'] = await win.webContents.executeJavaScript(`(() => {
      const panel=document.getElementById('animations'), r=panel.getBoundingClientRect();
      return !panel.hidden && r.left>=0 && r.top>=0 && r.right<=innerWidth && r.bottom<=innerHeight && document.activeElement.dataset.mood==='idle';
    })()`);
    writeFileSync(join(directory, `context-menu-submenu-${appearance}.png`), (await win.webContents.capturePage()).toPNG());
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'}); win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
    await wait(80);
    checks[appearance + 'StableClose'] = JSON.stringify(nativeBounds) === JSON.stringify(win.getBounds());
    checks[appearance + 'Escape'] = await win.webContents.executeJavaScript(`document.getElementById('animations').hidden && document.activeElement.id==='preview'`);
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'S'}); win.webContents.sendInputEvent({type:'keyUp',keyCode:'S'});
    await wait(80);
    checks[appearance + 'Typeahead'] = await win.webContents.executeJavaScript(`document.activeElement.dataset.action==='settings'`);
    await win.webContents.executeJavaScript(`(() => {const r=document.getElementById('preview').getBoundingClientRect();document.getElementById('preview').dispatchEvent(new PointerEvent('pointerenter',{clientX:r.x+r.width/2,clientY:r.y+r.height/2,screenX:100,screenY:100}));})()`);
    await wait(220);
    checks[appearance + 'StationaryPointer'] = await win.webContents.executeJavaScript(`document.getElementById('animations').hidden`);
    await win.webContents.executeJavaScript(`(() => {const r=document.getElementById('preview').getBoundingClientRect();document.getElementById('preview').dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:r.x+r.width/2+6,clientY:r.y+r.height/2,screenX:106,screenY:100}));})()`);
    const hoverDeadline = Date.now() + 1200;
    while (Date.now() < hoverDeadline && await win.webContents.executeJavaScript(`document.getElementById('animations').hidden`)) await wait(25);
    checks[appearance + 'DeliberateHover'] = await win.webContents.executeJavaScript(`!document.getElementById('animations').hidden && scrollX===0 && scrollY===0`);
    await win.webContents.executeJavaScript(`document.getElementById('preview').focus()`);
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Right'}); win.webContents.sendInputEvent({type:'keyUp',keyCode:'Right'});
    await wait(80);
    checks[appearance + 'HoverKeyboard'] = await win.webContents.executeJavaScript(`document.activeElement.dataset.mood==='idle'`);
    menu.hide();
    if (process.platform === 'win32') checks[appearance + 'DismissedTaskbarHidden'] = await taskbarWindowCount() === 0;
  }
  const closeSettings = async () => {
    const current = settingsWindow();
    if (!current || current.isDestroyed()) return;
    const closed = new Promise<void>(resolve => current.once('closed', () => resolve()));
    current.close();
    await closed;
  };
  const openSettingsOnce = async (action: 'settings' | 'notifications') => {
    const win = await show();
    // Deliver one mouse click through Chromium rather than calling element.click().
    const point = await win.webContents.executeJavaScript(`(() => {const r=document.querySelector('[data-action=${action}]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
    win.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const current = settingsWindow();
      if (current && !current.isDestroyed() && !menu.visible && current.isVisible() && current.isFocused() && !current.isMinimized() && !current.webContents.isLoadingMainFrame()) {
        if (current.getTitle() === 'T3 Pet settings' && (action === 'settings' || await current.webContents.executeJavaScript(`document.getElementById('notifications-tab')?.getAttribute('aria-selected')==='true'`))) return true;
      }
      await wait(25);
    }
    return false;
  };
  await closeSettings();
  checks.settingsFirstClick = await openSettingsOnce('settings');
  if (process.platform === 'win32') checks.settingsTaskbarVisible = await taskbarWindowCount() === 1;
  const createdSettings = settingsWindow();
  if (process.platform === 'win32' && app.isPackaged && createdSettings) checks.settingsNativeIcons = await checkWindowIcon(createdSettings, directory);
  if (createdSettings && !createdSettings.isDestroyed()) {
    createdSettings.hide();
    checks.settingsHiddenFirstClick = await openSettingsOnce('settings') && settingsWindow() === createdSettings;
    createdSettings.minimize();
    await wait(100);
    checks.settingsMinimizedFirstClick = createdSettings.isMinimized() && await openSettingsOnce('settings') && settingsWindow() === createdSettings;
  } else {
    checks.settingsHiddenFirstClick = checks.settingsMinimizedFirstClick = false;
  }
  checks.settings = checks.settingsFirstClick && checks.settingsHiddenFirstClick && checks.settingsMinimizedFirstClick;
  checks.notifications = await openSettingsOnce('notifications');
  await closeSettings();
  checks.notificationsFirstClick = await openSettingsOnce('notifications');
  if (process.platform === 'win32') checks.onboardingTaskbarVisible = await taskbarWindowCount() === 1;
  settings(false); await wait(300);
  let win = await show();
  await win.webContents.executeJavaScript(`document.getElementById('preview').click()`); await wait(100);
  await win.webContents.executeJavaScript(`document.querySelector('[data-mood=working]').click()`); await wait(100);
  checks.preview = menu.view().previewMood === 'working' && !menu.visible;
  win = await show(); await win.webContents.executeJavaScript(`document.getElementById('preview').click()`); await wait(100);
  checks.selected = await win.webContents.executeJavaScript(`document.querySelector('[data-mood=working]').getAttribute('aria-checked')==='true'`);
  await win.webContents.executeJavaScript(`document.querySelector('[data-mood=follow]').click()`); await wait(80);
  checks.follow = menu.view().previewMood === null;
  win = await show();
  await win.webContents.executeJavaScript(`document.querySelector('[data-action=pause-notifications]').click()`); await wait(80);
  const pausedUntil = menu.view().state.preferences.notificationsPausedUntil;
  checks.pauseAlerts = !!pausedUntil && pausedUntil > Date.now() + 29 * 60_000 && !menu.visible;
  win = await show();
  checks.resumeLabel = await win.webContents.executeJavaScript(`document.getElementById('pause-label').textContent==='Resume notifications'`);
  await win.webContents.executeJavaScript(`document.querySelector('[data-action=pause-notifications]').click()`); await wait(80);
  checks.resumeAlerts = menu.view().state.preferences.notificationsPausedUntil === null && !menu.visible;
  win = await show();
  const hidden = menu.view().hidden;
  await win.webContents.executeJavaScript(`document.querySelector('[data-action=visibility]').click()`); await wait(80);
  checks.visibility = menu.view().hidden !== hidden;
  win = await show();
  checks.visibilityLabel = await win.webContents.executeJavaScript(`document.getElementById('visibility-label').textContent==='${hidden ? 'Hide pet' : 'Show pet'}'`);
  await win.webContents.executeJavaScript(`document.querySelector('[data-action=visibility]').click()`); await wait(80);
  win = await show(); settingsWindow()!.show(); settingsWindow()!.focus();
  const blurDeadline = Date.now() + 2000;
  while (menu.visible && Date.now() < blurDeadline) await wait(25);
  checks.blurCloses = !menu.visible && await win.webContents.executeJavaScript(`document.body.hasAttribute('data-closed') && getComputedStyle(document.getElementById('primary')).visibility==='hidden'`);
  const senderWin = await show();
  await senderWin.webContents.executeJavaScript(`window.petMenu.action('invalid')`); await wait(80);
  checks.invalidRejected = menu.visible;
  menu.hide();
  await pet.webContents.executeJavaScript(`window.pet.showMenu()`); await wait(200);
  checks.petEntry = menu.visible && await win.webContents.executeJavaScript(`!document.body.hasAttribute('data-closed')`);
  menu.hide();
  await wait(80);
  checks.canvasClosed = win.isVisible() === (process.platform !== 'linux') && !menu.visible && await win.webContents.executeJavaScript(`document.body.hasAttribute('data-closed')`);
  if (petWasVisible) pet.showInactive(); else pet.hide();
  await wait(100);
  return checks;
}
