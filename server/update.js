// Recherche de mise à jour dans les versions publiées sur GitHub.
//
// Le serveur autonome (npm start) signale seulement qu'une version plus récente
// existe, avec le lien de téléchargement. L'application PC fournit son propre
// gestionnaire (electron-updater) qui télécharge et installe la mise à jour :
// il expose la même interface { status, check, install, onChange }.
import { compareVersions, RELEASES_REPO, RELEASES_URL } from '../shared/version.js';

const CHECK_EVERY = 6 * 3600_000;

export function createReleaseChecker({ current, log = console, fetchImpl = globalThis.fetch, auto = true } = {}) {
  const listeners = new Set();
  let state = { current, state: 'idle', latest: null, url: RELEASES_URL, notes: '', error: null, canInstall: false, progress: null };
  let timer = null;
  let first = null;

  const set = (patch) => {
    state = { ...state, ...patch };
    for (const fn of listeners) fn(state);
  };

  async function check() {
    set({ state: 'checking', error: null });
    try {
      const res = await fetchImpl(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'StreamDeck' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(res.status === 404 ? 'aucune version publiée trouvée' : `GitHub a répondu ${res.status}`);
      const rel = await res.json();
      const latest = String(rel.tag_name ?? '').replace(/^v/i, '');
      const newer = compareVersions(latest, current) > 0;
      set({ state: newer ? 'available' : 'current', latest, url: rel.html_url ?? RELEASES_URL, notes: rel.body ?? '' });
      if (newer) log.log?.(`Mise à jour disponible : v${latest} (installée : v${current}).`);
    } catch (e) {
      set({ state: 'error', error: `Recherche de mise à jour impossible : ${e.message}` });
    }
    return state;
  }

  if (auto) {
    first = setTimeout(check, 5_000);
    first.unref?.();
    timer = setInterval(check, CHECK_EVERY);
    timer.unref?.();
  }

  return {
    status: () => state,
    check,
    install() {
      throw Object.assign(new Error('Installation automatique disponible uniquement dans l’application PC.'), { status: 400 });
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close() {
      clearTimeout(first);
      clearInterval(timer);
      listeners.clear();
    },
  };
}
