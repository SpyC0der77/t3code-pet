import type { AppState, PetMood } from '../shared';
const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const select = (id: string) => document.getElementById(id) as HTMLSelectElement;
const text = (id: string, value: string) => { document.getElementById(id)!.textContent = value; };
let initialized = false;
let threadSignature = '';
let current: AppState;

function render(state: AppState) {
  current = state;
  const p = state.preferences;
  if (!initialized) {
    input('directory').value = p.dataDirectory;
    select('size').value = String(p.size);
    input('reduced-motion').checked = p.reducedMotion;
    input('login').checked = p.launchAtLogin;
  }
  text('connection', state.snapshot.connected ? 'Connected to T3 Code' : 'Not connected');
  text('connection-detail', state.snapshot.connected ? state.pet.threadTitle ? `${state.pet.label} · ${state.pet.threadTitle}` : 'Ready to follow your agents.' : state.snapshot.message);
  text('version', `v${state.version}`);
  input('login').disabled = !state.supportsLoginStartup;
  input('login').closest('label')!.title = state.supportsLoginStartup ? '' : 'Login startup is available on Windows and macOS.';
  text('chat-count', `${state.snapshot.threads.length} ${state.snapshot.threads.length === 1 ? 'chat' : 'chats'}`);
  const signature = JSON.stringify(state.snapshot.threads.map(t => [t.id, t.title, t.project]));
  if (!initialized || signature !== threadSignature) {
    const chosen = initialized ? select('follow').value : p.followThreadId ?? '';
    const follow = select('follow');
    follow.replaceChildren(new Option('All chats · requests for attention first', ''));
    for (const thread of state.snapshot.threads) follow.add(new Option(`${thread.title}${thread.project ? ` · ${thread.project}` : ''}`, thread.id));
    if (chosen && !state.snapshot.threads.some(t => t.id === chosen)) follow.add(new Option('Selected chat · currently unavailable', chosen));
    follow.value = chosen;
    threadSignature = signature;
  }
  if (!state.preview) select('preview').value = '';
  const selected = state.snapshot.threads.find(t => t.id === p.followThreadId);
  text('following-detail', selected
    ? `Following this chat${selected.provider ? ` · ${selected.provider}` : ''}.`
    : p.followThreadId
      ? 'The selected chat is unavailable. Choose another chat or All chats.'
      : 'Watching local chats across providers.');
  initialized = true;
}

window.pet.onState(render);
void window.pet.getState().then(render);
document.getElementById('browse')!.addEventListener('click', async () => {
  const path = await window.pet.chooseDirectory();
  if (path) input('directory').value = path;
});
select('preview').addEventListener('change', () => window.pet.preview(select('preview').value as PetMood || null));
document.getElementById('quit')!.addEventListener('click', () => window.pet.quit());
document.getElementById('settings-form')!.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.getElementById('save') as HTMLButtonElement;
  const result = document.getElementById('save-result')!;
  button.disabled = true;
  result.classList.remove('error');
  text('save-result', 'Saving…');
  try {
    const next = await window.pet.savePreferences({
      dataDirectory: input('directory').value.trim(), followThreadId: select('follow').value || null,
      size: Number(select('size').value),
      reducedMotion: input('reduced-motion').checked, launchAtLogin: input('login').checked,
    });
    render(next);
    text('save-result', 'Saved');
  } catch (error) {
    result.classList.add('error');
    text('save-result', error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Could not save. Try again.');
  } finally { button.disabled = false; }
});
