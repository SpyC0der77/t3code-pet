import { applyUiTheme } from './theme';
import { createThemeControls } from './theme-controls';
import { enhanceDropdowns, syncDropdowns, closeDropdowns } from './dropdown';
import type { AppState, PetMood, Preferences, SelectionFilter } from '../shared';
import { createPetGallery } from './pet-gallery';
import { pets } from '../pets';
import { unsettledChats } from '../unsettled';
import { allowedThreads } from '../project-filter';
import { createNotificationModal } from './notification-modal';
const element = (id: string) => document.getElementById(id)!;
const input = (id: string) => element(id) as HTMLInputElement;
const select = (id: string) => element(id) as HTMLSelectElement;
const button = (id: string) => element(id) as HTMLButtonElement;
const text = (id: string, value: string) => { element(id).textContent = value; };
const gallery = createPetGallery(element('pet-gallery'), element('pet-panel'), id => {
  input('pet-id').value = id; showPetCredit(); updateControls();
});
function showPetCredit() {
  const pet = pets.find(pet => pet.id === input('pet-id').value)!;
  text('pet-credit', pet.credit);
  gallery.select(pet.id);
}
function updatePreview() { gallery.preview(select('preview').value as PetMood, input('reduced-motion').checked); }
let current: AppState;
let saved: Preferences | undefined;
let saving = false;
let testingNotification = false;
let activitySignature = '';
function renderActivity() {
  const snapshot = current.snapshot;
  const query = input('activity-search').value.trim().toLocaleLowerCase();
  const active = new Map(unsettledChats(snapshot.threads).map(chat => [chat.thread.id, chat]));
  const followed = new Set(allowedThreads(snapshot.threads, current.preferences).map(thread => thread.id));
  const chats = snapshot.connected ? snapshot.threads.filter(thread =>
    (thread.title + ' ' + thread.project).toLocaleLowerCase().includes(query)
  ).map(thread => ({ thread, status: active.get(thread.id)?.status ??
    (thread.turnState === 'completed' ? 'Completed' : ['stopped', 'interrupted'].includes(thread.sessionStatus ?? '') ? 'Stopped' : 'Ready'),
    priority: active.get(thread.id)?.priority ?? 5
  })).sort((a, b) => a.priority - b.priority || b.thread.updatedAt.localeCompare(a.thread.updatedAt) || a.thread.id.localeCompare(b.thread.id)) : [];
  const signature = JSON.stringify([snapshot.connected, query, chats.map(({ thread, status }) =>
    [thread.id, thread.title, thread.project, status, followed.has(thread.id)])]);
  element('activity-empty').hidden = chats.length > 0;
  text('activity-empty', !snapshot.connected ? snapshot.message : query ? 'No chats match your search.' : 'No chats yet. Start a chat in T3 Code.');
  if (signature === activitySignature) return;
  activitySignature = signature;
  const focusedId = (document.activeElement as HTMLElement)?.dataset.activityId;
  element('chat-activity').replaceChildren(...chats.map(({ thread, status }) => {
    const row = document.createElement('li');
    const open = document.createElement('button'); open.type = 'button'; open.dataset.activityId = thread.id;
    open.title = 'Open chat in T3 Code in your browser';
    const name = document.createElement('span'); name.className = 'activity-name'; name.textContent = thread.title || 'Untitled chat';
    const project = document.createElement('span'); project.className = 'activity-project';
    project.textContent = (thread.project || 'No project') + (followed.has(thread.id) ? '' : ' · Excluded by filters');
    name.append(project);
    const detail = document.createElement('span'); detail.className = 'activity-status'; detail.textContent = status;
    open.append(name, detail); row.append(open);
    open.addEventListener('click', async () => {
      open.disabled = true; element('activity-error').hidden = true;
      try { await window.pet.openChat(thread.id); }
      catch (error) { text('activity-error', errorText(error)); element('activity-error').hidden = false; }
      finally { open.disabled = false; }
    });
    return row;
  }));
  if (focusedId) [...element('chat-activity').querySelectorAll<HTMLButtonElement>('button')].find(button => button.dataset.activityId === focusedId)?.focus({ preventScroll: true });
}
type Kind = 'project' | 'chat';
const selections: Record<Kind, SelectionFilter['selected']> = { project: [], chat: [] };
const signatures: Record<Kind, string> = { project: '', chat: '' };
const visible: Record<Kind, SelectionFilter['selected']> = { project: [], chat: [] };
const selectors = {
  project: { list: 'blocked-projects', help: 'blocked-help', all: 'ignore-all', none: 'allow-all' },
  chat: { list: 'selected-chats', help: 'chat-filter-help', all: 'select-chats', none: 'clear-chats' },
};
const kinds: Kind[] = ['project', 'chat'];
const errorText = (error: unknown) => error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Could not complete this action. Try again.';
const sorted = (items: SelectionFilter['selected']) => items.map(p => ({ ...p })).sort((a,b) => a.id.localeCompare(b.id));
const themeControls = createThemeControls();
function draft() {
  return {
    ...themeControls.read(),
    petId: input('pet-id').value,
    dataDirectory: input('directory').value.trim(),
    projectFilter: { mode: select('project-mode').value as SelectionFilter['mode'], selected: sorted(selections.project) },
    chatFilter: { mode: select('chat-mode').value as SelectionFilter['mode'], selected: sorted(selections.chat) },
    size: Number(select('size').value), reducedMotion: input('reduced-motion').checked,
    launchAtLogin: input('login').checked, notificationsEnabled: input('notifications').checked,
    notificationSound: input('notification-sound').checked,
    notificationStyle: select('notification-style').value as Preferences['notificationStyle'],
  };
}
function dirty() {
  if (!saved) return false;
  const baseline = { ...draft(), ...Object.fromEntries(Object.keys(draft()).map(key => [key, saved![key as keyof Preferences]])),
    projectFilter: { ...saved.projectFilter, selected: sorted(saved.projectFilter.selected) },
    chatFilter: { ...saved.chatFilter, selected: sorted(saved.chatFilter.selected) } };
  return JSON.stringify(draft()) !== JSON.stringify(baseline);
}
function updateControls(message?: string) {
  themeControls.update(saving);
  const changed = dirty();
  const value = draft();
  for (const tab of tabs) {
    const panel = element(tab.getAttribute('aria-controls')!);
    const keys: Record<string, (keyof ReturnType<typeof draft>)[]> = {
      'general-panel': ['theme', 'themeAppearance', 'launchAtLogin'], 'chats-panel': ['dataDirectory'],
      'projects-panel': ['projectFilter', 'chatFilter'], 'pet-panel': ['petId', 'size', 'reducedMotion'],
      'notifications-panel': ['notificationsEnabled', 'notificationSound', 'notificationStyle'],
    };
    const edited = saved && keys[panel.id].some(key => JSON.stringify(value[key]) !== JSON.stringify(
      key === 'projectFilter' || key === 'chatFilter' ? { ...saved![key], selected: sorted(saved![key].selected) } : saved![key]));
    tab.textContent = tab.dataset.label! + (edited ? ' *' : '');
    tab.setAttribute('aria-label', tab.dataset.label! + (edited ? ', unsaved changes' : ''));
  }
  updateFilterResult();
  button('save').disabled = saving || !changed; button('discard').hidden = !changed; button('discard').disabled = saving;
  button('notification-setup').disabled = saving || changed;
  button('notification-setup').title = changed ? 'Save or discard your changes before opening setup.' : '';
  button('reopen-onboarding').disabled = saving;
  updateNotificationControls();
  if (message) text('save-result', message);
  else { element('save-result').classList.remove('error'); text('save-result', changed ? 'Unsaved changes' : 'Changes apply after saving.'); }
}
function updateFilterResult() {
  if (!current) return;
  const count = allowedThreads(current.snapshot.threads, { ...current.preferences, ...draft() }).length;
  text('filter-result', current.snapshot.connected ? `${count} of ${current.snapshot.threads.length} loaded chats will be followed after saving.` : 'Connect to T3 Code to see how many chats these filters will follow.');
}
function updateNotificationControls() {
  const supported = select('notification-style').value === 'custom' || !!current?.notificationsSupported;
  input('notifications').disabled = saving || !supported;
  input('notification-sound').disabled = saving || !supported || !input('notifications').checked;
  select('notification-style').disabled = saving;
  button('test-notification').disabled = saving || testingNotification || !supported;
  text('notification-style-help', select('notification-style').value === 'custom' ? "Alerts beside the pet use its theme and do not follow system Do Not Disturb." : supported ? 'System alerts use your notification settings and notification center.' : 'System notifications are unavailable on this system. Choose Beside the pet to receive alerts.');
  syncDropdowns();
}
function renderSelector(kind: Kind) {
  if (!current) return;
  const config = selectors[kind];
  const items = new Map(selections[kind].map(p => [p.id, p.name]));
  const available = new Set<string>();
  if (kind === 'project') {
    for (const p of current.snapshot.projects ?? []) { available.add(p.id); items.set(p.id,p.name || 'Untitled project'); }
    for (const t of current.snapshot.threads) if (t.projectId) { available.add(t.projectId); items.set(t.projectId,t.project || 'Untitled project'); }
  } else for (const t of current.snapshot.threads) { available.add(t.id); items.set(t.id,t.title || 'Untitled chat'); }
  const entries = [...items].sort((a,b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  const query = input(kind+'-search').value.trim().toLocaleLowerCase();
  visible[kind] = entries.filter(([id,name]) => (name+' '+(kind==='chat' ? current.snapshot.threads.find(t=>t.id===id)?.project ?? '' : '')).toLocaleLowerCase().includes(query)).map(([id,name])=>({id,name}));
  const selected = new Set(selections[kind].map(p=>p.id));
  const whitelist = select(kind+'-mode').value === 'whitelist';
  text(config.help, whitelist ? selected.size ? 'Only checked '+kind+'s are followed.' : 'No '+kind+'s selected. All chats are excluded.' : 'Checked '+kind+'s are excluded. Unchecked '+kind+'s are followed.');
  text(kind+'-summary', selected.size+' of '+entries.length+' selected'+(query ? ' · '+visible[kind].length+' found' : ''));
  button(config.all).textContent = query ? 'Select results' : 'Select all';
  button(config.none).textContent = query ? 'Clear results' : 'Select none';
  button(config.all).disabled = saving || !visible[kind].some(p=>!selected.has(p.id));
  button(config.none).disabled = saving || !visible[kind].some(p=>selected.has(p.id));
  const signature = JSON.stringify([entries,[...available],query,current.snapshot.threads.map(t=>[t.id,t.projectId,t.project])]);
  if (signature === signatures[kind]) {
    for (const checkbox of element(config.list).querySelectorAll<HTMLInputElement>('input')) {
      checkbox.checked=selected.has(checkbox.dataset.filterId!); checkbox.disabled=saving;
    }
    return;
  }
  signatures[kind]=signature;
  const activeId=(document.activeElement as HTMLInputElement)?.dataset?.filterId;
  const rows=visible[kind].map(({id,name})=>{
    const label=document.createElement('label'); label.className='project-option';
    const checkbox=document.createElement('input'); checkbox.type='checkbox'; checkbox.dataset.filterId=id;
    if(kind==='project') checkbox.dataset.projectId=id; else checkbox.dataset.chatId=id;
    checkbox.checked=selected.has(id); checkbox.disabled=saving;
    const title=document.createElement('span'); title.className='project-name'; title.textContent=name;
    const chat=current.snapshot.threads.find(t=>t.id===id);
    const detailText=!available.has(id) ? 'Currently unavailable' : kind==='chat' ? (chat?.project || 'No project') : '';
    const duplicates=entries.filter(p=>p[1]===name).length>1;
    if(detailText || duplicates){ const detail=document.createElement('span');detail.className='project-detail';detail.textContent=detailText+(duplicates ? (detailText ? ' · ' : '')+'ID: '+id : '');title.append(detail); }
    checkbox.addEventListener('change',()=>{
      selections[kind]=selections[kind].filter(p=>p.id!==id);
      if(checkbox.checked)selections[kind].push({id,name});renderSelector(kind);updateControls();
    });
    label.append(checkbox,title);
    if(kind==='project'){const count=current.snapshot.threads.filter(t=>t.projectId===id).length;const detail=document.createElement('span');detail.className='project-count';detail.textContent=count+' '+(count===1?'chat':'chats');label.append(detail);}
    return label;
  });
  if(!rows.length){const empty=document.createElement('p');empty.className='filter-empty';empty.textContent=query?'No '+kind+'s match your search.':'Open T3 Code to load your '+kind+'s.';element(config.list).replaceChildren(empty);}
  else element(config.list).replaceChildren(...rows);
  if(activeId)[...element(config.list).querySelectorAll<HTMLInputElement>('input')].find(p=>p.dataset.filterId===activeId)?.focus();
}
function renderSelectors(){for(const kind of kinds)renderSelector(kind);}
function hydrate(p: Preferences) {
  saved=p;
  themeControls.hydrate(p);
  for(const kind of kinds){const filter=p[kind==='project'?'projectFilter':'chatFilter'];selections[kind]=filter.selected.map(p=>({...p}));select(kind+'-mode').value=filter.mode;}
  input('directory').value=p.dataDirectory;select('size').value=String(p.size);
  input('pet-id').value=p.petId;showPetCredit();
  input('reduced-motion').checked=p.reducedMotion;input('login').checked=p.launchAtLogin;
  input('notifications').checked=p.notificationsEnabled;input('notification-sound').checked=p.notificationSound;
  select('notification-style').value=p.notificationStyle;
  renderSelectors();updateControls();updatePreview();
}
const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role=tab]')];
tabs.forEach(tab => { tab.dataset.label = tab.textContent!; });
function showTab(index: number, focus = false) {
  closeDropdowns();
  tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; element(tab.getAttribute('aria-controls')!).hidden = i !== index; });
  if (focus) tabs[index].focus();
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => showTab(index));
  tab.addEventListener('keydown', event => {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (next !== null) { event.preventDefault(); showTab(next, true); }
  });
});
function render(state: AppState) {
  applyUiTheme(state.theme);
  themeControls.update(saving, state.theme);
  const wasConnected = current?.snapshot.connected;
  const changed = dirty(); current = state;
  if (!saved || (!changed && JSON.stringify(saved) !== JSON.stringify(state.preferences))) hydrate(state.preferences);
  renderSelectors();
  updateFilterResult();
  renderActivity();
  text('connection', state.snapshot.connected ? 'Connected to T3 Code' : 'Not connected');
  text('connection-detail', state.snapshot.connected ? 'Agent status updates automatically.' : state.snapshot.message);
  element('connection-recovery').hidden = state.snapshot.connected;
  if (!state.snapshot.connected && wasConnected !== false) (element('data-folder') as HTMLDetailsElement).open = true;
  text('version', `v${state.version}`); text('chat-count', `${state.snapshot.threads.length} ${state.snapshot.threads.length === 1 ? 'chat' : 'chats'}`);
  input('login').disabled = saving || !state.supportsLoginStartup;
  input('login').closest('label')!.title = state.supportsLoginStartup ? '' : 'Login startup is unavailable on this system.';
  updateNotificationControls();
}
window.pet.onState(render); void window.pet.getState().then(render);
window.pet.onSettingsTab(() => showTab(tabs.findIndex(tab => tab.id === 'notifications-tab')));
if (new URLSearchParams(location.search).get('tab') === 'notifications') showTab(tabs.findIndex(tab => tab.id === 'notifications-tab'));
input('activity-search').addEventListener('input', () => { if (current) renderActivity(); });
element('settings-form').addEventListener('change', event => { if ((event.target as HTMLElement).id !== 'preview') updateControls(); });
input('directory').addEventListener('input', () => updateControls());
element('advanced-settings').addEventListener('toggle', () => {
  if ((element('advanced-settings') as HTMLDetailsElement).open) element('advanced-settings').scrollIntoView({ block: 'start' });
  else element('projects-panel').scrollTop = 0;
});
for (const kind of kinds) {
  input(kind+'-search').addEventListener('input',()=>renderSelector(kind));
  select(kind+'-mode').addEventListener('change',()=>{renderSelector(kind);updateControls();});
  const config=selectors[kind];
  for(const id of [config.all,config.none])button(id).addEventListener('click',()=>{
    const ids=new Set(visible[kind].map(p=>p.id));selections[kind]=selections[kind].filter(p=>!ids.has(p.id));
    if(id===config.all)selections[kind].push(...visible[kind].map(p=>({...p})));renderSelector(kind);updateControls();
  });
}
button('discard').addEventListener('click', () => { if (saved) hydrate(saved); });
button('browse').addEventListener('click', async () => {
  try { const path = await window.pet.chooseDirectory(); if (path) { input('directory').value = path; updateControls(); } }
  catch (error) { element('save-result').classList.add('error'); text('save-result', errorText(error)); }
});
select('preview').addEventListener('change', updatePreview);
input('reduced-motion').addEventListener('change', updatePreview);
const notificationModal = createNotificationModal(() => current, render);
enhanceDropdowns();
button('notification-setup').addEventListener('click', () => { if (!dirty()) void notificationModal.open(); });
button('reopen-onboarding').addEventListener('click', () => { if (!saving) window.pet.showOnboarding(); });
button('connection-retry').addEventListener('click', async () => {
  if (saving) return;
  button('connection-retry').disabled = true;
  try {
    if (input('directory').value.trim() !== saved?.dataDirectory) {
      text('connection-detail', 'Save your selected data folder before checking the connection.');
      button('save').focus();
    } else render(await window.pet.savePreferences({ dataDirectory: input('directory').value.trim() }));
  } catch (error) { text('connection-detail', errorText(error)); }
  finally { button('connection-retry').disabled = false; }
});
button('test-notification').addEventListener('click', async () => {
  if (testingNotification) return;
  testingNotification = true; updateNotificationControls();
  try { await window.pet.testNotification(select('notification-style').value as Preferences['notificationStyle']); text('notification-status', select('notification-style').value === 'custom' ? 'Test sent beside your pet.' : 'Test sent. If no alert appears, allow T3 Pet in system notification settings.'); }
  catch (error) { text('notification-status', errorText(error)); }
  finally { testingNotification = false; updateControls(); }
});
async function saveChanges(): Promise<boolean> {
  if (saving) return false;
  if (!dirty()) return true;
  let success = false;
  saving = true; updateControls('Saving…');
  const controls = [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('.tab-panel input,.tab-panel select,.tab-panel button')];
  const disabled = controls.map(control => control.disabled);
  controls.forEach(control => { control.disabled = true; });
  try { const next = await window.pet.savePreferences(draft()); current = next; hydrate(next.preferences); render(next); updateControls('Saved'); success = true; }
  catch (error) { element('save-result').classList.add('error'); text('save-result', errorText(error)); }
  finally {
    controls.forEach((control, index) => { control.disabled = disabled[index]; });
    saving = false; button('save').disabled = !dirty(); button('discard').disabled = false; button('notification-setup').disabled = dirty();
    updateControls(element('save-result').textContent ?? undefined);
    renderSelectors();
  }
  return success;
}
element('settings-form').addEventListener('submit', event => { event.preventDefault(); void saveChanges(); });
const exitDialog = element('unsaved-dialog') as HTMLDialogElement;
let pendingExit: 'close' | 'onboarding' | undefined;
window.pet.onSettingsExit(action => {
  if (saving || (element('notification-dialog') as HTMLDialogElement).open) return;
  if (!dirty()) { window.pet.completeSettingsExit(action); return; }
  if (exitDialog.open) return;
  pendingExit = action;
  element('unsaved-error').hidden = true;
  exitDialog.showModal(); button('unsaved-cancel').focus();
});
button('unsaved-cancel').addEventListener('click', () => exitDialog.close());
exitDialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
exitDialog.addEventListener('close', () => { if (!exitDialog.open) pendingExit = undefined; });
function finishExit() {
  const action = pendingExit;
  exitDialog.close();
  if (action) window.pet.completeSettingsExit(action);
}
button('unsaved-discard').addEventListener('click', () => { if (saved) hydrate(saved); finishExit(); });
button('unsaved-save').addEventListener('click', async () => {
  for (const id of ['unsaved-save', 'unsaved-discard', 'unsaved-cancel']) button(id).disabled = true;
  const success = await saveChanges();
  for (const id of ['unsaved-save', 'unsaved-discard', 'unsaved-cancel']) button(id).disabled = false;
  if (success) finishExit();
  else { text('unsaved-error', element('save-result').textContent ?? 'Could not save. Try again.'); element('unsaved-error').hidden = false; }
});
