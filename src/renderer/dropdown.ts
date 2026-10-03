const svg = (path: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="${path}"/></svg>`;
const instances = new Set<Dropdown>();

class Dropdown {
  private wrapper = document.createElement('div');
  private trigger = document.createElement('button');
  private value = document.createElement('span');
  private popup = document.createElement('div');
  private active = -1;
  private items: HTMLElement[] = [];
  private signature = '';
  private search = '';
  private searchedAt = 0;
  private opened = false;

  constructor(private select: HTMLSelectElement) {
    this.wrapper.className = 'custom-select';
    this.trigger.type = 'button';
    this.trigger.className = 'select-trigger';
    this.trigger.id = select.id + '-trigger';
    this.trigger.setAttribute('role', 'combobox');
    this.trigger.setAttribute('aria-haspopup', 'listbox');
    this.trigger.setAttribute('aria-expanded', 'false');
    this.trigger.setAttribute('aria-controls', select.id + '-listbox');
    const labels = [...select.labels ?? []];
    labels.forEach((label, i) => {
      label.id ||= select.id + '-label-' + i;
      label.htmlFor = this.trigger.id;
    });
    if (labels.length) this.trigger.setAttribute('aria-labelledby', labels.map(label => label.id).join(' '));
    else this.trigger.setAttribute('aria-label', select.getAttribute('aria-label') || select.id);
    if (select.hasAttribute('aria-describedby')) this.trigger.setAttribute('aria-describedby', select.getAttribute('aria-describedby')!);
    this.value.className = 'select-value';
    const icon = document.createElement('span');
    icon.className = 'select-chevron'; icon.innerHTML = svg('m8 10 4 4 4-4');
    this.trigger.append(this.value, icon);
    this.popup.className = 'select-popup';
    this.popup.id = select.id + '-listbox';
    this.popup.setAttribute('role', 'listbox');
    this.popup.setAttribute('aria-labelledby', this.trigger.id);
    this.popup.setAttribute('popover', 'manual');
    select.before(this.wrapper);
    this.wrapper.append(select, this.trigger, this.popup);
    select.hidden = true; select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
    select.dataset.customDropdown = 'true';
    this.trigger.addEventListener('click', () => { if (this.opened) this.close(); else this.open(); });
    this.trigger.addEventListener('keydown', event => this.key(event));
    select.addEventListener('change', () => this.sync());
    // Disabled fields remain in step with saves and setup's busy state.
    new MutationObserver(() => this.sync()).observe(select, { attributes: true, childList: true, subtree: true });
    this.sync();
  }

  sync() {
    this.trigger.disabled = this.select.disabled;
    this.value.textContent = this.select.selectedOptions[0]?.textContent ?? '';
    this.trigger.title = this.select.title;
    const options = [...this.select.options];
    const signature = JSON.stringify(options.map(option => [option.value, option.textContent, option.disabled]));
    if (signature !== this.signature) {
      this.signature = signature;
      this.items = options.map((option, index) => {
        const item = document.createElement('div');
        item.className = 'select-option'; item.id = this.select.id + '-option-' + index;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-disabled', String(option.disabled));
        item.dataset.value = option.value;
        const text = document.createElement('span'); text.textContent = option.textContent;
        const check = document.createElement('span'); check.className = 'select-check'; check.innerHTML = svg('m6 12 4 4 8-8');
        item.append(text, check);
        item.addEventListener('pointermove', () => { if (!option.disabled) this.highlight(index, false); });
        item.addEventListener('pointerdown', event => event.preventDefault());
        item.addEventListener('click', () => this.commit(index));
        return item;
      });
      this.popup.replaceChildren(...this.items);
    }
    this.items.forEach((item, index) => item.setAttribute('aria-selected', String(index === this.select.selectedIndex)));
    if (this.opened && (this.select.disabled || !this.trigger.getClientRects().length)) this.close();
  }

  private highlight(index: number, scroll = true) {
    this.active = index;
    this.items.forEach((item, i) => { item.dataset.highlighted = String(i === index); });
    if (index < 0) this.trigger.removeAttribute('aria-activedescendant');
    else {
      this.trigger.setAttribute('aria-activedescendant', this.items[index]!.id);
      if (scroll) {
        const item = this.items[index]!.getBoundingClientRect();
        const popup = this.popup.getBoundingClientRect();
        if (item.top < popup.top + 4) this.popup.scrollTop -= popup.top + 4 - item.top;
        else if (item.bottom > popup.bottom - 4) this.popup.scrollTop += item.bottom - popup.bottom + 4;
      }
    }
  }

  private open() {
    if (this.select.disabled) return;
    closeDropdowns(); this.sync();
    if (!this.items.length) return;
    this.opened = true;
    this.popup.showPopover();
    this.trigger.setAttribute('aria-expanded', 'true');
    this.position();
    this.highlight(this.select.selectedIndex >= 0 && !this.select.options[this.select.selectedIndex]?.disabled ? this.select.selectedIndex : this.enabled()[0] ?? -1);
  }

  close() {
    if (!this.opened) return;
    this.opened = false; this.popup.hidePopover();
    this.trigger.setAttribute('aria-expanded', 'false');
    this.trigger.removeAttribute('aria-activedescendant');
    this.search = '';
  }

  private position() {
    const rect = this.trigger.getBoundingClientRect();
    this.popup.style.width = Math.min(rect.width, innerWidth - 16) + 'px';
    const bottom = innerHeight - rect.bottom - 12;
    const top = rect.top - 12;
    const below = bottom >= Math.min(280, this.popup.scrollHeight) || bottom >= top;
    this.popup.style.maxHeight = Math.min(280, Math.max(32, below ? bottom : top)) + 'px';
    this.popup.style.left = Math.max(8, Math.min(rect.left, innerWidth - rect.width - 8)) + 'px';
    this.popup.style.top = (below ? rect.bottom + 4 : Math.max(8, rect.top - this.popup.getBoundingClientRect().height - 4)) + 'px';
  }

  outside(target: EventTarget | null) { if (target instanceof Node && !this.wrapper.contains(target)) this.close(); }
  scrolled(target: EventTarget | null) { if (target !== this.popup) this.close(); }
  private enabled() { return [...this.select.options].map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0); }
  private commit(index: number) {
    if (this.select.disabled || !this.select.options[index] || this.select.options[index]!.disabled) return;
    const changed = this.select.selectedIndex !== index;
    this.select.selectedIndex = index;
    this.sync(); this.close(); this.trigger.focus({preventScroll: true});
    if (changed) {
      this.select.dispatchEvent(new Event('input', {bubbles: true}));
      this.select.dispatchEvent(new Event('change', {bubbles: true}));
    }
  }

  private key(event: KeyboardEvent) {
    const {key} = event;
    if (key === 'Tab') { this.close(); return; }
    if (key === 'Escape' && this.opened) { event.preventDefault(); event.stopPropagation(); this.close(); return; }
    if (['ArrowDown','ArrowUp','Home','End'].includes(key)) {
      event.preventDefault();
      if (!this.opened) this.open();
      if (!this.opened) return;
      const enabled = this.enabled();
      if (!enabled.length) return;
      const index = enabled.indexOf(this.active);
      if (key === 'Home') this.highlight(enabled[0]!);
      else if (key === 'End') this.highlight(enabled.at(-1)!);
      else this.highlight(enabled[(index + (key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]!);
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (this.opened) this.commit(this.active); else this.open();
    } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      this.search = now - this.searchedAt > 700 ? key : this.search + key;
      this.searchedAt = now;
      const query = this.search.toLocaleLowerCase();
      const repeated = [...query].every(char => char === query[0]);
      const term = repeated ? query[0]! : query;
      if (!this.opened) this.open();
      const candidates = this.enabled();
      const offset = repeated ? candidates.indexOf(this.active) + 1 : 0;
      const ordered = [...candidates.slice(offset), ...candidates.slice(0, offset)];
      const index = ordered.find(index => this.select.options[index]!.textContent?.trim().toLocaleLowerCase().startsWith(term));
      if (index !== undefined) this.highlight(index);
    }
  }
}

export function syncDropdowns() { instances.forEach(dropdown => dropdown.sync()); }
export function closeDropdowns() { instances.forEach(dropdown => dropdown.close()); }
export function enhanceDropdowns(root: ParentNode = document) {
  for (const select of root.querySelectorAll<HTMLSelectElement>('select:not([data-custom-dropdown])')) instances.add(new Dropdown(select));
}
document.addEventListener('pointerdown', event => instances.forEach(dropdown => dropdown.outside(event.target)));
document.addEventListener('scroll', event => instances.forEach(dropdown => dropdown.scrolled(event.target)), true);
window.addEventListener('resize', closeDropdowns);
window.addEventListener('blur', closeDropdowns);
