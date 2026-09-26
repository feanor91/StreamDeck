import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createBackups } from '../server/backups.js';
import { startDeckServer } from '../server/app.js';

const quiet = { log() {}, warn() {}, error() {} };

test('sauvegardes : création, liste, lecture, rotation des automatiques', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-bk-'));
  let t = new Date('2026-01-01T10:00:00Z').getTime();
  const b = createBackups(dir, { version: '1.2.3', now: () => new Date(t) });
  const cfg = { profiles: [{ id: 'p', name: 'P', pages: [{ id: 'a', keys: { 0: {}, 1: {} } }, { id: 'b', keys: {} }] }] };
  const m = await b.create(cfg, { label: 'Avant MSFS' });
  assert.deepEqual([m.kind, m.label, m.profiles, m.pages, m.keys], ['manual', 'Avant MSFS', 1, 2, 2]);
  const again = await b.create(cfg); // même instant : identifiant distinct
  assert.notEqual(again.id, m.id);
  // Automatique : au plus une par heure.
  assert.ok(await b.autoSave(cfg));
  assert.equal(await b.autoSave(cfg), null);
  t += 3600_001;
  assert.ok(await b.autoSave(cfg));
  // Rotation : 30 automatiques conservées, les manuelles jamais supprimées.
  for (let i = 0; i < 35; i++) {
    t += 1000;
    await b.autoSave(cfg, { force: true });
  }
  const list = await b.list();
  assert.equal(list.filter((x) => x.kind === 'auto').length, 30);
  assert.equal(list.filter((x) => x.kind === 'manual').length, 2);
  assert.ok(list[0].id > list[list.length - 1].id, 'plus récentes en premier');
  assert.equal((await b.read(m.id)).config.profiles[0].name, 'P');
  await assert.rejects(b.read('../config'), /introuvable/);
  await b.remove(m.id);
  await assert.rejects(b.read(m.id), /introuvable/);
  await fs.rm(dir, { recursive: true, force: true });
});

test('serveur : sauvegarde manuelle, restauration avec sauvegarde de sécurité', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-bk-srv-'));
  const deck = await startDeckServer({ port: 0, host: '127.0.0.1', dataDir, dryRun: true, discovery: false, msfs: false, simhub: false, updateCheck: false, log: quiet });
  const url = `http://127.0.0.1:${deck.port}`;
  const json = { 'Content-Type': 'application/json' };
  const post = (p, data = {}) => fetch(url + p, { method: 'POST', headers: json, body: JSON.stringify(data) }).then((r) => r.json());
  const list = async () => (await fetch(`${url}/api/backups`).then((r) => r.json())).backups;
  try {
    // Sauvegarde automatique au démarrage.
    assert.deepEqual((await list()).map((b) => b.kind), ['auto']);
    const { config } = await fetch(`${url}/api/config`).then((r) => r.json());
    const original = config.profiles[0].pages[0].name;
    const { backup } = await post('/api/backups', { label: 'Ma config' });
    assert.equal(backup.label, 'Ma config');

    config.profiles[0].pages[0].name = 'Modifiée';
    await fetch(`${url}/api/config`, { method: 'PUT', headers: json, body: JSON.stringify({ config }) });

    const restored = await post('/api/backups/restore', { id: backup.id });
    assert.equal(restored.config.profiles[0].pages[0].name, original);
    assert.equal((await fetch(`${url}/api/config`).then((r) => r.json())).config.profiles[0].pages[0].name, original);
    // La configuration remplacée a été gardée dans une sauvegarde de sécurité.
    const safety = (await list()).find((b) => b.kind === 'safety');
    assert.equal((await post('/api/backups/read', { id: safety.id })).config.profiles[0].pages[0].name, 'Modifiée');

    await post('/api/backups/delete', { id: backup.id });
    assert.equal((await list()).some((b) => b.id === backup.id), false);
    const bad = await fetch(`${url}/api/backups/restore`, { method: 'POST', headers: json, body: JSON.stringify({ id: '../../etc' }) });
    assert.equal(bad.status, 404);
  } finally {
    await deck.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
