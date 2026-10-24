// Themed stand-in for a native <select>. The open list of a real <select> is
// drawn by the OS (a plain white/grey Windows menu) and can't be styled, so
// this hides the select and shows a button + menu of our own instead. The
// select stays the source of truth: its options are read each time the menu
// opens, picking one sets its value and fires `change` on it, and setting
// .value / .selectedIndex or replacing its options from code updates the
// button — so callers keep using the select exactly as before.

const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12.5 10 17.5 19 7"/></svg>';
const CHEVRON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

let openMenu = null; // { close } of whichever menu is open — only ever one
let nextId = 0;

export function enhanceSelect(select) {
  if (select.dataset.enhanced) return;
  select.dataset.enhanced = '1';

  const wrap = document.createElement('div');
  wrap.className = 'fancySelect';
  select.before(wrap);
  wrap.appendChild(select);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'fancySelectTrigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = `<span class="fancySelectValue"></span><span class="fancySelectChevron">${CHEVRON_ICON}</span>`;
  wrap.appendChild(trigger);
  const valueEl = trigger.querySelector('.fancySelectValue');

  // Clicking the select's <label> should land on the control you can see.
  if (select.id) {
    for (const label of document.querySelectorAll(`label[for="${CSS.escape(select.id)}"]`)) {
      label.addEventListener('click', (e) => { e.preventDefault(); trigger.focus(); });
    }
  }

  const refresh = () => {
    const opt = select.options[select.selectedIndex];
    valueEl.textContent = opt ? opt.textContent : '';
    trigger.title = valueEl.textContent; // long device names get cut off
    trigger.disabled = select.disabled;
  };

  const proto = HTMLSelectElement.prototype;
  for (const prop of ['value', 'selectedIndex']) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    Object.defineProperty(select, prop, {
      configurable: true,
      get() { return desc.get.call(this); },
      set(v) { desc.set.call(this, v); refresh(); },
    });
  }
  new MutationObserver(refresh).observe(select, {
    childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'selected'],
  });
  refresh();

  let menu = null;
  let active = -1;

  const choose = (index) => {
    if (index !== select.selectedIndex) {
      select.selectedIndex = index;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close();
    trigger.focus();
  };

  const setActive = (index) => {
    const items = menu.querySelectorAll('.fancySelectOption');
    if (!items.length) return;
    active = Math.max(0, Math.min(items.length - 1, index));
    items.forEach((el, i) => el.classList.toggle('active', i === active));
    trigger.setAttribute('aria-activedescendant', items[active].id);
    items[active].scrollIntoView({ block: 'nearest' });
  };

  const place = () => {
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    menu.style.minWidth = `${Math.round(rect.width)}px`;
    menu.style.maxWidth = `${Math.max(rect.width, Math.min(320, window.innerWidth - margin * 2))}px`;
    const below = window.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    const want = Math.min(menu.scrollHeight, 260);
    const up = below < want && above > below;
    menu.style.maxHeight = `${Math.max(80, Math.min(260, up ? above - 6 : below - 6))}px`;
    menu.classList.toggle('up', up);
    const width = menu.offsetWidth;
    menu.style.left = `${Math.round(Math.min(rect.left, window.innerWidth - width - margin))}px`;
    menu.style.top = up
      ? `${Math.round(rect.top - menu.offsetHeight - 6)}px`
      : `${Math.round(rect.bottom + 6)}px`;
  };

  const open = () => {
    if (menu || select.disabled) return;
    openMenu?.close();

    menu = document.createElement('div');
    menu.className = 'fancySelectMenu';
    menu.setAttribute('role', 'listbox');
    menu.id = `fancySelectMenu${nextId++}`;
    trigger.setAttribute('aria-controls', menu.id);
    [...select.options].forEach((opt, i) => {
      const item = document.createElement('div');
      item.className = 'fancySelectOption';
      item.id = `${menu.id}-${i}`;
      item.setAttribute('role', 'option');
      const selected = i === select.selectedIndex;
      item.setAttribute('aria-selected', String(selected));
      if (selected) item.classList.add('selected');
      item.innerHTML = `<span class="fancySelectOptionText"></span><span class="fancySelectCheck">${selected ? CHECK_ICON : ''}</span>`;
      item.querySelector('.fancySelectOptionText').textContent = opt.textContent;
      item.title = opt.textContent;
      item.addEventListener('mousemove', () => { if (active !== i) setActive(i); });
      item.addEventListener('click', () => choose(i));
      menu.appendChild(item);
    });
    // Lives on <body> so the settings card's overflow can't clip it — and
    // stops its clicks here so the popover it opened from (screen share)
    // doesn't take them as a click outside and close.
    menu.addEventListener('click', (e) => e.stopPropagation());
    menu.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus on the trigger
    document.body.appendChild(menu);

    wrap.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    place();
    setActive(select.selectedIndex);
    openMenu = { close };

    document.addEventListener('mousedown', onOutside, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    document.addEventListener('scroll', onScroll, true);
  };

  function close() {
    if (!menu) return;
    menu.remove();
    menu = null;
    active = -1;
    wrap.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    if (openMenu?.close === close) openMenu = null;
    document.removeEventListener('mousedown', onOutside, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('blur', close);
    document.removeEventListener('scroll', onScroll, true);
  }

  function onOutside(e) {
    if (menu.contains(e.target) || trigger.contains(e.target)) return;
    close();
  }
  function onScroll(e) {
    if (menu && !menu.contains(e.target)) close();
  }

  trigger.addEventListener('click', () => (menu ? close() : open()));
  trigger.addEventListener('blur', close);
  trigger.addEventListener('keydown', (e) => {
    const last = select.options.length - 1;
    if (!menu) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive(active + 1); break;
      case 'ArrowUp': e.preventDefault(); setActive(active - 1); break;
      case 'Home': e.preventDefault(); setActive(0); break;
      case 'End': e.preventDefault(); setActive(last); break;
      case 'Enter': case ' ': e.preventDefault(); if (active >= 0) choose(active); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break;
      case 'Tab': close(); break;
    }
  });
}
