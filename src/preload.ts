import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, PetBridge } from './shared';

const bridge: PetBridge = {
  onSettingsExit: listener => {
    const handler = (_event: Electron.IpcRendererEvent, action: unknown) => {
      if (action === 'close' || action === 'onboarding') listener(action);
    };
    ipcRenderer.on('pet:settings-exit', handler);
    return () => ipcRenderer.removeListener('pet:settings-exit', handler);
  },
  completeSettingsExit: action => ipcRenderer.send('pet:settings-exit-complete', action),
  onSettingsTab: listener => {
    const handler = (_event: Electron.IpcRendererEvent, tab: unknown) => { if (tab === 'notifications') listener(tab); };
    ipcRenderer.on('pet:settings-tab', handler);
    return () => ipcRenderer.removeListener('pet:settings-tab', handler);
  },
  closeSetup: () => ipcRenderer.send('pet:close-setup'),
  onNotificationSound: listener => {
    const handler = (_event: Electron.IpcRendererEvent, kind: unknown, test: unknown) => {
      if (kind === 'completion' || kind === 'input') listener(kind, test === true);
    };
    ipcRenderer.on('pet:notification-sound', handler);
    return () => ipcRenderer.removeListener('pet:notification-sound', handler);
  },
  notificationSetup: () => ipcRenderer.invoke('pet:notification-setup'),
  finishOnboarding: (choice, style) => ipcRenderer.invoke('pet:finish-onboarding', choice, style),
  testNotification: style => ipcRenderer.invoke('pet:test-notification', style),
  showOnboarding: () => ipcRenderer.send('pet:onboarding'),
  openChat: threadId => ipcRenderer.invoke('pet:open-chat', threadId),
  hover: () => ipcRenderer.send('pet:hover'),
  hoverSize: height => ipcRenderer.send('pet:hover-size', height),
  getState: () => ipcRenderer.invoke('pet:state'),
  onState: listener => {
    const handler = (_event: Electron.IpcRendererEvent, state: AppState) => listener(state);
    ipcRenderer.on('pet:state', handler);
    return () => ipcRenderer.removeListener('pet:state', handler);
  },
  savePreferences: prefs => ipcRenderer.invoke('pet:save', prefs),
  chooseDirectory: () => ipcRenderer.invoke('pet:choose-directory'),
  showMenu: point => ipcRenderer.send('pet:menu', point),
  showSettings: () => ipcRenderer.send('pet:settings'),
  preview: mood => ipcRenderer.send('pet:preview', mood),
  mousePassthrough: ignore => ipcRenderer.send('pet:passthrough', ignore),
  drag: action => ipcRenderer.send('pet:drag', action),
  quit: () => ipcRenderer.send('pet:quit'),
};
contextBridge.exposeInMainWorld('pet', bridge);
contextBridge.exposeInMainWorld('petMenu', {
  onVisible: (listener: (visible: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, visible: boolean) => listener(visible);
    ipcRenderer.on('menu:visible', handler);
    return () => ipcRenderer.removeListener('menu:visible', handler);
  },
  get: () => ipcRenderer.invoke('menu:get'),
  onUpdate: (listener: (value: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) => listener(value);
    ipcRenderer.on('menu:update', handler);
    return () => ipcRenderer.removeListener('menu:update', handler);
  },
  size: (main: number, sub: number, top: number) => ipcRenderer.send('menu:size', main, sub, top),
  painted: (sequence: number, layout: string) => ipcRenderer.send('menu:painted', sequence, layout),
  pointer: () => ipcRenderer.send('menu:pointer'),
  action: (action: string, mood?: string | null) => ipcRenderer.send('menu:action', action, mood),
  close: () => ipcRenderer.send('menu:close'),
});
contextBridge.exposeInMainWorld('petToast', {
  get: () => ipcRenderer.invoke('toast:get'),
  onUpdate: (listener: (value: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) => listener(value);
    ipcRenderer.on('toast:update', handler);
    return () => ipcRenderer.removeListener('toast:update', handler);
  },
  dismiss: (id: number) => ipcRenderer.send('toast:dismiss', id),
  pause: (paused: boolean) => ipcRenderer.send('toast:pause', paused),
  hitTest: (areas: unknown) => ipcRenderer.send('toast:hit-test', areas),
  capture: (active: boolean) => ipcRenderer.send('toast:capture', active),
  onPointer: (listener: (inside: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, inside: boolean) => listener(inside);
    ipcRenderer.on('toast:pointer', handler);
    return () => ipcRenderer.removeListener('toast:pointer', handler);
  },
  open: (id: number) => ipcRenderer.invoke('toast:open', id),
});
