import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { appIconPath, nativeHelperName, nativeWindowId } from '../src/platform';
import { desktopExecArgument, linuxStartupCommand, setLinuxLoginStartup } from '../src/login-startup';
import { isT3Executable } from '../src/t3-notifications';

test('native paths and window identities work for HWND, NSView, and XID sizes', () => {
  assert.equal(nativeHelperName('t3-close', 'win32'), 't3-close.exe');
  assert.equal(nativeHelperName('t3-close', 'darwin'), 't3-close');
  assert.equal(nativeHelperName('foreground-monitor', 'linux'), 'foreground-monitor');
  const xid = Buffer.alloc(4); xid.writeUInt32LE(0xff000012);
  assert.equal(nativeWindowId(xid), String(0xff000012));
  const hwnd = Buffer.alloc(8); hwnd.writeBigUInt64LE(0x100000012n);
  assert.equal(nativeWindowId(hwnd), String(0x100000012n));
});

test('packaged Windows icons use the persistent shell resource outside ASAR', () => {
  const root = join('resources', 'app.asar');
  assert.equal(appIconPath(root, 'resources', true, 'win32'), join('resources', 'icon.ico'));
  assert.equal(appIconPath('source', 'resources', false, 'win32'), join('source', 'assets', 'icon-transparent.ico'));
  for (const platform of ['linux', 'darwin'] as const) {
    assert.equal(appIconPath(root, 'resources', true, platform), join(root, 'assets', 'icon-transparent.png'));
  }
});

test('process detection matches only T3 executable names, including macOS bundle paths', () => {
  for (const path of ['/usr/bin/t3code', '/tmp/.mount_xyz/t3code-nightly', '/Applications/T3 Code.app/Contents/MacOS/T3 Code', '/Applications/T3 Code (Nightly).app/Contents/MacOS/T3 Code (Nightly)']) assert.equal(isT3Executable(path), true, path);
  for (const path of ['node', 'T3 Pet', 't3code-server', 't3code-helper', '/Applications/T3 Code.app/Contents/Frameworks/T3 Code Helper.app/Contents/MacOS/T3 Code Helper', '/tmp/t3code/readme', '/tmp/t3code-else']) assert.equal(isT3Executable(path), false, path);
});

test('desktop startup safely preserves spaces, percent field codes, quotes and shell metacharacters', () => {
  const escaped = desktopExecArgument('pet $HOME`x`\\"100%.AppImage');
  assert.equal(escaped, '"pet \\\\$HOME\\\\`x\\\\`\\\\\\\\\\\\"100%%.AppImage"');
  assert.throws(() => desktopExecArgument('/tmp/pet\nExec=bad'), /Invalid/);
  const exe = resolve('installed pet'), app = resolve('built files'), image = resolve('T3 Pet.AppImage');
  assert.equal(linuxStartupCommand(exe, app, true, image), desktopExecArgument(image));
  assert.equal(linuxStartupCommand(exe, app, false), `${desktopExecArgument(exe)} ${desktopExecArgument(app)}`);
  assert.throws(() => linuxStartupCommand('relative', app, true), /absolute/);
});

test('Linux startup installs and removes only its own per-user entry', t => {
  const config = mkdtempSync(join(tmpdir(), 't3pet-startup-'));
  t.after(() => rmSync(config, { recursive: true, force: true }));
  const file = join(config, 'autostart', 'dev.t3pet.companion.desktop');
  setLinuxLoginStartup(true, '"/opt/T3 Pet.AppImage"', config);
  assert.match(readFileSync(file, 'utf8'), /^Exec="\/opt\/T3 Pet.AppImage"$/m);
  const other = join(config, 'autostart', 'other.desktop'); writeFileSync(other, 'unchanged');
  setLinuxLoginStartup(false, '', config);
  assert.equal(existsSync(file), false);
  assert.equal(readFileSync(other, 'utf8'), 'unchanged');
  setLinuxLoginStartup(false, '', config);
});
