import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { computeCells, placementError, findFreeSlot, faceFor } from '../shared/layout.js';
import { toggleAction, runAction } from '../server/actions.js';
import { startDeckServer } from '../server/app.js';

test('touche fusionnée 2×2 : 3 emplacements couverts, une seule cellule', () => {
  const keys = { 0: { title: 'A', span: { w: 2, h: 2 } }, 2: { title: 'B' } };
  const { cells, coveredBy } = computeCells(keys, 3, 5);
  assert.equal(cells.length, 15 - 3);
  assert.deepEqual(cells[0], { index: 0, row: 0, col: 0, w: 2, h: 2, key: keys[0] });
  assert.equal(coveredBy.get(1), 0);
  assert.equal(coveredBy.get(5), 0);
  assert.equal(coveredBy.get(6), 0);
  assert.equal(coveredBy.has(2), false);
});

test('touche fusionnée réduite au bord de la grille', () => {
  const { cells } = computeCells({ 4: { span: { w: 3, h: 1 } } }, 3, 5);
  const c = cells.find((x) => x.index === 4);
  assert.equal(c.w, 1);
});

test('placement refusé si des touches occupent la zone', () => {
  const keys = { 0: { title: 'A' }, 6: { title: 'B' } };
  assert.match(placementError(keys, 0, 2, 2, 3, 5, [0]), /occupent/);
  assert.equal(placementError(keys, 2, 2, 2, 3, 5), null);
  assert.match(placementError(keys, 4, 2, 1, 3, 5), /dépasse/);
  // Une zone recouverte par une autre touche fusionnée compte aussi.
  assert.match(placementError({ 0: { span: { w: 2, h: 1 } } }, 1, 1, 1, 3, 5), /occupent/);
});

test('recherche d’un emplacement libre pour une grande touche', () => {
  const keys = { 0: {}, 1: {}, 7: {} };
  assert.equal(findFreeSlot(keys, 3, 5, 2, 2), 3); // en 2, la touche 7 gênerait
  assert.equal(findFreeSlot(keys, 3, 5, 5, 3), null);
});

test('apparence d’une bascule selon l’état', () => {
  const key = { title: 'Train rentré', color: '#333', icon: '🛬', action: { type: 'toggle' }, alt: { title: 'Train sorti', color: '#0a0' } };
  assert.equal(faceFor(key, 0).title, 'Train rentré');
  assert.equal(faceFor(key, 1).title, 'Train sorti');
  assert.equal(faceFor(key, 1).icon, '🛬');
});

test('action d’une bascule selon l’état', () => {
  const a = { actions: [{ type: 'hotkey', id: 1 }, { type: 'hotkey', id: 2 }] };
  assert.equal(toggleAction(a, 0).id, 1);
  assert.equal(toggleAction(a, 1).id, 2);
  assert.equal(toggleAction({ ...a, same: true }, 1).id, 1);
});

test('une bascule ne peut pas en contenir une autre', async () => {
  const ex = { hotkey: async () => {} };
  await assert.rejects(runAction(ex, { type: 'toggle', actions: [{ type: 'toggle' }] }), /bascule/);
});

test('serveur : appui sur une bascule, resynchronisation, persistance', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-toggle-'));
  const port = 3400 + Math.floor(Math.random() * 500);
  const deck = await startDeckServer({ port, host: '127.0.0.1', dataDir, dryRun: true, discovery: false, log: { log() {}, warn() {}, error() {} } });
  const url = `http://127.0.0.1:${port}`;
  const post = (p, body) =>
    fetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  try {
    const { config } = await fetch(`${url}/api/config`).then((r) => r.json());
    const pageId = config.profiles[0].pages[0].id;
    config.profiles[0].pages[0].keys[9] = {
      title: 'Train rentré',
      action: { type: 'toggle', same: true, actions: [{ type: 'hotkey', hotkey: { modifiers: [], key: 'G' } }] },
      alt: { title: 'Train sorti' },
    };
    await fetch(`${url}/api/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config }) });

    const press = { profileId: 'default', pageId, index: 9 };
    assert.equal((await post('/api/press', press)).state, 1);
    assert.equal((await post('/api/press', press)).state, 0);
    assert.equal((await post('/api/press', { ...press, syncOnly: true })).state, 1);
    const { states } = await fetch(`${url}/api/config`).then((r) => r.json());
    assert.equal(states[`default/${pageId}/9`], 1);
  } finally {
    await deck.close();
  }
  const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'states.json'), 'utf8'));
  assert.equal(Object.values(saved)[0], 1);
  await fs.rm(dataDir, { recursive: true, force: true });
});

test('orientation : la grille est transposée en portrait', async () => {
  const { fitGrid, orientCell } = await import('../shared/layout.js');
  // Tablette en paysage : 3×5 conservé
  assert.deepEqual(fitGrid(3, 5, 1280, 760), { rows: 3, cols: 5, transposed: false });
  // Téléphone en portrait : 3×5 affiché en 5×3
  assert.deepEqual(fitGrid(3, 5, 380, 780), { rows: 5, cols: 3, transposed: true });
  // Grille carrée : jamais transposée
  assert.equal(fitGrid(4, 4, 380, 780).transposed, false);
  // Touche fusionnée 2×1 en ligne 2, colonne 1 → 1×2 en ligne 1, colonne 2
  assert.deepEqual(orientCell({ index: 6, row: 1, col: 0, w: 2, h: 1 }, true), { index: 6, row: 0, col: 1, w: 1, h: 2 });
});
