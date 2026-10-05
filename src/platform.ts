import { join } from 'node:path';

/** Resolve the icon location supported by each platform's native shell APIs. */
export function appIconPath(root: string, resources: string, packaged: boolean, platform = process.platform) {
  // Windows taskbar and shell APIs need a persistent file outside app.asar.
  if (platform === 'win32' && packaged) return join(resources, 'icon.ico');
  return join(root, 'assets', platform === 'win32' ? 'icon-transparent.ico' : 'icon-transparent.png');
}

export function nativeHelperName(name: string, platform = process.platform) {
  return `${name}${platform === 'win32' ? '.exe' : ''}`;
}

export function nativeWindowId(handle: Buffer) {
  return (handle.length >= 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE())).toString();
}

export function nativeHelperPath(root: string, name: string, platform = process.platform) {
  return join(root, 'native', nativeHelperName(name, platform));
}
