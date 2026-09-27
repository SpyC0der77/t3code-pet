export type PetMood = 'offline' | 'idle' | 'working' | 'waiting' | 'done' | 'error';

export interface ThreadStatus {
  settledOverride?: string | null;
  snoozedUntil?: string | null;
  id: string;
  title: string;
  project: string;
  provider: string;
  sessionStatus: string | null;
  turnId: string | null;
  turnState: string | null;
  completedAt: string | null;
  updatedAt: string;
  pendingApproval: number;
  pendingInput: number;
}

export interface Snapshot {
  connected: boolean;
  message: string;
  threads: ThreadStatus[];
  checkedAt: number;
}

export interface Preferences {
  dataDirectory: string;
  followThreadId: string | null;
  size: number;
  reducedMotion: boolean;
  showLabel: boolean;
  launchAtLogin: boolean;
  position: { x: number; y: number } | null;
}

export interface PetStatus {
  mood: PetMood;
  label: string;
  threadId: string | null;
  threadTitle: string | null;
  workingCount: number;
  waitingCount: number;
}

export interface AppState {
  darkBackground: boolean;
  preferences: Preferences;
  snapshot: Snapshot;
  pet: PetStatus;
  preview: boolean;
  version: string;
  supportsLoginStartup: boolean;
}

export interface PetBridge {
  openChat(threadId: string): Promise<void>;
  hover(): void;
  hoverSize(height: number): void;
  getState(): Promise<AppState>;
  onState(listener: (state: AppState) => void): () => void;
  savePreferences(prefs: Partial<Preferences>): Promise<AppState>;
  chooseDirectory(): Promise<string | null>;
  showMenu(): void;
  showSettings(): void;
  preview(mood: PetMood | null): void;
  mousePassthrough(ignore: boolean): void;
  drag(action: 'start' | 'stop'): void;
  quit(): void;
}

declare global {
  interface Window { pet: PetBridge; }
}
