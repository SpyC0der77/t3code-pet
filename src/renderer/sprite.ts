import { animations, frameAt, type AnimationName } from '../animations';
import { isPetId, petAnimation } from '../pets';

export function createSpriteRenderer() {
let sheets = new Map<string, HTMLImageElement>();
let loadedPet = '';
let requestedPet = '';
let loading: Promise<void> | undefined;
let generation = 0;
const outlineMask = document.createElement('canvas');
function loadSprites(petId = 'lfg'): Promise<void> {
  const id = isPetId(petId) ? petId : 'lfg';
  if (requestedPet === id && loading) return loading;
  requestedPet = id;
  const request = ++generation;
  const files = new Set((Object.keys(animations) as AnimationName[]).map(name => petAnimation(id, name).file));
  loading = Promise.all([...files].map(async file => {
    const image = new Image(); image.src = file; await image.decode();
    return [file, image] as const;
  })).then(images => {
    if (request !== generation) return;
    // Only retain the selected pet's decoded sheets in each renderer.
    sheets = new Map(images); loadedPet = id;
  });
  return loading;
}

function drawSprite(canvas: HTMLCanvasElement, name: AnimationName, elapsed: number, still: boolean, background = false, petId = 'lfg') {
  const id = isPetId(petId) ? petId : 'lfg';
  if (requestedPet !== id) void loadSprites(id).catch(error => console.error('Animation could not load', error));
  if (loadedPet !== id) return;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const animation = petAnimation(id, name);
  const image = sheets.get(animation.file);
  if (!image) return;
  const frame = frameAt(animation, elapsed, still);
  if (canvas.dataset.pet === id && canvas.dataset.animation === name && canvas.dataset.frame === String(frame) && canvas.dataset.background === String(background)) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(image,
    frame % animation.columns * animation.width, ((animation.row ?? 0) + Math.floor(frame / animation.columns)) * animation.height,
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
  canvas.dataset.pet = id;
  canvas.dataset.frame = String(frame);
  canvas.dataset.background = String(background);
}
return { loadSprites, drawSprite, release() {
  generation++; sheets.clear(); loadedPet = ''; requestedPet = ''; loading = undefined;
} };
}

export const { loadSprites, drawSprite } = createSpriteRenderer();
