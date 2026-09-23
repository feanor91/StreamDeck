// Serveur autonome (sans l'application PC) : npm start
import { startDeckServer } from './app.js';

const port = Number(process.env.PORT) || 3210;

let deck;
try {
  deck = await startDeckServer({
    port,
    host: process.env.HOST || '0.0.0.0',
    dataDir: process.env.DECK_DATA_DIR || undefined,
    dryRun: process.env.DECK_DRY_RUN === '1',
    remoteAdmin: process.env.DECK_REMOTE_ADMIN === '1',
  });
} catch (e) {
  console.error(e.code === 'EADDRINUSE' ? `Le port ${port} est déjà utilisé (StreamDeck tourne peut-être déjà).` : e);
  process.exit(1);
}

console.log('');
console.log('  ▣  StreamDeck est prêt');
console.log(`     Gestion   : http://localhost:${port}/`);
console.log(`     Deck      : http://localhost:${port}/deck`);
for (const url of deck.deckUrls()) console.log(`     Réseau    : ${url}`);
console.log(`     Données   : ${deck.dataFile}`);
console.log('');

deck.executorReady.then((s) => {
  if (!s.ok) console.warn(`  ⚠  Envoi des touches indisponible : ${s.reason}`);
  else console.log(`  ✓  Exécuteur : ${deck.executorLabel}`);
});

const shutdown = async () => {
  await deck.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
