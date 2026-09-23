import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const LAYOUTS = {
  mini: { rows: 2, cols: 3, label: 'Mini — 6 touches' },
  standard: { rows: 3, cols: 5, label: 'Standard — 15 touches' },
  plus: { rows: 4, cols: 4, label: 'Plus — 16 touches' },
  xl: { rows: 4, cols: 8, label: 'XL — 32 touches' },
};

export const newId = () => randomUUID().slice(0, 8);

export function defaultConfig() {
  const home = newId();
  const media = newId();
  return {
    version: 1,
    layout: 'standard',
    activeProfileId: 'default',
    profiles: [
      {
        id: 'default',
        name: 'Principal',
        pages: [
          {
            id: home,
            name: 'Accueil',
            keys: {
              0: { title: 'Copier', icon: '📋', color: '#4f46e5', action: { type: 'hotkey', hotkey: { modifiers: ['ctrl'], key: 'C' } } },
              1: { title: 'Coller', icon: '📌', color: '#7c3aed', action: { type: 'hotkey', hotkey: { modifiers: ['ctrl'], key: 'V' } } },
              2: { title: 'Annuler', icon: '↩️', color: '#0f766e', action: { type: 'hotkey', hotkey: { modifiers: ['ctrl'], key: 'Z' } } },
              4: { title: 'Médias', icon: '🎵', color: '#be185d', action: { type: 'page', pageId: media } },
              5: { title: 'Navigateur', icon: '🌐', color: '#0369a1', action: { type: 'url', url: 'https://www.google.com' } },
              6: { title: 'Signature', icon: '✍️', color: '#b45309', action: { type: 'text', text: 'Cordialement,' } },
            },
          },
          {
            id: media,
            name: 'Médias',
            keys: {
              0: { title: 'Retour', icon: '⬅️', color: '#334155', action: { type: 'page', pageId: home } },
              1: { title: 'Précédent', icon: '⏮️', color: '#1e293b', action: { type: 'media', media: 'prev' } },
              2: { title: 'Lecture', icon: '⏯️', color: '#be185d', action: { type: 'media', media: 'play-pause' } },
              3: { title: 'Suivant', icon: '⏭️', color: '#1e293b', action: { type: 'media', media: 'next' } },
              6: { title: 'Vol −', icon: '🔉', color: '#1e293b', action: { type: 'media', media: 'vol-down' } },
              7: { title: 'Muet', icon: '🔇', color: '#1e293b', action: { type: 'media', media: 'mute' } },
              8: { title: 'Vol +', icon: '🔊', color: '#1e293b', action: { type: 'media', media: 'vol-up' } },
            },
          },
        ],
      },
    ],
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Validation structurelle minimale : on refuse ce qui casserait l'application,
// sans figer le contenu des actions (l'interface évolue plus vite que le schéma).
export function validateConfig(cfg) {
  if (!isObj(cfg)) throw new Error('Configuration invalide.');
  if (!LAYOUTS[cfg.layout]) throw new Error(`Disposition inconnue : ${cfg.layout}`);
  if (!Array.isArray(cfg.profiles) || cfg.profiles.length === 0) throw new Error('Au moins un profil est requis.');
  const ids = new Set();
  for (const p of cfg.profiles) {
    if (!isObj(p) || typeof p.id !== 'string' || typeof p.name !== 'string') throw new Error('Profil invalide.');
    if (ids.has(p.id)) throw new Error(`Identifiant de profil dupliqué : ${p.id}`);
    ids.add(p.id);
    if (!Array.isArray(p.pages) || p.pages.length === 0) throw new Error(`Le profil « ${p.name} » n'a aucune page.`);
    for (const pg of p.pages) {
      if (!isObj(pg) || typeof pg.id !== 'string' || !isObj(pg.keys)) throw new Error('Page invalide.');
    }
  }
  if (!ids.has(cfg.activeProfileId)) cfg.activeProfileId = cfg.profiles[0].id;
  return cfg;
}

export function findKey(cfg, profileId, pageId, index) {
  const profile = cfg.profiles.find((p) => p.id === profileId);
  const page = profile?.pages.find((p) => p.id === pageId);
  return page?.keys?.[index] ?? null;
}

export class Store {
  constructor(dir) {
    this.file = path.join(dir, 'config.json');
    this.dir = dir;
    this.config = null;
    this.writing = Promise.resolve();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      this.config = validateConfig(JSON.parse(raw));
    } catch (e) {
      if (e.code !== 'ENOENT') {
        const backup = `${this.file}.corrompu-${Date.now()}`;
        console.warn(`Configuration illisible (${e.message}), sauvegardée dans ${backup}`);
        await fs.rename(this.file, backup).catch(() => {});
      }
      this.config = defaultConfig();
      await this.save(this.config);
    }
    return this.config;
  }

  async save(cfg) {
    this.config = validateConfig(cfg);
    const data = JSON.stringify(this.config, null, 2);
    // Écritures sérialisées + renommage atomique : jamais de fichier à moitié écrit.
    const job = this.writing.then(async () => {
      await fs.mkdir(this.dir, { recursive: true });
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, data);
      await fs.rename(tmp, this.file);
    });
    this.writing = job.catch(() => {});
    await job;
    return this.config;
  }
}
