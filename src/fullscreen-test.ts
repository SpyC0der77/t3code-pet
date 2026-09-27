import { app, BrowserWindow, screen } from 'electron';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PetVisibility } from './fullscreen';

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

/** An isolated, short-lived app window for testing the actual foreground monitor. */
export async function runFullscreenFixture(directory: string) {
  await app.whenReady();
  mkdirSync(directory, { recursive: true });
  const window = new BrowserWindow({ width: 640, height: 420, title: 'T3 Pet fullscreen check', show: false, autoHideMenuBar: true });
  await window.loadURL('data:text/html,<html><body style="background:%23121212;color:%23e1e1e1;font:18px sans-serif;padding:48px"><p>T3 Pet fullscreen check</p><p>This temporary window will close automatically.</p></body></html>');
  const phase = (name: string, target = window) => writeFileSync(join(directory, 'phase.json'), JSON.stringify({
    name, at: Date.now(), pid: process.pid,
    handle: target.getNativeWindowHandle().readBigUInt64LE().toString(),
  }));
  window.showInactive(); phase('normal'); await wait(1700);
  window.maximize(); phase('maximized'); await wait(1700);
  window.setFullScreen(true); phase('fullscreen'); await wait(1900);
  window.setFullScreen(false); window.unmaximize(); phase('restored'); await wait(1700);
  const borderless = new BrowserWindow({ ...screen.getPrimaryDisplay().bounds, frame: false, thickFrame: false, hasShadow: false, resizable: false, show: false, title: 'T3 Pet borderless check' });
  await borderless.loadURL('data:text/html,<html><body style="background:%23121212;color:%23e1e1e1;font:18px sans-serif;padding:48px">Checking borderless fullscreen.</body></html>');
  borderless.showInactive(); borderless.setBounds(screen.getPrimaryDisplay().bounds); phase('borderless', borderless); await wait(1900);
  borderless.close(); phase('restored-again'); await wait(1700);
  window.close(); app.quit();
}

export async function runFullscreenCheck(directory: string, petWindow: BrowserWindow, visibility: PetVisibility) {
  mkdirSync(directory, { recursive: true });
  const args = [...(app.isPackaged ? [] : [app.getAppPath()]), '--fullscreen-fixture', directory];
  const child = spawn(process.execPath, args, { windowsHide: true, stdio: 'ignore' });
  let exited = false;
  child.once('exit', () => { exited = true; });
  child.once('error', () => { exited = true; });
  const helper = app.isPackaged ? join(process.resourcesPath, 'native', 'foreground-monitor.exe') : join(__dirname, 'native', 'foreground-monitor.exe');
  const results: Record<string, { fullscreen: boolean; foreground: boolean; automaticFullscreen: boolean; petVisible: boolean }> = {};
  const deadline = Date.now() + 20_000;
  try {
    while (!exited && Date.now() < deadline) {
      try {
        const phase = JSON.parse(readFileSync(join(directory, 'phase.json'), 'utf8'));
        // Allow the OS transition and two detector polls to settle.
        if (Date.now() - phase.at >= 900 && !results[phase.name]) {
          const probe = JSON.parse(execFileSync(helper, ['--probe-window', phase.handle], { windowsHide: true, encoding: 'utf8' }));
          results[phase.name] = { ...probe, automaticFullscreen: visibility.fullscreen, petVisible: petWindow.isVisible() };
        }
      } catch { /* The fixture is still starting. */ }
      await wait(100);
    }
  } finally { if (!exited) child.kill(); }
  const expected = { normal: false, maximized: false, fullscreen: true, restored: false, borderless: true, 'restored-again': false };
  const passed = Object.entries(expected).every(([name, fullscreen]) => results[name]?.fullscreen === fullscreen &&
    (!results[name]?.foreground || (results[name]?.automaticFullscreen === fullscreen && results[name]?.petVisible === !fullscreen)));
  const foregroundTransitionsVerified = Object.values(results).filter(result => result.foreground).length;
  writeFileSync(join(directory, 'fullscreen-report.json'), JSON.stringify({ passed, foregroundTransitionsVerified, results }, null, 2));
  app.exit(passed ? 0 : 1);
}
