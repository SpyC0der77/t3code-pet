import { build } from 'esbuild';
import { mkdir, copyFile, readdir, unlink, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

await mkdir('dist/renderer', { recursive: true });
await mkdir('assets', { recursive: true });
await build({ entryPoints: ['src/main.ts', 'src/preload.ts'], outdir: 'dist', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outExtension: { '.js': '.cjs' }, target: 'node24' });
await build({ entryPoints: ['src/renderer/pet.ts', 'src/renderer/settings.ts', 'src/renderer/hover.ts', 'src/renderer/onboarding.ts'], outdir: 'dist/renderer', bundle: true, platform: 'browser', target: 'chrome140', format: 'iife' });
for (const name of await readdir('src/renderer')) if (/\.(html|css)$/.test(name)) await copyFile(`src/renderer/${name}`, `dist/renderer/${name}`);
await copyFile('node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2', 'dist/renderer/font.woff2');
await copyFile('node_modules/@fontsource-variable/dm-sans/LICENSE', 'dist/renderer/FONT-LICENSE.txt');

// Bundle each character independently, preserving the original LFG artwork.
for (const pet of ['lfg', 'biscuit', 'miso', 'clover']) {
  await mkdir(`dist/renderer/${pet}`, { recursive: true });
  for (const name of await readdir(`assets/${pet}`)) await copyFile(`assets/${pet}/${name}`, `dist/renderer/${pet}/${name}`);
}
await unlink('dist/cat-icon.mjs').catch(error => { if (error.code !== 'ENOENT') throw error; });
const bundledPets = join(resolve('dist/renderer'), 'pets');
await rm(bundledPets, { recursive: true, force: true });
// Remove retired imported artwork from incremental builds.
if (process.platform === 'win32') {
  await mkdir('dist/native', { recursive: true });
  const compiler = join(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  execFileSync(compiler, ['/nologo', '/optimize+', '/target:exe', '/platform:anycpu', '/out:' + resolve('dist/native/foreground-monitor.exe'), resolve('native/ForegroundMonitor.cs')], { stdio: 'inherit', windowsHide: true });
  execFileSync(compiler, ['/nologo', '/optimize+', '/target:exe', '/out:' + resolve('dist/native/t3-close.exe'), resolve('native/T3Close.cs')], { stdio: 'inherit', windowsHide: true });
  execFileSync(compiler, ['/nologo', '/target:winexe', '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/out:' + resolve('dist/native/T3PetCloseFixture.exe'), resolve('native/T3PetCloseFixture.cs')], { stdio: 'inherit', windowsHide: true });
}
if (process.platform === 'darwin') {
  await mkdir('dist/native', { recursive: true });
  execFileSync('clang', ['-O2', '-arch', 'arm64', '-arch', 'x86_64', '-fobjc-arc', '-framework', 'AppKit', '-o', 'dist/native/t3-close', 'native/T3CloseMac.m'], { stdio: 'inherit' });
  execFileSync('clang', ['-O2', '-arch', 'arm64', '-arch', 'x86_64', '-fobjc-arc', '-framework', 'AppKit', '-framework', 'CoreGraphics', '-o', 'dist/native/foreground-monitor', 'native/ForegroundMonitorMac.m'], { stdio: 'inherit' });
}
if (process.platform === 'linux') {
  await mkdir('dist/native', { recursive: true });
  execFileSync('cc', ['-O2', '-Wall', '-Wextra', '-o', 'dist/native/t3-close', 'native/T3CloseLinux.c', '-lX11'], { stdio: 'inherit' });
  execFileSync('cc', ['-O2', '-Wall', '-Wextra', '-o', 'dist/native/foreground-monitor', 'native/ForegroundMonitorLinux.c', '-lX11', '-lXrandr', '-lXext'], { stdio: 'inherit' });
}
// App identity is independent of the selected pet. Use the committed icon assets;
// never regenerate menu, tray, or notification icons from a sprite sheet.
console.log('Built T3 Pet.');
