import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, PetBridge } from './shared';

const bridge: PetBridge = {
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
