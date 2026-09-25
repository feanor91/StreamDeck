import { KEY_GROUPS, MODIFIERS, MEDIA_ACTIONS, keyFromEvent, keyLabel } from '/shared/keys.js';
import { api, clientId, subscribe } from './api.js';
import { h, icon, toast, promptModal, confirmModal, openMenu } from './dom.js';
import {
  ACTION_TYPES, STEP_TYPES, DELAY_TYPE, LIBRARY, COLORS, EMOJIS,
  libraryItemInfo, createFromLibrary, keyFace, isMac, isIconPath,
} from './catalog.js';
import { computeCells, placementError, findFreeSlot, keySpan, stateKey } from '/shared/layout.js';
import { SIMHUB_PROPERTIES } from '/shared/simhub.js';
import { MSFS_EVENTS, MSFS_EVENT_LABELS, MSFS_SIMVARS, MSFS_NUMERIC_SIMVARS, MSFS_UNITS, AVIA_ICONS, FBW_EVENTS, FBW_PRESETS, isLocalVar } from '/shared/msfs.js';

const $ = (id) => document.getElementById(id);
const clone = (v) => JSON.parse(JSON.stringify(v));
const uid = () => Math.random().toString(36).slice(2, 10);

const FALLBACK_LAYOUTS = { standard: { rows: 3, cols: 5, label: 'Standard — 15 touches' } };

const state = {
  config: null,
  revision: 0,
  status: null,
  update: null, // état de la recherche de mise à jour (GET /api/update)
  profileId: null,
  pageId: null,
  selected: null,
  clipboard: null,
  windows: [],
  iconTab: 'emoji',
  faceTab: 0, // apparence éditée d'une bascule : 0 = état 1, 1 = état 2
  toggles: {}, // états courants des bascules (clé : profil/page/index)
  levels: {}, // positions des curseurs (0..1)
  values: {}, // valeurs affichées par les boutons rotatifs (lues dans MSFS)
  flags: {}, // tirets, point « managé », STD des afficheurs type FCU
  inputEvents: null, // commandes de cockpit (Input Events) de l'avion chargé
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
const toggleState = (i) => (state.toggles[stateKey(profile().id, page().id, i)] ? 1 : 0);
// Valeurs en direct d'une touche continue ; « vertical » selon la forme de la touche.
function liveFor(i, cell) {
  const sk = stateKey(profile().id, page().id, i);
  const { w, h: hh } = cell ?? spanOf(keyAt(i));
  return { value: state.values[sk], flags: state.flags[sk], level: state.levels[sk] ?? 0, angle: 0, vertical: hh >= w };
}
const spanOf = (key) => ({ w: Math.max(1, Number(key?.span?.w) || 1), h: Math.max(1, Number(key?.span?.h) || 1) });

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
  const { cells } = computeCells(page().keys, rows, cols);
  grid.replaceChildren(...cells.map(buildSlot));
}

function buildSlot(cell) {
  const i = cell.index;
  const key = keyAt(i);
  const slot = h(
    'button',
    {
      class: `slot${state.selected === i ? ' selected' : ''}`,
      dataset: { index: i },
      style: { gridColumn: `${cell.col + 1} / span ${cell.w}`, gridRow: `${cell.row + 1} / span ${cell.h}` },
      draggable: key ? 'true' : 'false',
      'aria-label': key ? `Touche ${i + 1} : ${key.title || ACTION_TYPES[key.action?.type]?.long || ''}` : `Touche ${i + 1} vide`,
      onclick: () => select(i),
      oncontextmenu: (e) => {
        e.preventDefault();
        select(i);
        keyMenu({ x: e.clientX, y: e.clientY }, i);
      },
    },
    keyFace(key, toggleState(i), liveFor(i, cell)),
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

// Groupes de la bibliothèque dépliés (repliés par défaut), mémorisés dans le navigateur.
const openGroups = new Set(
  (() => {
    try {
      return JSON.parse(localStorage.getItem('deck.library.open') ?? '[]');
    } catch {
      return [];
    }
  })(),
);
function toggleLibraryGroup(name) {
  if (openGroups.has(name)) openGroups.delete(name);
  else openGroups.add(name);
  try {
    localStorage.setItem('deck.library.open', JSON.stringify([...openGroups]));
  } catch {}
  renderLibrary();
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
    ...groups.map((g) => {
      // Pendant une recherche, tous les groupes contenant un résultat sont dépliés.
      const open = !!q || openGroups.has(g.group);
      return h(
        'div',
        { class: `lib-group${open ? ' open' : ''}` },
        h(
          'button',
          { class: 'lib-head', 'aria-expanded': String(open), disabled: !!q, onclick: () => toggleLibraryGroup(g.group) },
          h('span', { class: 'chev', html: '<svg class="i" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>' }),
          h('span', {}, g.group),
          h('small', {}, String(g.items.length)),
        ),
        ...(!open ? [] : g.items.map((it) => {
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
            h('span', { class: 'lib-icon', style: { '--c': info.color } },
              isIconPath(info.icon) ? h('img', { src: info.icon, alt: '', draggable: 'false' }) : info.icon),
            h('span', {}, h('strong', {}, info.label), h('small', {}, info.desc)),
          );
          el.querySelector('.lib-icon').style.setProperty('--c', info.color);
          el.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('application/x-deck-action', JSON.stringify(it));
            e.dataTransfer.effectAllowed = 'copy';
          });
          return el;
        })),
      );
    }),
  );
}

function renderSimhub() {
  const pill = $('simhubPill');
  const m = state.status?.simhub;
  const on = !!(state.connected && m?.connected);
  pill.dataset.state = on ? 'ok' : 'off';
  pill.querySelector('span').textContent = on ? 'SimHub connecté' : 'SimHub';
  pill.title = on ? `Connecté à SimHub (${m.host}:${m.port})` : m?.reason ?? 'SimHub non détecté';
}

function renderMsfs() {
  const pill = $('msfsPill');
  const m = state.status?.msfs;
  const on = !!(state.connected && m?.connected);
  pill.dataset.state = on ? 'ok' : 'off';
  pill.querySelector('span').textContent = on ? 'MSFS connecté' : 'MSFS';
  pill.title = on ? `Connecté à ${m.simName || 'Flight Simulator'} (SimConnect)` : m?.reason ?? 'Flight Simulator non détecté';
}

// --- Version et mises à jour -----------------------------------------------------------------

function renderUpdate() {
  const u = state.update;
  const version = u?.current ?? state.status?.version;
  $('appVersion').textContent = version ? `v${version}` : '';
  const pill = $('updatePill');
  const label = pill.querySelector('span');
  pill.hidden = !u || !['available', 'downloading', 'ready'].includes(u.state);
  if (pill.hidden) return;
  if (u.state === 'ready') {
    label.textContent = `Installer la v${u.latest}`;
    pill.title = u.canInstall ? 'Redémarrer StreamDeck et installer la mise à jour' : 'Mise à jour prête';
  } else if (u.state === 'downloading') {
    label.textContent = `Téléchargement v${u.latest}… ${u.progress ?? 0} %`;
    pill.title = 'La mise à jour sera proposée à la fin du téléchargement.';
  } else if (u.canInstall) {
    label.textContent = `Installer la v${u.latest}`;
    pill.title = 'Télécharger et installer la mise à jour, puis redémarrer StreamDeck';
  } else {
    label.textContent = `v${u.latest} disponible`;
    pill.title = 'Ouvrir la page de téléchargement';
  }
}

async function onUpdatePill() {
  const u = state.update;
  if (!u) return;
  if ((u.state === 'ready' || u.state === 'available') && u.canInstall) {
    const ok = await confirmModal({
      title: `Installer StreamDeck ${u.latest} ?`,
      message: 'La mise à jour se télécharge, puis StreamDeck se ferme, l’installe et redémarre. Le Deck sera indisponible quelques secondes.',
      confirmLabel: 'Installer et redémarrer',
    });
    if (!ok) return;
    try {
      await api.installUpdate();
      toast('Téléchargement de la mise à jour…');
    } catch (e) {
      toast(e.message, 'err');
    }
  } else if (u.state === 'available') {
    window.open(u.url, '_blank', 'noopener');
  }
}

async function checkUpdateNow() {
  if (!state.status?.canAdmin) return;
  toast('Recherche de mise à jour…');
  try {
    state.update = await api.checkUpdate();
    renderUpdate();
    const u = state.update;
    if (u.state === 'current') toast(`StreamDeck est à jour (v${u.current})`, 'ok');
    else if (u.state === 'error') toast(u.error, 'err', 6000);
    else if (u.latest) toast(`Nouvelle version disponible : v${u.latest}`, 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

function renderStatus() {
  renderMsfs();
  renderSimhub();
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
  // Aperçu : état en cours d'édition pour une bascule, forme réelle pour une touche fusionnée.
  const face = keyFace(key, key?.action?.type === 'toggle' ? state.faceTab : 0, key ? liveFor(i) : {});
  const { w, h: hh } = spanOf(key);
  if (key && (w > 1 || hh > 1)) {
    face.style.aspectRatio = `${w} / ${hh}`;
    face.style.width = w >= hh ? '120px' : '70px';
  }
  return h(
    'div',
    { class: 'insp-hero' },
    face,
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
    case 'toggle':
      return [toggleEditor(getAction, tag)];
    case 'msfs':
      return msfsFields(getAction, tag);
    case 'simhub':
      return simhubFields(getAction, tag);
    case 'display':
      return [displayEditor(getAction, tag)];
    case 'dial':
      return [dialEditor(getAction, tag)];
    case 'slider':
      return [sliderEditor(getAction, tag)];
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

// ---------------------------------------------------------------------------
// Microsoft Flight Simulator
// ---------------------------------------------------------------------------
function msfsNote() {
  const m = state.status?.msfs;
  if (m?.connected) {
    return h('div', { class: 'note info ok' }, icon('check'),
      h('span', {}, `Connecté à ${m.simName || 'Flight Simulator'}${m.aircraft ? ` · avion : ${m.aircraft}` : ''}.`));
  }
  return h('div', { class: 'note' }, icon('info'),
    h('span', {}, `${m?.reason ?? 'Simulateur non détecté.'} Les commandes partiront dès que MSFS sera lancé, sans réglage à faire : la liaison SimConnect est intégrée au simulateur.`));
}

// Listes de suggestions (variables connues, Input Events de l'avion chargé).
function ensureDatalists() {
  if (!document.getElementById('simvarList')) {
    const known = [
      ...MSFS_SIMVARS.map(([v, label]) => [v, label]),
      ...MSFS_NUMERIC_SIMVARS.map(([v, , label]) => [v, label]),
      ...FBW_PRESETS.flatMap((p) => [p.action.sync?.simvar, p.action.display?.simvar].filter(Boolean).map((v) => [v, `A320 — ${p.label}`])),
    ];
    const seen = new Set();
    document.body.append(
      h('datalist', { id: 'simvarList' }, ...known.filter(([v]) => !seen.has(v) && seen.add(v)).map(([v, label]) => h('option', { value: v }, label))),
    );
  }
  let props = document.getElementById('simhubPropList');
  if (!props) {
    props = h('datalist', { id: 'simhubPropList' });
    document.body.append(props);
  }
  const known = new Map(SIMHUB_PROPERTIES);
  for (const p of state.simhubProperties ?? []) if (!known.has(p.name)) known.set(p.name, p.type);
  props.replaceChildren(...[...known].map(([v, label]) => h('option', { value: v }, label)));
  let inputs = document.getElementById('inputEventList');
  if (!inputs) {
    inputs = h('datalist', { id: 'inputEventList' });
    document.body.append(inputs);
  }
  inputs.replaceChildren(...(state.inputEvents ?? []).map((i) => h('option', { value: i.name })));
}

const textInput = (value, placeholder, oninput, extra = {}) =>
  h('input', { class: 'mono', value: value ?? '', placeholder, spellcheck: 'false', oninput, ...extra });

/**
 * Source d'une valeur lue en direct : variable MSFS (SimVar ou « L: »), Input Event
 * MSFS 2024 ou propriété SimHub. `obj()` renvoie l'objet à éditer
 * ({ simvar, unit }, { input } ou { simhub }), `tag` groupe l'historique.
 */
function simSourceFields(obj, tag, { unitDefault = 'number', equals = false } = {}) {
  ensureDatalists();
  const o = obj();
  const mode = 'simhub' in o ? 'simhub' : 'input' in o ? 'input' : 'var';
  const set = (patch, opts = { tag: `${tag}:src`, render: 'key' }) => commit(() => Object.assign(obj(), patch), opts);
  const switchTo = (m) =>
    commit(() => {
      const x = obj();
      for (const k of ['simvar', 'unit', 'input', 'simhub']) delete x[k];
      if (m === 'var') Object.assign(x, { simvar: '', unit: unitDefault });
      else x[m] = '';
    });
  const source = {
    var: () =>
      h('div', { class: 'row' },
        h('label', { class: 'field', style: { flex: 2 } }, h('span', {}, 'Variable'),
          textInput(o.simvar, 'ex. L:A32NX_FCU_AP_1_LIGHT_ON', (e) => set({ simvar: e.target.value.trim() }), { list: 'simvarList' })),
        h('label', { class: 'field' }, h('span', {}, 'Unité'),
          h('select', { onchange: (e) => set({ unit: e.target.value }, {}) },
            ...MSFS_UNITS.map((u) => h('option', { value: u, selected: (o.unit || (isLocalVar(o.simvar) ? 'number' : unitDefault)) === u }, u))))),
    input: () =>
      h('div', { class: 'field' },
        h('div', { class: 'input-with-btn' },
          textInput(o.input, 'ex. LIGHTING_LANDING_1', (e) => set({ input: e.target.value.trim() }), { list: 'inputEventList' }),
          h('button', { class: 'btn icon-only', title: 'Parcourir les commandes de l’avion chargé', onclick: () => openExplorer((name) => commit(() => (obj().input = name))) }, icon('target')),
        ),
        h('span', { class: 'hint' }, 'Commande de cockpit de l’avion chargé : utilisez le bouton pour parcourir la liste.')),
    simhub: () =>
      h('div', { class: 'field' },
        h('div', { class: 'input-with-btn' },
          textInput(o.simhub, 'ex. dcp.gd.SpeedKmh', (e) => set({ simhub: e.target.value.trim() }), { list: 'simhubPropList' }),
          h('button', { class: 'btn icon-only', title: 'Charger la liste des propriétés depuis SimHub', onclick: loadSimhubProperties }, icon('target')),
        ),
        h('span', { class: 'hint' }, 'Propriété SimHub : « dcp.gd.X » pour DataCorePlugin.GameData.X, ou le nom complet copié depuis « Available properties » de SimHub.')),
  };
  return [
    h(
      'div',
      { class: 'segmented' },
      ...[['var', 'Variable'], ['input', 'Input Event'], ['simhub', 'SimHub']].map(([m, label]) =>
        h('button', { class: mode === m ? 'on' : '', onclick: () => mode !== m && switchTo(m) }, label)),
    ),
    source[mode](),
    equals
      ? h('div', { class: 'row' },
          h('label', { class: 'field' }, h('span', {}, 'État 2 si la valeur vaut (facultatif)'),
            h('input', {
              type: mode === 'simhub' ? 'text' : 'number',
              value: o.equals ?? '',
              placeholder: 'non nulle',
              oninput: (e) => {
                const v = e.target.value.trim();
                set({ equals: v === '' ? undefined : Number.isNaN(Number(v)) ? v : Number(v) });
              },
            })),
          h('label', { class: 'switch', style: { alignSelf: 'end', paddingBottom: '9px' } },
            h('input', { type: 'checkbox', checked: !!o.invert, onchange: (e) => commit(() => (obj().invert = e.target.checked)) }), 'Inverser'))
      : null,
  ];
}

// Propriétés proposées à la saisie : liste courante, complétée par celle de SimHub s'il est lancé.
async function loadSimhubProperties() {
  try {
    const { properties } = await api.simhubProperties();
    state.simhubProperties = properties;
    ensureDatalists();
    toast(`${properties.length} propriétés chargées depuis SimHub`, 'ok');
  } catch (e) {
    toast(e.message, 'err', 5000);
  }
}

function simhubFields(getAction, tag) {
  const a = getAction();
  const mode = a.mode ?? 'click';
  const sh = state.status?.simhub;
  return [
    textField(getAction, 'input', 'Nom de la commande', {
      tag,
      mono: true,
      placeholder: 'ex. deck.limiteur',
      hint: 'Nom libre (sans espace). Dans SimHub, « Controls and events » : associez ce nom à une action en appuyant sur la touche pendant que SimHub attend l’entrée.',
    }),
    h('span', { class: 'field-label' }, 'Déclenchement'),
    h('div', { class: 'segmented' },
      ...[['click', 'Appui bref'], ['press', 'Appuyer'], ['release', 'Relâcher']].map(([id, label]) =>
        h('button', { class: mode === id ? 'on' : '', onclick: () => commit(() => (getAction().mode = id)) }, label))),
    sh && !sh.connected
      ? h('div', { class: 'note' }, icon('alert'), h('span', {}, sh.reason ?? 'SimHub non détecté.'))
      : null,
  ];
}

function msfsFields(getAction, tag) {
  const a = getAction();
  const kind = a.kind ?? 'event';
  const kinds = [['event', 'Commande'], ['var', 'Variable'], ['input', 'Input Event']];
  const head = [
    h('div', { class: 'segmented' },
      ...kinds.map(([id, label]) => h('button', {
        class: kind === id ? 'on' : '',
        onclick: () => commit(() => {
          const x = getAction();
          x.kind = id;
          if (id !== 'event') x.op ??= 'set';
        }),
      }, label))),
  ];

  if (kind === 'event') {
    const known = !!MSFS_EVENT_LABELS[a.event];
    const custom = !!a.event && !known;
    const groups = [...MSFS_EVENTS, ...FBW_EVENTS];
    const select = h(
      'select',
      {
        onchange: (e) =>
          commit(() => {
            const v = e.target.value;
            getAction().event = v === '@custom' ? (known ? '' : getAction().event) : v;
            getAction().custom = v === '@custom';
          }),
      },
      h('option', { value: '', disabled: true, selected: !a.event && !a.custom }, 'Choisir une commande…'),
      ...groups.map((g) => h('optgroup', { label: g.group }, ...g.items.map(([id, label]) => h('option', { value: id, selected: id === a.event }, label)))),
      h('optgroup', { label: 'Avancé' }, h('option', { value: '@custom', selected: custom || (a.custom && !a.event) }, 'Autre événement (saisie libre)…')),
    );
    return [
      ...head,
      h('label', { class: 'field' }, h('span', {}, 'Commande'), select),
      custom || a.custom
        ? h('label', { class: 'field' }, h('span', {}, 'Nom de l’événement SimConnect'),
            textInput(a.event, 'ex. TOGGLE_WATER_RUDDER ou A32NX.FCU_EXPED_PUSH', (e) => commit(() => (getAction().event = e.target.value.trim().toUpperCase()), { tag: `${tag}:event`, render: 'key' })),
            h('span', { class: 'hint' }, 'Événements standard (SDK MSFS) ou personnalisés d’un avion (ex. « A32NX.… » de FlyByWire).'))
        : null,
      h('label', { class: 'field' }, h('span', {}, 'Valeur (facultatif)'),
        h('input', { type: 'number', value: a.value ?? 0, oninput: (e) => commit(() => (getAction().value = Number(e.target.value) || 0), { tag: `${tag}:value`, render: 'key' }) }),
        h('span', { class: 'hint' }, 'Utile pour les commandes qui attendent un paramètre (ex. HEADING_BUG_SET : cap en degrés).')),
      msfsNote(),
    ];
  }

  // Variable ou Input Event : opération sur la valeur.
  const op = a.op ?? 'set';
  const num = (label, prop, placeholder = '') =>
    h('label', { class: 'field' }, h('span', {}, label),
      h('input', { type: 'number', value: a[prop] ?? '', placeholder, oninput: (e) => commit(() => (getAction()[prop] = e.target.value === '' ? undefined : Number(e.target.value)), { tag: `${tag}:${prop}`, render: 'key' }) }));
  const target =
    kind === 'var'
      ? h('div', { class: 'row' },
          h('label', { class: 'field', style: { flex: 2 } }, h('span', {}, 'Variable à écrire'),
            (ensureDatalists(), textInput(a.var, 'ex. L:A32NX_… ou L:…', (e) => commit(() => (getAction().var = e.target.value.trim()), { tag: `${tag}:var`, render: 'key' }), { list: 'simvarList' }))),
          h('label', { class: 'field' }, h('span', {}, 'Unité'),
            h('select', { onchange: (e) => commit(() => (getAction().unit = e.target.value)) },
              ...MSFS_UNITS.map((u) => h('option', { value: u, selected: (a.unit || 'number') === u }, u)))))
      : h('div', { class: 'field' }, h('span', {}, 'Commande de cockpit (Input Event)'),
          h('div', { class: 'input-with-btn' },
            (ensureDatalists(), textInput(a.input, 'ex. LIGHTING_LANDING_1', (e) => commit(() => (getAction().input = e.target.value.trim()), { tag: `${tag}:input`, render: 'key' }), { list: 'inputEventList' })),
            h('button', { class: 'btn icon-only', title: 'Parcourir les commandes de l’avion chargé', onclick: () => openExplorer((name) => commit(() => (getAction().input = name))) }, icon('target'))));
  return [
    ...head,
    target,
    h('div', { class: 'segmented' },
      ...[['set', 'Fixer'], ['toggle', 'Basculer'], ['add', 'Ajouter']].map(([id, label]) =>
        h('button', { class: op === id ? 'on' : '', onclick: () => commit(() => (getAction().op = id)) }, label))),
    op === 'set' ? num('Valeur', 'value', '0') : null,
    op === 'toggle' ? h('div', { class: 'row' }, num('Valeur « allumé »', 'value', '1'), num('Valeur « éteint »', 'off', '0')) : null,
    op === 'add'
      ? h('div', { class: 'field' },
          h('div', { class: 'row' }, num('Pas', 'value', '1'), num('Minimum', 'min'), num('Maximum', 'max')),
          h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: !!a.wrap, onchange: (e) => commit(() => (getAction().wrap = e.target.checked)) }), 'Boucler (ex. cap 360 → 1)'))
      : null,
    msfsNote(),
  ];
}

// ---------------------------------------------------------------------------
// Explorateur MSFS : commandes de cockpit (Input Events) de l'avion chargé et
// lecture en direct d'une variable. Sert à découvrir les commandes d'un avion
// non documenté (ex. le Rafale). `onPick` : choisir une commande pour une touche.
// ---------------------------------------------------------------------------
function openExplorer(onPick = null) {
  document.querySelector('.explorer-backdrop')?.remove();
  const list = h('div', { class: 'explorer-list' });
  const search = h('input', { class: 'mono', placeholder: 'Rechercher (ex. gear, light, master, hdg…)', spellcheck: 'false', autocomplete: 'off' });
  const info = h('div', { class: 'explorer-info' });
  const values = new Map();
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e) => e.key === 'Escape' && (e.stopPropagation(), close());

  const render = () => {
    const q = search.value.trim().toLowerCase();
    const items = (state.inputEvents ?? []).filter((i) => !q || i.name.toLowerCase().includes(q));
    info.textContent = state.inputEvents
      ? `${items.length} commande(s) sur ${state.inputEvents.length}${state.status?.msfs?.aircraft ? ` · ${state.status.msfs.aircraft}` : ''}`
      : '';
    list.replaceChildren(
      ...items.slice(0, 300).map((i) => {
        const val = h('span', { class: 'explorer-value' }, values.has(i.name) ? String(values.get(i.name)) : '');
        return h(
          'div',
          { class: 'explorer-row' },
          h('code', {}, i.name),
          val,
          h('button', {
            class: 'btn small ghost',
            title: 'Lire la valeur actuelle',
            onclick: async () => {
              try {
                const { value } = await api.msfsRead({ input: i.name });
                values.set(i.name, value ?? '—');
                val.textContent = String(value ?? '—');
              } catch (e) {
                toast(e.message, 'err');
              }
            },
          }, 'Lire'),
          onPick
            ? h('button', { class: 'btn small primary', onclick: () => { onPick(i.name); close(); } }, 'Choisir')
            : h('button', { class: 'btn small', title: 'Copier le nom', onclick: () => navigator.clipboard?.writeText(i.name).then(() => toast('Nom copié', 'ok')) }, icon('copy')),
        );
      }),
      ...(items.length > 300 ? [h('div', { class: 'explorer-more' }, `… ${items.length - 300} autres : affinez la recherche.`)] : []),
      ...(state.inputEvents && !items.length ? [h('div', { class: 'explorer-more' }, 'Aucune commande ne correspond.')] : []),
    );
  };

  const load = async (refresh = false) => {
    list.replaceChildren(h('div', { class: 'explorer-more' }, 'Interrogation de l’avion chargé…'));
    try {
      const res = await api.msfsInputs(refresh);
      state.inputEvents = res.inputs;
      if (state.status?.msfs) state.status.msfs.aircraft = res.aircraft;
      ensureDatalists();
      render();
    } catch (e) {
      list.replaceChildren(h('div', { class: 'note' }, icon('alert'), h('span', {}, e.message)));
    }
  };

  // Lecture d'une variable (SimVar ou « L: ») en direct.
  const varName = h('input', { class: 'mono', list: 'simvarList', placeholder: 'ex. L:A32NX_AUTOBRAKES_ARMED_MODE', spellcheck: 'false' });
  const varUnit = h('select', {}, ...MSFS_UNITS.map((u) => h('option', { value: u }, u)));
  const varOut = h('code', { class: 'explorer-value big' }, '—');
  const readVar = async () => {
    try {
      const { value } = await api.msfsRead({ var: varName.value.trim(), unit: varUnit.value });
      varOut.textContent = value === null ? 'pas de réponse' : String(value);
    } catch (e) {
      varOut.textContent = e.message;
    }
  };
  ensureDatalists();

  search.addEventListener('input', render);
  const modal = h(
    'div',
    { class: 'modal explorer' },
    h('div', { class: 'explorer-head' },
      h('h3', {}, 'Explorateur MSFS'),
      h('button', { class: 'btn small', onclick: () => load(true) }, icon('refresh'), 'Actualiser'),
      h('button', { class: 'btn small ghost icon-only', title: 'Fermer', onclick: close }, icon('x'))),
    msfsNote(),
    h('p', { class: 'explorer-help' },
      'Commandes de cockpit (Input Events) de l’avion chargé dans MSFS 2024. Cherchez un mot-clé, « Lire » affiche la valeur actuelle : actionnez l’interrupteur dans le cockpit puis relisez pour repérer la bonne commande.'),
    search,
    info,
    list,
    h('div', { class: 'explorer-var' },
      h('span', { class: 'field-label' }, 'Lire une variable (SimVar ou L:)'),
      h('div', { class: 'row' }, varName, varUnit, h('button', { class: 'btn', style: { flex: 'none' }, onclick: readVar }, 'Lire')),
      varOut),
    h('div', { class: 'modal-actions' },
      state.inputEvents?.length
        ? h('button', {
            class: 'btn ghost',
            onclick: () => {
              const blob = new Blob([state.inputEvents.map((i) => i.name).join('\n')], { type: 'text/plain' });
              const link = h('a', { href: URL.createObjectURL(blob), download: `input-events-${state.status?.msfs?.aircraft ?? 'avion'}.txt` });
              link.click();
            },
          }, icon('download'), 'Exporter la liste')
        : null,
      h('button', { class: 'btn', onclick: close }, 'Fermer')),
  );
  const backdrop = h('div', { class: 'modal-backdrop explorer-backdrop', onmousedown: (e) => e.target === backdrop && close() }, modal);
  document.body.append(backdrop);
  document.addEventListener('keydown', onKey, true);
  search.focus();
  if (state.inputEvents) render();
  if (state.status?.msfs?.connected) load(!state.inputEvents);
  else list.replaceChildren(h('div', { class: 'explorer-more' }, 'Lancez MSFS et chargez un avion pour voir ses commandes.'));
}

// Bascule : état lu dans le simulateur (état réel, même si on agit dans le cockpit).
function simSyncField(getAction, tag) {
  const a = getAction();
  const on = !!a.sync && ['simvar', 'input', 'simhub'].some((k) => k in a.sync);
  return h(
    'div',
    { class: 'field sim-sync' },
    h('label', { class: 'switch' },
      h('input', {
        type: 'checkbox',
        checked: on,
        onchange: (e) => commit(() => {
          if (e.target.checked) getAction().sync = { simvar: getAction().sync?.simvar || 'GEAR HANDLE POSITION' };
          else delete getAction().sync;
        }),
      }),
      'État lu dans le simulateur (MSFS ou SimHub)'),
    ...(on ? simSourceFields(() => getAction().sync, `${tag}:sync`, { unitDefault: 'Bool', equals: true }) : []),
    on ? h('span', { class: 'hint' }, 'L’état de la touche suit le simulateur : plus besoin de l’appui long pour se recaler. Pour une variable « L: », choisissez l’unité « number ». Une propriété SimHub texte peut être comparée à un texte (ex. « R »).') : null,
  );
}

// ---------------------------------------------------------------------------
// Bouton rotatif et curseur
// ---------------------------------------------------------------------------

// Carte d'une action interne (ex. « Tourner + ») : type au choix, champs de l'action.
function innerActionCard(title, getParent, prop, tag, { optional = false } = {}) {
  const inner = getParent()[prop];
  const getInner = () => getParent()[prop];
  return h(
    'div',
    { class: 'step' },
    h(
      'div',
      { class: 'step-head' },
      h('span', { class: 'step-title' }, title),
      h(
        'select',
        {
          onchange: (e) =>
            commit(() => {
              getParent()[prop] = e.target.value ? ACTION_TYPES[e.target.value].create() : null;
            }),
        },
        optional ? h('option', { value: '', selected: !inner?.type }, 'Aucune') : null,
        ...INNER_TYPES.map((t) => h('option', { value: t, selected: t === inner?.type }, `${ACTION_TYPES[t].icon}  ${ACTION_TYPES[t].long}`)),
      ),
    ),
    inner?.type
      ? h(
          'div',
          { class: 'step-body' },
          ...actionFields(getInner, `${tag}:${prop}`),
          ['hotkey', 'text'].includes(inner.type) ? compactTarget(getInner, `${tag}:${prop}`) : null,
        )
      : null,
  );
}

function dialEditor(getAction, tag) {
  const a = getAction();
  const sens = a.sensitivity ?? 'normal';
  const display = a.display;
  const shown = !!display && ['simvar', 'input', 'simhub'].some((k) => k in display);
  const fmt = (label, prop, type = 'text', placeholder = '') =>
    h('label', { class: 'field' }, h('span', {}, label),
      h('input', {
        type, value: display?.[prop] ?? '', placeholder,
        oninput: (e) => commit(() => (getAction().display[prop] = type === 'number' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value), { tag: `${tag}:fmt:${prop}`, render: 'key' }),
      }));
  return h(
    'div',
    { class: 'field' },
    h('div', { class: 'note info' }, icon('info'),
      h('span', {}, 'Sur le Deck : glissez le doigt vers la droite ou vers le haut pour « + », vers la gauche ou vers le bas pour « − ». Un appui sans glisser déclenche l’action d’appui ; un appui long (½ s), l’action d’appui long (ex. tirer un bouton du FCU Airbus). Sur PC, la molette de la souris fonctionne aussi.')),
    h('span', { class: 'field-label' }, 'Sensibilité'),
    h('div', { class: 'segmented' },
      ...[['fine', 'Fine'], ['normal', 'Normale'], ['fast', 'Rapide']].map(([id, label]) =>
        h('button', { class: sens === id ? 'on' : '', onclick: () => commit(() => (getAction().sensitivity = id)) }, label))),
    h('div', { class: 'steps' },
      innerActionCard('Tourner +', getAction, 'inc', tag),
      innerActionCard('Tourner −', getAction, 'dec', tag),
      innerActionCard('Appui', getAction, 'press', tag, { optional: true }),
      innerActionCard('Appui long', getAction, 'hold', tag, { optional: true })),
    h('div', { class: 'field sim-sync' },
      h('label', { class: 'switch' },
        h('input', {
          type: 'checkbox',
          checked: shown,
          onchange: (e) => commit(() => {
            if (!e.target.checked) return (getAction().display = null);
            const [simvar, unit, , suffix, decimals] = MSFS_NUMERIC_SIMVARS[0];
            getAction().display = { simvar, unit, suffix, decimals, wrap360: unit === 'degrees' };
          }),
        }),
        'Afficher une valeur du simulateur sur la touche (MSFS ou SimHub)'),
      ...(shown
        ? [
            ...simSourceFields(() => getAction().display, `${tag}:display`, { unitDefault: 'number' }),
            h('div', { class: 'row' }, fmt('Suffixe', 'suffix', 'text', '° / ft / kt'), fmt('Décimales', 'decimals', 'number', '0'), fmt('Chiffres (zéros)', 'pad', 'number', '—')),
            h('label', { class: 'switch' },
              h('input', { type: 'checkbox', checked: !!display.sign, onchange: (e) => commit(() => (getAction().display.sign = e.target.checked)) }), 'Afficher le signe (+1500)'),
          ]
        : []),
    ),
  );
}

function displayEditor(getAction, tag) {
  getAction().display ??= { simhub: '', decimals: 0 };
  const d = getAction().display;
  const fmt = (label, prop, type = 'text', placeholder = '') =>
    h('label', { class: 'field' }, h('span', {}, label),
      h('input', {
        type, value: d[prop] ?? '', placeholder,
        oninput: (e) => commit(() => (getAction().display[prop] = type === 'number' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value), { tag: `${tag}:fmt:${prop}`, render: 'key' }),
      }));
  const flag = (prop, label) =>
    h('label', { class: 'switch' },
      h('input', { type: 'checkbox', checked: !!d[prop], onchange: (e) => commit(() => (getAction().display[prop] = e.target.checked)) }), label);
  return h(
    'div',
    { class: 'field' },
    h('div', { class: 'note info' }, icon('info'),
      h('span', {}, 'La touche affiche en direct une valeur de SimHub (vitesse, rapport, carburant, temps au tour…) ou de MSFS. Un appui peut en plus déclencher une action.')),
    h('span', { class: 'field-label' }, 'Valeur affichée'),
    ...simSourceFields(() => getAction().display, `${tag}:display`, { unitDefault: 'number' }),
    h('div', { class: 'row' }, fmt('Suffixe', 'suffix', 'text', ' km/h'), fmt('Décimales', 'decimals', 'number', '0'), fmt('Multiplier par', 'scale', 'number', '1')),
    h('div', { class: 'row' }, flag('time', 'Durée (temps au tour 1:23.456)'), flag('sign', 'Afficher le signe (+)')),
    h('div', { class: 'steps' }, innerActionCard('Appui', getAction, 'press', tag, { optional: true })),
  );
}

function sliderEditor(getAction, tag) {
  const a = getAction();
  const mode = a.mode ?? 'value';
  const axisEvents = MSFS_EVENTS.find((g) => g.group.startsWith('Axes'))?.items ?? [];
  const numField = (label, prop, hint, obj = () => getAction()) =>
    h('label', { class: 'field' }, h('span', {}, label),
      h('input', {
        type: 'number',
        value: obj()?.[prop] ?? '',
        oninput: (e) => commit(() => (obj()[prop] = Number(e.target.value)), { tag: `${tag}:${prop}`, render: 'key' }),
      }),
      hint ? h('span', { class: 'hint' }, hint) : null);
  const synced = !!a.sync && ['simvar', 'input', 'simhub'].some((k) => k in a.sync);

  const valueMode = [
    h('label', { class: 'field' }, h('span', {}, 'Commande MSFS qui reçoit la position'),
      h('select', {
        onchange: (e) => commit(() => {
          getAction().set = { type: 'msfs', event: e.target.value };
          // Le compensateur va de −16383 à +16383, les autres axes de 0 à 16383.
          getAction().min = e.target.value === 'ELEVATOR_TRIM_SET' ? -16383 : 0;
          getAction().max = 16383;
        }),
      }, ...axisEvents.map(([id, label]) => h('option', { value: id, selected: id === a.set?.event }, label)))),
    h('div', { class: 'row' }, numField('Valeur en bas', 'min'), numField('Valeur en haut', 'max')),
    h('div', { class: 'field sim-sync' },
      h('label', { class: 'switch' },
        h('input', {
          type: 'checkbox',
          checked: synced,
          onchange: (e) => commit(() => {
            if (!e.target.checked) return (getAction().sync = null);
            const pct = MSFS_NUMERIC_SIMVARS.find((x) => x[1] === 'percent');
            getAction().sync = { simvar: pct[0], unit: 'percent', min: 0, max: 100 };
          }),
        }),
        'Suivre la position dans MSFS (levier bougé dans le cockpit)'),
      ...(synced
        ? [
            ...simSourceFields(() => getAction().sync, `${tag}:sync`, { unitDefault: 'percent' }),
            h('div', { class: 'row' },
              numField('Valeur lue en bas', 'min', null, () => getAction().sync),
              numField('Valeur lue en haut', 'max', null, () => getAction().sync)),
          ]
        : []),
    ),
    msfsNote(),
  ];

  const stepsMode = [
    numField('Nombre de crans sur la course', 'notches', 'Glisser d’un bout à l’autre envoie ce nombre de « + » ou de « − ».'),
    h('div', { class: 'steps' }, innerActionCard('Vers le haut / la droite (+)', getAction, 'inc', tag), innerActionCard('Vers le bas / la gauche (−)', getAction, 'dec', tag)),
  ];

  return h(
    'div',
    { class: 'field' },
    h('div', { class: 'note info' }, icon('info'),
      h('span', {}, 'Sur le Deck : faites glisser le curseur. Il est vertical si la touche est plus haute que large (fusionnez-la en 1×3 pour un vrai levier). Un appui sans glisser déclenche l’action d’appui si elle est définie.')),
    h('div', { class: 'segmented' },
      h('button', { class: mode === 'value' ? 'on' : '', onclick: () => commit(() => (getAction().mode = 'value')) }, 'Position (MSFS)'),
      h('button', { class: mode === 'steps' ? 'on' : '', onclick: () => commit(() => (getAction().mode = 'steps')) }, 'Pas à pas (+ / −)')),
    ...(mode === 'value' ? valueMode : stepsMode),
    h('div', { class: 'steps' }, innerActionCard('Appui', getAction, 'press', tag, { optional: true })),
  );
}

// Taille d'une touche fusionnée (en nombre d'emplacements).
function sizeField(i) {
  const { rows, cols } = layout();
  const { w, h: hh } = spanOf(keyAt(i));
  const apply = (nw, nh) => {
    const err = placementError(page().keys, i, nw, nh, rows, cols, [i]);
    if (err) {
      toast(`Fusion impossible : ${err}`, 'err', 4500);
      renderInspector();
      return;
    }
    commit(() => {
      const k = keyAt(i);
      if (nw === 1 && nh === 1) delete k.span;
      else k.span = { w: nw, h: nh };
    });
  };
  const opts = (max, cur) => Array.from({ length: max }, (_, n) => h('option', { value: n + 1, selected: n + 1 === cur }, String(n + 1)));
  const presets = [[1, 1], [2, 1], [1, 2], [2, 2], [4, 2], [4, 4]].filter(([a, b]) => a <= cols && b <= rows);
  return h(
    'div',
    { class: 'field' },
    h('span', {}, 'Taille (touches fusionnées)'),
    h(
      'div',
      { class: 'size-presets' },
      ...presets.map(([a, b]) =>
        h(
          'button',
          { class: a === w && b === hh ? 'on' : '', title: `${a} × ${b}`, onclick: () => apply(a, b) },
          h('span', { class: 'mini', style: { gridTemplateColumns: `repeat(${a}, 1fr)` } }, ...Array.from({ length: a * b }, () => h('i'))),
          `${a}×${b}`,
        ),
      ),
    ),
    h(
      'div',
      { class: 'row' },
      h('label', { class: 'field' }, h('span', {}, 'Largeur'), h('select', { onchange: (e) => apply(Number(e.target.value), hh) }, ...opts(cols, w))),
      h('label', { class: 'field' }, h('span', {}, 'Hauteur'), h('select', { onchange: (e) => apply(w, Number(e.target.value)) }, ...opts(rows, hh))),
    ),
    h('span', { class: 'hint' }, 'La touche s’étend vers la droite et vers le bas ; les emplacements couverts doivent être vides.'),
  );
}

const INNER_TYPES = ['msfs', 'simhub', 'hotkey', 'text', 'media', 'launch', 'url', 'command', 'multi'];

// Éditeur d'une touche à bascule : une action par état (ou la même pour les deux).
function toggleEditor(getAction, tag) {
  const a = getAction();
  const i = state.selected;
  const actions = () => {
    const act = getAction();
    if (!Array.isArray(act.actions)) act.actions = [];
    return act.actions;
  };
  const current = toggleState(i);
  const names = [keyAt(i)?.title || 'État 1', keyAt(i)?.alt?.title || 'État 2'];

  const stateCard = (n) => {
    const getInner = () => actions()[n] ?? (actions()[n] = ACTION_TYPES.hotkey.create());
    const inner = getInner();
    return h(
      'div',
      { class: 'step' },
      h(
        'div',
        { class: 'step-head' },
        h('span', { class: `num${current === n ? ' live' : ''}`, title: current === n ? 'État actuel' : '' }, n + 1),
        h(
          'select',
          {
            onchange: (e) =>
              commit(() => {
                actions()[n] = ACTION_TYPES[e.target.value].create();
              }),
          },
          ...INNER_TYPES.map((t) => h('option', { value: t, selected: t === inner.type }, `${ACTION_TYPES[t].icon}  ${ACTION_TYPES[t].long}`)),
        ),
      ),
      h(
        'div',
        { class: 'step-body' },
        h('span', { class: 'field-label' }, a.same ? 'À chaque appui, envoyer :' : `Appui sur « ${names[n]} » : envoyer`),
        ...actionFields(getInner, `${tag}:t${n}`),
        ['hotkey', 'text'].includes(inner.type) ? compactTarget(getInner, `${tag}:t${n}`) : null,
      ),
    );
  };

  return h(
    'div',
    { class: 'field' },
    h('div', { class: 'note info' }, icon('info'),
      h('span', {}, a.sync?.simvar
        ? 'À chaque appui, la touche envoie l’action ; son état (titre, icône, couleur) suit ensuite le simulateur, même si vous agissez dans le cockpit.'
        : 'À chaque appui, la touche envoie l’action de son état actuel puis passe à l’autre état (titre, icône et couleur changent). Sur le Deck, un appui long change l’état sans rien envoyer, pour se recaler sur le simulateur.')),
    h(
      'label',
      { class: 'switch' },
      h('input', {
        type: 'checkbox',
        checked: !!a.same,
        onchange: (e) => commit(() => (getAction().same = e.target.checked)),
      }),
      'Même action pour les deux états (ex. touche G pour le train)',
    ),
    h('div', { class: 'steps' }, stateCard(0), a.same ? null : stateCard(1)),
    simSyncField(getAction, tag),
    h(
      'div',
      { class: 'row', style: { alignItems: 'center' } },
      h('span', { class: 'hint', style: { flex: 1 } }, `État actuel : ${current + 1} (« ${names[current]} »)`),
      h(
        'button',
        {
          class: 'btn small',
          style: { flex: 'none' },
          title: 'Change l’état affiché sans envoyer de touche',
          onclick: async () => {
            try {
              await api.sync(profile().id, page().id, i);
            } catch (e) {
              toast(e.message, 'err');
            }
          },
        },
        icon('refresh'),
        'Changer d’état',
      ),
    ),
  );
}

function appearanceSection(i) {
  const raw = keyAt(i);
  const isToggle = raw.action?.type === 'toggle';
  // Bascule : l'état 2 a sa propre apparence (key.alt), qui se superpose à celle de l'état 1.
  const alt = isToggle && state.faceTab === 1;
  const key = alt ? { ...raw, ...(raw.alt ?? {}) } : raw;
  const setFace = (patch, opts = { render: 'key' }) =>
    commit(() => {
      const k = keyAt(i);
      if (alt) k.alt = { ...(k.alt ?? {}), ...patch };
      else Object.assign(k, patch);
    }, opts);
  const isImage = key.icon?.startsWith('data:');
  if (isImage) state.iconTab = 'image';
  else if (isIconPath(key.icon) && state.iconTab === 'emoji') state.iconTab = 'avia';

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

  const aviaPanel = () => [
    h(
      'div',
      { class: 'emoji-grid avia-grid' },
      ...AVIA_ICONS.map((name) => {
        const src = `/public/icons/avia/${name}.svg`;
        return h(
          'button',
          { class: key.icon === src ? 'on' : '', title: name, onclick: () => setFace({ icon: src }, { render: 'all' }) },
          h('img', { src, alt: name, draggable: 'false' }),
        );
      }),
    ),
  ];

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
  const sec = section(
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
        h('button', { class: state.iconTab === 'avia' ? 'on' : '', onclick: () => { state.iconTab = 'avia'; renderInspector(); } }, 'Aviation'),
        h('button', { class: state.iconTab === 'image' ? 'on' : '', onclick: () => { state.iconTab = 'image'; renderInspector(); } }, 'Image'),
      ),
      ...(state.iconTab === 'image' ? imagePanel() : state.iconTab === 'avia' ? aviaPanel() : emojiPanel()),
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
  if (isToggle) {
    sec.querySelector('.section-head').after(
      h(
        'div',
        { class: 'segmented' },
        ...[0, 1].map((n) =>
          h('button', { class: state.faceTab === n ? 'on' : '', onclick: () => { state.faceTab = n; renderInspector(); } },
            `État ${n + 1}${n === 0 ? '' : ' (après un appui)'}`),
        ),
      ),
    );
  }
  if (!alt) sec.append(sizeField(i));
  return sec;
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
  state.faceTab = 0;
  state.iconTab = keyAt(i)?.icon?.startsWith('data:') ? 'image' : 'emoji';
  renderGrid();
  renderInspector();
}

function firstFreeSlot(w = 1, h = 1) {
  const { rows, cols } = layout();
  return findFreeSlot(page().keys, rows, cols, w, h);
}

/** Message d'erreur si la touche `j` (éventuellement fusionnée) ne tient pas à sa place, sinon null. */
function fitError(keys, j) {
  const { rows, cols } = layout();
  const { w, h } = spanOf(keys[j]);
  return placementError(keys, j, w, h, rows, cols, [j]);
}

function assignLibrary(item, i) {
  const { action, face } = createFromLibrary(item);
  // Préréglage de grande taille (ex. curseur 1×3) : on le réduit s'il ne tient pas ici.
  if (face.span && !page().keys[i]) {
    const { rows, cols } = layout();
    if (placementError(page().keys, i, face.span.w, face.span.h, rows, cols, [i])) {
      delete face.span;
      toast('Pas assez de place pour la taille prévue : agrandissez la touche dans Apparence › Taille.', 'info', 5000);
    }
  }
  commit(() => {
    const existing = page().keys[i];
    // Une touche existante garde son apparence personnalisée ; seule l'action change.
    // Exception : un préréglage complet (MSFS, rotatif, curseur…) apporte aussi son apparence.
    if (existing && item.action) {
      const { span } = existing;
      page().keys[i] = { ...face, action, ...(span ? { span } : {}) };
    } else {
      page().keys[i] = existing ? { ...existing, action } : { ...face, action };
    }
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
    if (!prev || key.title === (prev.face.title ?? prev.label)) key.title = t.face.title ?? t.label;
    if (t.alt && !key.alt) key.alt = { ...t.alt };
    key.action = t.create();
  });
}

function swapKeys(a, b) {
  if (a === b) return;
  // Simulation sur une copie : une touche fusionnée doit tenir à sa nouvelle place.
  const keys = clone(page().keys);
  const ka = keys[a];
  const kb = keys[b];
  delete keys[a];
  delete keys[b];
  if (kb) keys[a] = kb;
  if (ka) keys[b] = ka;
  const err = (ka && fitError(keys, b)) || (kb && fitError(keys, a));
  if (err) return toast(`Déplacement impossible : ${err}`, 'err', 4500);
  commit(() => (page().keys = keys));
  state.selected = b;
  renderGrid();
  renderInspector();
}

function moveKeyToPage(i, pageId) {
  const dest = profile().pages.find((p) => p.id === pageId);
  const { rows, cols } = layout();
  const { w, h } = spanOf(keyAt(i));
  const free = findFreeSlot(dest.keys, rows, cols, w, h);
  if (free === null) return toast(`Pas assez de place libre sur la page « ${dest.name} ».`, 'err');
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
  const keys = clone(page().keys);
  keys[i] = clone(state.clipboard);
  const err = fitError(keys, i);
  if (err) return toast(`Collage impossible : ${err}`, 'err', 4500);
  commit(() => (page().keys[i] = clone(state.clipboard)));
}

function duplicateKey(i) {
  const { w, h } = spanOf(keyAt(i));
  const free = firstFreeSlot(w, h);
  if (free === null) return toast('Pas assez de place libre sur cette page.', 'err');
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
  // Bascule : on teste l'action de l'état affiché, sans changer l'état.
  const tested = action.type === 'toggle' ? { ...action, testState: toggleState(i) } : action;
  const inner = action.type === 'toggle' ? (toggleState(i) && !action.same ? action.actions?.[1] : action.actions?.[0]) ?? {} : action;
  const needsFocus = (a) => ['hotkey', 'text'].includes(a.type) && (!a.target || a.target.by === 'none' || !a.target.value);
  const risky = needsFocus(inner) || (inner.type === 'multi' && inner.steps?.some(needsFocus));
  if (risky) {
    toast('Envoi dans 3 s : placez-vous dans le logiciel qui doit recevoir les touches…', 'info', 3000);
    await new Promise((r) => setTimeout(r, 3000));
  }
  try {
    await api.test(tested);
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
  // Une touche fusionnée se quitte par son bord : on avance de sa largeur / hauteur.
  const { w, h } = keySpan(keyAt(i));
  const moves = { ArrowLeft: -1, ArrowRight: w, ArrowUp: -cols, ArrowDown: h * cols };
  if (moves[e.key] !== undefined) {
    let next = i + moves[e.key];
    const sameRow = Math.floor(next / cols) === Math.floor(i / cols);
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !sameRow) next = -1;
    // Emplacement recouvert par une touche fusionnée : on sélectionne cette touche.
    if (next >= 0 && next < slotCount()) next = computeCells(page().keys, layout().rows, cols).coveredBy.get(next) ?? next;
    if (next >= 0 && next < slotCount() && next !== i) {
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
  $('msfsPill').addEventListener('click', () => openExplorer());
  $('updatePill').addEventListener('click', onUpdatePill);
  $('appVersion').addEventListener('click', checkUpdateNow);
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
        state.update = await api.update();
      } catch {}
      renderStatus();
      renderUpdate();
    },
    error: () => {
      state.connected = false;
      renderStatus();
    },
    hello: async ({ revision }) => {
      // Reconnexion : on récupère les modifications faites entre-temps.
      if (revision !== state.revision && !dirty) {
        const { config, revision: r, states, levels, values, flags } = await api.getConfig();
        state.flags = flags ?? {};
        state.config = config;
        state.revision = r;
        state.toggles = states ?? {};
        state.levels = levels ?? {};
        state.values = values ?? {};
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
    value: ({ key, value, flags }) => {
      state.values[key] = value;
      if (flags) state.flags[key] = flags;
      refreshKeyViews();
    },
    level: ({ key, level }) => {
      state.levels[key] = level;
      refreshKeyViews();
    },
    state: ({ key, state: value }) => {
      if (value) state.toggles[key] = 1;
      else delete state.toggles[key];
      refreshKeyViews();
    },
    update: (u) => {
      state.update = u;
      renderUpdate();
    },
    simhub: (m) => {
      if (state.status) state.status.simhub = m;
      renderSimhub();
    },
    msfs: (m) => {
      if (state.status) state.status.msfs = m;
      renderMsfs();
      // Met à jour la note de connexion dans l'inspecteur, sans perdre une saisie en cours.
      if (!document.activeElement?.closest?.('.inspector')) renderInspector();
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
    const [{ config, revision, states, levels, values, flags }, status] = await Promise.all([api.getConfig(), api.status()]);
    state.flags = flags ?? {};
    state.config = config;
    state.revision = revision;
    state.toggles = states ?? {};
    state.levels = levels ?? {};
    state.values = values ?? {};
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
