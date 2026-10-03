import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ThemeStorage, readThemeLog } from '../src/theme-storage';
import { writeThemeManifestFixture } from '../src/theme-fixture';
import { maskedCrc32c } from '../src/leveldb-checksum';

function number(value: number): Buffer {
  const bytes = []; do { bytes.push((value & 127) | (value > 127 ? 128 : 0)); value = Math.floor(value / 128); } while (value);
  return Buffer.from(bytes);
}
function record(payload: Buffer) {
  const header = Buffer.alloc(7); header.writeUInt16LE(payload.length, 4); header[6] = 1;
  header.writeUInt32LE(maskedCrc32c(Buffer.concat([Buffer.from([1]), payload])));
  return Buffer.concat([header, payload]);
}
function key(origin = 't3code://app') { return Buffer.from(`_${origin}\0\x01t3code:theme`); }
function value(theme: string) { return Buffer.from(`\x01${theme}`); }
function log(theme: string, sequence = 1n, origin = 't3code://app') {
  const header = Buffer.alloc(12); header.writeBigUInt64LE(sequence); header.writeUInt32LE(1, 8);
  const k = key(origin), v = value(theme);
  return record(Buffer.concat([header, Buffer.from([1]), number(k.length), k, number(v.length), v]));
}
function table(theme: string) {
  const tag = Buffer.alloc(8); tag.writeBigUInt64LE(257n);
  const k = Buffer.concat([key(), tag]), v = value(theme);
  const block = (key: Buffer, value: Buffer) => Buffer.concat([number(0), number(key.length), number(value.length), key, value, Buffer.from([0, 0, 0, 0, 1, 0, 0, 0])]);
  const trailer = (data: Buffer) => {
    const result = Buffer.concat([data, Buffer.alloc(5)]);
    result.writeUInt32LE(maskedCrc32c(result.subarray(0, -4)), result.length - 4); return result;
  };
  const data = block(k, v), dataBlock = trailer(data);
  const index = block(k, Buffer.concat([number(0), number(data.length)]));
  const footer = Buffer.alloc(48); Buffer.concat([number(0), number(0), number(dataBlock.length), number(index.length)]).copy(footer);
  footer.writeBigUInt64LE(0xdb4775248b80fb57n, 40);
  return Buffer.concat([dataBlock, trailer(index), footer]);
}
function directory(t: test.TestContext) {
  const result = mkdtempSync(join(tmpdir(), 't3pet-manifest-'));
  t.after(() => rmSync(result, { recursive: true, force: true })); return result;
}

test('development desktop appearance values use their own accepted origin', () => {
  assert.equal(readThemeLog(log('iris', 1n, 't3code-dev://app'))[0].value, 'iris');
  assert.deepEqual(readThemeLog(log('iris', 1n, 'https://unrelated.example')), []);
});
test('manifest compaction removes cached obsolete tables even after tombstones disappear', t => {
  const root = directory(t), storage = new ThemeStorage();
  writeFileSync(join(root, '000005.ldb'), table('ember'));
  writeThemeManifestFixture(root, { logNumber: 6, tables: [5] });
  assert.equal(storage.read(root)['t3code:theme'], 'ember');
  // Compaction has discarded both the deleted preference and its tombstone.
  appendFileSync(join(root, 'MANIFEST-000001'), record(Buffer.from([6, 0, 5])));
  assert.deepEqual(storage.read(root), {});
  // Obsolete files must not even reach table decoding.
  writeFileSync(join(root, '000005.ldb'), 'obsolete malformed table');
  assert.deepEqual(storage.read(root), {});
});
test('CURRENT selects the live manifest and excludes uncommitted tables', t => {
  const root = directory(t), storage = new ThemeStorage();
  writeThemeManifestFixture(root, { logNumber: 3, tables: [5] });
  writeFileSync(join(root, '000005.sst'), table('grove'));
  writeFileSync(join(root, '000008.ldb'), 'unfinished compaction output');
  assert.equal(storage.read(root)['t3code:theme'], 'grove');
  writeFileSync(join(root, 'MANIFEST-000002'), record(Buffer.from([2, 9])));
  writeFileSync(join(root, 'CURRENT'), 'MANIFEST-000002\n');
  assert.deepEqual(storage.read(root), {});
});
test('logs follow the current, previous and recovery log numbers', t => {
  const root = directory(t), storage = new ThemeStorage();
  writeThemeManifestFixture(root, { logNumber: 6, previousLogNumber: 4 });
  writeFileSync(join(root, '000003.log'), log('obsolete', 100n));
  writeFileSync(join(root, '000004.log'), log('ember', 2n));
  assert.equal(storage.read(root)['t3code:theme'], 'ember');
  writeFileSync(join(root, '000006.log'), log('grove', 3n));
  assert.equal(storage.read(root)['t3code:theme'], 'grove');
  writeFileSync(join(root, '000007.log'), log('iris', 4n));
  assert.equal(storage.read(root)['t3code:theme'], 'iris');
  writeThemeManifestFixture(root, { logNumber: 8 });
  assert.deepEqual(storage.read(root), {});
});
test('missing or corrupt manifest metadata never falls back to scanning obsolete files', t => {
  const root = directory(t), storage = new ThemeStorage();
  writeFileSync(join(root, '000001.log'), log('ember'));
  assert.throws(() => storage.read(root), /ENOENT/);
  writeFileSync(join(root, 'CURRENT'), '../outside\n');
  assert.throws(() => storage.read(root), /CURRENT/);
  writeThemeManifestFixture(root, { logNumber: 1 });
  const manifest = readFileSync(join(root, 'MANIFEST-000001')); manifest[7] ^= 1;
  writeFileSync(join(root, 'MANIFEST-000001'), manifest);
  assert.throws(() => storage.read(root), /checksum/);
});
