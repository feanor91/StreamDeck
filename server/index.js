import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store, findKey, LAYOUTS } from './store.js';
import { createExecutor } from './executors/index.js';
import { runAction } from './actions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3210;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DECK_DATA_DIR || path.join(ROOT, 'data');
const DRY_RUN = process.env.DECK_DRY_RUN === '1';
// Par défaut, seule la machine locale peut modifier la configuration ou tester
// des actions. Les autres appareils du réseau peuvent uniquement utiliser le Deck.
const REMOTE_ADMIN = process.env.DECK_REMOTE_ADMIN === '1';
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

const store = new Store(DATA_DIR);
const executor = createExecutor({ dryRun: DRY_RUN });
let executorStatus = { ok: false, reason: 'Vérification en cours…' };
const clients = new Set();
let revision = 0;

function lanUrls() {
  const urls = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${PORT}/deck`);
    }
  }
  return urls;
}

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
    if (size > MAX_BODY) throw Object.assign(new Error('Requête trop volumineuse.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('JSON invalide.'), { status: 400 });
  }
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}

async function serveStatic(req, res, pathname) {
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

function requireAdmin(req) {
  if (!REMOTE_ADMIN && !isLocal(req)) {
    throw Object.assign(
      new Error("Modification réservée à l'ordinateur hôte (démarrez avec DECK_REMOTE_ADMIN=1 pour l'autoriser)."),
      { status: 403 },
    );
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
  if (!hostOk) throw Object.assign(new Error('Hôte non autorisé.'), { status: 403 });
  if (req.method === 'GET') return;
  const origin = req.headers.origin;
  if (origin && originHost(origin) !== req.headers.host) {
    throw Object.assign(new Error('Origine non autorisée.'), { status: 403 });
  }
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
    throw Object.assign(new Error('Content-Type application/json requis.'), { status: 415 });
  }
}

async function handleApi(req, res, pathname) {
  checkRequestOrigin(req);
  const route = `${req.method} ${pathname}`;
  switch (route) {
    case 'GET /api/config':
      return send(res, 200, { revision, config: store.config });

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
      return send(res, 200, { revision });
    }

    case 'GET /api/status':
      return send(res, 200, {
        platform: process.platform,
        executor: executor.label,
        executorStatus,
        dryRun: DRY_RUN,
        canAdmin: REMOTE_ADMIN || isLocal(req),
        deckUrls: lanUrls(),
        port: PORT,
        layouts: LAYOUTS,
      });

    case 'POST /api/press': {
      const { profileId, pageId, index } = await readJson(req);
      const key = findKey(store.config, profileId, pageId, index);
      if (!key) throw Object.assign(new Error('Touche vide.'), { status: 404 });
      const started = Date.now();
      try {
        await runAction(executor, key.action);
        broadcast('press', { profileId, pageId, index, ok: true });
        return send(res, 200, { ok: true, ms: Date.now() - started });
      } catch (e) {
        broadcast('press', { profileId, pageId, index, ok: false, error: e.message });
        throw Object.assign(e, { status: 422 });
      }
    }

    case 'POST /api/test': {
      requireAdmin(req);
      const { action } = await readJson(req);
      try {
        await runAction(executor, action);
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
    if (req.method === 'GET' && (await serveStatic(req, res, pathname))) return;
    send(res, 404, 'Introuvable');
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: e.message });
  }
});

await store.load();
server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ▣  StreamDeck est prêt');
  console.log(`     Gestion   : http://localhost:${PORT}/`);
  console.log(`     Deck      : http://localhost:${PORT}/deck`);
  for (const url of lanUrls()) console.log(`     Réseau    : ${url}`);
  console.log(`     Données   : ${store.file}`);
  console.log('');
});

executor.check().then((s) => {
  executorStatus = s;
  if (!s.ok) console.warn(`  ⚠  Envoi des touches indisponible : ${s.reason}`);
  else console.log(`  ✓  Exécuteur : ${executor.label}`);
  broadcast('status', { executorStatus });
});

const shutdown = () => {
  executor.dispose?.();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
