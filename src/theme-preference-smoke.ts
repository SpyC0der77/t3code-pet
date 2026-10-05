import type { BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppState } from './shared';
import { resolveUiTheme } from './t3-theme';

export async function runThemePreferenceSmoke(win: BrowserWindow, hover: BrowserWindow, directory: string,
  state: () => AppState, followed: (appearance: 'light' | 'dark', id: string) => Promise<void>) {
  const checks: Record<string, boolean> = {};
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  checks.default = await win.webContents.executeJavaScript(`document.getElementById('ui-theme').value==='follow-t3-code' && !document.getElementById('theme-appearance-field').hidden && document.querySelector('#theme-modes input').disabled && document.querySelector('#theme-styles input').disabled`);
  checks.customPaletteIds = await win.webContents.executeJavaScript(`(() => {
    const root=document.documentElement, original=root.dataset.theme, errors=[];
    const canvas=document.querySelector('.theme-wireframe-pane').style.getPropertyValue('--preview-canvas');
    const onError=event=>{errors.push(event.message);event.preventDefault();};window.addEventListener('error',onError);
    const safe=['constructor','__proto__','toString'].every(id=>{
      root.dataset.theme=id;document.getElementById('ui-theme').dispatchEvent(new Event('change',{bubbles:true}));
      return document.querySelector('.theme-wireframe-pane').style.getPropertyValue('--preview-canvas')===canvas;
    });
    root.dataset.theme=original;document.getElementById('ui-theme').dispatchEvent(new Event('change',{bubbles:true}));
    window.removeEventListener('error',onError);return safe && errors.length===0;
  })()`);
  const save = async (theme: string, appearance: string) => {
    await win.webContents.executeJavaScript(`(() => {
      document.getElementById('general-tab').click();
      const follow=document.getElementById('follow-t3-theme');
      if (${JSON.stringify(theme)}==='follow-t3-code') {
        if (!follow.checked) {
          document.querySelector('#theme-modes input[value="'+${JSON.stringify(appearance)}+'"]').click();
          follow.click();
        }
      }
      else {
        if (follow.checked) follow.click();
        document.querySelector('#theme-styles input[value="'+${JSON.stringify(theme)}+'"]').click();
        document.querySelector('#theme-modes input[value="'+${JSON.stringify(appearance)}+'"]').click();
      }
      document.getElementById('settings-form').requestSubmit();
    })()`);
    const deadline = Date.now() + 2000;
    while ((state().preferences.theme !== theme || state().preferences.themeAppearance !== appearance) && Date.now() < deadline) await wait(20);
    await wait(100);
  };
  checks.visualChoices = await win.webContents.executeJavaScript(`document.querySelectorAll('#theme-modes input').length===3 && document.querySelectorAll('#theme-styles input').length===6 && document.querySelectorAll('.theme-swatch').length===12`);
  await save('grove', 'light');
  checks.saved = state().theme.id === 'grove' && state().theme.appearance === 'light' &&
    await win.webContents.executeJavaScript(`document.getElementById('save-result').textContent==='Saved' && !document.getElementById('theme-appearance-field').hidden && !document.querySelector('#theme-modes input').disabled`);
  await win.webContents.executeJavaScript(`document.querySelector('#theme-modes input[value=light]').focus()`);
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' });
  await wait(50);
  checks.keyboard = await win.webContents.executeJavaScript(`document.querySelector('#theme-modes input[value=dark]').checked && document.getElementById('theme-appearance').value==='dark' && !document.getElementById('save').disabled`);
  await win.webContents.executeJavaScript(`document.getElementById('discard').click()`);
  checks.visualDiscard = await win.webContents.executeJavaScript(`document.querySelector('#theme-modes input[value=light]').checked && document.querySelector('#theme-styles input[value=grove]').checked && !document.getElementById('follow-t3-theme').checked`);
  await win.webContents.executeJavaScript(`(() => {const theme=document.getElementById('ui-theme');theme.value='ember';theme.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await followed('dark', 'iris');
  checks.independent = state().theme.id === 'grove' && state().theme.appearance === 'light';
  checks.draftRetained = await win.webContents.executeJavaScript(`document.getElementById('ui-theme').value==='ember' && document.documentElement.dataset.theme==='grove' && !document.getElementById('save').disabled`);
  await win.webContents.executeJavaScript(`document.getElementById('discard').click()`);
  checks.discarded = await win.webContents.executeJavaScript(`document.getElementById('ui-theme').value==='grove' && document.getElementById('save').disabled`);
  await save('ember', 'dark');
  hover.webContents.send('pet:state', state());
  await wait(50);
  checks.openViews = state().theme.id === 'ember' && state().theme.appearance === 'dark' &&
    await hover.webContents.executeJavaScript(`document.documentElement.dataset.theme==='ember' && document.documentElement.style.colorScheme==='dark'`);
  await win.webContents.executeJavaScript(`document.querySelector('#general-panel').scrollTop=0`);
  writeFileSync(join(directory, 'settings-independent-theme.png'), (await win.webContents.capturePage()).toPNG());
  // Capture the whole General page for review without altering its default window size.
  win.setSize(768, 800);
  await wait(80);
  await win.webContents.executeJavaScript(`document.activeElement.blur();document.querySelector('#general-panel').scrollTop=0`);
  writeFileSync(join(directory, 'settings-general-full.png'), (await win.webContents.capturePage()).toPNG());
  win.setSize(470, 500);
  await wait(80);
  checks.compact = await win.webContents.executeJavaScript(`(() => {document.querySelector('#general-panel').scrollTop=0;return document.documentElement.scrollWidth<=innerWidth && document.getElementById('save').getBoundingClientRect().bottom<=innerHeight && [...document.querySelectorAll('.theme-style-choice')].every(node=>node.scrollWidth<=node.clientWidth);})()`);
  writeFileSync(join(directory, 'settings-general-compact.png'), (await win.webContents.capturePage()).toPNG());
  win.setSize(768, 600);
  await save('follow-t3-code', 'system');
  checks.followRestored = state().theme.id === 'iris' && state().theme.appearance === 'dark' &&
    await win.webContents.executeJavaScript(`!document.getElementById('theme-appearance-field').hidden && document.querySelector('#theme-modes input').disabled`);
  const custom = resolveUiTheme({ 't3code:theme': 'constructor', 't3code:theme-appearance-mode': 'dark',
    't3code:themes:v1': JSON.stringify([{ id: 'constructor', appearance: 'light', colors: { canvas: '#faf0e0' },
      variants: { dark: { canvas: '#112233', warningForeground: '#ccbbaa' } } }]) }, false);
  win.webContents.send('pet:state', { ...state(), theme: custom });
  await wait(80);
  checks.customPreviews = await win.webContents.executeJavaScript(`(() => {
    const canvas = mode => document.querySelector('#theme-modes input[value='+mode+']').parentElement.querySelector('.theme-wireframe-pane').style.getPropertyValue('--preview-canvas');
    return canvas('light')==='#faf0e0' && canvas('dark')==='#112233' && document.documentElement.style.getPropertyValue('--warning')==='#ccbbaa';
  })()`);
  win.webContents.send('pet:state', state());
  await wait(80);
  return checks;
}
