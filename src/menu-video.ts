import { screen, type BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PetMenu } from './pet-menu';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export async function runMenuVideo(menu: PetMenu, pet: BrowserWindow, directory: string) {

  const area = screen.getPrimaryDisplay().workArea;
  await menu.show({x:area.x+area.width-80,y:area.y+area.height-80});
  const win = menu.window!;
  const trigger = await win.webContents.executeJavaScript(`(() => {const r=document.getElementById('preview').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  const host = win.getBounds(), point = {x:host.x+trigger.x,y:host.y+trigger.y};
  menu.hide();
  const frames = join(directory,'frames'); mkdirSync(frames,{recursive:true});
  let frame = 0, recording = true;
  const capture = async () => {
    while(recording) {
      const image = await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
      if(!image.isEmpty()) writeFileSync(join(frames,`frame-${String(frame++).padStart(5,'0')}.png`),image.toPNG());
      await wait(33);
    }
  };
  const capturing = capture();
  const bounds = pet.getBounds(); pet.setPosition(Math.round(point.x-bounds.width/2), Math.round(point.y-bounds.height/2)); pet.showInactive();
  await wait(600);
  const samples: unknown[] = [];
  for (let index=0;index<3;index++) {
    await pet.webContents.executeJavaScript(`document.getElementById('cat').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,screenX:${point.x},screenY:${point.y}}))`);
    const deadline = Date.now() + 3000;
    while (!await win.webContents.executeJavaScript(`!document.body.hasAttribute('data-closed')`) && Date.now() < deadline) await wait(20);
    if(!menu.visible || !await win.webContents.executeJavaScript(`!document.body.hasAttribute('data-closed')`)) throw new Error('Right-click menu did not become visible for recording.');
    await win.webContents.executeJavaScript(`(() => {const r=document.getElementById('preview').getBoundingClientRect();window.initialMenuFrames=[];const start=performance.now();const sample=()=>{const p=document.getElementById('primary').getBoundingClientRect();window.initialMenuFrames.push({time:performance.now()-start,top:p.top,left:p.left,submenu:!document.getElementById('animations').hidden,focus:document.activeElement?.id});if(performance.now()-start<900)requestAnimationFrame(sample);};sample();document.getElementById('preview').dispatchEvent(new PointerEvent('pointerenter',{clientX:r.x+r.width/2,clientY:r.y+r.height/2}));})()`);
    await wait(950);
    const initialFrames = await win.webContents.executeJavaScript(`window.initialMenuFrames`);
    await win.webContents.executeJavaScript(`(() => {const r=document.getElementById('preview').getBoundingClientRect();document.getElementById('preview').dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:r.x+r.width/2+6,clientY:r.y+r.height/2,screenX:6,screenY:0}));})()`);
    await wait(250);
    samples.push({frames:initialFrames, deliberateOpen:await win.webContents.executeJavaScript(`!document.getElementById('animations').hidden`)});
    menu.hide(); await wait(350);
  }
  writeFileSync(join(directory,'menu-video-frames.json'),JSON.stringify({samples,nativeCanvasStaysVisible:win.isVisible()},null,2));
  recording = false; await capturing;
  menu.hide();
}

