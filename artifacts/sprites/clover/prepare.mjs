// Rebuild runtime sheets and previews from accepted imagegen pixels.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const root = 'artifacts/sprites/clover';
const runtime = 'assets/clover';
const states = [
  ['ready', 'ready.png', [600, 140, 160, 90, 90, 140, 180, 300]],
  ['typing', 'typing.png', Array(8).fill(100)],
  ['waiting', 'needs-input.png', [450, 150, 150, 180, 180, 150, 150, 330]],
  ['broken', 'broken.png', [600, 160, 160, 140, 140, 160, 160, 340]],
  ['jumping', 'jumping.png', [260, 110, 110, 110, 160, 110, 110, 250]],
];
mkdirSync(runtime, { recursive: true });
mkdirSync(join(root, 'frames'), { recursive: true });
mkdirSync(join(root, 'previews'), { recursive: true });
const report = { processing: '4 x 2 source grid; one fixed nearest-neighbor transform per sequence; first-pose eye spacing at most 22px and full height at most 88px, eye midpoint x64, baseline y112 in 128 x 128 cells; no per-frame centering', animations: [] };
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

function eyeAnchors(input) {
  const width = Math.floor(input.width / 4), height = Math.floor(input.height / 2);
  const seen = new Set(), eyes = [];
  const dark = (x, y) => {
    const i = (y * input.width + x) * 4;
    return input.data[i + 3] >= 128 && input.data[i] < 130 && input.data[i + 1] < 100 && input.data[i + 2] < 90;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const key = y * width + x;
    if (seen.has(key) || !dark(x, y)) continue;
    const stack = [[x, y]];
    seen.add(key);
    let pixels = 0, left = x, right = x, top = y, bottom = y;
    while (stack.length) {
      const [a, b] = stack.pop();
      pixels++; left = Math.min(left, a); right = Math.max(right, a);
      top = Math.min(top, b); bottom = Math.max(bottom, b);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c = a + dx, d = b + dy, next = d * width + c;
        if (c < 0 || d < 0 || c >= width || d >= height || seen.has(next) || !dark(c, d)) continue;
        seen.add(next); stack.push([c, d]);
      }
    }
    // Isolated dark eye regions, excluding the connected outline and tiny mouth.
    if (pixels > width * height * 0.001 && pixels < width * height * 0.03 && top > height * 0.35 && bottom < height * 0.82) {
      eyes.push({ x: (left + right) / 2, y: (top + bottom) / 2, pixels });
    }
  }
  if (eyes.length !== 2) throw new Error('First pose must supply two measurable open eyes');
  eyes.sort((a, b) => a.x - b.x);
  return eyes;
}

function registration(input) {
  const width = Math.floor(input.width / 4), height = Math.floor(input.height / 2);
  let baseline = 0, firstVisible = height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (input.data[(y * input.width + x) * 4 + 3] < 128) continue;
      baseline = y; firstVisible = Math.min(firstVisible, y);
    }
  }
  if (!baseline) throw new Error('Missing first pose for registration');
  const bodyHeight = baseline - firstVisible + 1;
  const eyes = eyeAnchors(input), eyeSpacing = eyes[1].x - eyes[0].x;
  return { scale: Math.min(22 / eyeSpacing, 88 / bodyHeight), eyes, eyeSpacing, bodyHeight, headCenter: (eyes[0].x + eyes[1].x) / 2, baseline };
}

function copyFrame(source, target, left, top) {
  for (let y = 0; y < source.height; y++) source.data.copy(target.data, ((top + y) * target.width + left) * 4, y * source.width * 4, (y + 1) * source.width * 4);
}

function sourceBounds(input, column, row, alignment) {
  const cellWidth = input.width / 4, cellHeight = input.height / 2;
  const originX = column * cellWidth, originY = row * cellHeight;
  let left = cellWidth, top = cellHeight, right = -1, bottom = -1;
  for (let y = Math.ceil(originY); y < originY + cellHeight; y++) {
    for (let x = Math.ceil(originX); x < originX + cellWidth; x++) {
      if (input.data[(y * input.width + x) * 4 + 3] < 128) continue;
      left = Math.min(left, x - originX); right = Math.max(right, x - originX);
      top = Math.min(top, y - originY); bottom = Math.max(bottom, y - originY);
    }
  }
  if (right < left || bottom < top) throw new Error('Missing source pose');
  if (left < 1 || top < 1 || right >= cellWidth - 1 || bottom >= cellHeight - 1) throw new Error('Source artwork touches cell boundary');
  const projected = {
    left: 64 + (left - alignment.headCenter) * alignment.scale,
    right: 64 + (right - alignment.headCenter) * alignment.scale,
    top: 112 + (top - alignment.baseline) * alignment.scale,
    bottom: 112 + (bottom - alignment.baseline) * alignment.scale,
  };
  if (projected.left < 1 || projected.top < 1 || projected.right >= 127 || projected.bottom >= 127) throw new Error('Packing would clip visible artwork');
  return { left, top, right, bottom, projected };
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
    const source = sourceBounds(input, column, row, alignment);
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
    entries.push({ frame, duration: durations[frame], sourceBounds: source, bounds: measured, pixelHash: createHash('sha256').update(extracted.data).digest('hex') });
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
gif(transition, join(root, 'clover.gif'));
writeFileSync(join(root, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log('Packed five Clover sheets and generated light/dark motion previews and frame validation.');
