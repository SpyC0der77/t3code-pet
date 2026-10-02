import { mkdirSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';

// Desktop Entry Exec is not a shell command. Escape both the general string
// layer and the quoted-argument layer; percent is a desktop field-code marker.
export function desktopExecArgument(value: string) {
  if (/[\r\n\0]/.test(value)) throw new Error('Invalid startup path.');
  return '"' + value.replace(/\\/g, '\\\\\\\\').replace(/["`$]/g, '\\\\$&').replace(/%/g, '%%') + '"';
}

export function linuxStartupCommand(executable: string, appPath: string, packaged: boolean, appImage?: string) {
  const path = appImage || executable;
  if (!isAbsolute(path)) throw new Error('Startup requires an absolute executable path.');
  return [path, ...(!packaged ? [appPath] : [])].map(desktopExecArgument).join(' ');
}

export function setLinuxLoginStartup(enabled: boolean, command: string, configHome = process.env.XDG_CONFIG_HOME) {
  const directory = join(configHome && isAbsolute(configHome) ? configHome : join(homedir(), '.config'), 'autostart');
  const file = join(directory, 'dev.t3pet.companion.desktop');
  if (!enabled) {
    try { unlinkSync(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return;
  }
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${file}.tmp`, `[Desktop Entry]\nType=Application\nName=T3 Pet\nExec=${command}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`, { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}
