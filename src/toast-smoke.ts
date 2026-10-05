import { screen, type BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ToastWindows } from './toast-windows';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export async function runToastSmoke(toasts: ToastWindows, pet: BrowserWindow, directory: string, theme: (value: 'light' | 'dark') => Promise<void>) {
  const checks: Record<string, any> = {};
  // Hosted desktops can disable OS animations. Exercise both media settings
  // explicitly instead of letting that preference skip all transition checks.
  const enableMotion = async (win: BrowserWindow) => {
    writeFileSync(join(directory, 'notification-motion-host.json'), JSON.stringify(await win.webContents.executeJavaScript(`({reduced:matchMedia('(prefers-reduced-motion: reduce)').matches})`)));
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
  };
  toasts.pointerTracking = false;
  checks.audio = await pet.webContents.executeJavaScript(`(async () => {
    const results = [];
    for (const kind of ['completion', 'input']) {
      const audio = new Audio('notification-' + kind + '.mp3'); audio.volume = 0;
      try { await audio.play(); } catch (error) { throw new Error('Notification audio: ' + error.name + ': ' + error.message); }
      results.push(Number.isFinite(audio.duration) && audio.duration > 0 && !audio.paused); audio.pause();
    }
    return results.every(Boolean) && typeof window.pet.onNotificationSound === 'function';
  })()`);
  const original = await pet.webContents.executeJavaScript(`window.pet.getState()`);
  await pet.webContents.executeJavaScript(`window.soundPreviewCalls=0;window.savedAudioPlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.soundPreviewCalls++;return Promise.resolve();};void 0;`);
  pet.webContents.send('pet:state', { ...original, preferences: { ...original.preferences, notificationsEnabled: false, notificationSound: true } });
  pet.webContents.send('pet:notification-sound', 'input', false);
  await wait(50);
  checks.disabledAlertsSilent = await pet.webContents.executeJavaScript(`window.soundPreviewCalls===0`);
  pet.webContents.send('pet:notification-sound', 'input', true);
  await wait(50);
  checks.testSound = await pet.webContents.executeJavaScript(`window.soundPreviewCalls===1`);
  pet.webContents.send('pet:state', { ...original, preferences: { ...original.preferences, notificationsEnabled: false, notificationSound: false } });
  pet.webContents.send('pet:notification-sound', 'input', true);
  await wait(50);
  checks.mutedTestSilent = await pet.webContents.executeJavaScript(`window.soundPreviewCalls===1`);
  await pet.webContents.executeJavaScript(`HTMLMediaElement.prototype.play=window.savedAudioPlay;delete window.savedAudioPlay;delete window.soundPreviewCalls;`);
  pet.webContents.send('pet:state', original);
  for (const appearance of ['light', 'dark'] as const) {
    await theme(appearance);
    const win = toasts.show({ threadId: '', title: 'Approval needed', body: 'Update the notification settings', kind: 'Approval needed' }, true);
    await enableMotion(win);
    await wait(650);
    checks[appearance] = await win.webContents.executeJavaScript(`(() => {
      const node = document.querySelector('.toast'), r = node.getBoundingClientRect(), action = node.querySelector('.open').getBoundingClientRect();
      return { theme:document.documentElement.style.colorScheme, title:node.querySelector('.title').textContent, overflow:r.left<0||r.right>innerWidth||r.top<0||r.bottom>innerHeight, actionFits:action.bottom<=r.bottom, bridge:!!window.petToast, transparent:getComputedStyle(document.body).backgroundColor==='rgba(0, 0, 0, 0)', draggable:getComputedStyle(node).cursor==='grab' };
    })()`);
    checks[appearance + 'Layout'] = await win.webContents.executeJavaScript(`(() => {
      const node=document.querySelector('.toast'), r=node.getBoundingClientRect(), content=node.querySelector('.content').getBoundingClientRect(), action=node.querySelector('.open').getBoundingClientRect(), close=node.querySelector('.dismiss').getBoundingClientRect();
      return content.right<=action.left && close.top<r.top && close.right>r.right;
    })()`);
    writeFileSync(join(directory, `notification-${appearance}.png`), (await win.webContents.capturePage()).toPNG());
    const bounds = win.getBounds(), area = screen.getDisplayMatching(bounds).workArea;
    checks[appearance + 'Bounds'] = bounds.x >= area.x && bounds.y >= area.y && bounds.x + bounds.width <= area.x + area.width && bounds.y + bounds.height <= area.y + area.height;
    await win.webContents.executeJavaScript(`window.petToast.pause(true)`);
    checks[appearance + 'Paused'] = toasts.state.entries.every(entry => entry.resumedAt === null);
    await win.webContents.executeJavaScript(`document.querySelector('.${appearance === 'light' ? 'dismiss' : 'open'}').click()`);
    await wait(60);
    checks.animatedDismiss = await win.webContents.executeJavaScript(`!!document.querySelector('[data-ending]') && Number(getComputedStyle(document.querySelector('.toast')).opacity)<1`);
    await wait(550);
    checks[appearance + 'Dismissed'] = win.isDestroyed();
  }
  // Use real long content so layout sizes the card before touch hit testing.
  const touchWin = toasts.show({ threadId: 'touch-scroll', title: 'Long notification',
    body: 'Long notification text '.repeat(150), kind: 'Approval needed' }, true);
  await enableMotion(touchWin); await wait(650);
  toasts.capture(touchWin.webContents, true);
  await touchWin.webContents.executeJavaScript(`(() => {
    const content=document.querySelector('.content');
    content.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',pointerId:42,button:0,clientX:100,clientY:50}));
  })()`);
  await wait(100);
  checks.touchContent = await touchWin.webContents.executeJavaScript(`(() => {
    const content=document.querySelector('.content');
    return !document.querySelector('[data-dragging]') && content.scrollHeight>content.clientHeight && getComputedStyle(document.querySelector('.toast')).touchAction==='pan-y';
  })()`);
  const scrollPoint = await touchWin.webContents.executeJavaScript(`(() => {const r=document.querySelector('.content').getBoundingClientRect();return {x:r.x+r.width/2,y:r.bottom-12};})()`);
  await touchWin.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true });
  await touchWin.webContents.debugger.sendCommand('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...scrollPoint, id: 1 }] });
  for (let distance = 10; distance <= 80; distance += 10) {
    await touchWin.webContents.debugger.sendCommand('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: scrollPoint.x, y: scrollPoint.y - distance, id: 1 }] });
    await wait(25);
  }
  await touchWin.webContents.debugger.sendCommand('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(100);
  checks.touchScroll = await touchWin.webContents.executeJavaScript(`document.querySelector('.content').scrollTop>0 && !document.querySelector('[data-dragging]')`);
  writeFileSync(join(directory, 'notification-touch.json'), JSON.stringify(await touchWin.webContents.executeJavaScript(`(() => {
    const content=document.querySelector('.content'), r=content.getBoundingClientRect();
    return {scrollTop:content.scrollTop,scrollHeight:content.scrollHeight,clientHeight:content.clientHeight,
      top:r.top,bottom:r.bottom,viewportHeight:innerHeight,dragging:!!document.querySelector('[data-dragging]')};
  })()`), null, 2));
  toasts.capture(touchWin.webContents, false); toasts.clear();
  // Resume updates must still reach the compositor during its empty exit delay.
  const emptyHost = toasts.show({ threadId: 'pause-regression', title: 'Finished', body: 'Done', kind: 'Turn finished' });
  const readyDeadline = Date.now() + 5000;
  while (Date.now() < readyDeadline && (!emptyHost.isVisible() || emptyHost.webContents.isLoadingMainFrame())) await wait(20);
  if (!emptyHost.isVisible() || emptyHost.webContents.isLoadingMainFrame() || !await emptyHost.webContents.executeJavaScript(`typeof window.petToast?.pause==='function'`)) throw new Error('Notification renderer did not become ready.');
  await emptyHost.webContents.executeJavaScript(`window.petToast.pause(true)`);
  toasts.dismiss(toasts.state.entries[0].id);
  await emptyHost.webContents.executeJavaScript(`window.petToast.pause(false)`);
  await wait(30);
  const reusedHost = toasts.show({ threadId: 'replacement', title: 'Finished', body: 'Done', kind: 'Turn finished' });
  checks.emptyStackResumes = reusedHost === emptyHost && toasts.state.entries[0].resumedAt !== null;
  toasts.state.expire(Date.now() + 6000);
  checks.emptyStackExpires = toasts.state.entries.length === 0;
  toasts.clear();
  const notice = (threadId: string, kind = 'Turn finished') => ({ threadId, kind, title: kind, body: 'A finished chat' });
  const win = toasts.show(notice('one'));
  await enableMotion(win);
  const same = toasts.show(notice('two'));
  toasts.show(notice('three'));
  await wait(650);
  const nativeBounds = win.getBounds();
  checks.singleWindow = win === same && new Set(toasts.windows.values()).size === 1;
  await win.webContents.executeJavaScript(`window.repeatedAnnouncements=0;window.announcementObserver=new MutationObserver(records=>{window.repeatedAnnouncements+=records.length;});document.querySelectorAll('.title,.description').forEach(node=>window.announcementObserver.observe(node,{childList:true,characterData:true,subtree:true}));`);
  toasts.publish(); await wait(50);
  checks.stableAnnouncements = await win.webContents.executeJavaScript(`window.announcementObserver.disconnect();window.repeatedAnnouncements===0`);
  checks.collapsed = await win.webContents.executeJavaScript(`document.querySelectorAll('[data-behind]').length===2 && [...document.querySelectorAll('[data-behind]')].every(node=>node.inert)`);
  writeFileSync(join(directory, 'notification-collapsed.png'), (await win.webContents.capturePage()).toPNG());
  win.webContents.send('toast:pointer', true);
  await wait(550);
  checks.expanded = await win.webContents.executeJavaScript(`(() => {
    const rows=[...document.querySelectorAll('.toast:not([data-ending])')].map(n=>n.getBoundingClientRect()).sort((a,b)=>a.top-b.top);
    return !document.querySelector('[data-behind]') && rows.every((r,i)=>!i || r.top-rows[i-1].bottom>=11);
  })()`);
  checks.stackPaused = toasts.state.entries.every(entry => entry.resumedAt === null);
  writeFileSync(join(directory, 'notification-expanded.png'), (await win.webContents.capturePage()).toPNG());
  const oldId = toasts.state.entries.find(entry => entry.notice.threadId === 'two')!.id;
  await win.webContents.executeJavaScript(`document.querySelector('[data-id="${oldId}"]').dataset.retained='yes'`);
  toasts.show(notice('two', 'Input needed'));
  await wait(550);
  checks.reused = toasts.state.entries.at(-1)!.id === oldId && await win.webContents.executeJavaScript(`document.querySelector('[data-id="${oldId}"]').dataset.retained==='yes' && document.querySelector('[data-id="${oldId}"] .title').textContent==='Input needed'`);
  const middle = toasts.state.entries[1]!.id;
  toasts.dismiss(middle);
  await wait(50);
  checks.parallelExit = await win.webContents.executeJavaScript(`document.querySelectorAll('[data-ending]').length===1 && document.querySelectorAll('.toast:not([data-ending])').length===2`);
  await wait(550);
  checks.removed = await win.webContents.executeJavaScript(`document.querySelectorAll('.toast').length===2`);
  win.webContents.send('toast:pointer', false); await wait(550);
  checks.collapses = await win.webContents.executeJavaScript(`document.querySelectorAll('[data-behind]').length===1`);
  win.focus();
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
  await wait(550);
  checks.keyboardExpands = await win.webContents.executeJavaScript(`!document.querySelector('[data-behind]') && document.activeElement.closest('.toast').dataset.id==='${oldId}'`);
  pet.focus(); await wait(550);
  win.webContents.send('toast:pointer', true); await wait(550);
  const source = await win.webContents.executeJavaScript(`(() => {
    const n=document.querySelector('[data-id="${oldId}"]'), r=n.getBoundingClientRect();
    return {x:Math.round(r.left+30), y:Math.round(r.top+r.height/2), left:r.left, top:r.top};
  })()`);
  const side = toasts.view(win.webContents).side === 'right' ? 1 : -1;
  // X11 may emit the real desktop cursor's position when native capture starts.
  // sendInputEvent does not move that cursor. Keep those unrelated moves out
  // of this injected gesture stream without changing the user's mouse position.
  await win.webContents.executeJavaScript(`(() => {
    const isolate=event=>{
      const point=window.injectedMousePoint;
      if(event.pointerType==='mouse' && point && (event.clientX!==point.x || event.clientY!==point.y)) event.stopImmediatePropagation();
    };
    window.addEventListener('pointermove',isolate,true);
    window.stopGestureIsolation=()=>window.removeEventListener('pointermove',isolate,true);
  })()`);
  const mouse = async (type: 'mouseDown' | 'mouseMove' | 'mouseUp', dx = 0, dy = 0) => {
    await win.webContents.executeJavaScript(`window.injectedMousePoint={x:${source.x + dx},y:${source.y + dy}};void 0;`);
    win.webContents.sendInputEvent({
      type, x: source.x + dx, y: source.y + dy, button: 'left',
      modifiers: type === 'mouseUp' ? [] : ['leftbuttondown'],
      ...(type === 'mouseMove' ? {} : { clickCount: 1 }),
    });
    await wait(30);
  };
  await mouse('mouseDown'); await wait(180); await mouse('mouseMove', side * 20);
  checks.dragHeld = await win.webContents.executeJavaScript(`(() => {const n=document.querySelector('[data-id="${oldId}"]');return n.hasAttribute('data-dragging') && Math.abs(n.getBoundingClientRect().left-${source.left + side * 20})<2 && Number(getComputedStyle(n).opacity)<1;})()`);
  await wait(120); await mouse('mouseUp', side * 20);
  checks.returnAnimated = await win.webContents.executeJavaScript(`Math.abs(document.querySelector('[data-id="${oldId}"]').getBoundingClientRect().left-${source.left})>1`);
  await wait(550);
  checks.returned = await win.webContents.executeJavaScript(`Math.abs(document.querySelector('[data-id="${oldId}"]').getBoundingClientRect().left-${source.left})<1`);
  await mouse('mouseDown'); await wait(150); await mouse('mouseMove', -side * 100); await wait(120); await mouse('mouseUp', -side * 100); await wait(550);
  checks.inwardResisted = toasts.state.entries.some(entry => entry.id === oldId);
  const vertical = toasts.view(win.webContents).vertical === 'top' ? -1 : 1;
  await mouse('mouseDown'); await wait(150); await mouse('mouseMove', 2, vertical * 20);
  await mouse('mouseMove', side * 80, vertical * 20);
  checks.axisLocked = await win.webContents.executeJavaScript(`(() => {const r=document.querySelector('[data-id="${oldId}"]').getBoundingClientRect();return Math.abs(r.left-${source.left})<1 && Math.abs(r.top-${source.top + vertical * 20})<1;})()`);
  await win.webContents.executeJavaScript(`document.querySelector('[data-id="${oldId}"]').dispatchEvent(new PointerEvent('pointercancel',{pointerId:1}))`);
  await mouse('mouseUp'); await wait(550);
  checks.cancelled = await win.webContents.executeJavaScript(`(() => {const n=document.querySelector('[data-id="${oldId}"]'),r=n.getBoundingClientRect();return !n.hasAttribute('data-dragging') && Math.abs(r.left-${source.left})<1 && Math.abs(r.top-${source.top})<1;})()`);
  await win.webContents.executeJavaScript(`(() => {
    window.swipeEvents=[];
    for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture','blur']) {
      window.addEventListener(type,event=>{
        const node=document.querySelector('[data-id="${oldId}"]'),rect=node?.getBoundingClientRect();
        window.swipeEvents.push({type,time:performance.now(),x:event.clientX,y:event.clientY,target:event.target?.dataset?.id,
          buttons:event.buttons,pointerId:event.pointerId,captured:node?.hasPointerCapture(event.pointerId),
          dragging:node?.hasAttribute('data-dragging'),left:rect?.left,top:rect?.top,focused:document.hasFocus()});
      },true);
    }
  })()`);
  await mouse('mouseDown'); await mouse('mouseMove', side * 45);
  checks.swipeMoved = await win.webContents.executeJavaScript(`(() => {
    const node=document.querySelector('[data-id="${oldId}"]'),r=node.getBoundingClientRect();
    const move=window.swipeEvents.find(event=>event.type==='pointermove');
    return move?.buttons===1 && node.hasPointerCapture(move.pointerId) && node.hasAttribute('data-dragging') && Math.abs(r.left-${source.left + side * 45})<1 && Math.abs(r.top-${source.top})<1;
  })()`);
  checks.waitsForRelease = toasts.state.entries.some(entry => entry.id === oldId);
  await mouse('mouseUp', side * 45); await wait(550);
  checks.swipeDismissed = !toasts.state.entries.some(entry => entry.id === oldId);
  writeFileSync(join(directory, 'notification-swipe-events.json'), JSON.stringify({
    source, side, dismissed: checks.swipeDismissed,
    events: await win.webContents.executeJavaScript('window.swipeEvents'),
  }, null, 2));
  await win.webContents.executeJavaScript('window.stopGestureIsolation();delete window.injectedMousePoint;');
  checks.nativeStable = JSON.stringify(nativeBounds) === JSON.stringify(win.getBounds());
  await win.webContents.executeJavaScript(`window.entryOrigins={};window.entryObserver=new MutationObserver(()=>{for(const node of document.querySelectorAll('.toast[data-entering]')){if(!window.entryOrigins[node.dataset.id]){const r=node.getBoundingClientRect();window.entryOrigins[node.dataset.id]={top:r.top,left:r.left};}}});window.entryObserver.observe(document.getElementById('stack'),{childList:true});undefined`);
  toasts.show(notice('four')); toasts.show(notice('five')); toasts.show(notice('six'));
  await wait(550);
  const enteredId = toasts.state.entries.at(-1)!.id;
  checks.entryHeight = await win.webContents.executeJavaScript(`(() => {window.entryObserver.disconnect();const first=window.entryOrigins[${enteredId}],r=document.querySelector('[data-id="${enteredId}"]').getBoundingClientRect();return !!first && Math.abs(first.top-r.top+32)<1 && Math.abs(first.left-r.left)<1;})()`);
  checks.bounded = toasts.state.entries.length === 3 && new Set(toasts.windows.values()).size === 1;
  // Exercise the native pass-through decision without moving the user's mouse.
  await win.webContents.executeJavaScript(`window.pointerDecisions=[];window.petToast.onPointer(inside=>window.pointerDecisions.push(inside));undefined`);
  toasts.pointerTracking = true;
  const cursor = screen.getCursorScreenPoint(), host = win.getBounds();
  toasts.hitTest(win.webContents, [{x:cursor.x-host.x-1,y:cursor.y-host.y-1,width:2,height:2}]);
  toasts.hitTest(win.webContents, []);
  toasts.pointerTracking = false;
  await wait(80);
  checks.clickThrough = await win.webContents.executeJavaScript(`window.pointerDecisions.includes(true) && window.pointerDecisions.includes(false)`);
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  checks.reducedMotion = await win.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.toast')).transitionDuration==='0s'`);
  win.webContents.debugger.detach();
  toasts.clear(); checks.cleared = win.isDestroyed() && toasts.windows.size === 0;
  toasts.pointerTracking = true;
  return checks;
}
