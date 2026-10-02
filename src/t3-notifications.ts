import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { NotificationSetup } from './shared';

const modes = ['off', 'notifications', 'sound', 'notifications-and-sound'];
export function isT3Executable(path: string) {
  return /(?:^|\/)(?:T3 Code(?: \(Nightly\))?|t3code(?:-nightly)?)$/i.test(path);
}

function linuxT3Running() {
  // /proc executable links avoid Linux's truncated comm names and never expose
  // command-line arguments, messages, or credentials.
  return readdirSync('/proc').filter(name => /^\d+$/.test(name)).some(pid => {
    try { return isT3Executable(readlinkSync(`/proc/${pid}/exe`).replace(/ \(deleted\)$/, '')); }
    catch (error) {
      if (!['ENOENT', 'ESRCH', 'EACCES', 'EPERM', 'EINVAL'].includes((error as NodeJS.ErrnoException).code!)) throw error;
      return false;
    }
  });
}
function document(directory: string) {
  const path = join(directory, 'client-settings.json');
  const raw = readFileSync(path, 'utf8');
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid T3 Code settings.');
  const settings = 'settings' in value ? value.settings : value;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings) || !modes.includes(settings.notificationMode ?? 'off')) {
    throw new Error('Unsupported T3 Code notification settings.');
  }
  return { path, raw, value, settings, mode: settings.notificationMode ?? 'off' };
}

export function inspectNotifications(directory: string): Pick<NotificationSetup, 'status' | 'mode' | 'message'> {
  try {
    const { mode } = document(directory);
    return { status: mode === 'off' ? 'off' : 'enabled', mode,
      message: mode === 'off' ? 'T3 Code desktop notifications are off.' : `T3 Code desktop alerts are on${mode.includes('sound') ? ' with sound' : ''}.` };
  } catch {
    return { status: 'unknown', mode: null, message: 'Could not check T3 Code notification settings. Check the data folder, then retry.' };
  }
}

// Never inspect credentials, messages, or process command lines. The desktop
// must exit too: its renderer caches preferences and can overwrite file edits.
export async function t3IsRunning(directory: string): Promise<boolean> {
  const runtime = join(directory, 'server-runtime.json');
  if (existsSync(runtime)) {
    let value;
    try { value = JSON.parse(readFileSync(runtime, 'utf8')); }
    catch { throw new Error('Cannot check whether T3 Code is closed. Restart T3 Code, then quit it and retry.'); }
    if (Number.isInteger(value.pid) && value.pid > 0) {
      try {
        process.kill(value.pid, 0);
        if (process.platform !== 'linux' || !/\) [ZX] /.test(readFileSync(`/proc/${value.pid}/stat`, 'utf8'))) return true;
      }
      catch (error) { if (!['ESRCH', 'ENOENT'].includes((error as NodeJS.ErrnoException).code!)) throw new Error('Cannot confirm that T3 Code is closed.'); }
    }
  }
  if (process.platform === 'linux') return linuxT3Running();
  const run = promisify(execFile);
  const { stdout } = process.platform === 'win32'
    ? await run('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 5000 })
    : await run('ps', ['-A', '-o', 'comm='], { timeout: 5000 });
  return stdout.split(/\r?\n/).some(line => process.platform === 'win32'
    ? /^"(?:T3 Code(?: \(Nightly\))?|t3code(?:-nightly)?)\.exe"/i.test(line)
    : isT3Executable(line.trim()));
}

export async function closeT3(helperPath: string) {
  const run = promisify(execFile);
  try { await run(helperPath, [], { windowsHide: true, timeout: 15_000 }); }
  catch (error) {
    const detail = (error as { stderr?: string }).stderr?.trim();
    throw new Error(detail || 'Could not close T3 Code. Notifications have not changed.');
  }
}

// Consent comes before any process or preference mutation. A failed close must
// not disable either application's alerts.
export async function consentedSwitch(confirm: () => Promise<boolean>, close: () => Promise<void>, migrate: () => Promise<'waiting' | 'complete'>) {
  if (!await confirm()) return 'cancelled' as const;
  await close();
  const result = await migrate();
  if (result !== 'complete') throw new Error('T3 Code is still closing. Wait a moment, then retry. Notifications have not changed.');
  return result;
}

function atomicWrite(path: string, raw: string) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, raw, { flag: 'wx', mode: 0o600 }); renameSync(temporary, path); }
  finally { if (existsSync(temporary)) unlinkSync(temporary); }
}

export async function migrateNotifications(directory: string, backupDirectory: string,
  commitPet: (sound: boolean) => void, isRunning = t3IsRunning): Promise<'waiting' | 'complete'> {
  if (await isRunning(directory)) return 'waiting';
  const original = document(directory);
  const sound = original.mode.includes('sound');
  // Keep the original in Pet's own folder. No T3 database writes are involved.
  const backup = join(backupDirectory, `t3-notifications-${randomUUID()}.json`);
  writeFileSync(backup, original.raw, { flag: 'wx', mode: 0o600 });
  original.settings.notificationMode = 'off';
  const changed = JSON.stringify(original.value, null, 2) + '\n';
  if (await isRunning(directory) || readFileSync(original.path, 'utf8') !== original.raw) {
    throw new Error('T3 Code changed during setup. Close it and retry.');
  }
  atomicWrite(original.path, changed);
  try { commitPet(sound); }
  catch (error) {
    // Roll back only our exact edit, preserving a concurrent external change.
    if (readFileSync(original.path, 'utf8') === changed) atomicWrite(original.path, original.raw);
    throw error;
  }
  return 'complete';
}
