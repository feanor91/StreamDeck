// Sauvegardes de la configuration, dans <données>/backups/ (un fichier JSON par sauvegarde).
//
//  - automatiques : au démarrage et au plus une fois par heure pendant les modifications
//    (les 30 plus récentes sont conservées) ;
//  - manuelles : créées depuis l'interface, conservées jusqu'à leur suppression ;
//  - de sécurité : juste avant une restauration ou un import, pour pouvoir revenir en arrière.
import fs from 'node:fs/promises';
import path from 'node:path';

const KEEP_AUTO = 30;
const AUTO_EVERY = 3600_000;
const ID_RE = /^\d{8}-\d{6}-\d{3}-(auto|manual|safety)$/;

export const BACKUP_KINDS = { auto: 'Automatique', manual: 'Manuelle', safety: 'Avant restauration' };

/** Résumé affiché dans la liste : profils, pages, touches. */
export function summarize(config) {
  const profiles = config?.profiles ?? [];
  const pages = profiles.reduce((n, p) => n + (p.pages?.length ?? 0), 0);
  const keys = profiles.reduce((n, p) => n + (p.pages ?? []).reduce((m, pg) => m + Object.keys(pg.keys ?? {}).length, 0), 0);
  return { profiles: profiles.length, pages, keys };
}

const stamp = (d) => {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
};

export function createBackups(dataDir, { version = '', now = () => new Date() } = {}) {
  const dir = path.join(dataDir, 'backups');
  let lastAuto = 0;
  let lastStamp = '';

  const fileOf = (id) => {
    if (!ID_RE.test(String(id))) throw Object.assign(new Error('Sauvegarde introuvable.'), { status: 404 });
    return path.join(dir, `${id}.json`);
  };

  async function list() {
    const names = await fs.readdir(dir).catch(() => []);
    const out = [];
    for (const name of names) {
      const id = name.replace(/\.json$/, '');
      if (!ID_RE.test(id)) continue;
      try {
        const data = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
        out.push({ id, kind: data.kind, label: data.label ?? '', createdAt: data.createdAt, version: data.version ?? '', ...summarize(data.config) });
      } catch {
        // fichier illisible : ignoré
      }
    }
    return out.sort((a, b) => (a.id < b.id ? 1 : -1));
  }

  async function create(config, { kind = 'manual', label = '' } = {}) {
    await fs.mkdir(dir, { recursive: true });
    let d = now();
    // Deux sauvegardes dans la même milliseconde : identifiants toujours distincts et croissants.
    while (stamp(d) <= lastStamp) d = new Date(d.getTime() + 1);
    lastStamp = stamp(d);
    const id = `${lastStamp}-${kind}`;
    const data = { kind, label: String(label).slice(0, 80), createdAt: d.toISOString(), version, config };
    await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(data, null, 2));
    if (kind === 'auto') {
      lastAuto = now().getTime();
      await prune();
    }
    return { id, kind, label: data.label, createdAt: data.createdAt, version, ...summarize(config) };
  }

  // Ne garde que les sauvegardes automatiques les plus récentes.
  async function prune() {
    const autos = (await list()).filter((b) => b.kind === 'auto');
    for (const b of autos.slice(KEEP_AUTO)) await fs.rm(fileOf(b.id), { force: true });
  }

  return {
    dir,
    list,
    create,
    /** Sauvegarde automatique si la dernière date de plus d'une heure. */
    async autoSave(config, { force = false } = {}) {
      if (!force && now().getTime() - lastAuto < AUTO_EVERY) return null;
      return create(config, { kind: 'auto' });
    },
    async read(id) {
      try {
        return JSON.parse(await fs.readFile(fileOf(id), 'utf8'));
      } catch (e) {
        if (e.status) throw e;
        throw Object.assign(new Error('Sauvegarde introuvable.'), { status: 404 });
      }
    },
    async remove(id) {
      await fs.rm(fileOf(id), { force: true });
    },
  };
}
