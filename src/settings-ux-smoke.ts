import type { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';

export async function runSettingsUxSmoke(win: BrowserWindow, directory: string) {
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const checks: Record<string, boolean> = {};
  checks.draftMarkers = await win.webContents.executeJavaScript(`(() => {
    document.getElementById('general-tab').click();
    document.getElementById('login').click();
    document.getElementById('pet-tab').click();
    return document.getElementById('general-tab').textContent.includes('*') && !document.getElementById('save').disabled;
  })()`);
  win.close(); await wait(100);
  checks.closeGuard = !win.isDestroyed() && await win.webContents.executeJavaScript(`document.getElementById('unsaved-dialog').open && document.activeElement.id==='unsaved-cancel'`);
  writeFileSync(join(directory, 'settings-unsaved.png'), (await win.webContents.capturePage()).toPNG());
  checks.cancelRetainsDraft = await win.webContents.executeJavaScript(`(() => {
    document.getElementById('unsaved-cancel').click();
    return !document.getElementById('unsaved-dialog').open && !document.getElementById('save').disabled;
  })()`);
  await win.webContents.executeJavaScript(`window.pet.showOnboarding()`); await wait(100);
  checks.onboardingGuard = await win.webContents.executeJavaScript(`document.title==='T3 Pet settings' && document.getElementById('unsaved-dialog').open`);
  await win.webContents.executeJavaScript(`document.getElementById('unsaved-cancel').click()`);
  // An invalid draft must keep the window and its edits available for recovery.
  await win.webContents.executeJavaScript(`document.getElementById('size').value='invalid';document.getElementById('size').dispatchEvent(new Event('change',{bubbles:true}))`);
  win.close(); await wait(100);
  await win.webContents.executeJavaScript(`document.getElementById('unsaved-save').click()`); await wait(150);
  checks.failedSaveRetainsDraft = !win.isDestroyed() && await win.webContents.executeJavaScript(`document.getElementById('unsaved-dialog').open && !document.getElementById('unsaved-error').hidden && !document.getElementById('unsaved-save').disabled`);
  await win.webContents.executeJavaScript(`document.getElementById('unsaved-cancel').click();document.getElementById('discard').click()`);
  checks.discardClearsMarkers = await win.webContents.executeJavaScript(`document.getElementById('save').disabled && !document.getElementById('general-tab').textContent.includes('*')`);
  await win.webContents.executeJavaScript(`document.getElementById('general-tab').click();document.getElementById('login').click()`);
  const expected = await win.webContents.executeJavaScript(`document.getElementById('login').checked`);
  const closed = new Promise<void>(resolve => win.once('closed', () => resolve()));
  win.close(); await wait(100);
  await win.webContents.executeJavaScript(`document.getElementById('unsaved-save').click()`);
  await Promise.race([closed, wait(2500)]);
  checks.saveClosesWindow = win.isDestroyed();
  return { checks, expected };
}
