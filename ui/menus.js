// Discord-style right-click menus, plus small confirm / prompt dialogs that
// fit the app instead of the browser's own confirm() and prompt().
import { t } from './i18n.js';

const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12.5 10 17.5 19 7"/></svg>';

let menuEl = null;
let menuCleanup = null;

export function closeMenu() {
  menuCleanup?.();
  menuEl?.remove();
  menuEl = null;
  menuCleanup = null;
}

// `items`: { label, action, icon?, desc?, checked?, danger? } or { separator: true };
// falsy entries are skipped. `icon` is trusted markup (one of our own SVGs).
// Opens at (x, y), or with its bottom edge at y when `above` is set.
export function openMenu(items, x, y, { above = false } = {}) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'contextMenu';
  menu.setAttribute('role', 'menu');
  for (const item of items) {
    if (!item) continue;
    if (item.separator) {
      if (menu.lastElementChild && !menu.lastElementChild.classList.contains('menuSep')) {
        menu.appendChild(Object.assign(document.createElement('div'), { className: 'menuSep' }));
      }
      continue;
    }
    const btn = document.createElement('button');
    btn.className = 'menuItem' + (item.danger ? ' danger' : '');
    btn.setAttribute('role', 'menuitem');
    btn.innerHTML = `${item.icon || ''}<span class="menuText"><span class="menuLabel"></span>${item.desc ? '<small></small>' : ''}</span>${item.checked ? `<span class="menuCheck">${CHECK_ICON}</span>` : ''}`;
    btn.querySelector('.menuLabel').textContent = item.label;
    if (item.desc) btn.querySelector('small').textContent = item.desc;
    btn.addEventListener('click', () => { closeMenu(); item.action(); });
    menu.appendChild(btn);
  }
  if (menu.lastElementChild?.classList.contains('menuSep')) menu.lastElementChild.remove();
  document.body.appendChild(menu);
  const { width, height } = menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
  let top = above ? y - height : y;
  if (top + height > window.innerHeight - 8) top = y - height;
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(Math.max(8, top))}px`;
  menuEl = menu;

  const buttons = [...menu.querySelectorAll('.menuItem')];
  const onDown = (e) => { if (!menu.contains(e.target)) closeMenu(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = buttons.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };
  document.addEventListener('mousedown', onDown, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', closeMenu);
  window.addEventListener('resize', closeMenu);
  document.addEventListener('scroll', closeMenu, true);
  menuCleanup = () => {
    document.removeEventListener('mousedown', onDown, true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', closeMenu);
    window.removeEventListener('resize', closeMenu);
    document.removeEventListener('scroll', closeMenu, true);
  };
}

// Resolves true / false.
export function confirmDialog({ title, message = '', confirmLabel, danger = false }) {
  return showDialog({ title, message, confirmLabel, danger, withInput: false });
}

// Resolves the trimmed text, or null if cancelled.
export function promptDialog({ title, message = '', value = '', placeholder = '', confirmLabel, maxLength = 40 }) {
  return showDialog({ title, message, confirmLabel, withInput: true, value, placeholder, maxLength });
}

function showDialog({ title, message, confirmLabel, danger = false, withInput, value = '', placeholder = '', maxLength = 40 }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modalOverlay';
    overlay.innerHTML = `
      <div class="card dialogCard" role="dialog" aria-modal="true">
        <h2></h2>
        ${message ? '<p></p>' : ''}
        ${withInput ? '<input type="text">' : ''}
        <div class="dialogButtons">
          <button class="secondary cancelBtn"></button>
          <button class="okBtn${danger ? ' danger' : ''}"></button>
        </div>
      </div>`;
    overlay.querySelector('h2').textContent = title;
    if (message) overlay.querySelector('p').textContent = message;
    overlay.querySelector('.cancelBtn').textContent = t('menu.cancel');
    overlay.querySelector('.okBtn').textContent = confirmLabel;
    const input = overlay.querySelector('input');
    if (input) Object.assign(input, { value, placeholder, maxLength });

    const finish = (ok) => {
      overlay.remove();
      window.removeEventListener('keydown', onKey, true);
      if (withInput) resolve(ok ? input.value.trim() : null);
      else resolve(ok);
    };
    // Captured first, so Esc closes this and not the settings or whatever is under it.
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true); }
    };
    overlay.querySelector('.cancelBtn').addEventListener('click', () => finish(false));
    overlay.querySelector('.okBtn').addEventListener('click', () => finish(true));
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) finish(false); });
    window.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    if (input) { input.focus(); input.select(); } else overlay.querySelector('.okBtn').focus();
  });
}
