// Comparaison de numéros de version (« v0.6.1 », « 0.10.0 »…), partagée par le
// serveur, l'interface et les tests. Les suffixes (« -beta ») sont ignorés.
export function parseVersion(v) {
  const m = String(v ?? '').trim().replace(/^v/i, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}

/** > 0 si a est plus récente que b, < 0 si plus ancienne, 0 si identique ou illisible. */
export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

export const RELEASES_REPO = 'feanor91/StreamDeck';
export const RELEASES_URL = `https://github.com/${RELEASES_REPO}/releases`;
