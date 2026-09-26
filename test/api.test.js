import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { startDeckServer } from '../server/app.js';

const quiet = { log() {}, warn() {}, error() {} };

test('interface : les requêtes sans paramètre (mise à jour) sont acceptées par le serveur', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-api-'));
  let installs = 0;
  const status = { current: '1.0.0', state: 'available', latest: '2.0.0', canInstall: true };
  const updater = { status: () => status, check: async () => status, install: () => installs++, onChange: () => () => {} };
  const deck = await startDeckServer({ port: 0, host: '127.0.0.1', dataDir, dryRun: true, discovery: false, msfs: false, simhub: false, updater, log: quiet });
  // Le client de l'interface utilise des adresses relatives : on les résout vers le serveur de test.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, opts) => realFetch(new URL(url, `http://127.0.0.1:${deck.port}`), opts);
  try {
    const { api } = await import('../public/js/api.js');
    assert.equal((await api.checkUpdate()).latest, '2.0.0');
    await api.installUpdate();
    assert.equal(installs, 1);
  } finally {
    globalThis.fetch = realFetch;
    await deck.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
