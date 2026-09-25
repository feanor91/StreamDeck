// Test de fumée : attend qu'un serveur StreamSim réponde, vérifie l'exécuteur
// et envoie une touche inoffensive (F24). Utilisé par l'intégration continue.
//   node scripts/smoke.mjs [--send]
const base = process.env.DECK_URL || 'http://127.0.0.1:3210';
const deadline = Date.now() + 90_000;

async function json(path, init) {
  const res = await fetch(base + path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status} ${body.error ?? ''}`);
  return body;
}

let status;
while (Date.now() < deadline) {
  try {
    status = await json('/api/status');
    if (status.executorStatus.reason !== 'Vérification en cours…') break;
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}
if (!status) {
  console.error('Le serveur ne répond pas.');
  process.exit(1);
}
console.log('Statut :', JSON.stringify({ platform: status.platform, executor: status.executor, executorStatus: status.executorStatus }));
if (!status.executorStatus.ok) {
  console.error('Exécuteur indisponible.');
  process.exit(1);
}

const cfg = await json('/api/config');
console.log('Configuration :', cfg.config.profiles.length, 'profil(s)');

const windows = await json('/api/windows');
console.log('Fenêtres détectées :', windows.windows.length);

if (process.argv.includes('--send')) {
  await json('/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: { type: 'hotkey', hotkey: { key: 'F24', modifiers: ['shift'] } } }),
  });
  console.log('Envoi de Maj+F24 : OK');
}
console.log('Test de fumée réussi.');
