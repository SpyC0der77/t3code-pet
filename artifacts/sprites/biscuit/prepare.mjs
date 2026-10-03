// Rebuild runtime sheets and previews from accepted imagegen pixels.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const root = 'artifacts/sprites/biscuit';
const runtime = 'assets/biscuit';
const states = [
  ['ready', 'ready.png', [500, 140, 140, 80, 80, 140, 140, 220]],
  ['typing', 'typing.png', Array(8).fill(100)],
  ['waiting', 'needs-input.png', [400, 160, 160, 160, 160, 160, 160, 300]],
  ['broken', 'broken.png', [500, 140, 140, 140, 140, 140, 140, 300]],
  ['jumping', 'jumping.png', [240, 100, 100, 100, 140, 100, 100, 240]],
];
mkdirSync(runtime, { recursive: true });
mkdirSync(join(root, 'frames'), { recursive: true });
mkdirSync(join(root, 'previews'), { recursive: true });
const report = { processing: '4 x 2 source grid; one fixed nearest-neighbor transform per sequence; first-pose head width 70px, head center x64, baseline y112 in 128 x 128 cells; no per-frame centering', animations: [] };
const previewFrames = new Map();
const contact = new PNG({ width: 8 * 128, height: states.length * 128 });

function bounds(frame) {
  let left = frame.width, top = frame.height, right = -1, bottom = -1, visible = 0, transparent = 0;
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    if (frame.data[(y * frame.width + x) * 4 + 3] === 0) { transparent++; continue; }
    visible++; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (!visible || !transparent) throw new Error('Empty or opaque frame');
  if (left <= 0 || top <= 0 || right >= 127 || bottom >= 127) throw new Error('Artwork touches cell boundary');
  return { left, top, right, bottom, visible, transparent };
}

function registration(input) {
  const width = Math.floor(input.width / 4), height = Math.floor(input.height / 2);
  let headWidth = 0, headCenter = 0, baseline = 0;
  for (let y = 0; y < height; y++) {
    let left = width, right = -1;
    for (let x = 0; x < width; x++) {
      if (input.data[(y * input.width + x) * 4 + 3] < 128) continue;
      left = Math.min(left, x); right = Math.max(right, x); baseline = y;
    }
    if (y < height * 0.6 && right - left + 1 > headWidth) {
      headWidth = right - left + 1; headCenter = (left + right) / 2;
    }
  }
  if (!headWidth || !baseline) throw new Error('Missing first pose for registration');
  return { scale: 70 / headWidth, headWidth, headCenter, baseline };
}

function copyFrame(source, target, left, top) {
  for (let y = 0; y < source.height; y++) source.data.copy(target.data, ((top + y) * target.width + left) * 4, y * source.width * 4, (y + 1) * source.width * 4);
}

function backgroundPreview(frame) {
  const preview = new PNG({ width: 512, height: 256 });
  for (let y = 0; y < 256; y++) for (let x = 0; x < 512; x++) {
    const src = (Math.floor(y / 2) * 128 + Math.floor((x % 256) / 2)) * 4;
    const dst = (y * 512 + x) * 4;
    const background = x < 256 ? [250, 248, 245] : [24, 24, 27];
    const alpha = frame.data[src + 3] / 255;
    for (let channel = 0; channel < 3; channel++) preview.data[dst + channel] = Math.round(frame.data[src + channel] * alpha + background[channel] * (1 - alpha));
    preview.data[dst + 3] = 255;
  }
  return preview;
}

function gif(sequence, file) {
  const args = ['-dispose', 'none'];
  for (const [frame, duration] of sequence) args.push('-delay', String(duration / 10), frame);
  args.push('-loop', '0', file);
  execFileSync('magick', args, { windowsHide: true });
}

for (const [index, [name, file, durations]] of states.entries()) {
  const input = PNG.sync.read(readFileSync(join(root, 'sources', `${name}.png`)));
  if (Math.abs(input.width / input.height - 2) > 0.02) throw new Error(`${name}: expected a 4 x 2 grid of square cells`);
  const alignment = registration(input);
  const sheet = new PNG({ width: 512, height: 256 });
  const entries = [], sequence = [];
  for (let frame = 0; frame < 8; frame++) {
    const column = frame % 4, row = Math.floor(frame / 4);
    const extracted = new PNG({ width: 128, height: 128 });
    // One fixed coordinate transform for every pose, retaining jump displacement.
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const localX = (x + 0.5 - 64) / alignment.scale + alignment.headCenter;
      const localY = (y + 0.5 - 112) / alignment.scale + alignment.baseline;
      if (localX < 0 || localX >= input.width / 4 || localY < 0 || localY >= input.height / 2) continue;
      const sx = Math.floor(column * input.width / 4 + localX);
      const sy = Math.floor(row * input.height / 2 + localY);
      input.data.copy(extracted.data, (y * 128 + x) * 4, (sy * input.width + sx) * 4, (sy * input.width + sx) * 4 + 4);
    }
    const measured = bounds(extracted);
    copyFrame(extracted, sheet, column * 128, row * 128);
    copyFrame(extracted, contact, frame * 128, index * 128);
    const frameFile = join(root, 'frames', `${name}-${frame}.png`);
    writeFileSync(frameFile, PNG.sync.write(extracted));
    const previewFile = join(root, 'previews', `${name}-${frame}.png`);
    writeFileSync(previewFile, PNG.sync.write(backgroundPreview(extracted)));
    sequence.push([previewFile, durations[frame]]);
    entries.push({ frame, duration: durations[frame], bounds: measured, pixelHash: createHash('sha256').update(extracted.data).digest('hex') });
  }
  const encoded = PNG.sync.write(sheet);
  writeFileSync(join(runtime, file), encoded);
  const decoded = PNG.sync.read(readFileSync(join(runtime, file)));
  if (decoded.width !== 512 || decoded.height !== 256) throw new Error('Encoded sheet dimensions changed');
  if (new Set(entries.map(entry => entry.pixelHash)).size < 6) throw new Error(`${name}: too few distinct frames`);
  report.animations.push({ name, sourceSize: [input.width, input.height], registration: alignment, file: `${runtime}/${file}`, size: [decoded.width, decoded.height], loopMilliseconds: durations.reduce((a, b) => a + b, 0), sha256: createHash('sha256').update(encoded).digest('hex'), frames: entries });
  previewFrames.set(name, sequence);
  gif(sequence, join(root, `${name}.gif`));
}
writeFileSync(join(root, 'contact.png'), PNG.sync.write(contact));
const contactArgs = [join(root, 'contact.png'), '-background', '#faf8f5', '-alpha', 'remove', '-alpha', 'off', '-gravity', 'west', '-splice', '96x0', '-gravity', 'northwest', '-font', process.platform === 'win32' ? 'Consolas' : 'DejaVu-Sans', '-pointsize', '14', '-fill', '#292524'];
for (const [index, [name]] of states.entries()) contactArgs.push('-annotate', `+8+${index * 128 + 60}`, name);
contactArgs.push(join(root, 'contact-labeled.png'));
execFileSync('magick', contactArgs, { windowsHide: true });
// Playback from these exact runtime frames, including each state boundary.
const transition = [];
for (const name of ['ready', 'typing', 'ready', 'waiting', 'ready', 'broken', 'ready', 'jumping', 'ready']) transition.push(...previewFrames.get(name));
gif(transition, join(root, 'biscuit.gif'));
writeFileSync(join(root, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log('Packed five Biscuit sheets and generated light/dark motion previews and frame validation.');
