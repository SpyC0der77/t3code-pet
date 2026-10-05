import { applyUiTheme } from './theme';
import { hoverChats } from '../unsettled';
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
  const chats = state.snapshot.connected ? hoverChats(state.snapshot.threads) : [];
  const next = JSON.stringify([state.snapshot.connected, state.snapshot.message, chats.map(c => [c.thread.id, c.thread.title, c.status, c.depth, c.parentTitle, c.thread.parentThreadId])]);
  if (next === signature) return;
  signature = next;
  const focusedId = (document.activeElement as HTMLElement)?.dataset.chatId;
  list.replaceChildren(...chats.map(({thread, status, depth, parentTitle}) => {
    const row = document.createElement('li');
    row.dataset.depth = String(Math.min(depth, 3));
    if (thread.parentThreadId) row.dataset.parentId = thread.parentThreadId;
    const button = document.createElement('button'); button.type = 'button';
    button.dataset.chatId = thread.id;
    button.title = 'Open chat in T3 Code in your browser';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await window.pet.openChat(thread.id); }
      catch { button.title = 'Could not open this chat. Check that T3 Code is running and try again.'; }
      finally { button.disabled = false; }
    });
    const name = document.createElement('span'); name.className = 'chat-name';
    const title = document.createElement('span'); title.className = 'title'; title.textContent = thread.title || 'Untitled chat';
    name.append(title);
    if (parentTitle) {
      const parent = document.createElement('span'); parent.className = 'parent';
      parent.textContent = 'Subagent of ' + parentTitle; parent.title = parent.textContent;
      button.append(parent);
      button.setAttribute('aria-label', `${title.textContent}, subagent of ${parentTitle}, ${status}`);
    }
    const detail = document.createElement('span'); detail.className = 'status'; detail.textContent = status;
    button.prepend(name, detail); row.append(button); return row;
  }));
  if (focusedId) [...list.querySelectorAll<HTMLButtonElement>('button')].find(button => button.dataset.chatId === focusedId)?.focus({ preventScroll: true });
  empty.hidden = chats.length > 0;
  empty.textContent = state.snapshot.connected ? 'No unsettled chats.' : state.snapshot.message;
  panel.hidden = false;
  fitHeight();
}
document.fonts.ready.then(fitHeight);
window.pet.onState(render);
void window.pet.getState().then(render);
