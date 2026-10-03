export type PetMood = 'offline' | 'idle' | 'working' | 'waiting' | 'done' | 'error';

export interface ThreadStatus {
  projectId?: string | null;
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
  projects?: { id: string; name: string }[];
  connected: boolean;
  message: string;
  threads: ThreadStatus[];
  checkedAt: number;
}

export interface SelectionFilter {
  mode: 'blocklist' | 'whitelist';
  selected: { id: string; name: string }[];
}

export interface Preferences {
  petId: string;
  projectFilter: SelectionFilter;
  chatFilter: SelectionFilter;
  blockedProjects: { id: string; name: string }[];
  onboardingCompleted: boolean;
  notificationsEnabled: boolean;
  notificationSound: boolean;
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
  theme: import('./t3-theme').UiTheme;
  notificationsSupported: boolean;
  darkBackground: boolean;
  preferences: Preferences;
  snapshot: Snapshot;
  pet: PetStatus;
  preview: boolean;
  version: string;
  supportsLoginStartup: boolean;
}

export interface PetBridge {
  notificationSetup(): Promise<NotificationSetup>;
  finishOnboarding(choice: 'keep' | 'enable' | 'migrate'): Promise<NotificationSetup>;
  testNotification(): Promise<void>;
  showOnboarding(): void;
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

export interface NotificationSetup {
  status: 'enabled' | 'off' | 'unknown';
  mode: string | null;
  message: string;
  outcome?: 'cancelled' | 'complete';
  completed: boolean;
  supported: boolean;
}

declare global {
  interface Window { pet: PetBridge; }
}
