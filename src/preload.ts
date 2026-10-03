import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, PetBridge } from './shared';

const bridge: PetBridge = {
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
  showMenu: () => ipcRenderer.send('pet:menu'),
  showSettings: () => ipcRenderer.send('pet:settings'),
  preview: mood => ipcRenderer.send('pet:preview', mood),
  mousePassthrough: ignore => ipcRenderer.send('pet:passthrough', ignore),
  drag: action => ipcRenderer.send('pet:drag', action),
  quit: () => ipcRenderer.send('pet:quit'),
};
contextBridge.exposeInMainWorld('pet', bridge);
contextBridge.exposeInMainWorld('petToast', {
  get: () => ipcRenderer.invoke('toast:get'),
  onUpdate: (listener: (value: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) => listener(value);
    ipcRenderer.on('toast:update', handler);
    return () => ipcRenderer.removeListener('toast:update', handler);
  },
  dismiss: () => ipcRenderer.send('toast:dismiss'),
  pause: (paused: boolean) => ipcRenderer.send('toast:pause', paused),
  drag: (action: string, x: number, y: number) => ipcRenderer.send('toast:drag', action, x, y),
  size: (height: number) => ipcRenderer.send('toast:size', height),
  onDragProgress: (listener: (progress: { opacity: number; animate: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: { opacity: number; animate: boolean }) => listener(progress);
    ipcRenderer.on('toast:drag-progress', handler);
    return () => ipcRenderer.removeListener('toast:drag-progress', handler);
  },
  open: () => ipcRenderer.invoke('toast:open'),
});
