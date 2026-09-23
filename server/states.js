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

  all() {
    return { ...this.values };
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
