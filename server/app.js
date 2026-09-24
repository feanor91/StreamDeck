import http from 'node:http';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, findKey, LAYOUTS } from './store.js';
import { createExecutor } from './executors/index.js';
import { runAction, toggleAction } from './actions.js';
import { ToggleStates } from './states.js';
import { stateKey } from '../shared/layout.js';
import { startDiscovery } from './discovery.js';
import { createMsfs } from './msfs.js';

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
 * Démarre le serveur StreamDeck (HTTP + découverte réseau).
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
  log = console,
} = {}) {
  const store = new Store(dataDir);
  const toggles = new ToggleStates(dataDir);
  const executor = createExecutor({ dryRun, log: (m) => log.log(m) });
  let executorStatus = { ok: false, reason: 'Vérification en cours…' };
  const clients = new Set();
  let revision = 0;

  const deckUrls = () => lanAddresses().map((a) => `http://${a}:${port}/deck`);

  // --- Microsoft Flight Simulator -------------------------------------------------------
  // Les bascules dont l'action porte `sync.simvar` prennent leur état dans le simulateur.
  function syncedKeys() {
    const out = [];
    for (const p of store.config?.profiles ?? []) {
      for (const pg of p.pages) {
        for (const [index, key] of Object.entries(pg.keys)) {
          const simvar = key?.action?.type === 'toggle' ? key.action.sync?.simvar : null;
          if (simvar) out.push({ sk: stateKey(p.id, pg.id, index), simvar: String(simvar).trim().toUpperCase(), invert: !!key.action.sync.invert });
        }
      }
    }
    return out;
  }

  function applySimvar(simvar, value) {
    if (value === null || value === undefined) return;
    for (const k of syncedKeys()) {
      if (k.simvar !== simvar) continue;
      const on = (Number(value) !== 0) !== k.invert ? 1 : 0;
      if (toggles.get(k.sk) === on) continue;
      toggles.set(k.sk, on);
      broadcast('state', { key: k.sk, state: on });
    }
  }

  const msfs = createMsfs({
    log,
    ...(msfsLoader ? { load: msfsLoader } : {}),
    onStatus: (s) => broadcast('msfs', s),
    onValue: applySimvar,
  });

  function refreshSimWatch() {
    const keys = syncedKeys();
    msfs.watch(keys.map((k) => k.simvar));
    for (const k of keys) applySimvar(k.simvar, msfs.value(k.simvar));
  }
  const ctx = { msfs };

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
        return send(res, 200, { revision, config: store.config, states: toggles.all() });

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
        return send(res, 200, { revision });
      }

      case 'GET /api/status':
        return send(res, 200, {
          app: 'streamdeck',
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
        });

      case 'POST /api/press': {
        const { profileId, pageId, index, syncOnly } = await readJson(req);
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
        try {
          if (isToggle) {
            const inner = toggleAction(key.action, toggles.get(sk));
            if (!inner?.type) throw new Error('Aucune action définie pour cet état de la bascule.');
            await runAction(executor, inner, 0, ctx);
            // Bascule synchronisée avec MSFS : l'état viendra du simulateur lui-même.
            const simSynced = key.action.sync?.simvar && msfs.status.connected;
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
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const disco = discovery ? startDiscovery({ port, version: VERSION, log }) : null;
  if (msfsEnabled) msfs.start();

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
      disco?.close();
      msfs.close();
      await toggles.flush().catch(() => {});
      for (const res of clients) res.end();
      clients.clear();
      executor.dispose?.();
      await new Promise((r) => server.close(() => r()));
    },
  };
}
