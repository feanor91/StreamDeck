import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { runAction } from '../server/actions.js';
import { Store, defaultConfig, validateConfig, findKey } from '../server/store.js';

function recorder() {
  const calls = [];
  const rec = (name) => async (...args) => calls.push([name, ...args]);
  return {
    calls,
    focus: rec('focus'),
    hotkey: rec('hotkey'),
    text: rec('text'),
    media: rec('media'),
    launch: rec('launch'),
    openUrl: rec('openUrl'),
  };
}

test('raccourci avec application cible : focus puis envoi', async () => {
  const ex = recorder();
  await runAction(ex, {
    type: 'hotkey',
    hotkey: { key: 'R', modifiers: ['ctrl'] },
    target: { by: 'process', value: 'obs64', delay: 0 },
  });
  assert.deepEqual(ex.calls.map((c) => c[0]), ['focus', 'hotkey']);
  assert.deepEqual(ex.calls[0][1], { by: 'process', value: 'obs64', delay: 0 });
});

test('sans cible, pas de changement de focus', async () => {
  const ex = recorder();
  await runAction(ex, { type: 'hotkey', hotkey: { key: 'R', modifiers: [] }, target: { by: 'none', value: '' } });
  assert.deepEqual(ex.calls.map((c) => c[0]), ['hotkey']);
});

test('texte + Entrée', async () => {
  const ex = recorder();
  await runAction(ex, { type: 'text', text: 'gg', submit: true });
  assert.deepEqual(ex.calls, [
    ['text', 'gg'],
    ['hotkey', { key: 'Enter', modifiers: [] }],
  ]);
});

test('URL sans schéma complétée en https', async () => {
  const ex = recorder();
  await runAction(ex, { type: 'url', url: 'youtube.com' });
  assert.deepEqual(ex.calls, [['openUrl', 'https://youtube.com']]);
});

test('multi-actions exécutées dans l’ordre', async () => {
  const ex = recorder();
  await runAction(ex, {
    type: 'multi',
    steps: [
      { type: 'hotkey', hotkey: { key: 'A', modifiers: ['ctrl'] } },
      { type: 'delay', ms: 1 },
      { type: 'media', media: 'mute' },
    ],
  });
  assert.deepEqual(ex.calls.map((c) => c[0]), ['hotkey', 'media']);
});

test('erreurs explicites', async () => {
  const ex = recorder();
  await assert.rejects(runAction(ex, null), /Aucune action/);
  await assert.rejects(runAction(ex, { type: 'hotkey', hotkey: { key: '' } }), /incomplet/);
  await assert.rejects(runAction(ex, { type: 'wat' }), /inconnu/);
});

test('validation de configuration', () => {
  assert.doesNotThrow(() => validateConfig(defaultConfig()));
  assert.throws(() => validateConfig({ layout: 'standard', profiles: [] }), /profil/);
  assert.throws(() => validateConfig({ layout: 'geant', profiles: defaultConfig().profiles }), /Disposition/);
  const cfg = defaultConfig();
  cfg.activeProfileId = 'disparu';
  assert.equal(validateConfig(cfg).activeProfileId, 'default');
});

test('stockage : création, sauvegarde atomique et relecture', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'deck-'));
  const store = new Store(dir);
  const cfg = await store.load();
  const pageId = cfg.profiles[0].pages[0].id;
  assert.equal(findKey(cfg, 'default', pageId, 0).title, 'Copier');
  cfg.profiles[0].name = 'Renommé';
  await store.save(cfg);
  const again = await new Store(dir).load();
  assert.equal(again.profiles[0].name, 'Renommé');
  await fs.rm(dir, { recursive: true, force: true });
});
