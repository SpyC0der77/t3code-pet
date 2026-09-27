import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, dialog, screen, shell } from 'electron';
import { chatUrl } from './t3-navigation';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { readLocalSnapshot } from './t3-local';
import { PetStateMachine } from './pet-state';
import { HoverPanel } from './hover-panel';
import { PetVisibility, watchFullscreen } from './fullscreen';
import { runFullscreenCheck, runFullscreenFixture } from './fullscreen-test';
import { loadPreferences, storePreferences, validatePreferences } from './preferences';
import type { AppState, PetMood, Preferences, Snapshot } from './shared';

const fullscreenTest = process.argv.includes('--fullscreen-test');
const fixtureIndex = process.argv.indexOf('--fullscreen-fixture');
const fixtureDirectory = fixtureIndex >= 0 ? process.argv[fixtureIndex + 1] : undefined;
const smokeIndex = process.argv.indexOf(fullscreenTest ? '--fullscreen-test' : '--smoke-test');
const smokeDirectory = smokeIndex >= 0 ? process.argv[smokeIndex + 1] : undefined;
if (smokeDirectory) app.setPath('userData', join(smokeDirectory, 'user-data'));
if (fixtureDirectory) app.setPath('userData', join(fixtureDirectory, 'fixture-user-data'));
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
let darkBackground = false;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let preferences: Preferences;
let preferencesPath: string;
let timer: ReturnType<typeof setTimeout> | undefined;
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let dragTimer: ReturnType<typeof setInterval> | undefined;
let previewMood: PetMood | null = null;
let quitting = false;
let polling = false;
let connectionGeneration = 0;
const visibility = new PetVisibility();
const hoverPanel = new HoverPanel(() => petWindow, state, () => visibility.visible && !dragTimer && !!petWindow?.isVisible());
visibility.fullscreen = process.platform === 'win32';
let stopFullscreenWatch: (() => void) | undefined;
let fullscreenCheckFailed = false;
let fullscreenCheckReady = process.platform !== 'win32';
let snapshot: Snapshot = { connected: false, message: 'Looking for T3 Code…', threads: [], checkedAt: Date.now() };
const machine = new PetStateMachine();
let pet = machine.update(snapshot, null);
const moods: PetMood[] = ['idle', 'working', 'waiting', 'done', 'error', 'offline'];
const labels: Record<PetMood, string> = { idle: 'Resting', working: 'Working', waiting: 'Approval needed', done: 'Turn finished', error: 'A chat hit an error', offline: 'T3 Code offline' };

function state(): AppState {
  return { darkBackground, preferences, snapshot, pet: previewMood ? { ...pet, mood: previewMood, label: `${labels[previewMood]} · preview`, threadTitle: null } : pet,
    preview: previewMood !== null, version: app.getVersion(), supportsLoginStartup: ['win32', 'darwin'].includes(process.platform) };
}

function publish() {
  const value = state();
  for (const win of [petWindow, settingsWindow]) if (win && !win.isDestroyed()) win.webContents.send('pet:state', value);
  tray?.setToolTip(`T3 Pet · ${value.pet.label}`);
  if (!testingHover) hoverPanel.publish();
}

function persist() { storePreferences(preferencesPath, preferences); }

function applyVisibility() {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (visibility.visible) {
    if (!petWindow.isVisible()) petWindow.showInactive();
    // Focus changes and fullscreen transitions can disturb native z-order even
    // when Electron still considers the window visible.
    if (!petWindow.isAlwaysOnTop()) petWindow.setAlwaysOnTop(true, 'floating');
  }
  else { hoverPanel.hide(); stopDrag(); if (petWindow.isVisible()) petWindow.hide(); }
}

function showPet() { visibility.manualHidden = false; applyVisibility(); }

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

function showSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.show(); settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 540, height: Math.min(790, screen.getPrimaryDisplay().workArea.height - 32), minWidth: 470, minHeight: 500, title: 'T3 Pet settings',
    backgroundColor: '#121212', autoHideMenuBar: true, show: false,
    icon: join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  lockWindow(settingsWindow);
  settingsWindow.once('ready-to-show', () => settingsWindow?.show());
  settingsWindow.on('closed', () => { settingsWindow = null; });
  void settingsWindow.loadFile(join(__dirname, 'renderer', 'settings.html'));
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
    { label: 'Settings…', click: showSettings },
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
      pet = machine.update(snapshot, preferences.followThreadId);
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
    const next = validatePreferences(raw, preferences);
    // Renderer settings cannot move the desktop window. Dragging owns position.
    next.position = preferences.position;
    const directoryChanged = next.dataDirectory !== preferences.dataDirectory;
    if (next.launchAtLogin !== preferences.launchAtLogin && ['win32', 'darwin'].includes(process.platform) && !smokeDirectory) {
      app.setLoginItemSettings({ openAtLogin: next.launchAtLogin });
    }
    storePreferences(preferencesPath, next);
    preferences = next;
    if (directoryChanged) {
      connectionGeneration++;
      snapshot = { connected: false, message: 'Looking for T3 Code…', threads: [], checkedAt: Date.now() };
      machine.reset();
    }
    petWindow?.setBounds(fitPosition(preferences.position));
    pet = machine.update(snapshot, preferences.followThreadId);
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
    }, 16);
  });
}

async function runSmokeTest(directory: string) {
  traceSmoke('smoke starting');
  mkdirSync(directory, { recursive: true });
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  await wait(1200);
  const report: Record<string, unknown> = { electron: process.versions.electron, sqlite: process.versions.sqlite, connected: snapshot.connected, message: snapshot.message, threadCount: snapshot.threads.length, mood: pet.mood };
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
  report.hoverEmpty = await hoverWindow.webContents.executeJavaScript(`document.querySelectorAll('li').length === 0 && document.querySelector('main').hidden`);
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
    const canvas = document.getElementById('cat');
    const pixels = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let opaque = 0; for (let i=3;i<pixels.length;i+=4) if(pixels[i]) opaque++;
    return {name: canvas.dataset.animation, frame: canvas.dataset.frame, opaquePixels: opaque};
  })()`);
  report.animationAdvanced = (report.animation as { frame: string }).frame !== firstFrame;
  report.visibility = { fullscreen: visibility.fullscreen, petVisible: petWindow!.isVisible(), manualHidden: visibility.manualHidden, monitorReady: fullscreenCheckReady, monitorFailed: fullscreenCheckFailed };
  setPreview(null);
  showSettings();
  await wait(700);
  // Exercise the actual renderer/preload/main bridge, including persistence.
  const controls = await settingsWindow!.webContents.executeJavaScript(`(async () => {
    const original = (await window.pet.getState()).preferences;
    const saved = await window.pet.savePreferences({size: 160, reducedMotion: true, showLabel: false});
    const readBack = await window.pet.getState();
    let invalidRejected = false;
    try { await window.pet.savePreferences({size: 9000}); } catch { invalidRejected = true; }
    await window.pet.savePreferences(original);
    return {saveRoundTrip: saved.preferences.size === 160 && readBack.preferences.reducedMotion && !readBack.preferences.showLabel, invalidRejected};
  })()`);
  report.controls = controls;
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
  report.missingChat = await settingsWindow!.webContents.executeJavaScript(`document.getElementById('following-detail').textContent`);
  writeFileSync(join(directory, 'settings-missing-chat.png'), (await settingsWindow!.webContents.capturePage()).toPNG());
  await settingsWindow!.webContents.executeJavaScript(`window.pet.savePreferences({followThreadId: null})`);
  writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2));
  app.quit();
}

if (fixtureDirectory) {
  void runFullscreenFixture(fixtureDirectory).catch(() => app.exit(1));
} else if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { showPet(); showSettings(); });
  app.whenReady().then(async () => {
    traceSmoke('app ready');
    preferencesPath = join(app.getPath('userData'), 'preferences.json');
    preferences = loadPreferences(preferencesPath);
    registerIpc();
    await createPet();
    if (process.platform === 'win32') {
      const helper = app.isPackaged
        ? join(process.resourcesPath, 'native', 'foreground-monitor.exe')
        : join(__dirname, 'native', 'foreground-monitor.exe');
      const petHandle = petWindow!.getNativeWindowHandle().readBigUInt64LE().toString();
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
    const trayImage = nativeImage.createFromPath(join(__dirname, '..', 'assets', 'icon.png')).resize({ width: process.platform === 'darwin' ? 22 : 24, height: process.platform === 'darwin' ? 22 : 24 });
    tray = new Tray(trayImage);
    tray.setToolTip('T3 Pet');
    tray.on('click', () => menu().popup());
    tray.on('right-click', () => menu().popup());
    tray.on('double-click', showSettings);
    screen.on('display-removed', () => petWindow?.setBounds(fitPosition(preferences.position)));
    screen.on('display-metrics-changed', () => petWindow?.setBounds(fitPosition(preferences.position)));
    if (process.platform === 'darwin') app.dock?.hide();
    await poll();
    traceSmoke('first poll finished');
    if (smokeDirectory && fullscreenTest) await runFullscreenCheck(smokeDirectory, petWindow!, visibility);
    else if (smokeDirectory) await runSmokeTest(smokeDirectory);
  }).catch(error => {
    traceSmoke(`startup error: ${error instanceof Error ? error.message : String(error)}`);
    if (smokeDirectory) { app.exit(1); return; }
    dialog.showErrorBox('T3 Pet could not start', error instanceof Error ? error.message : String(error));
    app.quit();
  });
  app.on('activate', showPet);
  app.on('window-all-closed', () => { /* The pet is a tray app. */ });
  app.on('before-quit', () => {
    quitting = true;
    hoverPanel.dispose();
    stopFullscreenWatch?.();
    stopDrag();
    if (timer) clearTimeout(timer);
    if (previewTimer) clearTimeout(previewTimer);
    tray?.destroy();
  });
}
