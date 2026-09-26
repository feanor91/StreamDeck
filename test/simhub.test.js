import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { parseSimhubValue, parseTimespan } from '../server/simhub.js';
import { startDeckServer } from '../server/app.js';
import { formatDisplay } from '../shared/controls.js';
import { SIMHUB_PRESETS, isValidSimhubProp } from '../shared/simhub.js';
import { fakeSimhub } from './fake-simhub.js';

const quiet = { log() {}, warn() {}, error() {} };
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 2000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await tick(20);
  }
  return false;
}

test('SimHub : conversion des valeurs reçues', () => {
  assert.equal(parseSimhubValue('boolean', 'True'), 1);
  assert.equal(parseSimhubValue('integer', '(null)'), null);
  assert.equal(parseSimhubValue('double', '123,5'), 123.5);
  assert.equal(parseSimhubValue('string', 'N'), 'N');
  assert.equal(parseSimhubValue('object', 'False'), 0);
  assert.equal(parseSimhubValue('object', '42'), 42);
  assert.equal(parseTimespan('00:01:23.4560000'), 83.456);
  assert.equal(parseTimespan('1.02:00:00'), 93600);
  assert.equal(formatDisplay(parseSimhubValue('timespan', '00:01:23.4560000'), { time: true }), '1:23.456');
});

test('SimHub : préréglages cohérents', () => {
  for (const p of SIMHUB_PRESETS) {
    const prop = p.action.display?.simhub ?? p.action.sync?.simhub;
    assert.ok(isValidSimhubProp(prop), p.label);
  }
});

test('serveur : afficheurs, bascule synchronisée et commandes SimHub', async () => {
  const sim = await fakeSimhub({ properties: { 'dcp.gd.Gear': ['string', 'N'], 'dcp.gd.PitLimiterOn': ['integer', '0'] } });
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-simhub-'));
  const deck = await startDeckServer({ port: 0, host: '127.0.0.1', dataDir, dryRun: true, discovery: false, msfs: false, simhubPort: sim.port, updateCheck: false, log: quiet });
  const url = `http://127.0.0.1:${deck.port}`;
  const get = () => fetch(`${url}/api/config`).then((r) => r.json());
  const post = (p, data) =>
    fetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json());
  try {
    assert.ok(await until(async () => (await fetch(`${url}/api/status`).then((r) => r.json())).simhub.connected));
    const { config } = await get();
    const pg = config.profiles[0].pages[0];
    pg.keys[10] = { title: 'Rapport', action: { type: 'display', display: { simhub: 'dcp.gd.Gear' } } };
    pg.keys[11] = { title: 'Limiteur', action: { type: 'toggle', same: true, sync: { simhub: 'dcp.gd.PitLimiterOn' }, actions: [{ type: 'simhub', input: 'deck.pit' }] } };
    pg.keys[12] = { title: 'Écran', action: { type: 'simhub', input: 'deck.screen', mode: 'click' } };
    await fetch(`${url}/api/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config }) });
    const sk = (i) => `default/${pg.id}/${i}`;

    // Valeur texte affichée telle quelle, puis mise à jour par le jeu.
    assert.ok(await until(async () => (await get()).values[sk(10)] === 'N'));
    sim.emit('dcp.gd.Gear', 'string', '3');
    assert.ok(await until(async () => (await get()).values[sk(10)] === 3));

    // Bascule : l'appui déclenche la commande, l'état vient de SimHub.
    const base = { profileId: 'default', pageId: pg.id };
    await post('/api/press', { ...base, index: 11 });
    assert.ok(await until(() => sim.received.includes('trigger-input-released deck.pit')));
    assert.ok(sim.received.includes('trigger-input-pressed deck.pit'));
    assert.equal((await get()).states[sk(11)], undefined, 'état inchangé tant que SimHub ne l’a pas confirmé');
    sim.emit('dcp.gd.PitLimiterOn', 'integer', '1');
    assert.ok(await until(async () => (await get()).states[sk(11)] === 1));

    await post('/api/press', { ...base, index: 12 });
    assert.ok(await until(() => sim.received.includes('trigger-input-released deck.screen')));

    // Liste des propriétés (commande « help »).
    const { properties } = await fetch(`${url}/api/simhub/properties`).then((r) => r.json());
    assert.deepEqual(properties.map((p) => p.name).sort(), ['dcp.gd.Gear', 'dcp.gd.PitLimiterOn']);

    // Touche supprimée : désabonnement.
    delete config.profiles[0].pages[0].keys[10];
    await fetch(`${url}/api/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config }) });
    assert.ok(await until(() => sim.received.includes('unsubscribe dcp.gd.Gear')));
  } finally {
    await deck.close();
    await sim.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test('SimHub absent : statut explicite et commande refusée', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-simhub-off-'));
  const deck = await startDeckServer({ port: 0, host: '127.0.0.1', dataDir, dryRun: true, discovery: false, msfs: false, simhubPort: 1, updateCheck: false, log: quiet });
  const url = `http://127.0.0.1:${deck.port}`;
  try {
    assert.ok(await until(async () => /non détecté/.test((await fetch(`${url}/api/status`).then((r) => r.json())).simhub.reason ?? '')));
    const res = await fetch(`${url}/api/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: { type: 'simhub', input: 'x' } }) });
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /SimHub non détecté/);
  } finally {
    await deck.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
