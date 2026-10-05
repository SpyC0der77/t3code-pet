import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Keep every variant's paw geometry and color identical to the original mark.
const source = await readFile('assets/icon.svg', 'utf8');
const background = /  <rect[^>]+\/>\r?\n/;
if (!background.test(source)) throw new Error('The original icon background was not found.');
for (const variant of ['light', 'transparent']) {
  const svg = source.replace(background, variant === 'light'
    ? '  <rect width="256" height="256" fill="#ffffff"/>\n'
    : '');
  const base = `assets/icon-${variant}`;
  await writeFile(`${base}.svg`, svg);
  execFileSync('magick', ['-background', 'none', '-density', '384', `${base}.svg`, '-resize', '1024x1024',
    '-set', 'Source', `T3 Pet authored paw mark; ${base}.svg`, `PNG32:${base}.png`], { stdio: 'inherit', windowsHide: true });
}
execFileSync('magick', ['assets/icon-transparent.png', '-define', 'icon:auto-resize=256,128,64,48,32,24,16',
  'assets/icon-transparent.ico'], { stdio: 'inherit', windowsHide: true });
