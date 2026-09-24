// Outil de développement : serveur StreamDeck relié à un faux simulateur.
//   node scripts/fake-msfs-server.mjs
// Pilotage du faux simulateur :
//   http://127.0.0.1:3299/set?simvar=L:A32NX_FCU_AP_1_LIGHT_ON&value=1   (variable)
//   http://127.0.0.1:3299/input?name=RAFALE_GEAR_LEVER&value=1          (Input Event)
//   http://127.0.0.1:3299/                                             (événements reçus)
import http from 'node:http';
import { startDeckServer } from '../server/app.js';
import { fakeSimConnect } from '../test/fake-simconnect.js';

// Quelques commandes de cockpit fictives, pour essayer l'explorateur.
const sim = fakeSimConnect({
  inputs: [
    { name: 'RAFALE_GEAR_LEVER', value: 0 },
    { name: 'RAFALE_MASTER_ARM', value: 0 },
    { name: 'RAFALE_LIGHT_LANDING', value: 0 },
    { name: 'RAFALE_AP_ALT_HOLD', value: 0 },
    { name: 'LIGHTING_LANDING_1', value: 0 },
    { name: 'AUTOPILOT_KNOB_HEADING', value: 90 },
  ],
});

await startDeckServer({ dryRun: true, dataDir: process.env.DECK_DATA_DIR, msfsLoader: async () => sim.lib });
console.log('Serveur StreamDeck + faux MSFS : http://localhost:3210/');

http
  .createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const value = Number(u.searchParams.get('value'));
    if (u.pathname === '/set') sim.emitValue(u.searchParams.get('simvar'), value);
    if (u.pathname === '/input') sim.emitInput(u.searchParams.get('name'), value);
    res.end(JSON.stringify({ sent: sim.sentEvents().map(([n, v]) => (v ? `${n}=${v}` : n)), inputs: sim.inputValues, vars: sim.values }));
  })
  .listen(3299, '127.0.0.1');
