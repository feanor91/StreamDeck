import { api, subscribe } from './api.js';
import { h, toast } from './dom.js';
import { keyFace } from './catalog.js';

const $ = (id) => document.getElementById(id);

const state = { config: null, layouts: null, profileId: null, pageId: null };

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

function render(direction = 0) {
  const { rows, cols } = layout();
  const grid = $('deckGrid');
  grid.style.setProperty('--cols', cols);
  grid.style.setProperty('--rows', rows);

  const pg = page();
  const keys = [];
  for (let i = 0; i < rows * cols; i++) keys.push(buildKey(pg, i));
  grid.replaceChildren(...keys);

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

function buildKey(pg, i) {
  const key = pg.keys[i] ?? null;
  const el = h('button', { class: `dkey${key ? '' : ' empty'}`, 'aria-label': key?.title || `Touche ${i + 1}` }, keyFace(key));
  if (!key) return el;

  const release = () => el.classList.remove('down');
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    el.classList.add('down');
    el.setPointerCapture?.(e.pointerId);
    press(el, pg.id, i, key);
  });
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  return el;
}

async function press(el, pageId, index, key) {
  navigator.vibrate?.(12);
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

$('fsBtn').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});
document.addEventListener('pointerdown', keepAwake, { once: true });
document.addEventListener('visibilitychange', keepAwake);

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
  const [{ config }, status] = await Promise.all([api.getConfig(), api.status()]);
  state.layouts = status.layouts;
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
  });
}

init();
