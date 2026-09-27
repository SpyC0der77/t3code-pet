import { build } from 'esbuild';
import { mkdir, copyFile, readdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';

await mkdir('dist/renderer', { recursive: true });
await mkdir('assets', { recursive: true });
await build({ entryPoints: ['src/main.ts', 'src/preload.ts'], outdir: 'dist', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outExtension: { '.js': '.cjs' }, target: 'node24' });
await build({ entryPoints: ['src/renderer/pet.ts', 'src/renderer/settings.ts', 'src/renderer/hover.ts'], outdir: 'dist/renderer', bundle: true, platform: 'browser', target: 'chrome140', format: 'iife' });
for (const name of await readdir('src/renderer')) if (/\.(html|css)$/.test(name)) await copyFile(`src/renderer/${name}`, `dist/renderer/${name}`);
await copyFile('node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2', 'dist/renderer/font.woff2');
await copyFile('node_modules/@fontsource-variable/dm-sans/LICENSE', 'dist/renderer/FONT-LICENSE.txt');

// Copy the user's original sprite sheets without modifying their pixels.
await mkdir('dist/renderer/lfg', { recursive: true });
for (const name of await readdir('assets/lfg')) await copyFile('assets/lfg/' + name, 'dist/renderer/lfg/' + name);
await unlink('dist/cat-icon.mjs').catch(error => { if (error.code !== 'ENOENT') throw error; });
if (process.platform === 'win32') {
  await mkdir('dist/native', { recursive: true });
  const compiler = join(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  execFileSync(compiler, ['/nologo', '/optimize+', '/target:exe', '/platform:anycpu', '/out:' + resolve('dist/native/foreground-monitor.exe'), resolve('native/ForegroundMonitor.cs')], { stdio: 'inherit', windowsHide: true });
}
// Use the first jumping pose for the app icon.
const sheet = PNG.sync.read(await readFile('assets/lfg/jumping.png'));
const size = 256;
const raw = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const sx = Math.floor(x * 208 / size) - 8;
  const sy = Math.floor(y * 208 / size);
  if (sx < 0 || sx >= 192) continue;
  const from = (sy * sheet.width + sx) * 4;
  sheet.data.copy(raw, y * (size * 4 + 1) + 1 + x * 4, from, from + 4);
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('tEXt', Buffer.from('Source\0LFG Pet by SpyC0der77; jumping.png first frame; commit 60716f8273e4a69b40dace98b241ab5c23733217.')), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
await writeFile('assets/icon.png', png);
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(1, 2); icoHeader.writeUInt16LE(1, 4);
icoHeader.writeUInt16LE(1, 10); icoHeader.writeUInt16LE(32, 12); icoHeader.writeUInt32LE(png.length, 14); icoHeader.writeUInt32LE(22, 18);
await writeFile('assets/icon.ico', Buffer.concat([icoHeader, png]));
console.log('Built T3 Pet.');
