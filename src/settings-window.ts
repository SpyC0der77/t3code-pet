import type { BrowserWindow } from 'electron';

type SettingsWindow = Pick<BrowserWindow, 'isDestroyed' | 'isMinimized' | 'restore' | 'show' | 'focus'>;

export function activateSettingsWindow(win: SettingsWindow) {
  // Yield after the menu releases native focus before activating settings.
  setImmediate(() => {
    if (win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}
