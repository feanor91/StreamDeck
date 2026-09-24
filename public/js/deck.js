import { api, subscribe } from './api.js';
import { h, toast } from './dom.js';
import { keyFace } from './catalog.js';
import { computeCells, stateKey, fitGrid, orientCell } from '/shared/layout.js';
import { DIAL_SENSITIVITY, clamp } from '/shared/controls.js';
import { clientId } from './api.js';

const $ = (id) => document.getElementById(id);

const state = { config: null, layouts: null, profileId: null, pageId: null, toggles: {}, levels: {}, values: {}, flags: {} };
const angles = {}; // angle affiché du repère de chaque bouton rotatif (visuel local)
const dragging = new Set(); // curseurs en cours de manipulation : on ignore les positions reçues
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

// Valeurs en direct d'une touche continue (bouton rotatif, curseur).
function liveOf(pageId, i, cell) {
  const sk = stateKey(profile().id, pageId, i);
  return { value: state.values[sk], flags: state.flags[sk], level: state.levels[sk] ?? 0, angle: angles[sk] ?? 0, vertical: cell ? cell.h >= cell.w : true };
}

function buildKey(pg, cell) {
  const i = cell.index;
  const key = cell.key;
  if (key?.action?.type === 'dial' || key?.action?.type === 'slider') return buildControl(pg, cell);
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

// ---------------------------------------------------------------------------
// Bouton rotatif et curseur
// ---------------------------------------------------------------------------
function buildControl(pg, cell) {
  const i = cell.index;
  const key = cell.key;
  const sk = stateKey(profile().id, pg.id, i);
  const isDial = key.action.type === 'dial';
  const el = h(
    'button',
    {
      class: `dkey control ${isDial ? 'dial' : 'slider'}`,
      'aria-label': key.title || (isDial ? 'Bouton rotatif' : 'Curseur'),
      dataset: { index: i },
      style: { gridColumn: `${cell.col + 1} / span ${cell.w}`, gridRow: `${cell.row + 1} / span ${cell.h}` },
    },
    keyFace(key, 0, liveOf(pg.id, i, cell)),
  );
  const repaint = () => el.querySelector('.keyface')?.replaceWith(keyFace(key, 0, liveOf(pg.id, i, cell)));

  // Envois regroupés : un seul appel réseau à la fois, les gestes s'accumulent entre-temps.
  let inflight = false;
  let pendingDelta = 0;
  let pendingLevel = null;
  const flush = () => {
    if (inflight) return;
    let input = null;
    if (pendingDelta) {
      input = { kind: 'dial', delta: pendingDelta };
      pendingDelta = 0;
    } else if (pendingLevel !== null) {
      input = { kind: 'slider', level: pendingLevel };
      pendingLevel = null;
    }
    if (!input) return;
    inflight = true;
    api
      .control(profile().id, pg.id, i, input)
      .catch((e) => {
        feedback(el, 'err');
        toast(e.message, 'err', 4000);
      })
      .finally(() => {
        inflight = false;
        flush();
      });
  };

  const tap = (kind = 'press') => {
    if (nativeApp) nativeApp.haptic();
    else navigator.vibrate?.(kind === 'hold' ? [10, 40, 10] : 12);
    if (!key.action[kind]?.type) return false;
    api
      .control(profile().id, pg.id, i, { kind })
      .then(() => feedback(el, 'ok'))
      .catch((e) => {
        feedback(el, 'err');
        toast(e.message, 'err', 4000);
      });
    return true;
  };

  let down = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let acc = 0;
  let holdTimer = null;
  let held = false;

  const step = (n) => {
    angles[sk] = (angles[sk] ?? 0) + 15 * n;
    el.querySelector('.kf-dial')?.style.setProperty('--angle', `${angles[sk]}deg`);
    if (nativeApp) nativeApp.haptic();
    pendingDelta += n;
    flush();
  };

  const levelAt = (e) => {
    const track = el.querySelector('.kf-track')?.getBoundingClientRect() ?? el.getBoundingClientRect();
    const vertical = cell.h >= cell.w;
    return clamp(vertical ? 1 - (e.clientY - track.top) / track.height : (e.clientX - track.left) / track.width, 0, 1);
  };
  const setLevel = (level) => {
    state.levels[sk] = level;
    const face = el.querySelector('.keyface');
    face?.style.setProperty('--level', level);
    const v = face?.querySelector('.kf-value');
    if (v) v.textContent = `${Math.round(level * 100)} %`;
    pendingLevel = level;
    flush();
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    el.setPointerCapture?.(e.pointerId);
    el.classList.add('active');
    down = true;
    moved = false;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    acc = 0;
    held = false;
    clearTimeout(holdTimer);
    // Appui long sans glisser : action « appui long » (tirer un bouton du FCU Airbus…).
    if (isDial && key.action.hold?.type) {
      holdTimer = setTimeout(() => {
        if (moved) return;
        held = true;
        tap('hold');
        feedback(el, 'ok');
      }, LONG_PRESS_MS);
    }
    if (!isDial) dragging.add(sk);
  });
  el.addEventListener('pointermove', (e) => {
    if (!down) return;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) {
      moved = true;
      clearTimeout(holdTimer);
    }
    if (isDial) {
      // Glisser vers la droite ou vers le haut = « + » ; vers la gauche ou le bas = « − ».
      acc += e.clientX - lastX - (e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
      const sens = DIAL_SENSITIVITY[key.action.sensitivity] ?? DIAL_SENSITIVITY.normal;
      let n = 0;
      while (acc >= sens) {
        acc -= sens;
        n++;
      }
      while (acc <= -sens) {
        acc += sens;
        n--;
      }
      if (n) step(n);
    } else if (moved) {
      setLevel(levelAt(e));
    }
  });
  const end = (e) => {
    if (!down) return;
    down = false;
    clearTimeout(holdTimer);
    el.classList.remove('active');
    dragging.delete(sk);
    if (moved || held || e.type === 'pointercancel') return;
    // Appui sans glisser : action « appui » (valider), sinon le curseur saute à la position touchée.
    if (!tap() && !isDial) setLevel(levelAt(e));
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  // Molette de la souris (Deck ouvert sur un ordinateur).
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      if (isDial) step(dir);
      else setLevel(clamp((state.levels[sk] ?? 0) + dir * 0.05, 0, 1));
    },
    { passive: false },
  );
  el.repaint = repaint;
  return el;
}

// Mise à jour d'une touche continue quand le serveur annonce une valeur ou une position.
function refreshControl(sk) {
  const [profileId, pageId, index] = sk.split('/');
  if (profileId !== profile().id || pageId !== page().id || dragging.has(sk)) return;
  document.querySelector(`.dkey[data-index="${index}"]`)?.repaint?.();
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
  const [{ config, states, levels, values, flags }, status] = await Promise.all([api.getConfig(), api.status()]);
  state.layouts = status.layouts;
  state.toggles = states ?? {};
  state.levels = levels ?? {};
  state.values = values ?? {};
  state.flags = flags ?? {};
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
    value: ({ key, value, flags }) => {
      state.values[key] = value;
      if (flags) state.flags[key] = flags;
      refreshControl(key);
    },
    level: ({ key, level, origin }) => {
      if (origin === clientId) return; // notre propre geste, déjà affiché
      state.levels[key] = level;
      refreshControl(key);
    },
    state: ({ key, state: value }) => {
      if (value) state.toggles[key] = 1;
      else delete state.toggles[key];
      refreshToggle(key);
    },
  });
}

init();
