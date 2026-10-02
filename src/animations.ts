import type { PetMood } from './shared';

export interface Animation {
  file: string;
  columns: number;
  width: number;
  height: number;
  durations: number[];
  scale: number;
  x: number;
  y: number;
  row?: number;
}

const emotion = (file: string, first: number, middle: number, last: number): Animation => ({
  file, columns: 7, width: 128, height: 128,
  durations: [first, ...Array<number>(47).fill(middle), last], scale: 2, x: 0, y: 0,
});
const movement = (file: string): Animation => ({
  file, columns: 8, width: 192, height: 208,
  durations: Array<number>(16).fill(80), scale: 1, x: 32, y: 40,
});

export const animations = {
  ready: emotion('ready.png', 40, 80, 40),
  typing: emotion('typing.png', 20, 40, 20),
  waiting: emotion('needs-input.png', 30, 60, 30),
  broken: emotion('broken.png', 20, 50, 30),
  jumping: movement('jumping.png'),
};
export type AnimationName = keyof typeof animations;
export const moodAnimation: Record<PetMood, AnimationName> = {
  idle: 'ready', offline: 'ready', working: 'typing', waiting: 'waiting', error: 'broken', done: 'jumping',
};

export function frameAt(animation: Animation, elapsed: number, still = false): number {
  if (still) return 0;
  const total = animation.durations.reduce((sum, duration) => sum + duration, 0);
  let time = Math.max(0, elapsed) % total;
  for (let i = 0; i < animation.durations.length; i++) {
    if (time < animation.durations[i]) return i;
    time -= animation.durations[i];
  }
  return 0;
}
