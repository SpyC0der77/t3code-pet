import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

export class PetVisibility {
  manualHidden = false;
  fullscreen = false;
  get visible() { return !this.manualHidden && !this.fullscreen; }
}

export interface ForegroundSample {
  kind: 'fullscreen' | 'windowed' | 'transition' | 'pet';
  windowId: string;
}

/** Hide immediately; reveal only after one normal window has settled. No delayed
 * callback can reveal a pet after a newer fullscreen observation has arrived. */
export class FullscreenStabilizer {
  hidden: boolean;
  private candidate: string | null = null;
  private candidateSince = 0;
  constructor(private readonly revealDelay = 400, initiallyHidden = true) { this.hidden = initiallyHidden; }

  sample(sample: ForegroundSample, now: number): boolean {
    // Dragging or focusing the pet must neither hide it nor override a game.
    if (sample.kind === 'pet' || sample.kind === 'transition') {
      this.candidate = null;
      return this.hidden;
    }
    if (sample.kind !== 'windowed') {
      this.candidate = null;
      this.hidden = true;
      return this.hidden;
    }
    if (!this.hidden) return false;
    if (this.candidate !== sample.windowId) {
      this.candidate = sample.windowId;
      this.candidateSince = now;
    }
    if (now - this.candidateSince >= this.revealDelay) this.hidden = false;
    return this.hidden;
  }
}

export function parseForegroundSample(line: string): ForegroundSample | null {
  const match = /^([10?S]):(\d+)$/.exec(line);
  if (!match) return null;
  const kinds = { '1': 'fullscreen', '0': 'windowed', '?': 'transition', S: 'pet' } as const;
  return { kind: kinds[match[1] as keyof typeof kinds], windowId: match[2] };
}

/** One persistent native helper per platform; no shell process on every poll. */
export function watchFullscreen(executable: string, petWindowHandle: string, onChange: (fullscreen: boolean) => void, onFailure: () => void, onBackground: (dark: boolean) => void): () => void {
  let child: ChildProcess | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const launch = () => {
    let failed = false;
    const stabilizer = new FullscreenStabilizer(400, process.platform === 'win32');
    child = spawn(executable, [String(process.pid), petWindowHandle], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const lines = createInterface({ input: child.stdout! });
    lines.on('line', line => {
      if (stopped || failed) return;
      if (line === 'B:0' || line === 'B:1') { onBackground(line === 'B:1'); return; }
      const sample = parseForegroundSample(line);
      if (sample) onChange(stabilizer.sample(sample, performance.now()));
    });
    const restart = () => {
      if (failed || stopped) return;
      failed = true;
      lines.close();
      onFailure();
      retry = setTimeout(launch, 5000);
    };
    child.once('error', restart);
    child.once('exit', restart);
  };
  launch();
  return () => { stopped = true; if (retry) clearTimeout(retry); child?.kill(); };
}
