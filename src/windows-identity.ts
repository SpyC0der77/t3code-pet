import { join, normalize } from 'node:path';

export function applicationIdentity(testing: boolean) {
  return testing ? { name: 'T3 Pet test', appId: 'dev.t3pet.companion.test' }
    : { name: 'T3 Pet', appId: 'dev.t3pet.companion' };
}

export function startMenuShortcut(appData: string, name: string) {
  return join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${name}.lnk`);
}

interface Shortcut { target: string; icon?: string; iconIndex?: number; }
export function repairShortcutIcon(file: string, executable: string, icon: string, shell: {
  readShortcutLink(file: string): Shortcut;
  writeShortcutLink(file: string, operation: 'update', details: Shortcut): boolean;
}) {
  const details = shell.readShortcutLink(file);
  // Only repair this executable's link. Preserve its notification activator,
  // app ID, arguments, and other properties using an update operation.
  const samePath = (a: string, b: string) => normalize(a).toLowerCase() === normalize(b).toLowerCase();
  if (!samePath(details.target, executable)) return false;
  if (details.icon && samePath(details.icon, icon) && details.iconIndex === 0) return true;
  return shell.writeShortcutLink(file, 'update', { target: details.target, icon, iconIndex: 0 });
}
