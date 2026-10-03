import { animations, type Animation, type AnimationName } from './animations';

export const pets = [
  { id: 'lfg', name: "Lil' Finder Guy", credit: 'Artwork by SpyC0der77. Used with permission.', source: 'https://github.com/SpyC0der77/lfg-codex-pet' },
  { id: 'biscuit', name: 'Biscuit', credit: 'Dog artwork generated with OpenAI imagegen for T3 Pet.', source: '' },
  { id: 'miso', name: 'Miso', credit: 'Cat artwork generated with OpenAI imagegen for T3 Pet.', source: '' },
  { id: 'clover', name: 'Clover', credit: 'Bunny artwork generated with OpenAI imagegen for T3 Pet.', source: '' },
];

const smallLoop = (file: string, durations: number[]): Animation => ({
  file, columns: 4, width: 128, height: 128, durations, scale: 2, x: 0, y: 0,
});

const dogAnimations: Record<AnimationName, Animation> = {
  ready: smallLoop('ready.png', [500, 140, 140, 80, 80, 140, 140, 220]),
  typing: smallLoop('typing.png', Array<number>(8).fill(100)),
  waiting: smallLoop('needs-input.png', [400, 160, 160, 160, 160, 160, 160, 300]),
  broken: smallLoop('broken.png', [500, 140, 140, 140, 140, 140, 140, 300]),
  jumping: smallLoop('jumping.png', [240, 100, 100, 100, 140, 100, 100, 240]),
};

const catAnimations: Record<AnimationName, Animation> = {
  ready: smallLoop('ready.png', [700, 160, 160, 90, 90, 160, 160, 300]),
  typing: smallLoop('typing.png', Array<number>(8).fill(110)),
  waiting: smallLoop('needs-input.png', [500, 160, 160, 160, 160, 160, 160, 320]),
  broken: smallLoop('broken.png', [700, 150, 150, 150, 150, 150, 150, 340]),
  jumping: smallLoop('jumping.png', [320, 120, 120, 120, 180, 120, 120, 280]),
};

const bunnyAnimations: Record<AnimationName, Animation> = {
  ready: smallLoop('ready.png', [600, 140, 160, 90, 90, 140, 180, 300]),
  typing: smallLoop('typing.png', Array<number>(8).fill(100)),
  waiting: smallLoop('needs-input.png', [450, 150, 150, 180, 180, 150, 150, 330]),
  broken: smallLoop('broken.png', [600, 160, 160, 140, 140, 160, 160, 340]),
  jumping: smallLoop('jumping.png', [260, 110, 110, 110, 160, 110, 110, 250]),
};

const petAnimations: Record<string, Record<AnimationName, Animation>> = {
  lfg: animations, biscuit: dogAnimations, miso: catAnimations, clover: bunnyAnimations,
};

export function isPetId(value: unknown): value is string {
  return typeof value === 'string' && pets.some(pet => pet.id === value);
}

export function petAnimation(petId: string, name: AnimationName): Animation {
  const id = isPetId(petId) ? petId : 'lfg';
  const animation = petAnimations[id][name];
  return { ...animation, file: `${id}/${animation.file}` };
}
