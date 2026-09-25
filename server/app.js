import http from 'node:http';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, findKey, LAYOUTS, validateConfig } from './store.js';
import { createBackups } from './backups.js';
import { createExecutor } from './executors/index.js';
import { runAction, toggleAction } from './actions.js';
import { ToggleStates } from './states.js';
import { stateKey } from '../shared/layout.js';
import { startDiscovery } from './discovery.js';
import { createReleaseChecker } from './update.js';
import { createMsfs } from './msfs.js';
import { createSimhub } from './simhub.js';
import { normalizeVar, defaultUnit } from '../shared/msfs.js';
import { clamp, levelToValue, valueToLevel, notchDelta, MAX_STEPS } from '../shared/controls.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Actions transmises directement au simulateur (pas de frappe clavier à espacer).
const DIRECT_ACTIONS = new Set(['msfs', 'simhub']);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VERSION = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const MAX_BODY = 25 * 1024 * 1024;

const STATIC = {
  '/': 'public/index.html',
  '/deck': 'public/deck.html',
};
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const httpError = (message, status) => Object.assign(new Error(message), { status });

function isLocal(req) {
  const addr = req.socket.remoteAddress || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw httpError('Requête trop volumineuse.', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw httpError('JSON invalide.', 400);
  }
}

async function serveStatic(res, pathname) {
  let rel = STATIC[pathname];
  if (!rel) {
    if (!pathname.startsWith('/public/') && !pathname.startsWith('/shared/')) return false;
    rel = decodeURIComponent(pathname.slice(1));
  }
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(path.join(ROOT, 'public')) && !file.startsWith(path.join(ROOT, 'shared'))) return false;
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

// Protège contre les requêtes intersites (CSRF) et le « DNS rebinding » :
// une page web ouverte dans le navigateur ne doit pas pouvoir piloter le Deck.
function originHost(origin) {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

function checkRequestOrigin(req) {
  const host = (req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  // IP, nom de machine sans domaine (ex. « MON-PC ») ou domaine local uniquement.
  const hostOk = /^[\d.]+$/.test(host) || host.includes(':') || !host.includes('.') || /\.(local|lan|home)$/.test(host);
  if (!hostOk) throw httpError('Hôte non autorisé.', 403);
  if (req.method === 'GET') return;
  const origin = req.headers.origin;
  if (origin && originHost(origin) !== req.headers.host) throw httpError('Origine non autorisée.', 403);
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
    throw httpError('Content-Type application/json requis.', 415);
  }
}

export function lanAddresses() {
  const out = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

/**
 * Démarre le serveur StreamSim (HTTP + découverte réseau).
 * Utilisé par la ligne de commande (server/index.js) et par l'application PC (desktop/main.js).
 */
export async function startDeckServer({
  port = 3210,
  host = '0.0.0.0',
  dataDir = path.join(ROOT, 'data'),
  dryRun = false,
  remoteAdmin = false,
  discovery = true,
  msfs: msfsEnabled = true,
  msfsLoader, // tests : remplace le module node-simconnect par une imitation
  simhub: simhubEnabled = true,
  simhubConnect, // tests : remplace la connexion TCP vers SimHub
  simhubPort,
  updater: customUpdater, // application PC : téléchargement et installation (electron-updater)
  updateCheck = true, // recherche automatique des nouvelles versions sur GitHub
  log = console,
} = {}) {
  const store = new Store(dataDir);
  const backups = createBackups(dataDir, { version: VERSION });
  const toggles = new ToggleStates(dataDir);
  const executor = createExecutor({ dryRun, log: (m) => log.log(m) });
  let executorStatus = { ok: false, reason: 'Vérification en cours…' };
  const clients = new Set();
  let revision = 0;

  const deckUrls = () => lanAddresses().map((a) => `http://${a}:${port}/deck`);

  // --- Microsoft Flight Simulator -------------------------------------------------------
  // Liaisons entre les touches et les variables du simulateur :
  //  - bascule avec `sync.simvar`      → état on/off ;
  //  - bouton rotatif avec `display`   → valeur affichée (ex. cap sélecté) ;
  //  - curseur avec `sync`             → position du curseur ;
  //  - afficheur avec `display`        → valeur affichée.
  // La source est une variable MSFS (simvar), un Input Event MSFS 2024 (input)
  // ou une propriété SimHub (simhub).
  const liveValues = {}; // touche → dernière valeur affichée
  const liveFlags = {}; // touche → { dashes, managed, std } (afficheurs type FCU)
  function simBindings() {
    const out = [];
    const src = (o, onOff) =>
      o.simhub
        ? { simhub: o.simhub }
        : o.input
          ? { input: o.input }
          : { simvar: normalizeVar(o.simvar), unit: o.unit || defaultUnit(o.simvar, onOff) };
    const bound = (o) => !!(o?.simvar || o?.input || o?.simhub);
    for (const p of store.config?.profiles ?? []) {
      for (const pg of p.pages) {
        for (const [index, key] of Object.entries(pg.keys)) {
          const a = key?.action;
          const sk = stateKey(p.id, pg.id, index);
          if (a?.type === 'toggle' && bound(a.sync)) {
            out.push({ sk, kind: 'toggle', ...src(a.sync, true), invert: !!a.sync.invert, equals: a.sync.equals });
          } else if (a?.type === 'display' && bound(a.display)) {
            out.push({ sk, kind: 'value', ...src(a.display, false) });
          } else if (a?.type === 'dial' && bound(a.display)) {
            out.push({ sk, kind: 'value', ...src(a.display, false) });
            for (const flag of ['dashes', 'managed', 'stdVar']) {
              if (a.display[flag]) out.push({ sk, kind: 'flag', flag, simvar: normalizeVar(a.display[flag]), unit: 'number' });
            }
          } else if (a?.type === 'slider' && bound(a.sync)) {
            out.push({ sk, kind: 'level', ...src(a.sync, false), min: a.sync.min ?? 0, max: a.sync.max ?? 100 });
          }
        }
      }
    }
    return out;
  }

  function applyBinding(b, value) {
    if (b.kind === 'toggle') {
      const v = Number(value);
      const hasEquals = b.equals !== undefined && b.equals !== null && b.equals !== '';
      // Valeur texte (propriété SimHub) : comparée telle quelle, sinon « non vide ».
      const hit = hasEquals
        ? String(value) === String(b.equals) || Math.abs(v - Number(b.equals)) < 1e-6
        : Number.isNaN(v) ? String(value) !== '' : v !== 0;
      const on = hit !== b.invert ? 1 : 0;
      if (toggles.get(b.sk) === on) return;
      toggles.set(b.sk, on);
      broadcast('state', { key: b.sk, state: on });
    } else if (b.kind === 'value') {
      if (liveValues[b.sk] === value) return;
      liveValues[b.sk] = value;
      broadcast('value', { key: b.sk, value, flags: liveFlags[b.sk] ?? null });
    } else if (b.kind === 'flag') {
      const flags = (liveFlags[b.sk] ??= {});
      const name = b.flag === 'stdVar' ? 'std' : b.flag;
      // Calage « STD » : mode 0 de l'afficheur baro FlyByWire.
      const on = name === 'std' ? Number(value) === 0 : Number(value) !== 0;
      if (flags[name] === on) return;
      flags[name] = on;
      broadcast('value', { key: b.sk, value: liveValues[b.sk] ?? null, flags });
    } else {
      const level = valueToLevel(value, b.min, b.max);
      if (Math.abs((toggles.getLevel(b.sk) ?? -1) - level) < 0.002) return;
      broadcast('level', { key: b.sk, level: toggles.setLevel(b.sk, level) });
    }
  }

  function applySimvar(simvar, value, unit = 'Bool') {
    if (value === null || value === undefined) return;
    for (const b of simBindings()) {
      if (b.input || b.simhub || b.simvar !== simvar || b.unit.toLowerCase() !== String(unit).toLowerCase()) continue;
      applyBinding(b, value);
    }
  }

  function applyInput(name, value) {
    if (value === null || value === undefined || typeof value === 'string') return;
    for (const b of simBindings()) if (b.input === name) applyBinding(b, value);
  }

  function applySimhub(name, value) {
    for (const b of simBindings()) if (b.simhub === name) applyBinding(b, value);
  }

  const msfs = createMsfs({
    log,
    ...(msfsLoader ? { load: msfsLoader } : {}),
    onStatus: (s) => broadcast('msfs', s),
    onValue: applySimvar,
    onInput: applyInput,
  });

  const simhub = createSimhub({
    log,
    ...(simhubConnect ? { connect: simhubConnect } : {}),
    ...(simhubPort ? { port: simhubPort } : {}),
    onStatus: (s) => broadcast('simhub', s),
    onValue: applySimhub,
  });

  function refreshSimWatch() {
    const bindings = simBindings();
    const fromMsfs = bindings.filter((b) => !b.simhub);
    msfs.watch(fromMsfs.map((b) => (b.input ? { input: b.input } : { simvar: b.simvar, unit: b.unit })));
    simhub.watch(bindings.filter((b) => b.simhub).map((b) => b.simhub));
    for (const b of bindings) {
      const v = b.simhub ? simhub.value(b.simhub) : b.input ? msfs.inputValue(b.input) : msfs.value(b.simvar, b.unit);
      if (v !== null && v !== undefined) applyBinding(b, v);
    }
  }

  // Bouton rotatif et curseur : un geste (crans, position) ou un appui.
  async function handleContinuous(key, sk, input) {
    const a = key.action;
    if (!input || input.kind === 'press') {
      if (!a.press?.type) return { ok: true };
      await runAction(executor, a.press, 0, ctx);
      return { ok: true };
    }
    // Appui long : sur un bouton du FCU Airbus, « tirer » (mode sélecté).
    if (input.kind === 'hold') {
      if (!a.hold?.type) return { ok: true };
      await runAction(executor, a.hold, 0, ctx);
      return { ok: true };
    }
    if (a.type === 'dial' && input.kind === 'dial') {
      const delta = Math.trunc(Number(input.delta) || 0);
      const act = delta > 0 ? a.inc : a.dec;
      if (!delta) return { ok: true, steps: 0 };
      if (!act?.type) throw new Error(`Aucune action « ${delta > 0 ? '+' : '−'} » définie pour ce bouton.`);
      const n = Math.min(Math.abs(delta), MAX_STEPS);
      for (let i = 0; i < n; i++) {
        await runAction(executor, act, 0, ctx);
        if (!DIRECT_ACTIONS.has(act.type)) await sleep(25); // laisse le logiciel encaisser les frappes clavier
      }
      return { ok: true, steps: n };
    }
    if (a.type === 'slider' && input.kind === 'slider') {
      const level = clamp(Number(input.level) || 0, 0, 1);
      if ((a.mode ?? 'value') === 'value') {
        if (a.set?.type !== 'msfs' || !a.set.event) throw new Error('Choisissez la commande MSFS qui reçoit la position du curseur.');
        await runAction(executor, { ...a.set, value: levelToValue(level, a.min ?? 0, a.max ?? 16383) }, 0, ctx);
      } else {
        const d = notchDelta(toggles.getLevel(sk) ?? 0, level, a.notches ?? 10);
        const act = d > 0 ? a.inc : a.dec;
        if (d && !act?.type) throw new Error(`Aucune action « ${d > 0 ? '+' : '−'} » définie pour ce curseur.`);
        for (let i = 0; i < Math.min(Math.abs(d), MAX_STEPS); i++) {
          await runAction(executor, act, 0, ctx);
          if (!DIRECT_ACTIONS.has(act.type)) await sleep(25);
        }
      }
      const saved = toggles.setLevel(sk, level);
      broadcast('level', { key: sk, level: saved, origin: input.clientId ?? null });
      return { ok: true, level: saved };
    }
    throw httpError('Geste non pris en charge par cette touche.', 400);
  }
  const ctx = { msfs, simhub };

  const updater = customUpdater ?? createReleaseChecker({ current: VERSION, log, auto: updateCheck });
  const stopUpdateEvents = updater.onChange((u) => broadcast('update', u));

  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(payload);
  }

  // Par défaut, seule la machine locale peut modifier la configuration ou tester
  // des actions. Les autres appareils du réseau peuvent uniquement utiliser le Deck.
  function requireAdmin(req) {
    if (!remoteAdmin && !isLocal(req)) {
      throw httpError("Modification réservée à l'ordinateur hôte (démarrez avec DECK_REMOTE_ADMIN=1 pour l'autoriser).", 403);
    }
  }

  async function handleApi(req, res, pathname) {
    checkRequestOrigin(req);
    switch (`${req.method} ${pathname}`) {
      case 'GET /api/config':
        return send(res, 200, { revision, config: store.config, states: toggles.all(), levels: toggles.levels(), values: liveValues, flags: liveFlags });

      case 'PUT /api/config': {
        requireAdmin(req);
        const body = await readJson(req);
        try {
          await store.save(body.config);
        } catch (e) {
          throw Object.assign(e, { status: e.status ?? 400 });
        }
        revision++;
        broadcast('config', { revision, origin: body.clientId ?? null, config: store.config });
        refreshSimWatch();
        backups.autoSave(store.config).catch((e) => log.warn(`Sauvegarde automatique impossible : ${e.message}`));
        return send(res, 200, { revision });
      }

      // --- Sauvegardes de la configuration ---
      case 'GET /api/backups':
        requireAdmin(req);
        return send(res, 200, { backups: await backups.list() });

      case 'POST /api/backups': {
        requireAdmin(req);
        const body = await readJson(req);
        const kind = body.kind === 'safety' ? 'safety' : 'manual';
        return send(res, 200, { backup: await backups.create(store.config, { kind, label: body.label ?? '' }) });
      }

      case 'POST /api/backups/read': {
        requireAdmin(req);
        const { id } = await readJson(req);
        return send(res, 200, await backups.read(id));
      }

      case 'POST /api/backups/delete': {
        requireAdmin(req);
        const { id } = await readJson(req);
        await backups.remove(id);
        return send(res, 200, { ok: true });
      }

      // Restauration : la configuration actuelle est d'abord sauvegardée (retour possible).
      case 'POST /api/backups/restore': {
        requireAdmin(req);
        const { id } = await readJson(req);
        const data = await backups.read(id);
        try {
          validateConfig(structuredClone(data.config));
        } catch (e) {
          throw Object.assign(e, { status: 422 });
        }
        await backups.create(store.config, { kind: 'safety', label: 'Avant restauration' });
        await store.save(data.config);
        revision++;
        broadcast('config', { revision, origin: null, config: store.config });
        refreshSimWatch();
        return send(res, 200, { revision, config: store.config });
      }

      case 'GET /api/status':
        return send(res, 200, {
          app: 'streamdeck', // identifiant de protocole, inchangé depuis l'ancien nom (clients existants)
          version: VERSION,
          name: os.hostname(),
          platform: process.platform,
          executor: executor.label,
          executorStatus,
          dryRun,
          canAdmin: remoteAdmin || isLocal(req),
          deckUrls: deckUrls(),
          addresses: lanAddresses(),
          port,
          layouts: LAYOUTS,
          msfs: msfsEnabled ? msfs.status : { available: false, connected: false, reason: 'Liaison MSFS désactivée.' },
          simhub: simhubEnabled ? simhub.status : { available: false, connected: false, reason: 'Liaison SimHub désactivée.' },
        });

      case 'GET /api/update':
        return send(res, 200, updater.status());

      case 'POST /api/update/check':
        requireAdmin(req);
        return send(res, 200, await updater.check());

      case 'POST /api/update/install':
        requireAdmin(req);
        await updater.install();
        return send(res, 200, { ok: true });

      case 'POST /api/press': {
        const { profileId, pageId, index, syncOnly, input } = await readJson(req);
        const key = findKey(store.config, profileId, pageId, index);
        if (!key) throw httpError('Touche vide.', 404);
        const started = Date.now();
        const isToggle = key.action?.type === 'toggle';
        const sk = stateKey(profileId, pageId, index);
        // Appui long sur une bascule : on change l'état sans rien envoyer (resynchronisation).
        if (syncOnly) {
          if (!isToggle) throw httpError('Seules les touches à bascule peuvent être resynchronisées.', 400);
          const state = toggles.set(sk, !toggles.get(sk));
          broadcast('state', { key: sk, state });
          return send(res, 200, { ok: true, state });
        }
        // Afficheur : l'appui déclenche l'action facultative associée.
        if (key.action?.type === 'display') {
          try {
            if (key.action.press?.type) await runAction(executor, key.action.press, 0, ctx);
            broadcast('press', { profileId, pageId, index, ok: true });
            return send(res, 200, { ok: true });
          } catch (e) {
            broadcast('press', { profileId, pageId, index, ok: false, error: e.message });
            throw Object.assign(e, { status: 422 });
          }
        }
        if (key.action?.type === 'dial' || key.action?.type === 'slider') {
          try {
            const result = await handleContinuous(key, sk, input);
            if (!input || input.kind === 'press') broadcast('press', { profileId, pageId, index, ok: true });
            return send(res, 200, result);
          } catch (e) {
            broadcast('press', { profileId, pageId, index, ok: false, error: e.message });
            throw Object.assign(e, { status: e.status ?? 422 });
          }
        }
        try {
          if (isToggle) {
            const inner = toggleAction(key.action, toggles.get(sk));
            if (!inner?.type) throw new Error('Aucune action définie pour cet état de la bascule.');
            await runAction(executor, inner, 0, ctx);
            // Bascule synchronisée avec MSFS : l'état viendra du simulateur lui-même.
            const sync = key.action.sync;
            const simSynced =
              ((sync?.simvar || sync?.input) && msfs.status.connected) || (sync?.simhub && simhub.status.connected);
            if (!simSynced) {
              const state = toggles.set(sk, !toggles.get(sk));
              broadcast('state', { key: sk, state });
            }
          } else {
            await runAction(executor, key.action, 0, ctx);
          }
          broadcast('press', { profileId, pageId, index, ok: true });
          return send(res, 200, { ok: true, ms: Date.now() - started, state: isToggle ? toggles.get(sk) : undefined });
        } catch (e) {
          broadcast('press', { profileId, pageId, index, ok: false, error: e.message });
          throw Object.assign(e, { status: 422 });
        }
      }

      case 'POST /api/test': {
        requireAdmin(req);
        const { action } = await readJson(req);
        try {
          await runAction(executor, action, 0, ctx);
        } catch (e) {
          throw Object.assign(e, { status: 422 });
        }
        return send(res, 200, { ok: true });
      }

      // Explorateur MSFS : commandes de cockpit de l'avion chargé, lecture d'une valeur.
      case 'GET /api/msfs/inputs': {
        requireAdmin(req);
        const refresh = new URL(req.url, 'http://x').searchParams.has('refresh');
        try {
          const inputs = await msfs.inputEvents(refresh);
          return send(res, 200, { aircraft: msfs.status.aircraft, inputs });
        } catch (e) {
          throw Object.assign(e, { status: 409 });
        }
      }

      case 'POST /api/msfs/read': {
        requireAdmin(req);
        const body = await readJson(req);
        try {
          const value = body.input ? await msfs.readInput(body.input) : await msfs.readVar(body.var, body.unit || 'number');
          return send(res, 200, { value });
        } catch (e) {
          throw Object.assign(e, { status: 409 });
        }
      }

      // Propriétés annoncées par SimHub (commande « help » du Property Server).
      case 'GET /api/simhub/properties': {
        requireAdmin(req);
        try {
          return send(res, 200, { properties: await simhub.properties() });
        } catch (e) {
          throw Object.assign(e, { status: 409 });
        }
      }

      case 'GET /api/windows': {
        requireAdmin(req);
        const windows = await executor.listWindows().catch(() => []);
        return send(res, 200, { windows });
      }

      case 'GET /api/events': {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
        });
        res.write(`event: hello\ndata: ${JSON.stringify({ revision })}\n\n`);
        clients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 25000);
        req.on('close', () => {
          clearInterval(ping);
          clients.delete(res);
        });
        return;
      }

      default:
        return send(res, 404, { error: 'Route inconnue.' });
    }
  }

  const server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
      if (req.method === 'GET' && (await serveStatic(res, pathname))) return;
      send(res, 404, 'Introuvable');
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) log.error(e);
      if (!res.headersSent) send(res, status, { error: e.message });
    }
  });

  await store.load();
  await toggles.load();
  refreshSimWatch();
  // Sauvegarde au démarrage, sauf si la plus récente contient déjà cette configuration.
  try {
    const [latest] = await backups.list();
    const same = latest && JSON.stringify((await backups.read(latest.id)).config) === JSON.stringify(store.config);
    if (!same) await backups.autoSave(store.config, { force: true });
  } catch (e) {
    log.warn(`Sauvegarde automatique impossible : ${e.message}`);
  }
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const disco = discovery ? startDiscovery({ port, version: VERSION, log }) : null;
  if (msfsEnabled) msfs.start();
  if (simhubEnabled) simhub.start();

  const ready = executor.check().then((s) => {
    executorStatus = s;
    broadcast('status', { executorStatus });
    return s;
  });

  return {
    port,
    dataFile: store.file,
    executorLabel: executor.label,
    executorReady: ready,
    deckUrls,
    async close() {
      stopUpdateEvents();
      if (!customUpdater) updater.close();
      disco?.close();
      msfs.close();
      simhub.close();
      await toggles.flush().catch(() => {});
      for (const res of clients) res.end();
      clients.clear();
      executor.dispose?.();
      await new Promise((r) => server.close(() => r()));
    },
  };
}
