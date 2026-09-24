import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { createMsfs } from '../server/msfs.js';
import { startDeckServer } from '../server/app.js';
import { MSFS_PRESETS, MSFS_EVENT_LABELS, isValidSimvar } from '../shared/msfs.js';

// Imitation minimale de node-simconnect : enregistre les appels.
function fakeSimConnect() {
  const calls = [];
  const handle = new EventEmitter();
  Object.assign(handle, {
    mapClientEventToSimEvent: (id, name) => calls.push(['map', id, name]),
    transmitClientEvent: (obj, id, data, group, flags) => calls.push(['send', id, data, group, flags]),
    addToDataDefinition: (id, name, unit) => calls.push(['def', id, name, unit]),
    requestDataOnSimObject: (req, def, obj, period) => calls.push(['req', req, period]),
    close() {},
  });
  const lib = {
    open: async () => ({ recvOpen: { applicationName: 'KittyHawk' }, handle }),
    Protocol: { KittyHawk: 5 },
    SimConnectDataType: { FLOAT64: 4 },
    SimConnectPeriod: { NEVER: 0, SIM_FRAME: 3 },
    SimConnectConstants: { OBJECT_ID_USER: 0 },
    DataRequestFlag: { DATA_REQUEST_FLAG_CHANGED: 1 },
    EventFlag: { EVENT_FLAG_GROUPID_IS_PRIORITY: 16 },
  };
  const requestIdOf = (simvar) => calls.find((c) => c[0] === 'def' && c[2] === simvar)?.[1];
  const emitValue = (simvar, value) => handle.emit('simObjectData', { requestID: requestIdOf(simvar), data: { readFloat64: () => value } });
  return { lib, handle, calls, emitValue };
}

const tick = () => new Promise((r) => setTimeout(r, 20));
const quiet = { log() {}, warn() {}, error() {} };

test('MSFS : envoi d’événements après connexion', async () => {
  const sim = fakeSimConnect();
  const msfs = createMsfs({ log: quiet, load: async () => sim.lib });
  await assert.rejects(msfs.send('GEAR_TOGGLE'), /pas connecté/);
  msfs.start();
  await tick();
  assert.equal(msfs.status.connected, true);
  await msfs.send('gear_toggle');
  await msfs.send('GEAR_TOGGLE');
  await msfs.send('HEADING_BUG_SET', -1);
  const maps = sim.calls.filter((c) => c[0] === 'map');
  assert.equal(maps.length, 2, 'un seul mappage par événement');
  assert.deepEqual(sim.calls.filter((c) => c[0] === 'send').map((c) => c[2]), [0, 0, 4294967295]);
  await assert.rejects(msfs.send('rm -rf /'), /invalide/);
  sim.handle.emit('quit');
  assert.equal(msfs.status.connected, false);
  msfs.close();
});

test('MSFS : module absent → liaison indisponible, sans plantage', async () => {
  const msfs = createMsfs({ log: quiet, load: async () => { throw new Error('absent'); } });
  msfs.start();
  await tick();
  assert.equal(msfs.status.available, false);
  msfs.close();
});

test('MSFS : suivi des variables', async () => {
  const sim = fakeSimConnect();
  const seen = [];
  const msfs = createMsfs({ log: quiet, load: async () => sim.lib, onValue: (v, x) => seen.push([v, x]) });
  msfs.watch(['gear handle position', 'pas une variable !']);
  msfs.start();
  await tick();
  assert.equal(sim.calls.filter((c) => c[0] === 'def').length, 1);
  sim.emitValue('GEAR HANDLE POSITION', 1);
  assert.deepEqual(seen, [['GEAR HANDLE POSITION', 1]]);
  assert.equal(msfs.value('GEAR HANDLE POSITION'), 1);
  msfs.watch([]);
  assert.equal(sim.calls.at(-1)[0], 'req');
  assert.equal(sim.calls.at(-1)[2], 0, 'abonnement arrêté (période NEVER)');
  msfs.close();
});

test('catalogue MSFS cohérent', () => {
  for (const p of MSFS_PRESETS) {
    const a = p.action.type === 'toggle' ? p.action.actions[0] : p.action;
    assert.ok(MSFS_EVENT_LABELS[a.event], `événement inconnu : ${a.event}`);
    if (p.action.sync) assert.ok(isValidSimvar(p.action.sync.simvar), p.action.sync.simvar);
  }
});

test('serveur : bascule synchronisée avec une variable MSFS', async () => {
  const sim = fakeSimConnect();
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-msfs-'));
  const port = 3900 + Math.floor(Math.random() * 400);
  const deck = await startDeckServer({ port, host: '127.0.0.1', dataDir, dryRun: true, discovery: false, msfsLoader: async () => sim.lib, log: quiet });
  const url = `http://127.0.0.1:${port}`;
  const json = (p, body) =>
    fetch(url + p, body ? { method: body.method ?? 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body.data) } : {}).then((r) => r.json());
  try {
    await tick();
    const { config } = await json('/api/config');
    const pageId = config.profiles[0].pages[0].id;
    const gear = MSFS_PRESETS.find((p) => p.label.startsWith('Train'));
    config.profiles[0].pages[0].keys[9] = { ...gear.face, alt: gear.alt, action: gear.action };
    await json('/api/config', { method: 'PUT', data: { config } });
    await tick();

    const sk = `default/${pageId}/9`;
    // Le simulateur annonce « train sorti » : la touche passe à l'état 2.
    sim.emitValue('GEAR HANDLE POSITION', 1);
    assert.equal((await json('/api/config')).states[sk], 1);

    // Appui : l'événement part vers MSFS, l'état n'est pas inversé localement.
    const res = await json('/api/press', { data: { profileId: 'default', pageId, index: 9 } });
    assert.equal(res.ok, true);
    assert.ok(sim.calls.some((c) => c[0] === 'map' && c[2] === 'GEAR_TOGGLE'));
    assert.equal((await json('/api/config')).states[sk], 1);

    // Le simulateur confirme « train rentré ».
    sim.emitValue('GEAR HANDLE POSITION', 0);
    assert.equal((await json('/api/config')).states[sk], undefined);

    const status = await json('/api/status');
    assert.equal(status.msfs.connected, true);
  } finally {
    await deck.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test('serveur : bouton rotatif et curseur MSFS', async () => {
  const { MSFS_DIAL_PRESETS, MSFS_SLIDER_PRESETS } = await import('../shared/msfs.js');
  const sim = fakeSimConnect();
  const sentNames = () => {
    const names = new Map(sim.calls.filter((c) => c[0] === 'map').map((c) => [c[1], c[2]]));
    return sim.calls.filter((c) => c[0] === 'send').map((c) => [names.get(c[1]), c[2]]);
  };
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-ctl-'));
  const port = 4300 + Math.floor(Math.random() * 400);
  const deck = await startDeckServer({ port, host: '127.0.0.1', dataDir, dryRun: true, discovery: false, msfsLoader: async () => sim.lib, log: quiet });
  const url = `http://127.0.0.1:${port}`;
  const get = () => fetch(`${url}/api/config`).then((r) => r.json());
  const post = (data) =>
    fetch(`${url}/api/press`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json());
  try {
    await tick();
    const { config } = await get();
    const pageId = config.profiles[0].pages[0].id;
    const hdg = MSFS_DIAL_PRESETS.find((p) => p.label === 'Bouton HDG');
    const gaz = MSFS_SLIDER_PRESETS.find((p) => p.label === 'Manette des gaz');
    config.profiles[0].pages[0].keys[9] = { ...hdg.face, action: hdg.action };
    config.profiles[0].pages[0].keys[4] = { ...gaz.face, span: undefined, action: gaz.action };
    await fetch(`${url}/api/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config }) });
    await tick();
    const base = { profileId: 'default', pageId };

    // Valeur affichée sur le bouton : cap sélecté lu dans le simulateur.
    sim.emitValue('AUTOPILOT HEADING LOCK DIR', 275);
    assert.equal((await get()).values[`default/${pageId}/9`], 275);

    // Tourner : 3 crans à droite, 2 à gauche ; appuyer : engager le mode HDG.
    assert.equal((await post({ ...base, index: 9, input: { kind: 'dial', delta: 3 } })).steps, 3);
    await post({ ...base, index: 9, input: { kind: 'dial', delta: -2 } });
    await post({ ...base, index: 9, input: { kind: 'press' } });
    assert.deepEqual(sentNames().map((x) => x[0]), ['HEADING_BUG_INC', 'HEADING_BUG_INC', 'HEADING_BUG_INC', 'HEADING_BUG_DEC', 'HEADING_BUG_DEC', 'AP_HDG_HOLD']);

    // Curseur : mi-course → THROTTLE_SET 8192, position mémorisée.
    const r = await post({ ...base, index: 4, input: { kind: 'slider', level: 0.5 } });
    assert.equal(r.level, 0.5);
    assert.deepEqual(sentNames().at(-1), ['THROTTLE_SET', 8192]);
    // Le simulateur annonce 25 % : le curseur suit.
    sim.emitValue('GENERAL ENG THROTTLE LEVER POSITION:1', 25);
    assert.equal((await get()).levels[`default/${pageId}/4`], 0.25);
  } finally {
    await deck.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
