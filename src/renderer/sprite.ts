import { animations, frameAt, type AnimationName } from '../animations';

const sheets = new Map<AnimationName, HTMLImageElement>();
const outlineMask = document.createElement('canvas');
export async function loadSprites() {
  await Promise.all(Object.entries(animations).map(async ([name, animation]) => {
    const image = new Image();
    image.src = `lfg/${animation.file}`;
    await image.decode();
    sheets.set(name as AnimationName, image);
  }));
}

export function drawSprite(canvas: HTMLCanvasElement, name: AnimationName, elapsed: number, still: boolean, background = false) {
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const image = sheets.get(name);
  if (!image) return;
  const animation = animations[name];
  const frame = frameAt(animation, elapsed, still);
  if (canvas.dataset.animation === name && canvas.dataset.frame === String(frame) && canvas.dataset.background === String(background)) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(image,
    frame % animation.columns * animation.width, Math.floor(frame / animation.columns) * animation.height,
    animation.width, animation.height,
    animation.x + (canvas.width - 256) / 2, animation.y + (canvas.height - 256) / 2,
    animation.width * animation.scale, animation.height * animation.scale);
  if (background) {
    // Expand the frame's alpha mask behind the original pixels. Transparent
    // gaps stay transparent except for the narrow outline along their edges.
    if (outlineMask.width !== canvas.width || outlineMask.height !== canvas.height) {
      outlineMask.width = canvas.width;
      outlineMask.height = canvas.height;
    }
    const mask = outlineMask.getContext('2d')!;
    mask.clearRect(0, 0, canvas.width, canvas.height);
    mask.drawImage(canvas, 0, 0);
    mask.globalCompositeOperation = 'source-in';
    mask.fillStyle = '#ffffff';
    mask.fillRect(0, 0, canvas.width, canvas.height);
    mask.globalCompositeOperation = 'source-over';
    context.globalCompositeOperation = 'destination-over';
    // Four source pixels equals two screen pixels at the default pet size.
    for (let step = 0; step < 16; step++) {
      const angle = step * Math.PI / 8;
      context.drawImage(outlineMask, Math.round(Math.cos(angle) * 4), Math.round(Math.sin(angle) * 4));
    }
    context.globalCompositeOperation = 'source-over';
  }
  canvas.dataset.animation = name;
  canvas.dataset.frame = String(frame);
  canvas.dataset.background = String(background);
}
