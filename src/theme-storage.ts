// Read Chromium's LevelDB files without opening the database or taking its lock.
// Only these appearance keys have their values decoded. All other values are skipped.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { uncompress } from 'snappyjs';
import { maskedCrc32c } from './leveldb-checksum';

export const themeKeys = ['t3code:theme', 't3code:theme-appearance-mode', 't3code:theme-follow-system',
  't3code:theme-halves:v1', 't3code:themes:v1'] as const;
type Entry = { origin: string; key: string; value: string | null; sequence: bigint };
function varint(data: Buffer, cursor: { offset: number }): number {
  let result = 0, factor = 1;
  for (let i = 0; i < 8; i++) {
    if (cursor.offset >= data.length) throw new Error('Incomplete varint');
    const byte = data[cursor.offset++]; result += (byte & 127) * factor;
    if (!(byte & 128)) return result;
    factor *= 128;
  }
  throw new Error('Invalid varint');
}
function slice(data: Buffer, cursor: { offset: number }, length: number): Buffer {
  if (length < 0 || cursor.offset + length > data.length) throw new Error('Incomplete record');
  const value = data.subarray(cursor.offset, cursor.offset + length); cursor.offset += length; return value;
}
function text(data: Buffer) { return data.subarray(1).toString(data[0] === 0 ? 'utf16le' : 'latin1'); }
function keep(key: Buffer, value: Buffer | null, sequence: bigint, entries: Entry[]) {
  if (key[0] !== 95) return;
  const separator = key.indexOf(0);
  if (separator < 0) return;
  const name = text(key.subarray(separator + 1));
  if (!themeKeys.includes(name as typeof themeKeys[number])) return;
  const origin = key.subarray(1, separator).toString('utf8');
  // T3 desktop uses a local web origin. Ignore unrelated origins in the profile.
  if (origin !== 't3code://app' && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin)) return;
  entries.push({ origin, key: name, value: value === null ? null : text(value), sequence });
}
function batch(data: Buffer, entries: Entry[]) {
  if (data.length < 12) return;
  const sequence = data.readBigUInt64LE(0), count = data.readUInt32LE(8), cursor = { offset: 12 };
  const pending: Entry[] = [];
  for (let i = 0; i < count; i++) {
    const type = slice(data, cursor, 1)[0];
    if (type !== 0 && type !== 1) throw new Error('Invalid batch');
    const key = slice(data, cursor, varint(data, cursor));
    const value = type === 1 ? slice(data, cursor, varint(data, cursor)) : null;
    keep(key, value, sequence + BigInt(i), pending);
  }
  entries.push(...pending);
}
export function readThemeLog(data: Buffer): Entry[] {
  const entries: Entry[] = []; let fragments: Buffer[] = [];
  for (let block = 0; block < data.length; block += 32768) {
    const end = Math.min(block + 32768, data.length);
    for (let offset = block; offset + 7 <= end;) {
      const length = data.readUInt16LE(offset + 4), type = data[offset + 6]; offset += 7;
      if (offset + length > end) break; // A live append can be incomplete.
      const payload = data.subarray(offset, offset + length); offset += length;
      if (type && maskedCrc32c(Buffer.concat([Buffer.from([type]), payload])) !== data.readUInt32LE(offset - length - 7)) throw new Error('Invalid log checksum');
      if (type === 1) { fragments = []; batch(payload, entries); }
      else if (type === 2) fragments = [payload];
      else if (type === 3 && fragments.length) fragments.push(payload);
      else if (type === 4 && fragments.length) { fragments.push(payload); batch(Buffer.concat(fragments), entries); fragments = []; }
      else fragments = [];
    }
  }
  return entries;
}
function blockEntries(data: Buffer): { key: Buffer; value: Buffer }[] {
  const entries = []; let previous = Buffer.alloc(0);
  const end = data.length - 4 - data.readUInt32LE(data.length - 4) * 4, cursor = { offset: 0 };
  while (cursor.offset < end) {
    const shared = varint(data, cursor), length = varint(data, cursor), valueLength = varint(data, cursor);
    if (shared > previous.length) throw new Error('Invalid shared prefix');
    const key = Buffer.concat([previous.subarray(0, shared), slice(data, cursor, length)]);
    const value = slice(data, cursor, valueLength); entries.push({ key, value }); previous = key;
  }
  return entries;
}
function tableBlock(data: Buffer, handle: Buffer) {
  const cursor = { offset: 0 }, offset = varint(handle, cursor), size = varint(handle, cursor);
  if (size > 16 * 1024 * 1024 || offset + size + 5 > data.length) throw new Error('Invalid table block');
  const raw = data.subarray(offset, offset + size), type = data[offset + size];
  if (maskedCrc32c(data.subarray(offset, offset + size + 1)) !== data.readUInt32LE(offset + size + 1)) throw new Error('Invalid table checksum');
  if (type === 0) return raw;
  if (type !== 1) throw new Error('Unsupported compression');
  if (varint(raw, { offset: 0 }) > 16 * 1024 * 1024) throw new Error('Oversized table block');
  return Buffer.from(uncompress(raw));
}
export function readThemeTable(data: Buffer): Entry[] {
  if (data.length < 48 || data.readBigUInt64LE(data.length - 8) !== 0xdb4775248b80fb57n) throw new Error('Invalid table');
  const footer = data.subarray(data.length - 48), cursor = { offset: 0 };
  varint(footer, cursor); varint(footer, cursor); // Skip the metaindex handle.
  const entries: Entry[] = [];
  for (const index of blockEntries(tableBlock(data, footer.subarray(cursor.offset)))) {
    for (const { key, value } of blockEntries(tableBlock(data, index.value))) {
      if (key.length < 8) continue;
      const tag = key.readBigUInt64LE(key.length - 8), type = Number(tag & 255n);
      if (type === 0 || type === 1) keep(key.subarray(0, -8), type === 0 ? null : value, tag >> 8n, entries);
    }
  }
  return entries;
}
export class ThemeStorage {
  private cache = new Map<string, { signature: string; entries: Entry[] }>();
  read(directory: string): Record<string, string> {
    const entries: Entry[] = [], files = readdirSync(directory).filter(name => /^\d+\.(log|ldb|sst)$/.test(name));
    for (const name of files) {
      const path = join(directory, name), stat = statSync(path), signature = `${stat.size}:${stat.mtimeMs}`;
      if (stat.size > 64 * 1024 * 1024) continue;
      let cached = this.cache.get(path);
      if (cached?.signature !== signature) {
        const data = readFileSync(path);
        cached = { signature, entries: name.endsWith('.log') ? readThemeLog(data) : readThemeTable(data) };
        this.cache.set(path, cached);
      }
      entries.push(...cached.entries);
    }
    for (const path of this.cache.keys()) if (!files.some(name => join(directory, name) === path)) this.cache.delete(path);
    // Choose the origin with the newest theme selection, then resolve each key's
    // latest sequence, including deletions. File order must never decide the theme.
    const selected = entries.filter(e => e.key === 't3code:theme').sort((a, b) => a.sequence > b.sequence ? -1 : 1)[0];
    const latest = new Map<string, Entry>();
    for (const entry of entries) if (entry.origin === selected?.origin && (!latest.has(entry.key) || latest.get(entry.key)!.sequence < entry.sequence)) latest.set(entry.key, entry);
    return Object.fromEntries([...latest.values()].filter(e => e.value !== null).map(e => [e.key, e.value!]));
  }
}
