import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { compareVersions } from '../shared/version.js';
import { createReleaseChecker } from '../server/update.js';
import { startDeckServer, VERSION } from '../server/app.js';

const quiet = { log() {}, warn() {}, error() {} };
const fakeGitHub = (tag) => async () => ({ ok: true, status: 200, json: async () => ({ tag_name: tag, html_url: `https://example/${tag}`, body: 'notes' }) });

test('comparaison de versions', () => {
  assert.ok(compareVersions('v0.10.0', '0.9.9') > 0);
  assert.ok(compareVersions('0.6.1', 'v0.6.2') < 0);
  assert.equal(compareVersions('v1.0', '1.0.0'), 0);
  assert.equal(compareVersions('n’importe quoi', '1.0.0'), 0);
});

test('recherche de mise à jour : disponible, à jour, erreur', async () => {
  const seen = [];
  const newer = createReleaseChecker({ current: '0.6.1', log: quiet, auto: false, fetchImpl: fakeGitHub('v0.7.0') });
  newer.onChange((u) => seen.push(u.state));
  const u = await newer.check();
  assert.equal(u.state, 'available');
  assert.equal(u.latest, '0.7.0');
  assert.equal(u.url, 'https://example/v0.7.0');
  assert.deepEqual(seen, ['checking', 'available']);
  assert.throws(() => newer.install(), /application PC/);

  const same = createReleaseChecker({ current: '0.7.0', log: quiet, auto: false, fetchImpl: fakeGitHub('v0.7.0') });
  assert.equal((await same.check()).state, 'current');

  const offline = createReleaseChecker({ current: '0.7.0', log: quiet, auto: false, fetchImpl: async () => ({ ok: false, status: 404 }) });
  const e = await offline.check();
  assert.equal(e.state, 'error');
  assert.match(e.error, /aucune version publiée/);
});

test('serveur : état de mise à jour exposé et installation déléguée à l’application PC', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-update-'));
  const port = 5100 + Math.floor(Math.random() * 300);
  let installed = 0;
  let listener = null;
  const status = { current: VERSION, state: 'ready', latest: '9.9.9', canInstall: true };
  const updater = {
    status: () => status,
    check: async () => status,
    install: () => installed++,
    onChange: (fn) => ((listener = fn), () => (listener = null)),
  };
  const deck = await startDeckServer({ port, host: '127.0.0.1', dataDir, dryRun: true, discovery: false, msfs: false, updater, log: quiet });
  const url = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${url}/api/status`).then((r) => r.json())).version, VERSION);
    const u = await fetch(`${url}/api/update`).then((r) => r.json());
    assert.equal(u.latest, '9.9.9');
    const res = await fetch(`${url}/api/update/install`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 200);
    assert.equal(installed, 1);
    assert.equal(typeof listener, 'function');
  } finally {
    await deck.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  }
  assert.equal(listener, null);
});
