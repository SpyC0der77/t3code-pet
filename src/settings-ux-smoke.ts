import type { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

export async function runSettingsUxSmoke(win: BrowserWindow, directory: string) {
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (expression: string) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (win.isDestroyed()) throw new Error(`Settings closed while waiting for ${expression}`);
      if (await win.webContents.executeJavaScript(expression)) return;
      await wait(25);
    }
    throw new Error(`Settings did not reach ${expression}`);
  };
  const checks: Record<string, boolean> = {};
  checks.draftMarkers = await win.webContents.executeJavaScript(`(() => {
    document.getElementById('general-tab').click();
    document.getElementById('login').click();
    document.getElementById('pet-tab').click();
    return document.getElementById('general-tab').textContent.includes('*') && !document.getElementById('save').disabled;
  })()`);
  checks.connectionCheckBlocksSave = await win.webContents.executeJavaScript(`(() => {
    document.getElementById('connection-retry').click();
    const blocked = document.getElementById('save').disabled && document.getElementById('discard').disabled;
    document.getElementById('settings-form').dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
    return blocked;
  })()`);
  await until(`!document.getElementById('connection-retry').disabled`);
  checks.connectionCheckPreservesDraft = await win.webContents.executeJavaScript(`(async () => {
    const state = await window.pet.getState();
    const login = document.getElementById('login');
    return state.preferences.launchAtLogin !== login.checked && !document.getElementById('save').disabled && login.disabled === !state.supportsLoginStartup;
  })()`);
  win.close(); await until(`document.getElementById('unsaved-dialog').open && document.activeElement.id==='unsaved-cancel'`);
  checks.closeGuard = !win.isDestroyed() && await win.webContents.executeJavaScript(`document.getElementById('unsaved-dialog').open && document.activeElement.id==='unsaved-cancel'`);
  writeFileSync(join(directory, 'settings-unsaved.png'), (await win.webContents.capturePage()).toPNG());
  checks.cancelRetainsDraft = await win.webContents.executeJavaScript(`(() => {
    document.getElementById('unsaved-cancel').click();
    return !document.getElementById('unsaved-dialog').open && !document.getElementById('save').disabled;
  })()`);
  await win.webContents.executeJavaScript(`window.pet.showOnboarding()`);
  await until(`document.getElementById('unsaved-dialog').open`);
  checks.onboardingGuard = await win.webContents.executeJavaScript(`document.title==='T3 Pet settings' && document.getElementById('unsaved-dialog').open`);
  await win.webContents.executeJavaScript(`document.getElementById('unsaved-cancel').click()`);
  // An invalid draft must keep the window and its edits available for recovery.
  await win.webContents.executeJavaScript(`document.getElementById('size').value='invalid';document.getElementById('size').dispatchEvent(new Event('change',{bubbles:true}))`);
  await win.webContents.executeJavaScript(`document.getElementById('save').click()`);
  win.close(); await until(`document.getElementById('unsaved-dialog').open`);
  checks.closeDuringSave = await win.webContents.executeJavaScript(`document.getElementById('save-result').classList.contains('error') && !document.getElementById('save').disabled`);
  await win.webContents.executeJavaScript(`document.getElementById('unsaved-save').click()`);
  await until(`!document.getElementById('unsaved-error').hidden && !document.getElementById('unsaved-save').disabled`);
  checks.failedSaveRetainsDraft = !win.isDestroyed() && await win.webContents.executeJavaScript(`document.getElementById('unsaved-dialog').open && !document.getElementById('unsaved-error').hidden && !document.getElementById('unsaved-save').disabled`);
  await win.webContents.executeJavaScript(`document.getElementById('unsaved-cancel').click();document.getElementById('discard').click()`);
  checks.discardClearsMarkers = await win.webContents.executeJavaScript(`document.getElementById('save').disabled && !document.getElementById('general-tab').textContent.includes('*')`);
  await win.webContents.executeJavaScript(`document.getElementById('general-tab').click();document.getElementById('login').click()`);
  const expected = await win.webContents.executeJavaScript(`document.getElementById('login').checked`);
  const closed = new Promise<void>(resolve => win.once('closed', () => resolve()));
  win.close(); await until(`document.getElementById('unsaved-dialog').open`);
  void win.webContents.executeJavaScript(`document.getElementById('unsaved-save').click()`).catch(() => {});
  await Promise.race([closed, wait(5000)]);
  checks.saveClosesWindow = win.isDestroyed();
  return { checks, expected };
}
