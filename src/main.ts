import { app, BrowserWindow, Menu, Tray, nativeImage, nativeTheme, ipcMain, dialog, screen, shell, Notification } from 'electron';
import { chatUrl } from './t3-navigation';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readLocalSnapshot, readThreads } from './t3-local';
import { PetStateMachine } from './pet-state';
import { HoverPanel } from './hover-panel';
import { PetVisibility, watchFullscreen } from './fullscreen';
import { runFullscreenCheck, runFullscreenFixture } from './fullscreen-test';
import { loadPreferences, storePreferences, validatePreferences } from './preferences';
import { ChatNotifications, type ChatNotification } from './notifications';
import { ToastWindows } from './toast-windows';
import { allowedSnapshot } from './project-filter';
import { inspectNotifications, migrateNotifications, closeT3, consentedSwitch } from './t3-notifications';
import { nativeHelperPath, nativeWindowId } from './platform';
import { linuxStartupCommand, setLinuxLoginStartup } from './login-startup';
import type { AppState, NotificationSetup, PetMood, Preferences, Snapshot } from './shared';
import { pets, petAnimation } from './pets';
import { moodAnimation } from './animations';
import { T3ThemeSync, t3ProfileDirectory, resolveUiTheme } from './t3-theme';
import { writeThemeFixture } from './theme-fixture';

const fullscreenTest = process.argv.includes('--fullscreen-test');
// Wayland prevents desktop pets from positioning themselves. XWayland gives
// Linux the same window positioning and global pointer API as an X11 session.
if (process.platform === 'linux') app.commandLine.appendSwitch('ozone-platform', 'x11');
const closeFixtureIndex = process.argv.indexOf('--close-fixture');
const closeFixtureDirectory = closeFixtureIndex >= 0 ? process.argv[closeFixtureIndex + 1] : undefined;
const fixtureIndex = process.argv.indexOf('--fullscreen-fixture');
const fixtureDirectory = fixtureIndex >= 0 ? process.argv[fixtureIndex + 1] : undefined;
const smokeIndex = process.argv.indexOf(fullscreenTest ? '--fullscreen-test' : '--smoke-test');
const smokeDirectory = smokeIndex >= 0 ? process.argv[smokeIndex + 1] : undefined;
if (smokeDirectory) app.setPath('userData', join(smokeDirectory, 'user-data'));
if (fixtureDirectory) app.setPath('userData', join(fixtureDirectory, 'fixture-user-data'));
if (closeFixtureDirectory) app.setPath('userData', join(closeFixtureDirectory, 'close-fixture-user-data'));
function traceSmoke(stage: string) {
  if (!smokeDirectory) return;
  mkdirSync(smokeDirectory, { recursive: true });
  appendFileSync(join(smokeDirectory, 'stages.log'), `${new Date().toISOString()} ${stage}\n`);
}
traceSmoke('main loaded');
if (smokeDirectory) setTimeout(() => {
  traceSmoke('smoke timeout');
  app.exit(1);
}, 45_000).unref();
app.setName('T3 Pet');
app.setAppUserModelId('dev.t3pet.companion');

let petWindow: BrowserWindow | null = null;
let testingHover = false;
let testingToasts = false;
let darkBackground = false;
let settingsWindow: BrowserWindow | null = null;
let onboardingView = false;
let migrationMessage = '';
let migrating = false;
const notifications = new ChatNotifications();
const activeNotifications = new Set<Notification>();
const customNotifications = new ToastWindows(() => petWindow, () => uiTheme,
  async (threadId, test) => { if (test) showSettings(); else await openNotifiedChat(threadId); },
  error => { migrationMessage = `Could not show the custom notification: ${error instanceof Error ? error.message : String(error)}`; publish(); });
let tray: Tray | null = null;
let preferences: Preferences;
let preferencesPath: string;
let uiTheme = resolveUiTheme({}, false);
let themeSync: T3ThemeSync | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let dragTimer: ReturnType<typeof setInterval> | undefined;
let previewMood: PetMood | null = null;
let quitting = false;
let polling = false;
let connectionGeneration = 0;
const visibility = new PetVisibility();
const hoverPanel = new HoverPanel(() => petWindow, state, () => visibility.visible && !dragTimer && !!petWindow?.isVisible());
visibility.fullscreen = true;
let stopFullscreenWatch: (() => void) | undefined;
let fullscreenCheckFailed = false;
let fullscreenCheckReady = false;
let snapshot: Snapshot = { connected: false, message: 'Looking for T3 Code…', threads: [], checkedAt: Date.now() };
const machine = new PetStateMachine();
let pet = machine.update(snapshot, null);
const moods: PetMood[] = ['idle', 'working', 'waiting', 'done', 'error', 'offline'];
const labels: Record<PetMood, string> = { idle: 'Resting', working: 'Working', waiting: 'Approval needed', done: 'Turn finished', error: 'A chat hit an error', offline: 'T3 Code offline' };

function state(): AppState {
  return { theme: uiTheme, notificationsSupported: Notification.isSupported(), darkBackground, preferences, snapshot, pet: previewMood ? { ...pet, mood: previewMood, label: `${labels[previewMood]} · preview`, threadTitle: null } : pet,
    preview: previewMood !== null, version: app.getVersion(), supportsLoginStartup: ['win32', 'darwin', 'linux'].includes(process.platform) };
}

function publish() {
  const value = state();
  for (const win of [petWindow, settingsWindow]) if (win && !win.isDestroyed()) win.webContents.send('pet:state', value);
  tray?.setToolTip(`T3 Pet · ${value.pet.label}`);
  tray?.setContextMenu(menu());
  if (!testingHover) hoverPanel.publish();
  customNotifications.publish();
}

function persist() { storePreferences(preferencesPath, preferences); }

function applyVisibility() {
  if (!testingToasts && (visibility.fullscreen || !fullscreenCheckReady)) customNotifications.clear();
  if (!petWindow || petWindow.isDestroyed()) return;
  if (visibility.visible) {
    if (!petWindow.isVisible()) petWindow.showInactive();
    // Focus changes and fullscreen transitions can disturb native z-order even
    // when Electron still considers the window visible.
    if (!petWindow.isAlwaysOnTop()) petWindow.setAlwaysOnTop(true, 'floating');
  }
  else { hoverPanel.hide(); stopDrag(); if (petWindow.isVisible()) petWindow.hide(); }
  tray?.setContextMenu(menu());
}

function showPet() { visibility.manualHidden = false; applyVisibility(); }

function helperPath(name: string) {
  return nativeHelperPath(app.isPackaged ? process.resourcesPath : __dirname, name);
}

function dimensions() { return { width: Math.max(210, preferences.size + 64), height: preferences.size + 78 }; }

function fitPosition(position: { x: number; y: number } | null) {
  const size = dimensions();
  const display = position ? screen.getDisplayNearestPoint(position) : screen.getPrimaryDisplay();
  const area = display.workArea;
  return {
    x: Math.max(area.x, Math.min(position?.x ?? area.x + area.width - size.width - 24, area.x + area.width - size.width)),
    y: Math.max(area.y, Math.min(position?.y ?? area.y + area.height - size.height - 16, area.y + area.height - size.height)),
    ...size,
  };
}

function lockWindow(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
}

async function createPet() {
  traceSmoke('creating pet');
  petWindow = new BrowserWindow({
    ...fitPosition(preferences.position), title: 'T3 Pet', transparent: true, frame: false,
    icon: join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    hasShadow: false, alwaysOnTop: true, skipTaskbar: true, show: false,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  lockWindow(petWindow);
  // The companion has no native menu. Alt must not activate Electron's default
  // menu or change the transparent window's focus/layout.
  petWindow.setMenu(null);
  petWindow.setAlwaysOnTop(true, 'floating');
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  // Electron forwards ignored mouse movement only on Windows and macOS.
  petWindow.setIgnoreMouseEvents(process.platform !== 'linux', { forward: true });
  const ready = new Promise<void>(resolve => {
    petWindow!.once('ready-to-show', () => {
      traceSmoke('pet ready to show');
      applyVisibility();
      resolve();
    });
  });
  petWindow.webContents.on('did-finish-load', () => traceSmoke('pet loaded'));
  petWindow.webContents.on('did-fail-load', (_event, code, description) => traceSmoke(`pet load failed: ${code} ${description}`));
  petWindow.on('close', event => { if (!quitting) { event.preventDefault(); visibility.manualHidden = true; applyVisibility(); } });
  petWindow.on('blur', stopDrag);
  await petWindow.loadFile(join(__dirname, 'renderer', 'pet.html'));
  await ready;
  // Warm the list renderer so the first hover uses the same delay as later ones.
  await hoverPanel.prepare();
}

function showSettings(onboarding = false) {
  if (migrating) { settingsWindow?.show(); return; }
  onboarding = onboarding === true;
  const file = onboarding ? 'onboarding.html' : 'settings.html';
  const width = 768;
  const height = Math.min(600, screen.getPrimaryDisplay().workArea.height - 32);
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (onboardingView !== onboarding) {
      onboardingView = onboarding;
      settingsWindow.setSize(width, height);
      settingsWindow.setTitle(onboarding ? 'Set up T3 Pet' : 'T3 Pet settings');
      void settingsWindow.loadFile(join(__dirname, 'renderer', file));
    }
    settingsWindow.show(); settingsWindow.focus(); return;
  }
  onboardingView = onboarding;
  settingsWindow = new BrowserWindow({
    width, height, minWidth: 470, minHeight: 500, title: onboarding ? 'Set up T3 Pet' : 'T3 Pet settings',
    backgroundColor: uiTheme.appearance === 'dark' ? '#0a0a0a' : '#fafafa', autoHideMenuBar: true, show: false,
    icon: join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  lockWindow(settingsWindow);
  settingsWindow.once('ready-to-show', () => settingsWindow?.show());
  settingsWindow.on('closed', () => { settingsWindow = null; });
  settingsWindow.setMenu(null);
  void settingsWindow.loadFile(join(__dirname, 'renderer', file));
}

function setupState(): NotificationSetup {
  const inspected = inspectNotifications(preferences.dataDirectory);
  return { ...inspected, message: migrationMessage || inspected.message,
    completed: preferences.onboardingCompleted, supported: notificationSupported() };
}

function notificationSupported(style = preferences.notificationStyle) { return style === 'custom' || Notification.isSupported(); }
function clearNotifications() {
  customNotifications.clear();
  for (const notice of activeNotifications) notice.close();
  activeNotifications.clear();
}

async function openNotifiedChat(threadId: string) {
  if (!snapshot.connected || !snapshot.threads.some(t => t.id === threadId)) throw new Error('This chat is no longer available.');
  const url = chatUrl(preferences.dataDirectory, threadId);
  if (smokeDirectory) traceSmoke(`notification opened chat ${url}`);
  else await shell.openExternal(url);
}

function showNotification(notice: ChatNotification, test = false, style = preferences.notificationStyle) {
  if (style === 'custom') {
    const win = customNotifications.show(notice, test);
    if (preferences.notificationSound && !smokeDirectory) shell.beep();
    return win;
  }
  if (!Notification.isSupported()) throw new Error('Desktop notifications are unavailable on this system.');
  if (smokeDirectory && !process.argv.includes('--notification-smoke-test')) { traceSmoke(`notification ${notice.title}`); return null; }
  const notification = new Notification({ title: `T3 Pet · ${notice.title}`, body: notice.body,
    silent: !preferences.notificationSound,
    ...(process.platform === 'win32' ? {} : { icon: join(__dirname, '..', 'assets', 'icon.png') }) });
  activeNotifications.add(notification);
  notification.on('close', () => activeNotifications.delete(notification));
  notification.on('failed', (_event, error) => {
    activeNotifications.delete(notification);
    migrationMessage = `Could not show the notification: ${error}. Check system notification settings.`;
    publish();
  });
  notification.on('click', () => {
    activeNotifications.delete(notification);
    if (test) { if (smokeDirectory) traceSmoke('test notification clicked'); else showSettings(); }
    else void openNotifiedChat(notice.threadId).catch(error => {
      dialog.showErrorBox('Could not open chat', error instanceof Error ? error.message : 'Reopen T3 Code and try again.');
    });
  });
  notification.show();
  return notification;
}

function resetPosition() {
  preferences.position = null;
  petWindow?.setBounds(fitPosition(null));
  showPet();
  persist();
}

function menu() {
  return Menu.buildFromTemplate([
    { label: `T3 Pet · ${state().pet.label}`, enabled: false },
    ...(pet.threadTitle ? [{ label: pet.threadTitle.slice(0, 65), enabled: false }] : []),
    { type: 'separator' },
    ...(fullscreenCheckFailed ? [{ label: 'Fullscreen check unavailable · retrying', enabled: false }] : []),
    { label: visibility.manualHidden ? 'Show pet' : 'Hide pet', click: () => { visibility.manualHidden = !visibility.manualHidden; applyVisibility(); } },
    { label: 'Settings…', click: () => showSettings() },
    { label: 'Set up notifications…', click: () => showSettings(true) },
    { label: 'Preview animation', submenu: [
      ...moods.map(mood => ({ label: labels[mood], click: () => setPreview(mood) })),
      { type: 'separator' as const }, { label: 'Follow T3 Code', click: () => setPreview(null) },
    ] },
    { label: 'Reset position', click: resetPosition },
    { type: 'separator' },
    { label: 'Quit T3 Pet', click: () => app.quit() },
  ]);
}

function setPreview(mood: PetMood | null) {
  if (previewTimer) clearTimeout(previewTimer);
  previewMood = mood;
  publish();
  if (mood) previewTimer = setTimeout(() => { previewMood = null; publish(); }, 10_000);
}

function stopDrag() {
  if (!dragTimer) return;
  clearInterval(dragTimer);
  dragTimer = undefined;
  if (petWindow) {
    const [x, y] = petWindow.getPosition();
    preferences.position = { x, y };
    petWindow.setBounds(fitPosition(preferences.position));
    persist();
  }
}

async function poll() {
  if (polling || quitting) return;
  polling = true;
  const generation = connectionGeneration;
  try {
    const next = await readLocalSnapshot(preferences.dataDirectory);
    if (generation === connectionGeneration) {
      snapshot = next;
      const followed = allowedSnapshot(snapshot, preferences);
      pet = machine.update(followed, null);
      for (const notice of notifications.update(followed, notificationSupported() && preferences.notificationsEnabled,
        null, visibility.fullscreen || !fullscreenCheckReady || previewMood !== null || !!smokeDirectory)) {
        showNotification(notice);
      }
      publish();
    }
  } finally {
    polling = false;
    if (!quitting) timer = setTimeout(() => void poll(), 1500);
  }
}

function trusted(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) {
  if (event.sender !== petWindow?.webContents && event.sender !== settingsWindow?.webContents) throw new Error('Unknown window.');
  if (event.senderFrame !== event.sender.mainFrame) throw new Error('Unknown frame.');
}

function registerIpc() {
  ipcMain.handle('pet:notification-setup', event => { trusted(event); return setupState(); });
  ipcMain.handle('pet:finish-onboarding', async (event, choice: unknown, requestedStyle: unknown) => {
    trusted(event);
    if (event.sender !== settingsWindow?.webContents) throw new Error('Open notification setup to change notification ownership.');
    if (!['keep', 'enable', 'migrate'].includes(choice as string)) throw new Error('Choose a notification option.');
    if (requestedStyle !== undefined && requestedStyle !== 'os' && requestedStyle !== 'custom') throw new Error('Invalid notification style.');
    const style = choice === 'keep' ? preferences.notificationStyle : requestedStyle ?? preferences.notificationStyle;
    if (migrating) throw new Error('The switch is in progress. Please wait.');
    if (choice !== 'keep' && !notificationSupported(style)) throw new Error('OS notifications are unavailable on this system. Choose Custom notifications.');
    if (choice === 'migrate' && inspectNotifications(preferences.dataDirectory).status === 'unknown') throw new Error('Check the T3 Code data folder before switching notifications.');
    if (choice === 'enable' && inspectNotifications(preferences.dataDirectory).status !== 'off') throw new Error('Check T3 Code notifications first. Use Switch to T3 Pet if its alerts are on.');
    if (choice === 'migrate') {
      migrating = true;
      try {
        const helper = helperPath('t3-close');
        const result = await consentedSwitch(async () => {
          if (smokeDirectory) return false; // Smoke mode never closes the user's T3 Code.
          const answer = await dialog.showMessageBox(settingsWindow!, { type: 'question', title: 'Switch to T3 Pet notifications',
            message: 'Close T3 Code and switch notifications?',
            detail: 'T3 Pet will close all T3 Code windows, turn off its desktop alerts, and enable T3 Pet notifications. Save any work before continuing. You can reopen T3 Code afterward.',
            buttons: ['Cancel', 'Close T3 Code and switch'], defaultId: 0, cancelId: 0, noLink: true });
          return answer.response === 1;
        }, () => closeT3(helper), () => migrateNotifications(preferences.dataDirectory, app.getPath('userData'), sound => {
          const next = { ...preferences, notificationStyle: style, notificationSound: sound, notificationsEnabled: true, onboardingCompleted: true };
          storePreferences(preferencesPath, next); preferences = next; notifications.reset(); clearNotifications();
        }));
        migrationMessage = result === 'cancelled' ? 'Switch cancelled. Your notification settings have not changed.' : 'T3 Code desktop alerts are off. T3 Pet notifications are on. You can reopen T3 Code.';
        publish(); return { ...setupState(), outcome: result };
      } finally { migrating = false; }
    }
    const next = { ...preferences,
      notificationStyle: style, onboardingCompleted: true, notificationsEnabled: choice === 'enable' ? true : preferences.notificationsEnabled };
    storePreferences(preferencesPath, next);
    preferences = next;
    if (choice !== 'keep') { notifications.reset(); clearNotifications(); }
    migrationMessage = '';
    publish();
    return { ...setupState(), outcome: 'complete' };
  });
  ipcMain.handle('pet:test-notification', (event, style: unknown) => {
    trusted(event);
    if (visibility.fullscreen || !fullscreenCheckReady) throw new Error('Leave fullscreen, then try the notification again.');
    if (style !== undefined && style !== 'custom' && style !== 'os') throw new Error('Invalid notification style.');
    showNotification({ threadId: '', title: 'Test notification', body: 'Your pet can alert you when a chat needs attention, finishes, or fails.', kind: 'test' }, true, style ?? preferences.notificationStyle);
  });
  const toastEntry = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error('Unknown frame.');
    const entry = customNotifications.entryFor(event.sender);
    if (!entry) throw new Error('Unknown notification.');
    return entry;
  };
  ipcMain.handle('toast:get', event => { toastEntry(event); return customNotifications.view(event.sender); });
  ipcMain.handle('toast:open', event => { toastEntry(event); return customNotifications.activate(event.sender); });
  ipcMain.on('toast:dismiss', event => {
    if (event.senderFrame !== event.sender.mainFrame) return;
    const entry = customNotifications.entryFor(event.sender);
    if (entry) customNotifications.dismiss(entry.id);
  });
  ipcMain.on('toast:pause', (event, paused: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || typeof paused !== 'boolean') return;
    const entry = customNotifications.entryFor(event.sender);
    if (entry) customNotifications.pause(event.sender, paused);
  });
  ipcMain.on('toast:drag', (event, action: unknown, x: unknown, y: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || !customNotifications.entryFor(event.sender)) return;
    if (action !== 'start' && action !== 'move' && action !== 'end' && action !== 'cancel') return;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1_000_000 || Math.abs(y) > 1_000_000) return;
    customNotifications.drag(event.sender, action, x, y);
  });
  ipcMain.on('toast:size', (event, height: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || !customNotifications.entryFor(event.sender)) return;
    if (typeof height === 'number' && Number.isFinite(height)) customNotifications.resize(event.sender, height);
  });
  ipcMain.on('pet:onboarding', event => { trusted(event); showSettings(true); });
  ipcMain.handle('pet:open-chat', async (event, threadId: unknown) => {
    if (event.sender !== hoverPanel.window?.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error('Unknown window.');
    if (typeof threadId !== 'string' || !snapshot.connected || !snapshot.threads.some(thread => thread.id === threadId)) {
      throw new Error('This chat is no longer available.');
    }
    const url = chatUrl(preferences.dataDirectory, threadId);
    if (smokeDirectory) traceSmoke(`open chat ${url}`);
    else await shell.openExternal(url);
    hoverPanel.hide();
  });
  ipcMain.handle('pet:state', event => {
    if (event.sender !== hoverPanel.window?.webContents || event.senderFrame !== event.sender.mainFrame) trusted(event);
    return state();
  });
  ipcMain.on('pet:hover', event => { trusted(event); if (event.sender === petWindow?.webContents) hoverPanel.show(); });
  ipcMain.on('pet:hover-size', (event, height: unknown) => {
    traceSmoke(`hover size=${height}`);
    if (event.sender !== hoverPanel.window?.webContents || event.senderFrame !== event.sender.mainFrame) return;
    if (typeof height === 'number' && Number.isFinite(height)) hoverPanel.resize(height);
  });
  ipcMain.handle('pet:save', (event, raw: unknown) => {
    trusted(event);
    if (raw && typeof raw === 'object' && 'onboardingCompleted' in raw) throw new Error('Use onboarding to finish notification setup.');
    if (migrating) throw new Error('Finish the notification switch before changing settings.');
    const next = validatePreferences(raw, preferences);
    // Renderer settings cannot move the desktop window. Dragging owns position.
    next.position = preferences.position;
    const directoryChanged = next.dataDirectory !== preferences.dataDirectory;
    const filterKey = (p: Preferences) => JSON.stringify([p.projectFilter.mode, p.projectFilter.selected.map(item => item.id).sort(), p.chatFilter.mode, p.chatFilter.selected.map(item => item.id).sort()]);
    const filtersChanged = filterKey(next) !== filterKey(preferences);
    const notificationChanged = next.notificationStyle !== preferences.notificationStyle || next.notificationsEnabled !== preferences.notificationsEnabled;
    if (next.launchAtLogin !== preferences.launchAtLogin && !smokeDirectory) {
      if (process.platform === 'linux') setLinuxLoginStartup(next.launchAtLogin,
        linuxStartupCommand(process.execPath, app.getAppPath(), app.isPackaged, process.env.APPIMAGE));
      else app.setLoginItemSettings({ openAtLogin: next.launchAtLogin });
    }
    storePreferences(preferencesPath, next);
    preferences = next;
    if (notificationChanged || filtersChanged || directoryChanged) { notifications.reset(); clearNotifications(); }
    if (filtersChanged) {
      machine.reset();
      notifications.reset();
    }
    if (directoryChanged) {
      notifications.reset();
      migrationMessage = '';
      connectionGeneration++;
      snapshot = { connected: false, message: 'Looking for T3 Code…', threads: [], checkedAt: Date.now() };
      machine.reset();
    }
    petWindow?.setBounds(fitPosition(preferences.position));
    pet = machine.update(allowedSnapshot(snapshot, preferences), null);
    publish();
    if (timer) clearTimeout(timer);
    void poll();
    return state();
  });
  ipcMain.handle('pet:choose-directory', async event => {
    trusted(event);
    const result = await dialog.showOpenDialog(settingsWindow!, { title: 'Choose T3 Code userdata folder', defaultPath: preferences.dataDirectory, properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.on('pet:menu', event => { trusted(event); hoverPanel.hide(); menu().popup({ window: petWindow ?? undefined }); });
  ipcMain.on('pet:settings', event => { trusted(event); showSettings(); });
  ipcMain.on('pet:quit', event => { trusted(event); app.quit(); });
  ipcMain.on('pet:preview', (event, mood: unknown) => {
    trusted(event);
    if (mood === null || moods.includes(mood as PetMood)) setPreview(mood as PetMood | null);
  });
  ipcMain.on('pet:passthrough', (event, ignore: unknown) => {
    trusted(event);
    if (event.sender === petWindow?.webContents && typeof ignore === 'boolean' && !dragTimer && process.platform !== 'linux') petWindow?.setIgnoreMouseEvents(ignore, { forward: true });
  });
  ipcMain.on('pet:drag', (event, action: unknown) => {
    trusted(event);
    if (event.sender !== petWindow?.webContents) return;
    if (action === 'stop') { stopDrag(); return; }
    if (action !== 'start' || dragTimer || !petWindow) return;
    hoverPanel.hide();
    const origin = screen.getCursorScreenPoint();
    const [x, y] = petWindow.getPosition();
    petWindow.setIgnoreMouseEvents(false);
    const started = Date.now();
    dragTimer = setInterval(() => {
      if (Date.now() - started > 30_000) { stopDrag(); return; }
      const cursor = screen.getCursorScreenPoint();
      petWindow?.setPosition(Math.round(x + cursor.x - origin.x), Math.round(y + cursor.y - origin.y));
      customNotifications.position();
    }, 16);
  });
}

async function runSmokeTest(directory: string) {
  traceSmoke('smoke starting');
  mkdirSync(directory, { recursive: true });
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  await wait(1200);
  const report: Record<string, unknown> = { electron: process.versions.electron, sqlite: process.versions.sqlite, connected: snapshot.connected, message: snapshot.message, threadCount: snapshot.threads.length, mood: pet.mood };
  const { DatabaseSync } = await import('node:sqlite');
  const v2File = join(directory, 'statev2-fixture.sqlite');
  const v2Db = new DatabaseSync(v2File);
  try {
    v2Db.exec(`
      CREATE TABLE projection_projects(project_id TEXT, title TEXT);
      CREATE TABLE orchestration_v2_projection_threads(thread_id TEXT, project_id TEXT, title TEXT,
        default_provider TEXT, updated_at TEXT, archived_at TEXT, deleted_at TEXT, payload_json TEXT);
      CREATE TABLE orchestration_v2_projection_runs(run_id TEXT, thread_id TEXT, ordinal INTEGER, status TEXT, completed_at TEXT);
      CREATE TABLE orchestration_v2_projection_runtime_requests(thread_id TEXT, kind TEXT, status TEXT);
      INSERT INTO orchestration_v2_projection_threads VALUES('v2',NULL,'V2 fixture','custom','2026-10-03T14:00:00Z',NULL,NULL,'{}');
      INSERT INTO orchestration_v2_projection_runs VALUES('run','v2',1,'running',NULL);
    `);
    const v2Machine = new PetStateMachine();
    const v2Mood = () => v2Machine.update({ connected: true, message: '', checkedAt: Date.now(), threads: readThreads(v2File) }, null).mood;
    const working = v2Mood() === 'working';
    v2Db.exec("INSERT INTO orchestration_v2_projection_runtime_requests VALUES('v2','permission','pending')");
    const waiting = v2Mood() === 'waiting';
    v2Db.exec("UPDATE orchestration_v2_projection_runtime_requests SET status='resolved'; UPDATE orchestration_v2_projection_runs SET status='completed'");
    report.v2State = { working, waiting, done: v2Mood() === 'done' };
  } finally { v2Db.close(); }
  testingHover = true;
  const checkHoverOpen = visibility.visible;
  if (checkHoverOpen) hoverPanel.show();
  await hoverPanel.prepare();
  await wait(100);
  report.hoverOpened = checkHoverOpen ? hoverPanel.window!.isVisible() : 'skipped: fullscreen';
  hoverPanel.hide();
  const hoverWindow = hoverPanel.window!;
  const fixtureState = state();
  const fixtureThread = { id: 'hover-test', title: 'Chat needing attention', project: '', provider: 'any', sessionStatus: 'ready', turnId: null, turnState: null, completedAt: null, updatedAt: new Date().toISOString(), pendingApproval: 1, pendingInput: 0 };
  hoverWindow.webContents.send('pet:state', { ...fixtureState, snapshot: { ...snapshot, connected: true, threads: [fixtureThread, { ...fixtureThread, id: 'working-test', title: 'Working chat', pendingApproval: 0, sessionStatus: 'running' }] } });
  await wait(100);
  if (visibility.visible) hoverWindow.showInactive();
  await wait(150);
  report.hover = await hoverWindow.webContents.executeJavaScript(`({rows:document.querySelectorAll('li').length, buttons:document.querySelectorAll('button').length, text:document.querySelector('main').textContent, overflow:document.documentElement.scrollWidth > innerWidth, height:innerHeight, listHeight:document.querySelector('ul').getBoundingClientRect().height})`);
  report.hoverBounds = hoverWindow.getBounds();
  // Fullscreen suppression can hide the fixture during capture. Do not hang
  // the runtime check waiting for a frame that Windows will not composite.
  const hoverCapture = hoverWindow.isVisible() ? await Promise.race([
    hoverWindow.webContents.capturePage(), wait(1000).then(() => null),
  ]) : null;
  if (hoverCapture) writeFileSync(join(directory, 'hover-chats.png'), hoverCapture.toPNG());
  else report.hoverCapture = 'skipped: panel hidden or capture unavailable';
  hoverWindow.hide();
  hoverWindow.webContents.send('pet:state', { ...fixtureState, snapshot: { ...snapshot, connected: true, threads: [] } });
  await wait(100);
  report.hoverEmpty = await hoverWindow.webContents.executeJavaScript(`document.querySelectorAll('li').length === 0 && !document.querySelector('main').hidden && !document.getElementById('empty').hidden && document.getElementById('empty').textContent === 'No unsettled chats.'`);
  hoverWindow.webContents.send('pet:state', { ...fixtureState, snapshot: { ...snapshot, connected: true, threads: [{ ...fixtureThread, pendingApproval: 0, turnState: 'completed' }, { ...fixtureThread, id: 'settled-test', pendingApproval: 0, settledOverride: 'settled' }] } });
  await wait(100);
  report.hoverIdle = await hoverWindow.webContents.executeJavaScript(`document.querySelectorAll('li').length === 1 && document.querySelector('.status').textContent === 'Completed' && !document.querySelector('main').hidden && document.getElementById('empty').hidden`);
  hoverWindow.webContents.send('pet:state', { ...fixtureState, snapshot: { ...snapshot, connected: false, message: 'Open T3 Code to connect.', threads: [] } });
  await wait(100);
  report.hoverDisconnected = await hoverWindow.webContents.executeJavaScript(`!document.querySelector('main').hidden && !document.getElementById('empty').hidden && document.getElementById('empty').textContent === 'Open T3 Code to connect.'`);
  testingHover = false;
  hoverPanel.publish();
  await wait(100);
  report.chatNavigation = await hoverWindow.webContents.executeJavaScript(`(async () => {
    const state = await window.pet.getState();
    let rejectedUnknown = false;
    try { await window.pet.openChat('not-a-real-chat'); } catch { rejectedUnknown = true; }
    const id = state.snapshot.threads[0]?.id;
    if (id) await window.pet.openChat(id);
    return { rejectedUnknown, validChat: !!id };
  })()`);
  for (const mood of moods) {
    traceSmoke(`capture ${mood}`);
    setPreview(mood);
    await wait(120);
    writeFileSync(join(directory, `pet-${mood}.png`), (await petWindow!.webContents.capturePage()).toPNG());
  }
  setPreview('working');
  petWindow!.webContents.send('pet:state', { ...state(), darkBackground: true });
  await wait(50);
  writeFileSync(join(directory, 'pet-outline.png'), (await petWindow!.webContents.capturePage()).toPNG());
  publish();
  await wait(120);
  const firstFrame = await petWindow!.webContents.executeJavaScript(`document.getElementById('cat').dataset.frame`);
  await wait(240);
  // Sampling can also be verified while real fullscreen use correctly suspends rAF.
  publish();
  await wait(50);
  report.animation = await petWindow!.webContents.executeJavaScript(`(() => {
    const host = document.getElementById('cat'), canvas = host;
    const pixels = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let opaque = 0; for (let i=3;i<pixels.length;i+=4) if(pixels[i]) opaque++;
    return {name: host.dataset.animation, frame: host.dataset.frame, opaquePixels: opaque};
  })()`);
  report.animationAdvanced = (report.animation as { frame: string }).frame !== firstFrame;
  report.visibility = { fullscreen: visibility.fullscreen, petVisible: petWindow!.isVisible(), manualHidden: visibility.manualHidden, monitorReady: fullscreenCheckReady, monitorFailed: fullscreenCheckFailed };
  setPreview(null);
  showSettings();
  await wait(700);
  // Exercise the actual renderer/preload/main bridge, including persistence.
  const controls = await settingsWindow!.webContents.executeJavaScript(`(async () => {
    const original = (await window.pet.getState()).preferences;
    delete original.onboardingCompleted;
    const saved = await window.pet.savePreferences({size: 160, reducedMotion: true, showLabel: false});
    const readBack = await window.pet.getState();
    let invalidRejected = false;
    try { await window.pet.savePreferences({size: 9000}); } catch { invalidRejected = true; }
    await window.pet.savePreferences(original);
    return {saveRoundTrip: saved.preferences.size === 160 && readBack.preferences.reducedMotion && !readBack.preferences.showLabel, invalidRejected};
  })()`);
  report.controls = controls;
  traceSmoke('checking bundled characters');
  const characterCases = pets.map(character => ({ id: character.id, animations: Object.entries(moodAnimation).map(([mood, name]) => ({ mood, name, ...petAnimation(character.id, name) })) }));
  report.petCatalog = await settingsWindow!.webContents.executeJavaScript(`(async () => {
    const cases = ${JSON.stringify(characterCases)};
    const original = (await window.pet.getState()).preferences;
    delete original.onboardingCompleted;
    const selector = document.getElementById('pet-id');
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    document.getElementById('pet-tab').click();
    document.getElementById('reduced-motion').checked = true;
    document.getElementById('reduced-motion').dispatchEvent(new Event('change',{bubbles:true}));
    let frames = 0, choices = 0;
    const images = new Map();
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', {willReadFrequently:true});
    for (const character of cases) {
      for (const animation of character.animations) {
        let image = images.get(animation.file);
        if (!image) { image = new Image(); image.src = animation.file; await image.decode(); images.set(animation.file,image); }
        canvas.width = animation.width; canvas.height = animation.height;
        for (let frame = 0; frame < animation.durations.length; frame++) {
          const x = frame % animation.columns * animation.width;
          const y = ((animation.row || 0) + Math.floor(frame / animation.columns)) * animation.height;
          if (x + canvas.width > image.width || y + canvas.height > image.height) throw new Error('Frame outside sheet: '+character.id);
          ctx.clearRect(0,0,canvas.width,canvas.height);
          ctx.drawImage(image,x,y,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
          const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;
          let opaque = 0; for (let i=3;i<data.length;i+=4) if(data[i]) opaque++;
          if (!opaque || opaque === canvas.width * canvas.height) throw new Error('Blank or opaque frame: '+character.id);
          frames++;
        }
      }
      const radio = document.querySelector('input[name=character][value="'+character.id+'"]');
      const preview = document.querySelector('canvas[data-character="'+character.id+'"]');
      radio.closest('label').scrollIntoView({block:'nearest'}); radio.click();
      const size = document.getElementById('size');
      size.value = size.value === '160' ? '96' : '160'; size.dispatchEvent(new Event('change',{bubbles:true}));
      if (document.getElementById('save').disabled) throw new Error('Pet choice not marked dirty');
      document.getElementById('save').click();
      for (let retry=0;retry<200 && (document.getElementById('save-result').textContent !== 'Saved' || preview.dataset.pet !== character.id);retry++) await delay(10);
      if ((await window.pet.getState()).preferences.petId !== character.id || preview.dataset.pet !== character.id) throw new Error('Pet save/render failed: '+character.id);
      if (preview.width !== Math.round(128 * devicePixelRatio) || preview.getBoundingClientRect().width !== 128) throw new Error('Preview resolution does not match display: '+character.id);
      if (preview.getContext('2d').imageSmoothingEnabled !== (character.id !== 'lfg')) throw new Error('Incorrect preview sampling: '+character.id);
      for (const animation of character.animations) {
        const stateSelector = document.getElementById('preview');
        stateSelector.value = animation.mood; stateSelector.dispatchEvent(new Event('change',{bubbles:true}));
        for (let retry=0;retry<200 && (preview.dataset.animation !== animation.name || preview.dataset.frame !== '0');retry++) await delay(10);
        if (preview.dataset.animation !== animation.name || preview.dataset.frame !== '0') throw new Error('Still preview failed: '+character.id+'/'+animation.mood);
        const data = preview.getContext('2d').getImageData(0,0,preview.width,preview.height).data;
        if (!data.some((value,index)=>index%4===3 && value>0)) throw new Error('Empty renderer: '+character.id);
      }
      if (!document.getElementById('pet-credit').textContent.trim()) throw new Error('Missing artwork credit');
      choices++;
    }
    // Keep an unsaved appearance setting across state updates, then discard it.
    const size = document.getElementById('size');
    const savedSize = size.value;
    const draftSize = size.value === '160' ? '128' : '160';
    size.value = draftSize; size.dispatchEvent(new Event('change',{bubbles:true}));
    await window.pet.savePreferences({size:96}); await delay(40);
    const draftRetained = size.value === draftSize;
    document.getElementById('discard').click();
    const discarded = size.value === savedSize;
    const previewIsLocal = !(await window.pet.getState()).preview;
    await window.pet.savePreferences(original);
    document.getElementById('preview').value = 'idle'; document.getElementById('preview').dispatchEvent(new Event('change',{bubbles:true}));
    document.getElementById('pet-panel').scrollTop = 0;
    return {characters:choices, frames, draftRetained, discarded, previewIsLocal, radioCount:document.querySelectorAll('input[name=character]').length};
  })()`);
  report.petChoicePersisted = loadPreferences(preferencesPath).petId === preferences.petId;
  // Isolated example metadata exercises the real blocklist form and bridge.
  const liveSnapshot = snapshot;
  const livePreferences = { ...preferences };
  const wasPolling = polling;
  polling = true;
  snapshot = { connected: true, message: 'Connected', checkedAt: Date.now(), threads: [
    { ...fixtureThread, id: 'project-active', projectId: 'example-active', project: 't3code-pet', title: 'Settings update', pendingApproval: 0, sessionStatus: 'running' },
    { ...fixtureThread, id: 'project-ignored', projectId: 'example-ignored', project: 'Sandbox', title: 'Experiment', pendingApproval: 1 },
  ] };
  preferences = { ...preferences, blockedProjects: [], followThreadId: null, projectFilter: {mode: 'blocklist', selected: []}, chatFilter: {mode: 'blocklist', selected: []} };
  machine.reset();
  pet = machine.update(snapshot, null);
  publish();
  await wait(150);
  report.chatActivity = await settingsWindow!.webContents.executeJavaScript(`(() => {
    document.getElementById('chats-tab').click();
    const list = document.getElementById('chat-activity');
    const loaded = list.querySelectorAll('button').length === 2 && list.textContent.includes('Working') && list.textContent.includes('Approval needed');
    const search = document.getElementById('activity-search');
    search.value = 'Sandbox'; search.dispatchEvent(new Event('input', {bubbles:true}));
    const searched = list.querySelectorAll('button').length === 1 && list.textContent.includes('Experiment');
    search.value = 'no-such-chat'; search.dispatchEvent(new Event('input', {bubbles:true}));
    const emptySearch = list.children.length === 0 && !document.getElementById('activity-empty').hidden && document.getElementById('activity-empty').textContent.includes('No chats match');
    search.value = ''; search.dispatchEvent(new Event('input', {bubbles:true}));
    return {loaded, searched, emptySearch};
  })()`);
  writeFileSync(join(directory, 'settings-chat-activity.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  const activityReport = report.chatActivity as Record<string, boolean>;
  settingsWindow!.webContents.send('pet:state', { ...state(), snapshot: { ...snapshot, threads: snapshot.threads.map(thread => ({ ...thread, sessionStatus: 'ready', turnState: 'completed', pendingApproval: 0 })) } });
  await wait(80);
  activityReport.updated = await settingsWindow!.webContents.executeJavaScript(`document.querySelectorAll('#chat-activity button').length === 2 && !document.getElementById('chat-activity').textContent.includes('Working') && document.getElementById('chat-activity').textContent.includes('Completed')`);
  settingsWindow!.webContents.send('pet:state', { ...state(), snapshot: { ...snapshot, threads: [] } });
  await wait(80);
  activityReport.empty = await settingsWindow!.webContents.executeJavaScript(`document.getElementById('chat-activity').children.length === 0 && !document.getElementById('activity-empty').hidden && document.getElementById('activity-empty').textContent.includes('No chats yet')`);
  settingsWindow!.webContents.send('pet:state', { ...state(), snapshot: { ...snapshot, connected: false, message: 'Open T3 Code to connect.' } });
  await wait(80);
  activityReport.disconnected = await settingsWindow!.webContents.executeJavaScript(`document.getElementById('chat-activity').children.length === 0 && document.getElementById('activity-empty').textContent === 'Open T3 Code to connect.'`);
  publish();
  await wait(80);
  report.projectBlocklist = await settingsWindow!.webContents.executeJavaScript(`(async () => {
    document.getElementById('projects-tab').click();
    document.querySelector('[data-project-id="example-ignored"]').click();
    document.getElementById('settings-form').requestSubmit();
    for (let i=0;i<40 && document.getElementById('save-result').textContent !== 'Saved';i++) await new Promise(r => setTimeout(r,25));
    const state = await window.pet.getState();
    return {saved: document.getElementById('save-result').textContent === 'Saved',
      blocked: state.preferences.blockedProjects.some(p => p.id === 'example-ignored'),
      mood: state.pet.mood, waitingCount: state.pet.waitingCount, workingCount: state.pet.workingCount,
      footerFits: document.getElementById('save').getBoundingClientRect().bottom <= innerHeight};
  })()`);
  report.projectBlocklistPersisted = loadPreferences(preferencesPath).blockedProjects.some(p => p.id === 'example-ignored');
  report.selectionFilters = await settingsWindow!.webContents.executeJavaScript(`(async () => {
    const advanced=document.getElementById('advanced-settings');
    const renamed=document.getElementById('projects-tab').textContent==='Filters';
    const matchingLists=advanced.contains(document.getElementById('selected-chats')) && !document.getElementById('follow');
    advanced.open=true;
    const change=(id,value)=>{const control=document.getElementById(id);control.value=value;control.dispatchEvent(new Event('change',{bubbles:true}));};
    const save=async()=>{document.getElementById('settings-form').requestSubmit();for(let i=0;i<40 && document.getElementById('save-result').textContent!=='Saved';i++)await new Promise(r=>setTimeout(r,25));return window.pet.getState();};
    change('chat-mode','whitelist');
    const emptyMessage=document.getElementById('chat-filter-help').textContent.includes('All chats are excluded');
    document.querySelector('[data-chat-id="project-active"]').click();
    let state=await save();
    const chatWhitelist=state.pet.workingCount===1 && state.pet.waitingCount===0 && state.preferences.chatFilter.mode==='whitelist';
    const chatSearch=document.getElementById('chat-search');chatSearch.value='Sandbox';chatSearch.dispatchEvent(new Event('input',{bubbles:true}));
    const chatSearchWorks=document.querySelectorAll('[data-chat-id]').length===1;
    document.getElementById('select-chats').click();
    chatSearch.value='';chatSearch.dispatchEvent(new Event('input',{bubbles:true}));
    state=await save();
    const projectStillExcludes=state.pet.workingCount===1 && state.pet.waitingCount===0;
    change('project-mode','whitelist');state=await save();
    const projectWhitelist=state.pet.waitingCount===1 && state.pet.workingCount===0;
    change('chat-mode','blocklist');state=await save();
    const chatBlocklist=state.pet.waitingCount===0 && state.pet.workingCount===0;
    document.getElementById('clear-chats').click();change('chat-mode','whitelist');state=await save();
    const emptyWhitelist=state.pet.waitingCount===0 && state.pet.workingCount===0;
    change('chat-mode','blocklist');change('project-mode','blocklist');await save();
    document.querySelector('[data-chat-id="project-active"]').click();change('project-mode','whitelist');
    document.getElementById('discard').click();
    const discarded=!document.querySelector('[data-chat-id="project-active"]').checked && document.getElementById('project-mode').value==='blocklist' && document.getElementById('save').disabled;
    return {renamed,matchingLists,emptyMessage,chatWhitelist,chatSearchWorks,projectStillExcludes,projectWhitelist,chatBlocklist,emptyWhitelist,discarded};
  })()`);
  await wait(100);
  writeFileSync(join(directory, 'settings-filters-expanded.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('advanced-settings').open=false`);
  await wait(100);
  report.settingsDraft = await settingsWindow!.webContents.executeJavaScript(`(async () => {
    const search = document.getElementById('project-search');
    search.value = 't3code'; search.dispatchEvent(new Event('input', {bubbles:true}));
    const filtered = document.querySelectorAll('[data-project-id]').length === 1;
    document.getElementById('ignore-all').click();
    document.getElementById('pet-tab').click();
    const unsaved = !document.getElementById('save').disabled && !document.getElementById('discard').hidden;
    document.getElementById('projects-tab').click();
    const retained = document.querySelector('[data-project-id="example-active"]').checked;
    document.getElementById('discard').click();
    const discarded = !document.querySelector('[data-project-id="example-active"]').checked && document.getElementById('save').disabled;
    search.value = 'no-such-project'; search.dispatchEvent(new Event('input', {bubbles:true}));
    const empty = document.querySelector('#blocked-projects .filter-empty').textContent.includes('No projects');
    search.value = ''; search.dispatchEvent(new Event('input', {bubbles:true}));
    return {filtered,unsaved,retained,discarded,empty};
  })()`);
  await wait(100);
  writeFileSync(join(directory, 'settings-projects.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  for (const tab of ['pet', 'notifications']) {
    await settingsWindow!.webContents.executeJavaScript(`document.getElementById('${tab}-tab').click()`);
    await wait(50);
    writeFileSync(join(directory, `settings-${tab}.png`), (await settingsWindow!.webContents.capturePage()).toPNG());
  }
  let themeSequence = 1000n;
  const smokeTheme = async (appearance: 'light' | 'dark', id = 'ember') => {
    writeThemeFixture(join(directory, 't3-profile'), { 't3code:theme': id, 't3code:theme-appearance-mode': appearance }, themeSequence);
    themeSequence += 100n;
    const deadline = Date.now() + 2500;
    while ((uiTheme.id !== id || uiTheme.appearance !== appearance) && Date.now() < deadline) await wait(20);
    await wait(50);
  };
  const themeDraft = await settingsWindow!.webContents.executeJavaScript(`(() => {const control=document.getElementById('size');control.value=control.value==='96'?'160':'96';control.dispatchEvent(new Event('change',{bubbles:true}));return control.value;})()`);
  const beforeThemePet = JSON.stringify(pet);
  await smokeTheme('dark', 'iris');
  const settingsTheme = await settingsWindow!.webContents.executeJavaScript(`({id:document.documentElement.dataset.theme,appearance:document.documentElement.style.colorScheme,canvas:document.documentElement.style.getPropertyValue('--canvas'),draft:document.getElementById('size').value,font:getComputedStyle(document.body).fontFamily})`);
  hoverWindow.webContents.send('pet:state', { ...fixtureState, theme: uiTheme, snapshot: { ...snapshot, connected: true, threads: [fixtureThread] } });
  await wait(50);
  const hoverTheme = await hoverWindow.webContents.executeJavaScript(`({id:document.documentElement.dataset.theme,appearance:document.documentElement.style.colorScheme,canvas:document.documentElement.style.getPropertyValue('--canvas')})`);
  report.themeSync = { settings: settingsTheme, hover: hoverTheme, draftRetained: settingsTheme.draft === themeDraft, petUnchanged: beforeThemePet === JSON.stringify(pet), liveWatcher: uiTheme.id === 'iris' && uiTheme.appearance === 'dark' };
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('discard').click()`);
  const notificationPreferences = { notificationStyle: preferences.notificationStyle, notificationsEnabled: preferences.notificationsEnabled };
  report.settingsDropdowns = await settingsWindow!.webContents.executeJavaScript(`(async () => {
    document.getElementById('notifications-tab').click();
    const selects = [...document.querySelectorAll('select')];
    const allCustom = selects.every(select => select.hidden && select.tabIndex === -1 && getComputedStyle(select).display === 'none' && document.getElementById(select.id+'-trigger')?.getAttribute('role') === 'combobox');
    const source = document.getElementById('notification-style');
    const trigger = document.getElementById('notification-style-trigger');
    trigger.scrollIntoView({block:'nearest'}); trigger.focus(); trigger.click();
    const popup = document.getElementById('notification-style-listbox');
    const initial = source.value;
    const checked = popup.querySelectorAll('[aria-selected=true]').length === 1;
    const bounds = popup.getBoundingClientRect();
    const fits = bounds.left>=0 && bounds.right<=innerWidth && bounds.top>=0 && bounds.bottom<=innerHeight;
    const key = value => trigger.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));
    key('ArrowDown'); key('Enter');
    const keyboard = source.value !== initial && trigger.getAttribute('aria-expanded')==='false' && document.activeElement===trigger;
    document.getElementById('discard').click();
    const discarded = source.value === initial && trigger.textContent.includes(source.selectedOptions[0].textContent);
    const closedArrows = ['ArrowDown', 'ArrowUp'].every(arrow => {
      key(arrow);
      const moved = document.getElementById(trigger.getAttribute('aria-activedescendant'))?.dataset.value !== initial && source.value === initial;
      key('Enter');
      const committed = source.value !== initial;
      document.getElementById('discard').click();
      return moved && committed;
    });
    trigger.click(); key('Home'); key('Escape');
    const escaped = source.value === initial && trigger.getAttribute('aria-expanded')==='false';
    key('c');
    const typed = document.getElementById(trigger.getAttribute('aria-activedescendant'))?.dataset.value === 'custom';
    key('Tab');
    const tabClosed = trigger.getAttribute('aria-expanded')==='false';
    trigger.click(); document.getElementById('notifications-panel').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    const outside = trigger.getAttribute('aria-expanded')==='false';
    source.disabled=true; await new Promise(resolve=>setTimeout(resolve,20));
    const disabled=trigger.disabled; source.disabled=false;
    await new Promise(resolve=>setTimeout(resolve,20));
    return {allCustom, checked, fits, keyboard, discarded, closedArrows, escaped, typed, tabClosed, outside, disabled, restored:!trigger.disabled};
  })()`);
  report.notificationTestPending = await settingsWindow!.webContents.executeJavaScript(`(async () => {
    const style = document.getElementById('notification-style');
    const test = document.getElementById('test-notification');
    style.value = 'custom'; style.dispatchEvent(new Event('change', {bubbles:true}));
    test.click();
    const initiallyDisabled = test.disabled;
    document.getElementById('notification-sound').dispatchEvent(new Event('change', {bubbles:true}));
    const disabledAfterChange = test.disabled;
    document.getElementById('discard').click();
    const disabledAfterDiscard = test.disabled;
    for (let i=0;i<40 && test.disabled;i++) await new Promise(resolve=>setTimeout(resolve,25));
    return {initiallyDisabled, disabledAfterChange, disabledAfterDiscard, restored:!test.disabled};
  })()`);
  customNotifications.clear();
  if (process.argv.includes('--hover-smoke-test')) {
    writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2));
    app.quit();
    return;
  }
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('notification-style-trigger').scrollIntoView({block:'nearest'});document.getElementById('notification-style-trigger').click()`);
  await wait(50);
  writeFileSync(join(directory, 'dropdown-settings.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('notification-style-trigger').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);
  report.notificationChoice = await settingsWindow!.webContents.executeJavaScript(`(async () => {
    document.getElementById('notifications-tab').click();
    const style = document.getElementById('notification-style');
    const original = style.value;
    style.value = original === 'os' ? 'custom' : 'os'; style.dispatchEvent(new Event('change', {bubbles:true}));
    const dirty = !document.getElementById('save').disabled;
    document.getElementById('discard').click();
    const discarded = style.value === original && document.getElementById('save').disabled;
    style.value = 'custom'; style.dispatchEvent(new Event('change', {bubbles:true}));
    document.getElementById('save').click();
    await new Promise(resolve => setTimeout(resolve, 150));
    return {dirty, discarded, saved: (await window.pet.getState()).preferences.notificationStyle === 'custom'};
  })()`);
  // Keep explicitly created smoke fixtures alive while the real desktop changes focus.
  testingToasts = true;
  const notificationChecks: Record<string, unknown> = {};
  for (const theme of ['light', 'dark'] as const) {
    await smokeTheme(theme);
    const toast = customNotifications.show({threadId: '', title: 'Approval needed', body: 'Update the notification settings', kind: 'Approval needed'}, true);
    await wait(160);
    notificationChecks[theme] = await toast.webContents.executeJavaScript(`({theme:document.documentElement.style.colorScheme, title:document.getElementById('title').textContent, overflow:document.documentElement.scrollWidth>innerWidth, actionFits:document.getElementById('open').getBoundingClientRect().bottom<=innerHeight, bridge:!!window.petToast, transparent:getComputedStyle(document.documentElement).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(document.body).backgroundColor==='rgba(0, 0, 0, 0)', draggable:typeof window.petToast.drag==='function'&&getComputedStyle(document.querySelector('main')).cursor==='grab'})`);
    writeFileSync(join(directory, `notification-${theme}.png`), (await toast.webContents.capturePage()).toPNG());
    notificationChecks[theme + 'Layout'] = await toast.webContents.executeJavaScript(`(() => {
      const main=document.querySelector('main').getBoundingClientRect(), message=document.querySelector('.message').getBoundingClientRect(), action=document.getElementById('open').getBoundingClientRect(), close=document.getElementById('dismiss').getBoundingClientRect();
      return message.right<=action.left && Math.abs((action.top+action.bottom-main.top-main.bottom)/2)<2 && close.top<main.top && close.right>main.right && close.top>=0 && close.right<=innerWidth && Math.abs(innerHeight-main.height-16)<2;
    })()`);
    const area = screen.getDisplayMatching(petWindow!.getBounds()).workArea;
    const bounds = toast.getBounds();
    notificationChecks[theme + 'Bounds'] = bounds.x >= area.x && bounds.y >= area.y && bounds.x + bounds.width <= area.x + area.width && bounds.y + bounds.height <= area.y + area.height;
    await toast.webContents.executeJavaScript(`window.petToast.pause(true)`);
    notificationChecks[theme + 'Paused'] = customNotifications.entryFor(toast.webContents)?.resumedAt === null;
    if (theme === 'light') await toast.webContents.executeJavaScript(`window.petToast.dismiss()`);
    else await toast.webContents.executeJavaScript(`window.petToast.open()`);
    await wait(30);
    notificationChecks[theme + 'Dismissed'] = toast.isDestroyed();
    await settingsWindow!.webContents.executeJavaScript(`document.getElementById('pet-tab').click()`);
    await wait(100);
    writeFileSync(join(directory, `settings-pet-${theme}.png`), (await settingsWindow!.webContents.capturePage()).toPNG());
    await settingsWindow!.webContents.executeJavaScript(`document.getElementById('projects-tab').click()`);
    await wait(100);
    writeFileSync(join(directory, `settings-projects-${theme}.png`), (await settingsWindow!.webContents.capturePage()).toPNG());
  }
  const draggedToast = customNotifications.show({threadId: '', title: 'Drag notification', body: 'Dismiss by dragging', kind: 'test'}, true);
  await new Promise<void>((resolve, reject) => {
    if (!draggedToast.webContents.isLoading()) { resolve(); return; }
    draggedToast.webContents.once('did-finish-load', resolve);
    draggedToast.webContents.once('did-fail-load', (_event, _code, description) => reject(new Error(description)));
  });
  await wait(100);
  const dragOrigin = draggedToast.getBounds();
  await draggedToast.webContents.executeJavaScript(`window.petToast.drag('start',100,100);window.petToast.drag('move',108,104)`);
  await wait(50);
  const movedBounds = draggedToast.getBounds();
  notificationChecks.dragMoved = movedBounds.x === dragOrigin.x + 8 && movedBounds.y === dragOrigin.y;
  const dragOpacity = await draggedToast.webContents.executeJavaScript(`Number(getComputedStyle(document.body).opacity)`);
  notificationChecks.dragFaded = Math.abs(dragOpacity - (1 - 8 / dragOrigin.width)) < .01;
  notificationChecks.dragPaused = customNotifications.entryFor(draggedToast.webContents)?.resumedAt === null;
  await draggedToast.webContents.executeJavaScript(`window.petToast.drag('move',108,300)`);
  await wait(50);
  notificationChecks.dragAxisLocked = draggedToast.getBounds().x === dragOrigin.x + 8 && draggedToast.getBounds().y === dragOrigin.y;
  await draggedToast.webContents.executeJavaScript(`window.petToast.drag('end',108,300)`);
  await wait(50);
  notificationChecks.dragReturned = draggedToast.getBounds().x === dragOrigin.x && draggedToast.getBounds().y === dragOrigin.y;
  await draggedToast.webContents.executeJavaScript(`window.petToast.drag('start',100,100);window.petToast.drag('move',96,92);window.petToast.drag('move',0,92)`);
  await wait(50);
  notificationChecks.dragVertical = draggedToast.getBounds().x === dragOrigin.x && draggedToast.getBounds().y === dragOrigin.y - 8;
  await draggedToast.webContents.executeJavaScript(`window.petToast.drag('end',0,92)`);
  await wait(50);
  notificationChecks.dragReturned = notificationChecks.dragReturned && !draggedToast.isDestroyed() && draggedToast.getBounds().y === dragOrigin.y;
  await draggedToast.webContents.executeJavaScript(`window.petToast.drag('start',100,100);window.petToast.drag('move',92,104)`);
  await wait(50);
  notificationChecks.dragLeft = draggedToast.getBounds().x === dragOrigin.x - 8 && draggedToast.getBounds().y === dragOrigin.y;
  await draggedToast.webContents.executeJavaScript(`window.petToast.drag('cancel',92,104)`);
  await wait(50);
  await draggedToast.webContents.executeJavaScript(`window.petToast.drag('start',100,100);window.petToast.drag('move',114,100);window.petToast.drag('cancel',114,100)`);
  await wait(50);
  notificationChecks.dragCancelled = !draggedToast.isDestroyed() && draggedToast.getBounds().x === dragOrigin.x;
  await wait(150);
  notificationChecks.dragOpacityRestored = await draggedToast.webContents.executeJavaScript(`Number(getComputedStyle(document.body).opacity) === 1`);
  for (const action of ['end', 'cancel'] as const) {
    customNotifications.drag(draggedToast.webContents, 'start', 100, 100);
    customNotifications.drag(draggedToast.webContents, 'move', 108, 100);
    const sibling = customNotifications.show({threadId: 'drag-sibling', title: 'Turn finished', body: 'Arrived during drag', kind: 'Turn finished'});
    await wait(100);
    customNotifications.drag(draggedToast.webContents, action, 108, 100);
    const returned = draggedToast.getBounds();
    const siblingBounds = sibling.getBounds();
    notificationChecks['dragReflow-' + action] = returned.y + returned.height + 8 === siblingBounds.y;
    // Removing a sibling while dragging must also restore the current stack position.
    customNotifications.drag(draggedToast.webContents, 'start', 100, 100);
    customNotifications.drag(draggedToast.webContents, 'move', 108, 100);
    customNotifications.dismiss(customNotifications.entryFor(sibling.webContents)!.id);
    customNotifications.drag(draggedToast.webContents, action, 108, 100);
    notificationChecks['dragRemoval-' + action] = draggedToast.getBounds().y === dragOrigin.y;
  }
  await draggedToast.webContents.executeJavaScript(`window.petToast.drag('start',100,100);window.petToast.drag('move',139,100)`);
  await wait(50);
  notificationChecks.dragBelowThreshold = !draggedToast.isDestroyed() && draggedToast.getBounds().x === dragOrigin.x + 39;
  await draggedToast.webContents.executeJavaScript(`window.petToast.drag('move',140,100)`);
  await wait(200);
  notificationChecks.dragWaitsForRelease = !draggedToast.isDestroyed() && draggedToast.getBounds().x === dragOrigin.x + 40;
  await draggedToast.webContents.executeJavaScript(`window.petToast.drag('end',140,100)`);
  await wait(80);
  const autoBounds = draggedToast.getBounds();
  notificationChecks.dragAutoContinued = autoBounds.x > dragOrigin.x + 40 && autoBounds.y === dragOrigin.y;
  notificationChecks.dragSlower = !draggedToast.isDestroyed() && autoBounds.x < dragOrigin.x + dragOrigin.width * .7;
  notificationChecks.dragAutoFaded = await draggedToast.webContents.executeJavaScript(`Number(getComputedStyle(document.body).opacity) < .9`);
  await wait(450);
  notificationChecks.dragDismissed = draggedToast.isDestroyed();
  if (process.argv.includes('--toast-smoke-test')) {
    report.customNotifications = notificationChecks;
    writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2));
    app.quit();
    return;
  }
  const burst = Array.from({length:4}, (_, i) => customNotifications.show({threadId: 'toast-fixture-' + i, title: 'Turn finished', body: 'A finished chat', kind: 'Turn finished'}));
  await wait(160);
  notificationChecks.bounded = customNotifications.windows.size === 3 && burst[0]!.isDestroyed();
  customNotifications.clear();
  notificationChecks.cleared = customNotifications.windows.size === 0;
  testingToasts = false;
  report.customNotifications = notificationChecks;
  preferences = { ...preferences, ...notificationPreferences }; persist(); publish();
  settingsWindow!.setSize(470, 500);
  await wait(100);
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('pet-tab').click()`);
  await wait(80);
  writeFileSync(join(directory, 'settings-pet-compact.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('projects-tab').click()`);
  report.settingsCompact = await settingsWindow!.webContents.executeJavaScript(`({overflow:document.documentElement.scrollWidth>innerWidth,footerFits:document.getElementById('save').getBoundingClientRect().bottom<=innerHeight})`);
  writeFileSync(join(directory, 'settings-compact.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('advanced-settings').open=true`);
  await wait(50);
  report.advancedCompact = await settingsWindow!.webContents.executeJavaScript(`({overflow:document.documentElement.scrollWidth>innerWidth,footerFits:document.getElementById('save').getBoundingClientRect().bottom<=innerHeight,chatControlsVisible:document.getElementById('chat-search').getBoundingClientRect().bottom<document.getElementById('save').getBoundingClientRect().top})`);
  writeFileSync(join(directory, 'settings-filters-expanded-compact.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('advanced-settings').open=false`);
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('chats-tab').click();document.documentElement.style.setProperty('--ui-font-size','24px')`);
  report.largeFontSettings = await settingsWindow!.webContents.executeJavaScript(`(() => {
    const textFits = selector => [...document.querySelectorAll(selector)].every(node => {const style=getComputedStyle(node);return parseFloat(style.lineHeight)>=parseFloat(style.fontSize);});
    const tabs=[...document.querySelectorAll('.settings-tabs button')];
    return {lineHeights:textFits('.panel-title,.panel-description,#connection-detail,.notification-dialog h1,.help'),
      tabsFit:tabs.every(node=>node.scrollWidth<=node.clientWidth),tabsReflow:tabs[0].getBoundingClientRect().top!==tabs[2].getBoundingClientRect().top,
      overflow:document.documentElement.scrollWidth>innerWidth};
  })()`);
  writeFileSync(join(directory, 'settings-large-font.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  await settingsWindow!.webContents.executeJavaScript(`document.documentElement.style.setProperty('--ui-font-size','14px')`);
  report.hoverTransparency = await hoverWindow.webContents.executeJavaScript(`getComputedStyle(document.documentElement).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(document.body).backgroundColor==='rgba(0, 0, 0, 0)'`);
  await smokeTheme('light');
  settingsWindow!.setSize(768, 600);
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('chats-tab').click()`);
  snapshot = liveSnapshot;
  preferences = livePreferences;
  polling = wasPolling;
  storePreferences(preferencesPath, preferences);
  machine.reset();
  pet = machine.update(allowedSnapshot(snapshot, preferences), null);
  publish();
  report.window = { alwaysOnTop: petWindow!.isAlwaysOnTop(), bounds: petWindow!.getBounds() };
  await wait(150);
  report.ui = await settingsWindow!.webContents.executeJavaScript(`({
    title: document.title, fields: document.querySelectorAll('input,select').length,
    overflow: document.documentElement.scrollWidth > innerWidth,
    status: document.getElementById('connection').textContent,
    hasBridge: typeof window.pet.getState === 'function'
  })`);
  writeFileSync(join(directory, 'settings.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  await settingsWindow!.webContents.executeJavaScript(`window.pet.savePreferences({followThreadId: 'smoke-test-unavailable-chat'})`);
  await wait(100);
  report.missingChat = await settingsWindow!.webContents.executeJavaScript(`document.getElementById('selected-chats').textContent`);
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('projects-tab').click();document.getElementById('advanced-settings').open=true`);
  writeFileSync(join(directory, 'settings-missing-chat.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  await settingsWindow!.webContents.executeJavaScript(`window.pet.savePreferences({followThreadId: null})`);
  const originalPreferences = { ...preferences };
  const fixture = join(directory, 't3-fixture');
  mkdirSync(fixture, { recursive: true });
  const fixtureSettings = join(fixture, 'client-settings.json');
  writeFileSync(fixtureSettings, JSON.stringify({ notificationMode: 'notifications-and-sound', inAppNotificationsEnabled: true, futurePreference: 'preserved' }));
  preferences = { ...preferences, dataDirectory: fixture, onboardingCompleted: false };
  snapshot = { connected: false, threads: [], checkedAt: Date.now(), message: 'Open T3 Code to connect your pet.' };
  storePreferences(preferencesPath, preferences);
  publish();
  await wait(100);
  report.notificationModal = await settingsWindow!.webContents.executeJavaScript(`(async () => {
    document.getElementById('notifications-tab').click();
    const before = (await window.pet.getState()).preferences;
    document.getElementById('notification-setup').click();
    const modal = document.getElementById('notification-dialog');
    for (let i=0;i<40 && document.getElementById('notification-apply').disabled;i++) await new Promise(r=>setTimeout(r,25));
    const opened = modal.open && document.title === 'T3 Pet settings' && modal.querySelector('h1').textContent === 'Choose your notifications';
    const styleHidden = document.getElementById('notification-appearance').hidden;
    document.querySelector('input[value=migrate]').click();
    const styleShown = !document.getElementById('notification-appearance').hidden;
    document.querySelector('input[name=notification-appearance][value=custom]').click();
    const action = document.getElementById('notification-action-label').textContent === 'Switch notifications';
    document.getElementById('notification-apply').click();
    for (let i=0;i<40 && document.getElementById('notification-apply').disabled;i++) await new Promise(r=>setTimeout(r,25));
    const cancelled = modal.open && !document.getElementById('notification-error').hidden && JSON.stringify((await window.pet.getState()).preferences) === JSON.stringify(before);
    document.getElementById('notification-cancel').click();
    const closed = !modal.open;
    document.getElementById('notification-setup').click();
    for (let i=0;i<40 && document.getElementById('notification-apply').disabled;i++) await new Promise(r=>setTimeout(r,25));
    const reset = document.querySelector('input[value=keep]').checked;
    const setupVisible = !document.getElementById('notification-setup').hidden;
    const globalOnboarding = !document.getElementById('reopen-onboarding').closest('[role=tabpanel]');
    return {opened, styleHidden, styleShown, action, cancelled, closed, reset, setupVisible, globalOnboarding};
  })()`);
  await wait(80);
  writeFileSync(join(directory, 'notification-modal.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  settingsWindow!.setSize(470, 500);
  await wait(80);
  (report.notificationModal as Record<string, boolean>).compact = await settingsWindow!.webContents.executeJavaScript(`(() => { const modal=document.getElementById('notification-dialog'); const action=document.getElementById('notification-apply').getBoundingClientRect(); return modal.scrollWidth <= modal.clientWidth && action.bottom <= innerHeight && action.top >= 0; })()`);
  writeFileSync(join(directory, 'notification-modal-compact.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  const keptToast = customNotifications.show({threadId: '', title: 'Keep active alert', body: 'Setup must leave this visible', kind: 'test'}, true);
  notifications.reset();
  const trackingSnapshot = { ...snapshot, connected: true, threads: [{ ...fixtureThread, pendingApproval: 0, pendingInput: 0, turnState: 'running' }] };
  notifications.update(trackingSnapshot, true, null, false);
  const waitingSnapshot = { ...trackingSnapshot, threads: [{ ...trackingSnapshot.threads[0]!, pendingApproval: 1 }] };
  notifications.update(waitingSnapshot, true, null, true);
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('notification-apply').click()`);
  await wait(150);
  (report.notificationModal as Record<string, boolean>).keptActive = !keptToast.isDestroyed();
  (report.notificationModal as Record<string, boolean>).keptTracking = notifications.update(waitingSnapshot, true, null, false).some(notice => notice.kind === 'Approval needed');
  customNotifications.clear(); notifications.reset();
  (report.notificationModal as Record<string, boolean>).applied = await settingsWindow!.webContents.executeJavaScript(`!document.getElementById('notification-dialog').open && document.title === 'T3 Pet settings' && document.getElementById('notification-setup').hidden`);
  preferences = { ...preferences, onboardingCompleted: false };
  storePreferences(preferencesPath, preferences);
  const onboardingReopened = new Promise<void>(resolve => settingsWindow!.webContents.once('did-finish-load', () => resolve()));
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('reopen-onboarding').click()`);
  await onboardingReopened;
  await wait(150);
  report.onboardingConnect = await settingsWindow!.webContents.executeJavaScript(`({visible: !document.getElementById('connect-step').hidden, overflow: document.documentElement.scrollWidth > innerWidth, bridge: typeof window.pet.finishOnboarding === 'function'})`);
  settingsWindow!.setSize(470, 500);
  await settingsWindow!.webContents.executeJavaScript(`(() => {document.documentElement.style.setProperty('--ui-font-size','24px');const error=document.getElementById('setup-error');error.hidden=false;error.textContent='Could not connect. Check the selected folder and try again. This multi-line error must remain readable.';})()`);
  report.largeFontOnboarding = await settingsWindow!.webContents.executeJavaScript(`(() => {
    const readable = node => {const style=getComputedStyle(node);return parseFloat(style.lineHeight)>=parseFloat(style.fontSize);};
    return {heading:readable(document.querySelector('#connect-step h1')),error:readable(document.getElementById('setup-error'))};
  })()`);
  writeFileSync(join(directory, 'onboarding-large-font.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  await settingsWindow!.webContents.executeJavaScript(`(() => {document.documentElement.style.setProperty('--ui-font-size','14px');const error=document.getElementById('setup-error');error.hidden=true;error.textContent='';})()`);
  settingsWindow!.setSize(768, 600);
  const captureOnboarding = async (stage: string) => {
    for (const theme of ['light', 'dark'] as const) {
      await smokeTheme(theme);
      await wait(80);
      writeFileSync(join(directory, `onboarding-${stage}-${theme}.png`), (await settingsWindow!.webContents.capturePage()).toPNG());
    }
    await smokeTheme('light');
    settingsWindow!.setSize(470, 500);
    await wait(80);
    const layout = await settingsWindow!.webContents.executeJavaScript(`({
      overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
      footerFits: document.getElementById('continue').getBoundingClientRect().bottom <= innerHeight,
      progressCount: document.querySelectorAll('.steps button').length,
      currentCount: document.querySelectorAll('.steps [aria-current=step]').length
    })`);
    report['onboardingCompact' + stage] = layout;
    writeFileSync(join(directory, `onboarding-${stage}-compact.png`), (await settingsWindow!.webContents.capturePage()).toPNG());
    settingsWindow!.setSize(768, 600);
    await wait(80);
    writeFileSync(join(directory, `onboarding-${stage}.png`), (await settingsWindow!.webContents.capturePage()).toPNG());
  };
  await captureOnboarding('connect');
  report.onboardingProgressInitial = await settingsWindow!.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.steps button')).every(control => control.disabled)`);
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('connection-settings').open = true`);
  await captureOnboarding('connection-folder');
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('connection-settings').open = false`);
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('continue').click()`);
  await wait(200);
  report.onboardingDropdowns = await settingsWindow!.webContents.executeJavaScript(`(() => {
    const source=document.getElementById('pet-size');const trigger=document.getElementById('pet-size-trigger');
    const allCustom=[...document.querySelectorAll('select')].every(select=>select.hidden && document.getElementById(select.id+'-trigger')?.getAttribute('role')==='combobox');
    trigger.scrollIntoView({block:'nearest'});trigger.click();
    const popup=document.getElementById('pet-size-listbox');const rect=popup.getBoundingClientRect();
    const fits=rect.left>=0 && rect.right<=innerWidth && rect.top>=0 && rect.bottom<=innerHeight;
    trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));
    trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    return {allCustom,fits,keyboard:source.value==='96' && trigger.textContent.includes('Small'),closed:trigger.getAttribute('aria-expanded')==='false'};
  })()`);
  report.onboardingPet = await settingsWindow!.webContents.executeJavaScript(`(() => {
    const visible = !document.getElementById('pet-step').hidden;
    const choices = document.querySelectorAll('#pet-gallery input[name=character]').length === 4;
    document.querySelector('#pet-gallery input[value=miso]').click();
    document.getElementById('pet-size').value = '96';
    document.getElementById('pet-still').checked = true;
    document.getElementById('pet-still').dispatchEvent(new Event('change', {bubbles:true}));
    document.getElementById('back').click();
    return {visible, choices, back: !document.getElementById('connect-step').hidden};
  })()`);
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('continue').click()`);
  await wait(200);
  (report.onboardingPet as Record<string, boolean>).draftRetained = await settingsWindow!.webContents.executeJavaScript(`document.querySelector('#pet-gallery input[value=miso]').checked && document.getElementById('pet-size').value === '96' && document.getElementById('pet-still').checked`);
  await captureOnboarding('pet');
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('continue').click()`);
  await wait(200);
  const chosenPet = loadPreferences(preferencesPath);
  (report.onboardingPet as Record<string, boolean>).persisted = chosenPet.petId === 'miso' && chosenPet.size === 96 && chosenPet.reducedMotion;
  report.onboardingNotifications = await settingsWindow!.webContents.executeJavaScript(`({visible: !document.getElementById('notifications-step').hidden, migration: !document.getElementById('migrate-option').hidden, text: document.getElementById('notification-check').textContent, overflow: document.documentElement.scrollWidth > innerWidth, footerFits: document.getElementById('continue').getBoundingClientRect().bottom <= innerHeight})`);
  report.onboardingNotificationStyle = await settingsWindow!.webContents.executeJavaScript(`(async () => {
    const before=(await window.pet.getState()).preferences;
    const appearance=document.getElementById('notification-appearance');
    const hiddenInitially=appearance.hidden;
    const panel=document.getElementById('notifications-step');
    panel.scrollTop=0; const scrollBefore=panel.scrollTop;
    document.querySelector('input[value=migrate]').click();
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const scrollStable=panel.scrollTop===scrollBefore;
    const shownForPet=!appearance.hidden;
    document.querySelector('input[name=notification-appearance][value=custom]').click();
    document.querySelector('input[value=keep]').click();
    const hiddenForKeep=appearance.hidden;
    const draftOnly=JSON.stringify((await window.pet.getState()).preferences)===JSON.stringify(before);
    return {hiddenInitially,shownForPet,hiddenForKeep,draftOnly,scrollStable};
  })()`);
  report.onboardingProgressBack = await settingsWindow!.webContents.executeJavaScript(`(() => {
    const controls = document.querySelectorAll('.steps button');
    const backEnabled = !controls[0].disabled && !controls[1].disabled && controls[2].disabled && controls[3].disabled;
    controls[1].click();
    return { backEnabled, returned: !document.getElementById('pet-step').hidden,
      current: controls[1].getAttribute('aria-current') === 'step', folder: document.getElementById('directory').value === ${JSON.stringify(fixture)}, pet: document.querySelector('#pet-gallery input[value=miso]').checked };
  })()`);
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('continue').click()`);
  await wait(200);
  report.onboardingActionIcon = await settingsWindow!.webContents.executeJavaScript(`(() => {
    document.querySelector('input[value=migrate]').click();
    const label = document.getElementById('action-label').textContent;
    const icon = !!document.querySelector('#continue svg');
    document.querySelector('input[value=keep]').click();
    return label === 'Switch notifications' && icon;
  })()`);
  await captureOnboarding('notifications');
  const beforeCancel = readFileSync(fixtureSettings, 'utf8');
  report.onboardingCancellation = await settingsWindow!.webContents.executeJavaScript(`(async () => {
    const before = (await window.pet.getState()).preferences;
    const result = await window.pet.finishOnboarding('migrate', 'custom');
    const after = (await window.pet.getState()).preferences;
    return { cancelled: result.outcome === 'cancelled', unchanged: JSON.stringify(before) === JSON.stringify(after) };
  })()`);
  report.onboardingCancelFileUnchanged = beforeCancel === readFileSync(fixtureSettings, 'utf8');
  report.nativeCloseHelper = { packaged: app.isPackaged, supported: ['win32', 'darwin', 'linux'].includes(process.platform) };
  report.fixtureMigration = await migrateNotifications(fixture, app.getPath('userData'), sound => {
    const next = { ...preferences, notificationsEnabled: true, notificationSound: sound, onboardingCompleted: true };
    storePreferences(preferencesPath, next); preferences = next;
  }, async () => false);
  report.fixtureMigratedSettings = JSON.parse(readFileSync(fixtureSettings, 'utf8'));
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('retry').click()`);
  await wait(120);
  await settingsWindow!.webContents.executeJavaScript(`document.querySelector('input[value=enable]').click();document.querySelector('input[name=notification-appearance][value=custom]').click()`);
  await wait(60);
  writeFileSync(join(directory, 'onboarding-notification-style.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  await settingsWindow!.webContents.executeJavaScript(`document.getElementById('continue').click()`);
  await wait(150);
  report.onboardingFinish = await settingsWindow!.webContents.executeJavaScript(`({visible: !document.getElementById('finish-step').hidden, test: !document.getElementById('test-row').hidden, text: document.getElementById('finish-detail').textContent, overflow: document.documentElement.scrollWidth > innerWidth})`);
  (report.onboardingPet as Record<string, boolean>).finishPreview = await settingsWindow!.webContents.executeJavaScript(`document.getElementById('preview-pet').dataset.pet === 'miso'`);
  report.onboardingProgressFinished = await settingsWindow!.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.steps button')).every(control => control.disabled)`);
  await captureOnboarding('finish');
  (report.onboardingNotificationStyle as Record<string, boolean>).customPersisted = loadPreferences(preferencesPath).notificationStyle === 'custom';
  (report.onboardingNotificationStyle as Record<string, boolean>).keepUnchanged = await settingsWindow!.webContents.executeJavaScript(`(async () => {
    const before=(await window.pet.getState()).preferences;
    await window.pet.finishOnboarding('keep','os');
    return JSON.stringify((await window.pet.getState()).preferences)===JSON.stringify(before);
  })()`);
  (report.onboardingNotificationStyle as Record<string, boolean>).osPersisted = await settingsWindow!.webContents.executeJavaScript(`(async () => {
    if (!(await window.pet.getState()).notificationsSupported) return true;
    await window.pet.finishOnboarding('enable','os');
    const saved=(await window.pet.getState()).preferences.notificationStyle==='os';
    await window.pet.finishOnboarding('enable','custom');return saved;
  })()`);
  if (process.argv.includes('--notification-smoke-test')) {
    const notice = showNotification({ threadId: '', title: 'Test notification', body: 'Packaged T3 Pet notification check.', kind: 'test' }, true, 'os') as Notification;
    const shown = await new Promise<string>(resolve => {
      notice.once('show', () => resolve('shown'));
      notice.once('failed', (_event, message) => resolve(`failed: ${message}`));
      setTimeout(() => resolve('no native show event'), 3000);
    });
    notice.emit('click'); notice.close();
    report.nativeNotification = { supported: Notification.isSupported(), result: shown, clickHandlerExercised: true };
  }
  preferences = originalPreferences;
  storePreferences(preferencesPath, preferences);
  writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2));
  app.quit();
}

if (closeFixtureDirectory) {
  void app.whenReady().then(async () => {
    const window = new BrowserWindow({ width: 320, height: 240, title: 'T3 Pet close fixture' });
    await window.loadURL('data:text/html,<p>Temporary close test</p>');
    mkdirSync(closeFixtureDirectory, { recursive: true });
    writeFileSync(join(closeFixtureDirectory, 'ready.json'), JSON.stringify({ pid: process.pid }));
    // A refused close exercises the timeout without touching T3 Code.
    if (process.argv.includes('--refuse-close')) {
      window.on('close', event => event.preventDefault());
      app.on('before-quit', event => event.preventDefault());
    } else app.on('window-all-closed', () => app.quit());
  }).catch(() => app.exit(1));
} else if (fixtureDirectory) {
  void runFullscreenFixture(fixtureDirectory).catch(() => app.exit(1));
} else if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { showPet(); showSettings(); });
  app.whenReady().then(async () => {
    traceSmoke('app ready');
    preferencesPath = join(app.getPath('userData'), 'preferences.json');
    preferences = loadPreferences(preferencesPath);
    themeSync = new T3ThemeSync(
      () => smokeDirectory ? join(smokeDirectory, 't3-profile') : t3ProfileDirectory(app.getPath('appData')),
      () => preferences.dataDirectory, () => nativeTheme.shouldUseDarkColors,
      theme => { uiTheme = theme; nativeTheme.themeSource = theme.source; publish(); });
    nativeTheme.on('updated', () => themeSync?.refresh());
    if (process.platform === 'linux' && preferences.launchAtLogin && !smokeDirectory) {
      setLinuxLoginStartup(true, linuxStartupCommand(process.execPath, app.getAppPath(), app.isPackaged, process.env.APPIMAGE));
    }
    registerIpc();
    await createPet();
    {
      const helper = helperPath('foreground-monitor');
      const petHandle = nativeWindowId(petWindow!.getNativeWindowHandle());
      stopFullscreenWatch = watchFullscreen(helper, petHandle, fullscreen => {
        const changed = !fullscreenCheckReady || visibility.fullscreen !== fullscreen;
        fullscreenCheckReady = true;
        fullscreenCheckFailed = false;
        visibility.fullscreen = fullscreen;
        if (changed) traceSmoke(`foreground suppression=${fullscreen}`);
        applyVisibility();
      }, () => {
        fullscreenCheckReady = false;
        fullscreenCheckFailed = true;
        visibility.fullscreen = true;
        applyVisibility();
      }, dark => {
        if (darkBackground !== dark) { darkBackground = dark; publish(); }
      });
    }
    const trayImage = nativeImage.createFromPath(join(__dirname, '..', 'assets', process.platform === 'darwin' ? 'trayTemplate.png' : 'icon.png'))
      .resize({ width: process.platform === 'darwin' ? 22 : 24, height: process.platform === 'darwin' ? 22 : 24 });
    if (process.platform === 'darwin') trayImage.setTemplateImage(true);
    tray = new Tray(trayImage);
    tray.setToolTip('T3 Pet');
    tray.setContextMenu(menu());
    if (process.platform === 'win32') tray.on('click', () => tray?.popUpContextMenu(menu()));
    if (process.platform === 'linux') tray.on('click', () => showSettings());
    tray.on('double-click', () => showSettings());
    screen.on('display-removed', () => { petWindow?.setBounds(fitPosition(preferences.position)); customNotifications.position(); });
    screen.on('display-metrics-changed', () => { petWindow?.setBounds(fitPosition(preferences.position)); customNotifications.position(); });
    if (process.platform === 'darwin') app.dock?.hide();
    await poll();
    traceSmoke('first poll finished');
    if (!smokeDirectory && !preferences.onboardingCompleted) showSettings(true);
    if (smokeDirectory && fullscreenTest) await runFullscreenCheck(smokeDirectory, petWindow!, visibility);
    else if (smokeDirectory) await runSmokeTest(smokeDirectory);
  }).catch(error => {
    traceSmoke(`startup error: ${error instanceof Error ? error.stack : String(error)}`);
    if (smokeDirectory) { app.exit(1); return; }
    dialog.showErrorBox('T3 Pet could not start', error instanceof Error ? error.message : String(error));
    app.quit();
  });
  app.on('activate', showPet);
  app.on('window-all-closed', () => { /* The pet is a tray app. */ });
  app.on('before-quit', () => {
    quitting = true;
    themeSync?.dispose();
    hoverPanel.dispose();
    stopFullscreenWatch?.();
    stopDrag();
    if (timer) clearTimeout(timer);
    if (previewTimer) clearTimeout(previewTimer);
    clearNotifications();
    tray?.destroy();
  });
}
