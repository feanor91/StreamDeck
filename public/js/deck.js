import { api, subscribe } from './api.js';
import { h, toast } from './dom.js';
import { keyFace } from './catalog.js';
import { computeCells, stateKey, fitGrid, orientCell } from '/shared/layout.js';

const $ = (id) => document.getElementById(id);

const state = { config: null, layouts: null, profileId: null, pageId: null, toggles: {} };
const LONG_PRESS_MS = 600;

// Pont fourni par l'application Android (absent dans un navigateur).
const nativeApp = window.DeckApp ?? null;

const profile = () => state.config.profiles.find((p) => p.id === state.profileId) ?? state.config.profiles[0];
const page = () => profile().pages.find((p) => p.id === state.pageId) ?? profile().pages[0];
const layout = () => state.layouts?.[state.config.layout] ?? { rows: 3, cols: 5 };

function applyConfig(config) {
  const profileChanged = config.activeProfileId !== state.config?.activeProfileId;
  state.config = config;
  // Le Deck suit le profil actif choisi dans l'interface de gestion.
  if (profileChanged || !config.profiles.some((p) => p.id === state.profileId)) {
    state.profileId = config.activeProfileId;
    state.pageId = null;
  }
  if (!profile().pages.some((p) => p.id === state.pageId)) state.pageId = profile().pages[0].id;
  render();
}

function goToPage(id, direction = 0) {
  const pages = profile().pages;
  const idx = pages.findIndex((p) => p.id === page().id);
  let target = id;
  if (id === '@next') target = pages[(idx + 1) % pages.length].id;
  if (id === '@prev') target = pages[(idx - 1 + pages.length) % pages.length].id;
  const to = pages.findIndex((p) => p.id === target);
  if (to < 0) return toast('Page introuvable.', 'err');
  state.pageId = target;
  render(direction || (to > idx ? 1 : -1));
}

// Disposition affichée : la grille remplit tout l'écran ; en portrait, une grille
// pensée pour le paysage (ex. 3×5) est transposée (5×3) pour garder des touches
// proches du carré. Retourne aussi le rayon des coins adapté à la taille des touches.
function displayLayout() {
  const { rows, cols } = layout();
  const stage = $('stage');
  const style = getComputedStyle(stage);
  const w = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const hgt = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const fit = fitGrid(rows, cols, w, hgt);
  const gap = Math.max(6, Math.min(16, Math.min(w, hgt) * 0.018));
  const cellW = (w - (fit.cols - 1) * gap) / fit.cols;
  const cellH = (hgt - (fit.rows - 1) * gap) / fit.rows;
  return { ...fit, gap, radius: Math.max(8, Math.min(cellW, cellH) * 0.14), key: `${fit.rows}x${fit.cols}` };
}

let lastLayoutKey = '';

function render(direction = 0) {
  const { rows, cols } = layout();
  const view = displayLayout();
  lastLayoutKey = view.key;
  const grid = $('deckGrid');
  grid.style.setProperty('--cols', view.cols);
  grid.style.setProperty('--rows', view.rows);
  grid.style.setProperty('--gap', `${view.gap}px`);
  grid.style.setProperty('--key-radius', `${view.radius}px`);

  const pg = page();
  const { cells } = computeCells(pg.keys, rows, cols);
  grid.replaceChildren(...cells.map((cell) => buildKey(pg, orientCell(cell, view.transposed))));

  grid.classList.remove('slide-left', 'slide-right');
  if (direction) {
    void grid.offsetWidth;
    grid.classList.add(direction > 0 ? 'slide-left' : 'slide-right');
  }

  $('deckProfile').textContent = profile().name;
  $('deckPage').textContent = pg.name;
  const pages = profile().pages;
  $('deckDots').replaceChildren(
    ...(pages.length > 1
      ? pages.map((p) =>
          h('button', { class: p.id === pg.id ? 'on' : '', title: p.name, onclick: () => p.id !== pg.id && goToPage(p.id) }),
        )
      : []),
  );
}

const toggleState = (pageId, i) => (state.toggles[stateKey(profile().id, pageId, i)] ? 1 : 0);

function buildKey(pg, cell) {
  const i = cell.index;
  const key = cell.key;
  const el = h(
    'button',
    {
      class: `dkey${key ? '' : ' empty'}`,
      'aria-label': key?.title || `Touche ${i + 1}`,
      dataset: { index: i },
      style: { gridColumn: `${cell.col + 1} / span ${cell.w}`, gridRow: `${cell.row + 1} / span ${cell.h}` },
    },
    keyFace(key, toggleState(pg.id, i)),
  );
  if (!key) return el;

  const isToggle = key.action?.type === 'toggle';
  let timer = null;
  let longDone = false;
  const release = () => {
    clearTimeout(timer);
    el.classList.remove('down');
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    el.classList.add('down');
    el.setPointerCapture?.(e.pointerId);
    longDone = false;
    // Une bascule s'exécute au relâchement, pour laisser la place à l'appui long
    // (resynchronisation). Les autres touches réagissent dès l'appui.
    if (!isToggle) return press(el, pg.id, i, key);
    timer = setTimeout(() => {
      longDone = true;
      resync(el, pg.id, i);
    }, LONG_PRESS_MS);
  });
  el.addEventListener('pointerup', () => {
    const wasDown = el.classList.contains('down');
    release();
    if (isToggle && wasDown && !longDone) press(el, pg.id, i, key);
  });
  el.addEventListener('pointercancel', release);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  return el;
}

async function resync(el, pageId, index) {
  if (nativeApp) nativeApp.haptic();
  else navigator.vibrate?.([10, 40, 10]);
  try {
    await api.sync(profile().id, pageId, index);
    feedback(el, 'ok');
    toast('État resynchronisé (aucune touche envoyée)');
  } catch (e) {
    feedback(el, 'err');
    toast(e.message, 'err', 4000);
  }
}

// Met à jour une seule touche quand l'état d'une bascule change (sans redessiner la page).
function refreshToggle(key) {
  const [profileId, pageId, index] = key.split('/');
  if (profileId !== profile().id || pageId !== page().id) return;
  const el = document.querySelector(`.dkey[data-index="${index}"]`);
  const k = page().keys[index];
  if (!el || !k) return;
  el.querySelector('.keyface')?.replaceWith(keyFace(k, toggleState(pageId, Number(index))));
}

async function press(el, pageId, index, key) {
  if (nativeApp) nativeApp.haptic();
  else navigator.vibrate?.(12);
  if (key.action?.type === 'page') {
    if (key.action.pageId) goToPage(key.action.pageId);
    return;
  }
  const spinner = setTimeout(() => el.append(h('span', { class: 'spinner' })), 250);
  try {
    await api.press(profile().id, pageId, index);
    feedback(el, 'ok');
  } catch (e) {
    feedback(el, 'err');
    toast(e.message, 'err', 4000);
  } finally {
    clearTimeout(spinner);
    el.querySelector('.spinner')?.remove();
  }
}

function feedback(el, cls) {
  el.classList.remove('ok', 'err');
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 700);
}

// ---------------------------------------------------------------------------
// Plein écran et maintien de l'écran allumé
// ---------------------------------------------------------------------------
let wakeLock = null;
async function keepAwake() {
  try {
    if (!wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock?.request('screen');
      wakeLock?.addEventListener('release', () => (wakeLock = null));
    }
  } catch {}
}

if (nativeApp) {
  // L'application gère déjà le plein écran ; on propose à la place de changer de PC.
  $('fsBtn').hidden = true;
  $('switchBtn').hidden = false;
  $('switchBtn').addEventListener('click', () => nativeApp.disconnect());
}

$('fsBtn').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});
document.addEventListener('pointerdown', keepAwake, { once: true });
document.addEventListener('visibilitychange', keepAwake);

// Rotation de l'écran ou redimensionnement : on réadapte la grille (coins, espacement,
// orientation). Pas de nouveau rendu complet si la disposition ne change pas.
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!state.config) return;
    const view = displayLayout();
    if (view.key !== lastLayoutKey) return render();
    const grid = $('deckGrid');
    grid.style.setProperty('--gap', `${view.gap}px`);
    grid.style.setProperty('--key-radius', `${view.radius}px`);
  }, 120);
});

// Navigation au clavier / à la molette quand le Deck est ouvert sur un ordinateur.
document.addEventListener('keydown', (e) => {
  if (!state.config) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') goToPage('@next', 1);
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') goToPage('@prev', -1);
});

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------
function setConnected(on) {
  $('conn').classList.toggle('off', !on);
  $('conn').title = on ? 'Connecté' : 'Connexion perdue — reconnexion…';
}

async function load() {
  const [{ config, states }, status] = await Promise.all([api.getConfig(), api.status()]);
  state.layouts = status.layouts;
  state.toggles = states ?? {};
  applyConfig(config);
}

async function init() {
  try {
    await load();
  } catch (e) {
    document.body.append(h('div', { class: 'deck-offline' }, `Impossible de joindre le serveur StreamDeck.\n${e.message}`));
    setTimeout(() => location.reload(), 4000);
    return;
  }
  subscribe({
    open: () => setConnected(true),
    error: () => setConnected(false),
    hello: () => load().catch(() => {}),
    config: ({ config }) => applyConfig(config),
    state: ({ key, state: value }) => {
      if (value) state.toggles[key] = 1;
      else delete state.toggles[key];
      refreshToggle(key);
    },
  });
}

init();
