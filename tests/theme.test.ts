import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compress } from 'snappyjs';
import { readThemeLog, readThemeTable, ThemeStorage } from '../src/theme-storage';
import { resolveUiTheme, T3ThemeSync } from '../src/t3-theme';
import { palettes } from '../src/t3-palettes';
import { maskedCrc32c } from '../src/leveldb-checksum';
import { writeThemeManifestFixture } from '../src/theme-fixture';

function number(value: number): Buffer {
  const bytes = []; do { bytes.push((value & 127) | (value > 127 ? 128 : 0)); value = Math.floor(value / 128); } while (value);
  return Buffer.from(bytes);
}
function string(value: string) { return Buffer.concat([Buffer.from([1]), Buffer.from(value, 'latin1')]); }
function key(name: string, origin = 't3code://app') { return Buffer.concat([Buffer.from(`_${origin}\0`), string(name)]); }
function log(values: Record<string, string | null>, sequence = 1n) {
  const header = Buffer.alloc(12); header.writeBigUInt64LE(sequence); header.writeUInt32LE(Object.keys(values).length, 8);
  const batch = Buffer.concat([header, ...Object.entries(values).map(([name, value]) => {
    const k = key(name), v = value === null ? null : string(value);
    return Buffer.concat([Buffer.from([v ? 1 : 0]), number(k.length), k, ...(v ? [number(v.length), v] : [])]);
  })]);
  const record = Buffer.alloc(7); record.writeUInt16LE(batch.length, 4); record[6] = 1;
  record.writeUInt32LE(maskedCrc32c(Buffer.concat([Buffer.from([1]), batch])));
  return Buffer.concat([record, batch]);
}
function table(name: string, value: string, sequence: bigint, compressed: boolean) {
  const tag = Buffer.alloc(8); tag.writeBigUInt64LE((sequence << 8n) | 1n);
  const k = Buffer.concat([key(name), tag]), v = string(value);
  const block = (k: Buffer, v: Buffer) => Buffer.concat([number(0), number(k.length), number(v.length), k, v, Buffer.from([0, 0, 0, 0, 1, 0, 0, 0])]);
  const data = block(k, v), raw = compressed ? Buffer.from(compress(data)) : data;
  const dataBlock = Buffer.concat([raw, Buffer.from([compressed ? 1 : 0, 0, 0, 0, 0])]);
  dataBlock.writeUInt32LE(maskedCrc32c(dataBlock.subarray(0, -4)), dataBlock.length - 4);
  const handle = Buffer.concat([number(0), number(raw.length)]);
  const index = block(k, handle), indexBlock = Buffer.concat([index, Buffer.alloc(5)]);
  indexBlock.writeUInt32LE(maskedCrc32c(indexBlock.subarray(0, -4)), indexBlock.length - 4);
  const footer = Buffer.alloc(48); Buffer.concat([number(0), number(0), number(dataBlock.length), number(index.length)]).copy(footer);
  footer.writeBigUInt64LE(0xdb4775248b80fb57n, 40);
  return Buffer.concat([dataBlock, indexBlock, footer]);
}
test('theme logs preserve allowlisted values and deletion sequences', () => {
  const entries = readThemeLog(log({ 't3code:theme': 'ember', 'credentials': 'must never decode', 't3code:theme-halves:v1': null }, 42n));
  assert.equal(entries.length, 2); assert.equal(entries[0].value, 'ember');
  assert.equal(entries[1].sequence, 44n); assert.equal(entries[1].value, null);
  assert.equal(readThemeLog(log({ 't3code:theme': 'iris' }).subarray(0, -1)).length, 0);
  const corrupted = log({ 't3code:theme': 'iris' }); corrupted[corrupted.length - 1] ^= 1;
  assert.throws(() => readThemeLog(corrupted), /checksum/);
});
test('compressed and uncompressed tables resolve the same allowlisted value', () => {
  for (const compressed of [false, true]) {
    assert.equal(readThemeTable(table('t3code:theme', 'ocean', 7n, compressed))[0].value, 'ocean');
    assert.deepEqual(readThemeTable(table('message', 'private', 7n, compressed)), []);
  }
});
test('log and table parsers never decode non-allowlisted values', t => {
  const privateValue = 'private-value-must-not-be-decoded', allowedValue = 'allowlisted-theme-value';
  const privateBytes = Buffer.from(privateValue, 'latin1'), allowedBytes = Buffer.from(allowedValue, 'latin1');
  const original = Buffer.prototype.toString;
  let privateDecodes = 0, allowedDecodes = 0;
  t.mock.method(Buffer.prototype, 'toString', function (this: Buffer, ...args: Parameters<Buffer['toString']>) {
    if (this.includes(privateBytes)) privateDecodes++;
    if (this.includes(allowedBytes)) allowedDecodes++;
    return original.apply(this, args);
  });
  const parsers = [
    () => readThemeLog(log({ 't3code:theme': allowedValue, credentials: privateValue })),
    ...[false, true].map(compressed => () => {
      const allowed = readThemeTable(table('t3code:theme', allowedValue, 7n, compressed));
      assert.deepEqual(readThemeTable(table('credentials', privateValue, 8n, compressed)), []);
      return allowed;
    }),
  ];
  for (const parse of parsers) {
    privateDecodes = 0; allowedDecodes = 0;
    assert.equal(parse()[0].value, allowedValue);
    assert.equal(allowedDecodes, 1, 'the value decoder must be observed for the allowed value');
    assert.equal(privateDecodes, 0, 'credentials must never reach string decoding');
  }
});
test('new logs supersede tables and cached files, including deleted preferences', t => {
  const directory = mkdtempSync(join(tmpdir(), 't3pet-theme-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, '000005.ldb'), table('t3code:theme', 'grove', 4n, true));
  writeThemeManifestFixture(directory, { logNumber: 3, tables: [5] });
  const storage = new ThemeStorage(); assert.equal(storage.read(directory)['t3code:theme'], 'grove');
  writeFileSync(join(directory, '000003.log'), log({ 't3code:theme': 'ember' }, 10n));
  assert.equal(storage.read(directory)['t3code:theme'], 'ember');
  writeFileSync(join(directory, '000003.log'), log({ 't3code:theme': null }, 12n));
  assert.equal(storage.read(directory)['t3code:theme'], undefined);
});
test('T3 palettes follow appearance modes, system changes, aliases, halves and custom roles', () => {
  const light = resolveUiTheme({ 't3code:theme': 'ember', 't3code:theme-appearance-mode': 'light' }, true);
  assert.deepEqual(light.colors, palettes.ember.light);
  assert.equal(resolveUiTheme({ 't3code:theme': 't3-chat-dark' }, false).appearance, 'dark');
  assert.equal(resolveUiTheme({ 't3code:theme': 'constructor' }, true).appearance, 'dark');
  const values = { 't3code:theme': 'ember', 't3code:theme-appearance-mode': 'system', 't3code:theme-halves:v1': JSON.stringify({ dark: 'grove' }) };
  assert.deepEqual(resolveUiTheme(values, true).colors, palettes.grove.dark);
  assert.equal(resolveUiTheme(values, true).source, 'system');
  assert.deepEqual(resolveUiTheme(values, false).colors, palettes.ember.light);
  const custom = { id: 'mine', appearance: 'dark', colors: { canvas: '#121314', messageAction: '#cead71' } };
  const theme = resolveUiTheme({ 't3code:theme': 'mine', 't3code:themes:v1': JSON.stringify([custom]), 't3code:theme-appearance-mode': 'light' }, false, { fontFamilySans: 'Georgia', fontSizeInterface: 16 });
  assert.equal(theme.appearance, 'dark'); assert.equal(theme.colors.canvas, '#121314'); assert.equal(theme.colors.text, palettes['t3-chat'].dark.text);
  assert.equal(theme.source, 'dark');
  assert.equal(theme.fontFamily, 'Georgia'); assert.equal(theme.fontSize, 16);
});
test('the live watcher publishes a theme edit without status polling or restarting', async t => {
  t.mock.method(globalThis, 'setInterval', () => { throw new Error('The watcher test must not start periodic refresh'); });
  const root = mkdtempSync(join(tmpdir(), 't3pet-theme-watch-')), directory = join(root, 'Local Storage', 'leveldb');
  mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, '000001.log'), log({ 't3code:theme': 'ember' }));
  writeThemeManifestFixture(directory, { logNumber: 1 });
  const changes: string[] = [];
  const sync = new T3ThemeSync(() => root, () => root, () => false, theme => changes.push(theme.id), null);
  t.after(() => { sync.dispose(); rmSync(root, { recursive: true, force: true }); });
  writeFileSync(join(directory, '000002.log'), log({ 't3code:theme': 'iris' }, 100n));
  const deadline = Date.now() + 2000;
  while (!changes.includes('iris') && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(changes, ['ember', 'iris']);
});
