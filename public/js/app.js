import { KEY_GROUPS, MODIFIERS, MEDIA_ACTIONS, keyFromEvent, keyLabel } from '/shared/keys.js';
import { api, clientId, subscribe } from './api.js';
import { h, icon, toast, promptModal, confirmModal, openMenu } from './dom.js';
import {
  ACTION_TYPES, STEP_TYPES, DELAY_TYPE, LIBRARY, COLORS, EMOJIS,
  libraryItemInfo, createFromLibrary, keyFace, isMac,
} from './catalog.js';

const $ = (id) => document.getElementById(id);
const clone = (v) => JSON.parse(JSON.stringify(v));
const uid = () => Math.random().toString(36).slice(2, 10);

const FALLBACK_LAYOUTS = { standard: { rows: 3, cols: 5, label: 'Standard — 15 touches' } };

const state = {
  config: null,
  revision: 0,
  status: null,
  profileId: null,
  pageId: null,
  selected: null,
  clipboard: null,
  windows: [],
  iconTab: 'emoji',
  connected: false,
};

// ---------------------------------------------------------------------------
// Accès aux données
// ---------------------------------------------------------------------------
const profile = () => state.config.profiles.find((p) => p.id === state.profileId) ?? state.config.profiles[0];
const page = () => profile().pages.find((p) => p.id === state.pageId) ?? profile().pages[0];
const keyAt = (i) => page().keys[i] ?? null;
const layout = () => (state.status?.layouts ?? FALLBACK_LAYOUTS)[state.config.layout] ?? { rows: 3, cols: 5 };
const slotCount = () => layout().rows * layout().cols;

function ensureSelection() {
  if (!state.config.profiles.some((p) => p.id === state.profileId)) state.profileId = state.config.activeProfileId;
  if (!profile().pages.some((p) => p.id === state.pageId)) state.pageId = profile().pages[0].id;
  if (state.selected !== null && state.selected >= slotCount()) state.selected = null;
}

// ---------------------------------------------------------------------------
// Historique (annuler / rétablir) et sauvegarde
// ---------------------------------------------------------------------------
const history = { past: [], future: [], lastTag: null, lastTime: 0 };
let saveTimer = null;
let dirty = false;

/**
 * Applique une modification à la configuration.
 * `tag` regroupe les frappes successives d'un même champ en une seule entrée d'historique.
 * `render` : 'all' (tout), 'key' (grille + aperçu, sans toucher aux champs en cours d'édition).
 */
function commit(mutate, { tag = null, render = 'all' } = {}) {
  const now = Date.now();
  const merge = tag && tag === history.lastTag && now - history.lastTime < 1200;
  if (!merge) {
    history.past.push(JSON.stringify(state.config));
    if (history.past.length > 100) history.past.shift();
  }
  history.future = [];
  history.lastTag = tag;
  history.lastTime = now;
  mutate(state.config);
  ensureSelection();
  scheduleSave();
  if (render === 'key') refreshKeyViews();
  else renderAll();
  updateUndoButtons();
}

function undo() {
  if (!history.past.length) return;
  history.future.push(JSON.stringify(state.config));
  state.config = JSON.parse(history.past.pop());
  history.lastTag = null;
  ensureSelection();
  scheduleSave();
  renderAll();
  updateUndoButtons();
}

function redo() {
  if (!history.future.length) return;
  history.past.push(JSON.stringify(state.config));
  state.config = JSON.parse(history.future.pop());
  history.lastTag = null;
  ensureSelection();
  scheduleSave();
  renderAll();
  updateUndoButtons();
}

function updateUndoButtons() {
  $('undoBtn').disabled = !history.past.length;
  $('redoBtn').disabled = !history.future.length;
}

function setSaveState(s, text) {
  const el = $('saveState');
  el.dataset.state = s;
  el.textContent = text;
}

function scheduleSave() {
  dirty = true;
  setSaveState('saving', 'Enregistrement…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const snapshot = state.config;
    try {
      const res = await api.saveConfig(snapshot);
      state.revision = res.revision;
      if (snapshot === state.config) dirty = false;
      setSaveState('saved', 'Enregistré');
    } catch (e) {
      setSaveState('error', 'Échec de l’enregistrement');
      toast(e.message, 'err', 5000);
    }
  }, 350);
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------
function renderAll() {
  renderProfile();
  renderTabs();
  renderLayoutSelect();
  renderGrid();
  renderInspector();
}

function refreshKeyViews() {
  renderGrid();
  renderTabs();
  const hero = document.querySelector('.insp-hero');
  if (hero && state.selected !== null) hero.replaceWith(buildHero(state.selected));
}

function renderProfile() {
  $('profileName').textContent = profile().name;
}

function renderLayoutSelect() {
  const sel = $('layoutSelect');
  const layouts = state.status?.layouts ?? FALLBACK_LAYOUTS;
  sel.replaceChildren(
    ...Object.entries(layouts).map(([id, l]) => h('option', { value: id, selected: id === state.config.layout }, l.label)),
  );
}

function renderTabs() {
  const nav = $('pageTabs');
  const pages = profile().pages;
  nav.replaceChildren(
    ...pages.map((pg, idx) => {
      const count = Object.keys(pg.keys).filter((k) => Number(k) < slotCount()).length;
      const tab = h(
        'button',
        {
          class: `page-tab${pg.id === page().id ? ' on' : ''}`,
          title: 'Double-clic pour renommer · clic droit pour plus d’options',
          onclick: () => {
            state.pageId = pg.id;
            state.selected = null;
            renderAll();
          },
          ondblclick: () => renamePage(pg.id),
          oncontextmenu: (e) => {
            e.preventDefault();
            pageMenu(e.currentTarget, pg.id, idx);
          },
        },
        pg.name,
        h('span', { class: 'count' }, count || ''),
      );
      // Déposer une touche sur un onglet la déplace vers cette page.
      tab.addEventListener('dragover', (e) => {
        if (!e.dataTransfer.types.includes('application/x-deck-key') || pg.id === page().id) return;
        e.preventDefault();
        tab.classList.add('drop-target');
      });
      tab.addEventListener('dragleave', () => tab.classList.remove('drop-target'));
      tab.addEventListener('drop', (e) => {
        tab.classList.remove('drop-target');
        const from = e.dataTransfer.getData('application/x-deck-key');
        if (from === '') return;
        e.preventDefault();
        moveKeyToPage(Number(from), pg.id);
      });
      return tab;
    }),
    h('button', { class: 'page-tab add', title: 'Ajouter une page', onclick: addPage }, icon('plus')),
  );
}

function renderGrid() {
  const { rows, cols } = layout();
  const device = $('device');
  device.style.setProperty('--cols', cols);
  device.style.setProperty('--rows', rows);
  const grid = $('grid');
  const slots = [];
  for (let i = 0; i < rows * cols; i++) slots.push(buildSlot(i));
  grid.replaceChildren(...slots);
}

function buildSlot(i) {
  const key = keyAt(i);
  const slot = h(
    'button',
    {
      class: `slot${state.selected === i ? ' selected' : ''}`,
      dataset: { index: i },
      draggable: key ? 'true' : 'false',
      'aria-label': key ? `Touche ${i + 1} : ${key.title || ACTION_TYPES[key.action?.type]?.long || ''}` : `Touche ${i + 1} vide`,
      onclick: () => select(i),
      oncontextmenu: (e) => {
        e.preventDefault();
        select(i);
        keyMenu({ x: e.clientX, y: e.clientY }, i);
      },
    },
    keyFace(key),
  );
  if (!key) slot.append(h('span', { class: 'plus' }, icon('plus')));
  else if (key.action?.type === 'page') slot.append(h('span', { class: 'badge' }, icon('folder')));
  else if (key.action?.type === 'multi') slot.append(h('span', { class: 'badge' }, icon('layers')));

  slot.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/x-deck-key', String(i));
    e.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => slot.classList.add('dragging'));
  });
  slot.addEventListener('dragend', () => slot.classList.remove('dragging'));
  slot.addEventListener('dragover', (e) => {
    const t = e.dataTransfer.types;
    if (!t.includes('application/x-deck-key') && !t.includes('application/x-deck-action')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = t.includes('application/x-deck-key') ? 'move' : 'copy';
    slot.classList.add('drop');
  });
  slot.addEventListener('dragleave', () => slot.classList.remove('drop'));
  slot.addEventListener('drop', (e) => {
    slot.classList.remove('drop');
    e.preventDefault();
    const from = e.dataTransfer.getData('application/x-deck-key');
    const lib = e.dataTransfer.getData('application/x-deck-action');
    if (from !== '') swapKeys(Number(from), i);
    else if (lib) assignLibrary(JSON.parse(lib), i);
  });
  return slot;
}

function renderLibrary() {
  const q = $('librarySearch').value.trim().toLowerCase();
  const list = $('libraryList');
  const groups = LIBRARY.map((g) => ({
    group: g.group,
    items: g.items.filter((it) => {
      const info = libraryItemInfo(it);
      return !q || `${info.label} ${info.desc} ${g.group}`.toLowerCase().includes(q);
    }),
  })).filter((g) => g.items.length);

  if (!groups.length) {
    list.replaceChildren(h('div', { class: 'library-empty' }, 'Aucune action ne correspond.'));
    return;
  }
  list.replaceChildren(
    ...groups.map((g) =>
      h(
        'div',
        { class: 'lib-group' },
        h('h3', {}, g.group),
        ...g.items.map((it) => {
          const info = libraryItemInfo(it);
          const el = h(
            'button',
            {
              class: 'lib-item',
              draggable: 'true',
              title: 'Glissez sur une touche, ou cliquez pour l’appliquer à la touche sélectionnée',
              onclick: () => {
                if (state.selected === null) {
                  const free = firstFreeSlot();
                  if (free === null) return toast('Aucune touche libre sur cette page.', 'err');
                  assignLibrary(it, free);
                } else assignLibrary(it, state.selected);
              },
            },
            h('span', { class: 'lib-icon', style: { '--c': info.color } }, info.icon),
            h('span', {}, h('strong', {}, info.label), h('small', {}, info.desc)),
          );
          el.querySelector('.lib-icon').style.setProperty('--c', info.color);
          el.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('application/x-deck-action', JSON.stringify(it));
            e.dataTransfer.effectAllowed = 'copy';
          });
          return el;
        }),
      ),
    ),
  );
}

function renderStatus() {
  const pill = $('statusPill');
  const label = pill.querySelector('span');
  const s = state.status;
  if (!state.connected || !s) {
    pill.dataset.state = 'err';
    label.textContent = 'Serveur déconnecté';
    pill.title = 'Impossible de joindre le serveur StreamDeck.';
    return;
  }
  const ex = s.executorStatus;
  if (s.dryRun || ex.simulated) {
    pill.dataset.state = 'warn';
    label.textContent = 'Mode simulation';
    pill.title = 'Les actions sont journalisées sans être envoyées.';
  } else if (ex.ok) {
    pill.dataset.state = 'ok';
    label.textContent = s.executor;
    pill.title = 'Prêt à envoyer les touches.';
  } else {
    pill.dataset.state = 'err';
    label.textContent = 'Envoi indisponible';
    pill.title = ex.reason;
  }
}

// ---------------------------------------------------------------------------
// Inspecteur
// ---------------------------------------------------------------------------
function renderInspector() {
  const box = $('inspector');
  const i = state.selected;
  if (i === null) {
    box.replaceChildren(buildEmptyInspector());
    return;
  }
  const key = keyAt(i);
  if (!key) {
    box.replaceChildren(
      buildHero(i),
      h(
        'div',
        { class: 'section' },
        h('div', { class: 'section-head' }, h('h4', {}, 'Choisir une action')),
        typeGrid(null, (type) => assignLibrary({ type }, i)),
        h('p', { class: 'hint', style: { margin: 0, fontSize: '12px', color: 'var(--faint)' } },
          'Astuce : vous pouvez aussi glisser une action depuis le panneau de gauche.'),
      ),
    );
    return;
  }
  const getAction = () => keyAt(i).action;
  const parts = [
    buildHero(i),
    section(
      'Action',
      typeGrid(key.action?.type, (type) => changeType(i, type)),
      ...actionFields(getAction, `k${i}`),
    ),
    ['hotkey', 'text'].includes(key.action?.type) ? targetSection(getAction, `k${i}`) : null,
    appearanceSection(i),
  ];
  box.replaceChildren(...parts.filter(Boolean));
}

function section(title, ...children) {
  return h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h4', {}, title)), ...children);
}

function buildEmptyInspector() {
  const port = state.status?.port ?? location.port;
  const addrs = (state.status?.addresses ?? []).map((a) => `${a}:${port}`);
  return h(
    'div',
    { class: 'insp-empty' },
    h('div', { class: 'ghost-key' }, icon('plus')),
    h('h3', {}, 'Aucune touche sélectionnée'),
    h('p', {}, 'Cliquez sur une touche pour la configurer, ou glissez une action depuis la bibliothèque.'),
    h(
      'div',
      { class: 'connect-card' },
      h('h4', {}, 'Connecter un téléphone Android'),
      h('p', {}, 'Ouvrez l’application StreamDeck sur le téléphone, connecté au même Wi-Fi : ce PC apparaît automatiquement. Sinon, saisissez l’adresse :'),
      ...(addrs.length ? addrs : [location.host]).map((u) =>
        h(
          'code',
          {},
          u,
          h(
            'button',
            {
              title: 'Copier',
              onclick: () => navigator.clipboard?.writeText(u).then(() => toast('Adresse copiée', 'ok')),
            },
            icon('copy'),
          ),
        ),
      ),
      h('p', { style: { marginTop: '10px' } }, 'Depuis un navigateur (tablette, autre PC) : ', h('b', {}, `http://${addrs[0] ?? location.host}/deck`)),
    ),
    state.status && !state.status.executorStatus.ok
      ? h('div', { class: 'note', style: { marginTop: '12px', textAlign: 'left' } }, icon('alert'), h('span', {}, state.status.executorStatus.reason))
      : null,
  );
}

function buildHero(i) {
  const key = keyAt(i);
  const t = ACTION_TYPES[key?.action?.type];
  return h(
    'div',
    { class: 'insp-hero' },
    keyFace(key),
    h(
      'div',
      { class: 'insp-hero-info' },
      h('span', { class: 'kind' }, key ? t?.long ?? 'Action' : `Touche ${i + 1}`),
      h('span', { class: 'summary' }, key ? t?.summary(key.action, { pages: profile().pages }) ?? '' : 'Touche vide'),
      key
        ? h(
            'div',
            { class: 'insp-hero-actions' },
            h('button', { class: 'btn small primary', onclick: () => testKey(i) }, icon('play'), 'Tester'),
            h('button', { class: 'btn small icon-only', title: 'Copier (Ctrl+C)', onclick: () => copyKey(i) }, icon('copy')),
            h('button', { class: 'btn small icon-only danger', title: 'Effacer (Suppr)', onclick: () => clearKey(i) }, icon('trash')),
          )
        : null,
    ),
  );
}

function typeGrid(current, onPick) {
  return h(
    'div',
    { class: 'type-grid' },
    ...Object.entries(ACTION_TYPES).map(([id, t]) =>
      h('button', { class: id === current ? 'on' : '', onclick: () => id !== current && onPick(id) }, h('span', {}, t.icon), t.label),
    ),
  );
}

// Champ texte relié à une propriété de l'action.
function textField(getAction, prop, label, { tag, placeholder = '', mono = false, multiline = false, hint, type = 'text' } = {}) {
  const attrs = {
    value: getAction()[prop] ?? '',
    placeholder,
    class: mono ? 'mono' : '',
    spellcheck: mono ? 'false' : undefined,
    oninput: (e) =>
      commit(() => {
        getAction()[prop] = type === 'number' ? Number(e.target.value) : e.target.value;
      }, { tag: `${tag}:${prop}`, render: 'key' }),
  };
  const input = multiline ? h('textarea', { ...attrs, rows: 4 }) : h('input', { ...attrs, type });
  if (multiline) input.value = getAction()[prop] ?? '';
  return h('label', { class: 'field' }, h('span', {}, label), input, hint ? h('span', { class: 'hint' }, hint) : null);
}

function actionFields(getAction, tag) {
  const a = getAction();
  switch (a.type) {
    case 'hotkey':
      return [hotkeyEditor(getAction, tag)];
    case 'text':
      return [
        textField(getAction, 'text', 'Texte à saisir', { tag, multiline: true, placeholder: 'Bonjour,\nCordialement…' }),
        h(
          'label',
          { class: 'switch' },
          h('input', {
            type: 'checkbox',
            checked: !!a.submit,
            onchange: (e) => commit(() => (getAction().submit = e.target.checked), { render: 'key' }),
          }),
          'Appuyer sur Entrée après la saisie',
        ),
      ];
    case 'media':
      return [
        h(
          'label',
          { class: 'field' },
          h('span', {}, 'Commande'),
          h(
            'select',
            { onchange: (e) => commit(() => (getAction().media = e.target.value), { render: 'key' }) },
            ...MEDIA_ACTIONS.map((m) => h('option', { value: m.id, selected: m.id === a.media }, m.label)),
          ),
        ),
      ];
    case 'launch': {
      const win = state.status?.platform === 'win32';
      const mac = state.status?.platform === 'darwin';
      return [
        textField(getAction, 'path', 'Programme, fichier ou raccourci', {
          tag,
          mono: true,
          placeholder: win ? 'C:\\Program Files\\OBS Studio\\bin\\64bit\\obs64.exe' : mac ? 'Spotify' : '/usr/bin/firefox',
          hint: mac ? 'Nom d’une application (ex. « Spotify ») ou chemin complet.' : 'Chemin complet vers l’exécutable, un document ou un raccourci.',
        }),
        textField(getAction, 'args', 'Arguments', { tag, mono: true, placeholder: '--minimize' }),
        mac ? null : textField(getAction, 'cwd', 'Dossier de travail (facultatif)', { tag, mono: true }),
      ];
    }
    case 'url':
      return [textField(getAction, 'url', 'Adresse', { tag, placeholder: 'https://www.youtube.com', type: 'url' })];
    case 'command':
      return [
        textField(getAction, 'command', 'Commande', { tag, mono: true, multiline: true, placeholder: 'echo Bonjour' }),
        textField(getAction, 'cwd', 'Dossier de travail (facultatif)', { tag, mono: true }),
        h(
          'div',
          { class: 'note' },
          icon('alert'),
          h('span', {}, 'La commande est exécutée par le serveur avec vos droits d’utilisateur. N’y collez que des commandes que vous comprenez.'),
        ),
      ];
    case 'page': {
      const pages = profile().pages;
      return [
        h(
          'label',
          { class: 'field' },
          h('span', {}, 'Page de destination'),
          h(
            'select',
            { onchange: (e) => commit(() => (getAction().pageId = e.target.value), { render: 'key' }) },
            h('option', { value: '', disabled: true, selected: !a.pageId }, 'Choisir une page…'),
            h('option', { value: '@next', selected: a.pageId === '@next' }, '→ Page suivante'),
            h('option', { value: '@prev', selected: a.pageId === '@prev' }, '← Page précédente'),
            h(
              'optgroup',
              { label: 'Pages du profil' },
              ...pages.map((p) => h('option', { value: p.id, selected: p.id === a.pageId }, p.name)),
            ),
          ),
        ),
        h(
          'button',
          {
            class: 'btn small',
            onclick: async () => {
              const name = await promptModal({ title: 'Nouvelle page', value: `Page ${pages.length + 1}` });
              if (!name) return;
              const id = uid();
              commit(() => {
                profile().pages.push({ id, name, keys: {} });
                getAction().pageId = id;
              });
            },
          },
          icon('plus'),
          'Créer une nouvelle page',
        ),
      ];
    }
    case 'multi':
      return [multiEditor(getAction, tag)];
    case 'delay':
      return [textField(getAction, 'ms', 'Durée (millisecondes)', { tag, type: 'number', placeholder: '300' })];
    default:
      return [];
  }
}

function hotkeyEditor(getAction, tag) {
  const wrap = h('div', { class: 'field' });
  const recorder = h('div', { class: 'recorder', tabindex: '0', role: 'button', 'aria-label': 'Enregistrer un raccourci' });
  let listening = false;

  const paint = () => {
    const hk = getAction().hotkey ?? { modifiers: [], key: '' };
    recorder.classList.toggle('listening', listening);
    if (listening) {
      recorder.replaceChildren(h('span', { class: 'placeholder' }, 'Appuyez sur la combinaison… (Échap pour annuler)'));
      return;
    }
    const parts = [
      ...MODIFIERS.filter((m) => hk.modifiers?.includes(m.id)).map((m) => (isMac ? m.mac : m.id === 'meta' ? 'Win' : m.label)),
      hk.key ? keyLabel(hk.key) : null,
    ].filter(Boolean);
    if (!parts.length) {
      recorder.replaceChildren(h('span', { class: 'placeholder' }, 'Cliquez ici puis appuyez sur le raccourci'));
      return;
    }
    const nodes = [];
    parts.forEach((p, idx) => {
      if (idx) nodes.push(h('span', { class: 'plus-sep' }, '+'));
      nodes.push(h('span', { class: 'cap' }, p));
    });
    recorder.replaceChildren(...nodes);
  };

  const setHotkey = (hk) => {
    commit(() => (getAction().hotkey = hk), { render: 'key' });
    syncManual();
    paint();
  };

  recorder.addEventListener('click', () => {
    listening = true;
    recorder.focus();
    paint();
  });
  recorder.addEventListener('blur', () => {
    listening = false;
    paint();
  });
  recorder.addEventListener('keydown', (e) => {
    if (!listening) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        listening = true;
        paint();
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const mods = [e.ctrlKey && 'ctrl', e.shiftKey && 'shift', e.altKey && 'alt', e.metaKey && 'meta'].filter(Boolean);
    if (e.key === 'Escape' && !mods.length) {
      listening = false;
      paint();
      return;
    }
    const key = keyFromEvent(e);
    if (!key) return; // seulement un modificateur : on attend la touche principale
    listening = false;
    setHotkey({ modifiers: mods, key });
  });

  // Édition manuelle (utile pour les raccourcis capturés par le système, ex. Ctrl+W, Win+…)
  const chips = h('div', { class: 'mod-chips' });
  const keySelect = h(
    'select',
    {
      onchange: (e) => {
        const hk = clone(getAction().hotkey ?? { modifiers: [] });
        hk.key = e.target.value;
        setHotkey(hk);
      },
    },
    h('option', { value: '' }, 'Touche…'),
    ...KEY_GROUPS.map((g) => h('optgroup', { label: g.label }, ...g.keys.map((k) => h('option', { value: k.id }, k.label)))),
  );
  function syncManual() {
    const hk = getAction().hotkey ?? { modifiers: [], key: '' };
    chips.replaceChildren(
      ...MODIFIERS.map((m) =>
        h(
          'button',
          {
            class: hk.modifiers?.includes(m.id) ? 'on' : '',
            onclick: () => {
              const next = clone(getAction().hotkey ?? { modifiers: [], key: '' });
              next.modifiers = next.modifiers?.includes(m.id)
                ? next.modifiers.filter((x) => x !== m.id)
                : [...(next.modifiers ?? []), m.id];
              setHotkey(next);
            },
          },
          isMac ? `${m.mac} ${m.label}` : m.label,
        ),
      ),
    );
    keySelect.value = hk.key || '';
  }
  syncManual();
  paint();

  wrap.append(
    h('span', {}, 'Raccourci'),
    recorder,
    h('span', { class: 'field-label', style: { marginTop: '6px' } }, 'Ou composez-le manuellement'),
    chips,
    keySelect,
    h('label', { class: 'field', style: { marginTop: '6px' } }, h('span', {}, 'Répéter'),
      h('input', {
        type: 'number', min: 1, max: 50, value: getAction().repeat ?? 1,
        oninput: (e) => commit(() => (getAction().repeat = Math.max(1, Number(e.target.value) || 1)), { tag: `${tag}:repeat`, render: 'key' }),
      })),
  );
  return wrap;
}

function targetSection(getAction, tag) {
  const a = getAction();
  const target = a.target ?? { by: 'none', value: '' };
  const listId = 'windowsList';
  let datalist = document.getElementById(listId);
  if (!datalist) {
    datalist = h('datalist', { id: listId });
    document.body.append(datalist);
  }
  const fillList = () => {
    const by = getAction().target?.by;
    const values = [...new Set(state.windows.map((w) => (by === 'title' ? w.title : w.process)).filter(Boolean))];
    datalist.replaceChildren(...values.map((v) => h('option', { value: v })));
  };

  const setTarget = (patch, opts) =>
    commit(() => {
      getAction().target = { ...(getAction().target ?? { by: 'none', value: '' }), ...patch };
    }, opts);

  const modes = [
    ['none', 'Fenêtre active'],
    ['process', 'Application'],
    ['title', 'Titre'],
  ];
  const content = [
    h(
      'div',
      { class: 'segmented' },
      ...modes.map(([id, label]) =>
        h('button', { class: target.by === id ? 'on' : '', onclick: () => setTarget({ by: id }) }, label),
      ),
    ),
  ];

  if (target.by === 'none') {
    content.push(
      h('div', { class: 'note info' }, icon('info'),
        h('span', {}, 'Les touches sont envoyées à la fenêtre qui a le focus au moment de l’appui. Choisissez une application pour la mettre automatiquement au premier plan avant l’envoi.')),
    );
  } else {
    const input = h('input', {
      value: target.value ?? '',
      list: listId,
      placeholder: target.by === 'title' ? 'ex. : OBS, Discord, Visual Studio Code' : state.status?.platform === 'darwin' ? 'ex. : Spotify' : 'ex. : obs64, chrome, spotify',
      oninput: (e) => setTarget({ value: e.target.value }, { tag: `${tag}:target`, render: 'key' }),
      onfocus: fillList,
    });
    const refresh = h(
      'button',
      {
        class: 'btn icon-only',
        title: 'Actualiser la liste des applications ouvertes',
        onclick: async () => {
          try {
            state.windows = (await api.windows()).windows;
            fillList();
            toast(`${state.windows.length} fenêtre(s) détectée(s)`, 'ok');
            input.focus();
          } catch (e) {
            toast(e.message, 'err');
          }
        },
      },
      icon('refresh'),
    );
    content.push(
      h(
        'label',
        { class: 'field' },
        h('span', {}, target.by === 'title' ? 'Le titre de la fenêtre contient' : 'Nom du processus / de l’application'),
        h('div', { class: 'input-with-btn' }, input, refresh),
        h('span', { class: 'hint' }, 'L’application est mise au premier plan, puis les touches lui sont envoyées.'),
      ),
    );
  }
  return section('Logiciel cible', ...content);
}

function multiEditor(getAction, tag) {
  const steps = () => getAction().steps ?? (getAction().steps = []);
  const list = h('div', { class: 'steps' });
  const typeInfo = (t) => (t === 'delay' ? DELAY_TYPE : ACTION_TYPES[t]);

  const move = (j, d) =>
    commit(() => {
      const s = steps();
      [s[j], s[j + d]] = [s[j + d], s[j]];
    });

  steps().forEach((step, j) => {
    const getStep = () => steps()[j];
    list.append(
      h(
        'div',
        { class: 'step' },
        h(
          'div',
          { class: 'step-head' },
          h('span', { class: 'num' }, j + 1),
          h(
            'select',
            {
              onchange: (e) =>
                commit(() => {
                  const t = e.target.value;
                  steps()[j] = typeInfo(t).create();
                }),
            },
            ...STEP_TYPES.map((t) => h('option', { value: t, selected: t === step.type }, `${typeInfo(t).icon}  ${typeInfo(t).long}`)),
          ),
          h('button', { class: 'btn ghost small icon-only', title: 'Monter', disabled: j === 0, onclick: () => move(j, -1) }, icon('up')),
          h('button', { class: 'btn ghost small icon-only', title: 'Descendre', disabled: j === steps().length - 1, onclick: () => move(j, 1) }, icon('down')),
          h('button', { class: 'btn ghost small icon-only danger', title: 'Supprimer l’étape', onclick: () => commit(() => steps().splice(j, 1)) }, icon('x')),
        ),
        h(
          'div',
          { class: 'step-body' },
          ...actionFields(getStep, `${tag}:s${j}`),
          ['hotkey', 'text'].includes(step.type) ? compactTarget(getStep, `${tag}:s${j}`) : null,
        ),
      ),
    );
  });

  const add = h(
    'button',
    {
      class: 'btn small',
      onclick: (e) =>
        openMenu(
          e.currentTarget,
          STEP_TYPES.map((t) => ({
            label: `${typeInfo(t).icon}  ${typeInfo(t).long}`,
            run: () => commit(() => steps().push(typeInfo(t).create())),
          })),
        ),
    },
    icon('plus'),
    'Ajouter une étape',
  );

  if (!steps().length) {
    list.append(h('div', { class: 'note info' }, icon('info'), h('span', {}, 'Ajoutez des étapes : elles seront exécutées dans l’ordre, par exemple « Raccourci », « Pause », puis « Texte ».')));
  }
  return h('div', { class: 'field' }, list, add);
}

function compactTarget(getAction, tag) {
  const t = getAction().target ?? { by: 'none', value: '' };
  return h(
    'label',
    { class: 'field' },
    h('span', {}, 'Application cible (facultatif)'),
    h('input', {
      value: t.by === 'process' ? t.value : '',
      placeholder: 'Fenêtre active',
      list: 'windowsList',
      oninput: (e) =>
        commit(() => {
          const v = e.target.value;
          getAction().target = v ? { by: 'process', value: v } : { by: 'none', value: '' };
        }, { tag: `${tag}:target`, render: 'key' }),
    }),
  );
}

function appearanceSection(i) {
  const key = keyAt(i);
  const setFace = (patch, opts = { render: 'key' }) => commit(() => Object.assign(keyAt(i), patch), opts);
  const isImage = key.icon?.startsWith('data:');
  if (isImage) state.iconTab = 'image';

  const titleInput = h('input', {
    value: key.title ?? '',
    maxlength: 40,
    placeholder: 'Titre de la touche',
    oninput: (e) => setFace({ title: e.target.value }, { tag: `k${i}:title`, render: 'key' }),
  });

  const emojiPanel = () => {
    const custom = h('input', {
      value: !isImage ? key.icon ?? '' : '',
      maxlength: 8,
      placeholder: 'Ou tapez un emoji / 1-2 caractères',
      oninput: (e) => setFace({ icon: e.target.value }, { tag: `k${i}:icon`, render: 'key' }),
    });
    return [
      h(
        'div',
        { class: 'emoji-grid' },
        ...EMOJIS.map((em) =>
          h('button', {
            class: em === key.icon ? 'on' : '',
            title: em,
            onclick: () => {
              setFace({ icon: em }, { render: 'all' });
            },
          }, em),
        ),
      ),
      h('div', { class: 'row' }, h('label', { class: 'field' }, custom),
        h('button', { class: 'btn', style: { flex: 'none' }, onclick: () => setFace({ icon: '' }, { render: 'all' }) }, 'Aucune')),
    ];
  };

  const imagePanel = () => {
    const input = h('input', { type: 'file', accept: 'image/*', hidden: true });
    const drop = h(
      'div',
      { class: 'image-drop', onclick: () => input.click() },
      isImage ? h('img', { src: key.icon, alt: '' }) : h('span', { class: 'ph' }, icon('image')),
      h('span', {}, isImage ? 'Cliquez ou déposez une image pour la remplacer' : 'Cliquez ou déposez une image (PNG, JPG, SVG, GIF)'),
    );
    const load = async (file) => {
      if (!file || !file.type.startsWith('image/')) return toast('Ce fichier n’est pas une image.', 'err');
      try {
        setFace({ icon: await resizeImage(file) }, { render: 'all' });
      } catch {
        toast('Impossible de lire cette image.', 'err');
      }
    };
    input.addEventListener('change', () => load(input.files[0]));
    drop.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      drop.classList.add('over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      load(e.dataTransfer.files[0]);
    });
    return [
      drop,
      input,
      isImage ? h('button', { class: 'btn small danger', onclick: () => setFace({ icon: '' }, { render: 'all' }) }, icon('trash'), 'Retirer l’image') : null,
    ];
  };

  const colorIsCustom = !COLORS.includes(key.color);
  return section(
    'Apparence',
    h('label', { class: 'field' }, h('span', {}, 'Titre'), titleInput),
    h(
      'label',
      { class: 'switch' },
      h('input', {
        type: 'checkbox',
        checked: key.showTitle !== false,
        onchange: (e) => setFace({ showTitle: e.target.checked }),
      }),
      'Afficher le titre sur la touche',
    ),
    h(
      'div',
      { class: 'field' },
      h('span', {}, 'Icône'),
      h(
        'div',
        { class: 'segmented' },
        h('button', { class: state.iconTab === 'emoji' ? 'on' : '', onclick: () => { state.iconTab = 'emoji'; renderInspector(); } }, 'Emoji'),
        h('button', { class: state.iconTab === 'image' ? 'on' : '', onclick: () => { state.iconTab = 'image'; renderInspector(); } }, 'Image'),
      ),
      ...(state.iconTab === 'image' ? imagePanel() : emojiPanel()),
    ),
    h(
      'div',
      { class: 'field' },
      h('span', {}, 'Couleur de fond'),
      h(
        'div',
        { class: 'swatches' },
        ...COLORS.map((c) =>
          h('button', {
            class: `swatch${key.color === c ? ' on' : ''}`,
            style: { background: c },
            title: c,
            onclick: () => setFace({ color: c }, { render: 'all' }),
          }),
        ),
        h(
          'label',
          { class: `swatch-custom${colorIsCustom ? ' swatch on' : ''}`, title: 'Couleur personnalisée' },
          h('input', {
            type: 'color',
            value: /^#[0-9a-f]{6}$/i.test(key.color ?? '') ? key.color : '#4f46e5',
            oninput: (e) => setFace({ color: e.target.value }, { tag: `k${i}:color`, render: 'key' }),
          }),
        ),
      ),
    ),
  );
}

// Redimensionne une image en 144×144 (recadrage centré) pour garder une configuration légère.
function resizeImage(file, size = 144) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      const s = Math.min(img.naturalWidth, img.naturalHeight) || size;
      const sx = ((img.naturalWidth || size) - s) / 2;
      const sy = ((img.naturalHeight || size) - s) / 2;
      ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image'));
    };
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Opérations sur les touches
// ---------------------------------------------------------------------------
function select(i) {
  if (state.selected === i) return;
  state.selected = i;
  state.iconTab = keyAt(i)?.icon?.startsWith('data:') ? 'image' : 'emoji';
  renderGrid();
  renderInspector();
}

function firstFreeSlot() {
  for (let i = 0; i < slotCount(); i++) if (!keyAt(i)) return i;
  return null;
}

function assignLibrary(item, i) {
  const { action, face } = createFromLibrary(item);
  commit(() => {
    const existing = page().keys[i];
    // Une touche existante garde son apparence personnalisée ; seule l'action change.
    page().keys[i] = existing ? { ...existing, action } : { ...face, action };
  });
  state.selected = i;
  renderGrid();
  renderInspector();
}

function changeType(i, type) {
  const t = ACTION_TYPES[type];
  commit(() => {
    const key = keyAt(i);
    const prev = ACTION_TYPES[key.action?.type];
    // Si l'apparence est encore celle par défaut de l'ancien type, on la met à jour aussi.
    if (!prev || key.icon === prev.face.icon) key.icon = t.face.icon;
    if (!prev || key.color === prev.face.color) key.color = t.face.color;
    if (!prev || key.title === prev.label) key.title = t.label;
    key.action = t.create();
  });
}

function swapKeys(a, b) {
  if (a === b) return;
  commit(() => {
    const keys = page().keys;
    const ka = keys[a];
    const kb = keys[b];
    delete keys[a];
    delete keys[b];
    if (kb) keys[a] = kb;
    if (ka) keys[b] = ka;
  });
  state.selected = b;
  renderGrid();
  renderInspector();
}

function moveKeyToPage(i, pageId) {
  const dest = profile().pages.find((p) => p.id === pageId);
  let free = null;
  for (let j = 0; j < slotCount(); j++) {
    if (!dest.keys[j]) {
      free = j;
      break;
    }
  }
  if (free === null) return toast(`La page « ${dest.name} » est pleine.`, 'err');
  commit(() => {
    const d = profile().pages.find((p) => p.id === pageId);
    d.keys[free] = page().keys[i];
    delete page().keys[i];
  });
  state.selected = null;
  renderAll();
  toast(`Touche déplacée vers « ${dest.name} »`, 'ok');
}

function clearKey(i) {
  if (!keyAt(i)) return;
  commit(() => delete page().keys[i]);
  toast('Touche effacée · Ctrl+Z pour annuler');
}

function copyKey(i) {
  if (!keyAt(i)) return;
  state.clipboard = clone(keyAt(i));
  toast('Touche copiée', 'ok');
}

function pasteKey(i) {
  if (!state.clipboard) return;
  commit(() => (page().keys[i] = clone(state.clipboard)));
}

function duplicateKey(i) {
  const free = firstFreeSlot();
  if (free === null) return toast('Aucune touche libre sur cette page.', 'err');
  commit(() => (page().keys[free] = clone(keyAt(i))));
  state.selected = free;
  renderGrid();
  renderInspector();
}

async function testKey(i) {
  const key = keyAt(i);
  const action = key?.action;
  if (!action) return;
  if (action.type === 'page') return toast('La navigation entre pages s’effectue sur le Deck.', 'info');
  const needsFocus = (a) => ['hotkey', 'text'].includes(a.type) && (!a.target || a.target.by === 'none' || !a.target.value);
  const risky = needsFocus(action) || (action.type === 'multi' && action.steps?.some(needsFocus));
  if (risky) {
    toast('Envoi dans 3 s : placez-vous dans le logiciel qui doit recevoir les touches…', 'info', 3000);
    await new Promise((r) => setTimeout(r, 3000));
  }
  try {
    await api.test(action);
    flashSlot(i, true);
    toast('Action exécutée', 'ok');
  } catch (e) {
    flashSlot(i, false);
    toast(e.message, 'err', 5000);
  }
}

function flashSlot(i, ok) {
  const slot = document.querySelector(`.slot[data-index="${i}"]`);
  if (!slot) return;
  slot.classList.remove('flash-ok', 'flash-err');
  void slot.offsetWidth;
  slot.classList.add(ok ? 'flash-ok' : 'flash-err');
}

function keyMenu(anchor, i) {
  const key = keyAt(i);
  const items = [];
  if (key) {
    items.push(
      { label: 'Tester', icon: 'play', run: () => testKey(i) },
      '-',
      { label: 'Copier', icon: 'copy', run: () => copyKey(i) },
    );
  }
  if (state.clipboard) items.push({ label: 'Coller', icon: 'download', run: () => pasteKey(i) });
  if (key) {
    items.push({ label: 'Dupliquer', icon: 'layers', run: () => duplicateKey(i) });
    const others = profile().pages.filter((p) => p.id !== page().id);
    if (others.length) {
      items.push('-', { title: 'Déplacer vers' });
      for (const p of others) items.push({ label: p.name, icon: 'folder', run: () => moveKeyToPage(i, p.id) });
    }
    items.push('-', { label: 'Effacer', icon: 'trash', danger: true, run: () => clearKey(i) });
  }
  if (items.length) openMenu(anchor, items);
}

// ---------------------------------------------------------------------------
// Pages et profils
// ---------------------------------------------------------------------------
async function addPage() {
  const name = await promptModal({ title: 'Nouvelle page', value: `Page ${profile().pages.length + 1}`, confirmLabel: 'Créer' });
  if (!name) return;
  const id = uid();
  commit(() => profile().pages.push({ id, name, keys: {} }));
  state.pageId = id;
  state.selected = null;
  renderAll();
}

async function renamePage(id) {
  const pg = profile().pages.find((p) => p.id === id);
  const name = await promptModal({ title: 'Renommer la page', value: pg.name });
  if (name) commit(() => (profile().pages.find((p) => p.id === id).name = name));
}

function pageMenu(anchor, id, idx) {
  const pages = profile().pages;
  openMenu(anchor, [
    { label: 'Renommer', icon: 'pencil', run: () => renamePage(id) },
    {
      label: 'Dupliquer',
      icon: 'copy',
      run: () => {
        const nid = uid();
        commit(() => {
          const src = profile().pages.find((p) => p.id === id);
          profile().pages.splice(idx + 1, 0, { ...clone(src), id: nid, name: `${src.name} (copie)` });
        });
        state.pageId = nid;
        renderAll();
      },
    },
    idx > 0 && { label: 'Déplacer à gauche', icon: 'up', run: () => commit(() => { const p = profile().pages; [p[idx - 1], p[idx]] = [p[idx], p[idx - 1]]; }) },
    idx < pages.length - 1 && { label: 'Déplacer à droite', icon: 'down', run: () => commit(() => { const p = profile().pages; [p[idx + 1], p[idx]] = [p[idx], p[idx + 1]]; }) },
    '-',
    {
      label: 'Supprimer la page',
      icon: 'trash',
      danger: true,
      run: async () => {
        if (pages.length === 1) return toast('Un profil doit contenir au moins une page.', 'err');
        const pg = pages.find((p) => p.id === id);
        const n = Object.keys(pg.keys).length;
        const ok = await confirmModal({
          title: `Supprimer « ${pg.name} » ?`,
          message: n ? `Ses ${n} touche(s) seront supprimées. Vous pourrez annuler avec Ctrl+Z.` : 'Cette page est vide.',
          confirmLabel: 'Supprimer',
          danger: true,
        });
        if (!ok) return;
        commit(() => {
          const p = profile();
          p.pages = p.pages.filter((x) => x.id !== id);
        });
      },
    },
  ].filter(Boolean));
}

function switchProfile(id) {
  state.profileId = id;
  state.pageId = null;
  state.selected = null;
  // Le profil actif est aussi celui qu'affiche le Deck.
  commit((c) => (c.activeProfileId = id));
}

function profileMenu() {
  const items = [
    { title: 'Profils' },
    ...state.config.profiles.map((p) => ({ label: p.name, on: p.id === profile().id, run: () => switchProfile(p.id) })),
    '-',
    {
      label: 'Nouveau profil',
      icon: 'plus',
      run: async () => {
        const name = await promptModal({ title: 'Nouveau profil', message: 'Par exemple : « OBS », « Montage vidéo », « Jeux »…', placeholder: 'Nom du profil', confirmLabel: 'Créer' });
        if (!name) return;
        const id = uid();
        commit((c) => c.profiles.push({ id, name, pages: [{ id: uid(), name: 'Accueil', keys: {} }] }));
        switchProfile(id);
      },
    },
    {
      label: 'Renommer',
      icon: 'pencil',
      run: async () => {
        const name = await promptModal({ title: 'Renommer le profil', value: profile().name });
        if (name) commit(() => (profile().name = name));
      },
    },
    {
      label: 'Dupliquer',
      icon: 'copy',
      run: () => {
        const src = clone(profile());
        const id = uid();
        // Les liens entre pages sont conservés en réattribuant des identifiants cohérents.
        const map = Object.fromEntries(src.pages.map((p) => [p.id, uid()]));
        let json = JSON.stringify(src.pages);
        for (const [old, nid] of Object.entries(map)) json = json.split(`"${old}"`).join(`"${nid}"`);
        commit((c) => c.profiles.push({ id, name: `${src.name} (copie)`, pages: JSON.parse(json) }));
        switchProfile(id);
      },
    },
    {
      label: 'Supprimer le profil',
      icon: 'trash',
      danger: true,
      run: async () => {
        if (state.config.profiles.length === 1) return toast('Il faut conserver au moins un profil.', 'err');
        const ok = await confirmModal({ title: `Supprimer « ${profile().name} » ?`, message: 'Toutes ses pages et touches seront supprimées.', confirmLabel: 'Supprimer', danger: true });
        if (!ok) return;
        const id = profile().id;
        commit((c) => (c.profiles = c.profiles.filter((p) => p.id !== id)));
        switchProfile(state.config.profiles[0].id);
      },
    },
    '-',
    { label: 'Exporter la configuration', icon: 'download', run: exportConfig },
    { label: 'Importer une configuration', icon: 'upload', run: () => $('importInput').click() },
  ];
  openMenu($('profileBtn'), items);
}

function exportConfig() {
  const blob = new Blob([JSON.stringify(state.config, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `streamdeck-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importConfig(file) {
  try {
    const data = JSON.parse(await file.text());
    const cfg = data.config ?? data;
    if (!Array.isArray(cfg.profiles)) throw new Error('Ce fichier ne contient pas de configuration StreamDeck.');
    const ok = await confirmModal({
      title: 'Importer cette configuration ?',
      message: `${cfg.profiles.length} profil(s). La configuration actuelle sera remplacée (Ctrl+Z pour annuler).`,
      confirmLabel: 'Importer',
    });
    if (!ok) return;
    commit((c) => {
      for (const k of Object.keys(c)) delete c[k];
      Object.assign(c, cfg);
    });
    state.profileId = state.config.activeProfileId;
    ensureSelection();
    renderAll();
    toast('Configuration importée', 'ok');
  } catch (e) {
    toast(e.message || 'Fichier invalide.', 'err');
  }
}

// ---------------------------------------------------------------------------
// Événements globaux
// ---------------------------------------------------------------------------
function isTyping(e) {
  const t = e.target;
  return t.closest?.('input, textarea, select, [contenteditable], .recorder, .modal');
}

function onKeydown(e) {
  if (!state.config) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z' && !isTyping(e)) {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'y' && !isTyping(e)) {
    e.preventDefault();
    redo();
    return;
  }
  if (isTyping(e) || document.querySelector('.modal')) return;
  const i = state.selected;
  if (e.key === 'Escape') {
    state.selected = null;
    renderGrid();
    renderInspector();
    return;
  }
  if (i === null) return;
  const { cols } = layout();
  const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
  if (moves[e.key] !== undefined) {
    const next = i + moves[e.key];
    if (next >= 0 && next < slotCount()) {
      e.preventDefault();
      select(next);
      document.querySelector(`.slot[data-index="${next}"]`)?.focus();
    }
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    clearKey(i);
  } else if (mod && e.key.toLowerCase() === 'c') {
    copyKey(i);
  } else if (mod && e.key.toLowerCase() === 'v') {
    pasteKey(i);
  } else if (mod && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    duplicateKey(i);
  }
}

function bindGlobal() {
  document.addEventListener('keydown', onKeydown);
  $('undoBtn').addEventListener('click', undo);
  $('redoBtn').addEventListener('click', redo);
  $('profileBtn').addEventListener('click', profileMenu);
  $('librarySearch').addEventListener('input', renderLibrary);
  $('layoutSelect').addEventListener('change', (e) => {
    const value = e.target.value;
    commit((c) => (c.layout = value));
    const hidden = profile().pages.reduce((n, p) => n + Object.keys(p.keys).filter((k) => Number(k) >= slotCount()).length, 0);
    if (hidden) toast(`${hidden} touche(s) hors de la grille sont masquées mais conservées.`, 'info', 4500);
  });
  $('importInput').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importConfig(f);
  });
  // Clic dans le vide de la scène : désélection.
  document.querySelector('.device-wrap').addEventListener('click', (e) => {
    if (e.target.classList.contains('device-wrap') && state.selected !== null) {
      state.selected = null;
      renderGrid();
      renderInspector();
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (dirty) e.preventDefault();
  });
}

function connectEvents() {
  subscribe({
    open: async () => {
      state.connected = true;
      try {
        state.status = await api.status();
      } catch {}
      renderStatus();
    },
    error: () => {
      state.connected = false;
      renderStatus();
    },
    hello: async ({ revision }) => {
      // Reconnexion : on récupère les modifications faites entre-temps.
      if (revision !== state.revision && !dirty) {
        const { config, revision: r } = await api.getConfig();
        state.config = config;
        state.revision = r;
        ensureSelection();
        renderAll();
      }
    },
    config: ({ revision, origin, config }) => {
      state.revision = revision;
      if (origin === clientId || dirty) return;
      state.config = config;
      ensureSelection();
      renderAll();
      toast('Configuration mise à jour depuis un autre appareil');
    },
    press: ({ profileId, pageId, index, ok }) => {
      if (profileId === profile().id && pageId === page().id) flashSlot(index, ok);
    },
    status: ({ executorStatus }) => {
      if (state.status) state.status.executorStatus = executorStatus;
      renderStatus();
      if (state.selected === null) renderInspector();
    },
  });
}

async function init() {
  bindGlobal();
  renderLibrary();
  try {
    const [{ config, revision }, status] = await Promise.all([api.getConfig(), api.status()]);
    state.config = config;
    state.revision = revision;
    state.status = status;
    state.connected = true;
  } catch (e) {
    toast(`Serveur injoignable : ${e.message}`, 'err', 10000);
    return;
  }
  state.profileId = state.config.activeProfileId;
  ensureSelection();
  renderAll();
  renderStatus();
  setSaveState('idle', 'Toutes les modifications sont enregistrées');
  if (!state.status.canAdmin) toast('Lecture seule : les modifications sont réservées à l’ordinateur hôte.', 'err', 8000);
  connectEvents();
  api.windows().then((r) => (state.windows = r.windows)).catch(() => {});
}

init();
