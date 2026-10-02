import { join } from 'node:path';

export function nativeHelperName(name: string, platform = process.platform) {
  return `${name}${platform === 'win32' ? '.exe' : ''}`;
}

export function nativeWindowId(handle: Buffer) {
  return (handle.length >= 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE())).toString();
}

export function nativeHelperPath(root: string, name: string, platform = process.platform) {
  return join(root, 'native', nativeHelperName(name, platform));
}
