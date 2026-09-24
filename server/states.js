import fs from 'node:fs/promises';
import path from 'node:path';

// États des touches à bascule (0 ou 1), conservés à part de la configuration :
// un appui ne doit pas modifier la configuration ni son historique.
export class ToggleStates {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'states.json');
    this.values = {};
    this.timer = null;
  }

  async load() {
    try {
      const data = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (data && typeof data === 'object' && !Array.isArray(data)) this.values = data;
    } catch {
      this.values = {};
    }
  }

  get(key) {
    return this.values[key] ? 1 : 0;
  }

  set(key, value) {
    if (value) this.values[key] = 1;
    else delete this.values[key];
    this.scheduleSave();
    return this.get(key);
  }

  /** Position 0..1 d'un curseur (null si jamais réglé). */
  getLevel(key) {
    const v = this.values[`lvl:${key}`];
    return typeof v === 'number' ? v : null;
  }

  setLevel(key, level) {
    this.values[`lvl:${key}`] = Math.round(Math.min(1, Math.max(0, Number(level) || 0)) * 10000) / 10000;
    this.scheduleSave();
    return this.values[`lvl:${key}`];
  }

  /** États des bascules uniquement (clé → 1). */
  all() {
    return Object.fromEntries(Object.entries(this.values).filter(([k]) => !k.startsWith('lvl:')));
  }

  /** Positions des curseurs (clé → 0..1). */
  levels() {
    return Object.fromEntries(Object.entries(this.values).filter(([k]) => k.startsWith('lvl:')).map(([k, v]) => [k.slice(4), v]));
  }

  scheduleSave() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush().catch(() => {}), 300);
  }

  async flush() {
    clearTimeout(this.timer);
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.values));
    await fs.rename(tmp, this.file);
  }
}
