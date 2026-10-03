// An isolated Chromium local-storage fixture for the packaged runtime checks.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { maskedCrc32c } from './leveldb-checksum';
function varint(value: number) {
  const bytes = []; do { bytes.push((value & 127) | (value > 127 ? 128 : 0)); value = Math.floor(value / 128); } while (value);
  return Buffer.from(bytes);
}
export function writeThemeManifestFixture(directory: string, options: { logNumber: number; tables?: number[]; previousLogNumber?: number }) {
  const edit = Buffer.concat([Buffer.from([2]), varint(options.logNumber), Buffer.from([9]), varint(options.previousLogNumber ?? 0),
    ...(options.tables ?? []).map(number => Buffer.concat([Buffer.from([7, 0]), varint(number), varint(0), varint(8), Buffer.alloc(8), varint(8), Buffer.alloc(8)]))]);
  const header = Buffer.alloc(7); header.writeUInt16LE(edit.length, 4); header[6] = 1;
  header.writeUInt32LE(maskedCrc32c(Buffer.concat([Buffer.from([1]), edit])));
  writeFileSync(join(directory, 'MANIFEST-000001'), Buffer.concat([header, edit]));
  writeFileSync(join(directory, 'CURRENT'), 'MANIFEST-000001\n');
}
export function writeThemeFixture(profile: string, values: Record<string, string>, sequence: bigint) {
  const directory = join(profile, 'Local Storage', 'leveldb'); mkdirSync(directory, { recursive: true });
  const batchHeader = Buffer.alloc(12); batchHeader.writeBigUInt64LE(sequence); batchHeader.writeUInt32LE(Object.keys(values).length, 8);
  const batch = Buffer.concat([batchHeader, ...Object.entries(values).map(([name, value]) => {
    const key = Buffer.from(`_t3code://app\0\x01${name}`, 'latin1'), data = Buffer.concat([Buffer.from([0]), Buffer.from(value, 'utf16le')]);
    return Buffer.concat([Buffer.from([1]), varint(key.length), key, varint(data.length), data]);
  })]);
  const header = Buffer.alloc(7); header.writeUInt16LE(batch.length, 4); header[6] = 1;
  header.writeUInt32LE(maskedCrc32c(Buffer.concat([Buffer.from([1]), batch])));
  writeFileSync(join(directory, '000001.log'), Buffer.concat([header, batch]));
  writeThemeManifestFixture(directory, { logNumber: 1 });
}
