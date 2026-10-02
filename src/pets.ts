import { animations, type Animation, type AnimationName } from './animations';

export const pets = [
  { id: 'lfg', name: "Lil' Finder Guy", credit: 'Artwork by SpyC0der77. Used with permission.', source: 'https://github.com/SpyC0der77/lfg-codex-pet' },
];

export function isPetId(value: unknown): value is string {
  return typeof value === 'string' && pets.some(pet => pet.id === value);
}

export function petAnimation(_petId: string, name: AnimationName): Animation {
  return { ...animations[name], file: `lfg/${animations[name].file}` };
}
