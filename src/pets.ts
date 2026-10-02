import { animations, type Animation, type AnimationName } from './animations';

export const pets = [
  { id: 'lfg', name: "Lil' Finder Guy", credit: 'Artwork by SpyC0der77. Used with permission.', source: 'https://github.com/SpyC0der77/lfg-codex-pet' },
  ...[['jadebyte', 'Jadebyte'], ['lunari', 'Lunari']].map(([id, name]) => ({
    id, name, credit: 'Artwork by shuoyang129 / Codex Pet Collection. CC BY 4.0. Playback adapted for T3 Pet.', source: 'https://github.com/shuoyang129/codex-pet-collection',
  })),
  ...[['kerno', 'Kerno']].map(([id, name]) => ({
    id, name, credit: 'Artwork from lencx/pet. MIT license. Playback adapted for T3 Pet.', source: 'https://github.com/lencx/pet',
  })),
  ...[['aion', 'Aion'], ['floppy', 'Floppy'], ['oscillo', 'Oscillo']].map(([id, name]) => ({
    id, name, credit: 'Artwork by Jordan Cleigh. MIT license. Playback adapted for T3 Pet.', source: 'https://github.com/jcleigh/pets',
  })),
  ...[['caspian', 'Caspian'], ['cinder', 'Cinder'], ['hoggie', 'Hoggie'], ['cat-stack', 'Cat Stack']].map(([id, name]) => ({
    id, name, credit: 'Artwork from Dinohouse Digital / Andrew Deck. MIT license. Playback adapted for T3 Pet.', source: 'https://github.com/Dinohouse-Digital-LLC/vscode-codex-pet',
  })),
];

export function isPetId(value: unknown): value is string {
  return typeof value === 'string' && pets.some(pet => pet.id === value);
}

// Task timing is local unless supplied by the source. lencx supplies these
// arrays. LFG keeps its original loops.
const atlasRows: Record<AnimationName, { row: number; durations: number[] }> = {
  ready: { row: 0, durations: [280, 110, 110, 140, 140, 320] },
  typing: { row: 7, durations: [120, 120, 120, 120, 120, 220] },
  waiting: { row: 6, durations: [150, 150, 150, 150, 150, 260] },
  broken: { row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
  jumping: { row: 4, durations: [140, 140, 140, 140, 280] },
};

export function petAnimation(petId: string, name: AnimationName): Animation {
  if (petId === 'lfg' || !isPetId(petId)) return { ...animations[name], file: `lfg/${animations[name].file}` };
  const row = atlasRows[name];
  const durations = name === 'ready' && petId !== 'kerno'
    ? [280, 110, 110, 140, 140, 140, 320] : row.durations;
  return { file: `pets/${petId}/spritesheet.webp`, columns: 8, row: row.row, width: 192, height: 208,
    durations, scale: 1, x: 32, y: 40 };
}
