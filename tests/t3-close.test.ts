import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { join } from 'node:path';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { nativeHelperPath } from '../src/platform';

test('Windows helper gracefully closes a harmless hidden-window fixture', { skip: process.platform !== 'win32' }, async () => {
  const fixture = spawn(resolve('dist/native/T3PetCloseFixture.exe'), [], { windowsHide: true, stdio: 'ignore' });
  const exited = new Promise<number | null>((resolveExit, reject) => {
    fixture.once('exit', resolveExit); fixture.once('error', reject);
  });
  await new Promise(resolveWait => setTimeout(resolveWait, 700));
  const result = await promisify(execFile)(resolve('dist/native/t3-close.exe'), ['--fixture'], { windowsHide: true, timeout: 12_000 });
  assert.match(result.stdout, /closed/);
  assert.equal(await exited, 0);
});

for (const refuse of [false, true]) test(`native ${process.platform} close ${refuse ? 'respects refused quit' : 'closes an isolated Electron fixture'}`, {
  skip: process.platform === 'win32' || (process.platform === 'linux' && !process.env.DISPLAY), timeout: 25000,
}, async t => {
  const folder = mkdtempSync(join(tmpdir(), 't3pet-close-'));
  const electron: string = createRequire(import.meta.url)('electron');
  const fixture = spawn(electron, ['.', '--close-fixture', folder, ...(refuse ? ['--refuse-close'] : [])], { stdio: 'ignore' });
  const exited = new Promise<number | null>((resolveExit, reject) => {
    fixture.once('exit', resolveExit); fixture.once('error', reject);
  });
  t.after(async () => { if (fixture.exitCode === null) fixture.kill('SIGKILL'); await exited; rmSync(folder, { recursive: true, force: true }); });
  const deadline = Date.now() + 8000;
  while (!existsSync(join(folder, 'ready.json')) && Date.now() < deadline && fixture.exitCode === null) await new Promise(r => setTimeout(r, 100));
  assert.equal(existsSync(join(folder, 'ready.json')), true, 'fixture did not open');
  // Allow the X11 window manager to add it to _NET_CLIENT_LIST.
  await new Promise(r => setTimeout(r, 500));
  const close = promisify(execFile)(nativeHelperPath(resolve('dist'), 't3-close'), ['--fixture', String(fixture.pid)], { timeout: 15000 });
  if (refuse) {
    await assert.rejects(close, /still open/);
    assert.equal(fixture.exitCode, null, 'helper must not force-kill a refused quit');
  } else {
    assert.match((await close).stdout, /closed/);
    assert.equal(await exited, 0);
  }
});
