// Petits utilitaires DOM sans dépendance.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ICONS = {
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.9L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.9 3.9L20 15"/><path d="M20 20v-5h-5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  save: '<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v6h9V3M7 21v-7h10v7"/>',
};

export function icon(name, cls = 'i') {
  const span = document.createElement('span');
  span.innerHTML = `<svg class="${cls}" viewBox="0 0 24 24">${ICONS[name] ?? ''}</svg>`;
  return span.firstChild;
}

export function toast(message, type = 'info', timeout = 3200) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = h('div', { class: `toast ${type}` }, message);
  box.append(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  }, timeout);
}

export function openModal(build) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const close = (value) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(null);
      }
    };
    const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
    const backdrop = h('div', { class: 'modal-backdrop', onmousedown: (e) => e.target === backdrop && close(null) }, modal);
    build(modal, close);
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey, true);
    (modal.querySelector('input, textarea') ?? modal.querySelector('.btn.primary, .btn.danger'))?.focus();
  });
}

export function promptModal({ title, message, value = '', placeholder = '', confirmLabel = 'Valider' }) {
  return openModal((modal, close) => {
    const input = h('input', { value, placeholder, maxlength: 60 });
    const submit = () => {
      const v = input.value.trim();
      if (v) close(v);
      else input.focus();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      // Sinon, la touche Entrée « clique » aussi sur le bouton qui reprend le focus à la fermeture.
      e.preventDefault();
      submit();
    });
    modal.append(
      h('h3', {}, title),
      message ? h('p', {}, message) : null,
      h('label', { class: 'field' }, input),
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn ghost', onclick: () => close(null) }, 'Annuler'),
        h('button', { class: 'btn primary', onclick: submit }, confirmLabel),
      ),
    );
    setTimeout(() => input.select(), 0);
  });
}

export function confirmModal({ title, message, confirmLabel = 'Confirmer', danger = false }) {
  return openModal((modal, close) => {
    modal.append(
      h('h3', {}, title),
      message ? h('p', {}, message) : null,
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn ghost', onclick: () => close(false) }, 'Annuler'),
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => close(true) }, confirmLabel),
      ),
    );
  }).then(Boolean);
}

// Menu contextuel positionné sous (ou à côté de) un élément ou aux coordonnées d'un clic.
export function openMenu(anchor, items) {
  document.querySelector('.menu')?.remove();
  const menu = h('div', { class: 'menu', role: 'menu' });
  for (const it of items) {
    if (it === '-') menu.append(h('hr'));
    else if (it.title) menu.append(h('div', { class: 'menu-title' }, it.title));
    else
      menu.append(
        h(
          'button',
          {
            class: [it.danger && 'danger', it.on && 'on'].filter(Boolean).join(' '),
            role: 'menuitem',
            onclick: () => {
              close();
              it.run();
            },
          },
          it.icon ? icon(it.icon) : null,
          it.label,
          it.on ? h('span', { style: { marginLeft: 'auto' } }, icon('check')) : null,
        ),
      );
  }
  document.body.append(menu);
  const r = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, bottom: anchor.y, top: anchor.y };
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  menu.style.left = `${Math.min(r.left, innerWidth - mw - 8)}px`;
  menu.style.top = `${r.bottom + 6 + mh > innerHeight ? Math.max(8, r.top - mh - 6) : r.bottom + 6}px`;
  const onDown = (e) => {
    if (!menu.contains(e.target)) close();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  function close() {
    menu.remove();
    document.removeEventListener('mousedown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
  }
  setTimeout(() => {
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
  });
  return close;
}
