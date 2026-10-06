import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applicationIdentity, repairShortcutIcon, startMenuShortcut } from '../src/windows-identity';

test('smoke and fixture runs cannot reuse the installed Windows app name or identity', () => {
  const normal = applicationIdentity(false), testing = applicationIdentity(true);
  assert.notEqual(normal.name, testing.name);
  assert.notEqual(normal.appId, testing.appId);
  assert.notEqual(startMenuShortcut('appData', normal.name), startMenuShortcut('appData', testing.name));
});

test('repair only changes the icon on a shortcut belonging to this executable', () => {
  const writes: unknown[] = [];
  let shortcut = {target:'app.exe',icon:'',iconIndex:0};
  const shell = { readShortcutLink: () => shortcut,
    writeShortcutLink: (...args: unknown[]) => {writes.push(args);return true;} };
  assert.equal(repairShortcutIcon('app.lnk', 'app.exe', 'paw.ico', shell), true);
  assert.deepEqual(writes, [['app.lnk','update',{target:'app.exe',icon:'paw.ico',iconIndex:0}]]);
  shortcut = {target:'app.exe',icon:'paw.ico',iconIndex:0};
  repairShortcutIcon('app.lnk', 'app.exe', 'paw.ico', shell);
  assert.equal(writes.length, 1);
  shortcut = {target:'another.exe',icon:'',iconIndex:0};
  assert.equal(repairShortcutIcon('app.lnk', 'app.exe', 'paw.ico', shell), false);
  assert.equal(writes.length, 1);
});
