import { applyUiTheme } from './theme';
import { unsettledChats } from '../unsettled';
import type { AppState } from '../shared';
const list = document.getElementById('chats')!;
const panel = document.querySelector('main')!;
const empty = document.getElementById('empty')!;
function fitHeight() { window.pet.hoverSize(panel.hidden ? 0 : Math.ceil(list.getBoundingClientRect().height + empty.getBoundingClientRect().height) + 2); }
const resize = new ResizeObserver(fitHeight);
resize.observe(list);
resize.observe(empty);
let signature = '';
function render(state: AppState) {
  applyUiTheme(state.theme);
  const chats = state.snapshot.connected ? unsettledChats(state.snapshot.threads) : [];
  const next = JSON.stringify([state.snapshot.connected, state.snapshot.message, chats.map(c => [c.thread.id, c.thread.title, c.status])]);
  if (next === signature) return;
  signature = next;
  list.replaceChildren(...chats.map(({thread, status}) => {
    const row = document.createElement('li');
    const button = document.createElement('button'); button.type = 'button';
    button.title = 'Open chat in T3 Code in your browser';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await window.pet.openChat(thread.id); }
      catch { button.title = 'Could not open this chat. Check that T3 Code is running and try again.'; }
      finally { button.disabled = false; }
    });
    const title = document.createElement('span'); title.className = 'title'; title.textContent = thread.title || 'Untitled chat';
    const detail = document.createElement('span'); detail.className = 'status'; detail.textContent = status;
    button.append(title, detail); row.append(button); return row;
  }));
  empty.hidden = chats.length > 0;
  empty.textContent = state.snapshot.connected ? 'No unsettled chats.' : state.snapshot.message;
  panel.hidden = false;
  fitHeight();
}
document.fonts.ready.then(fitHeight);
window.pet.onState(render);
void window.pet.getState().then(render);
