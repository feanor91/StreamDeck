// Outil de développement : serveur StreamDeck relié à un faux simulateur.
//   node scripts/fake-msfs-server.mjs
// Pilotage du faux simulateur : http://127.0.0.1:3299/set?simvar=GEAR%20HANDLE%20POSITION&value=1
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { startDeckServer } from '../server/app.js';

const handle = new EventEmitter();
const defs = new Map();
const sent = [];
Object.assign(handle, {
  mapClientEventToSimEvent: (id, name) => defs.set(`event:${id}`, name),
  transmitClientEvent: (obj, id) => {
    const name = defs.get(`event:${id}`);
    sent.push(name);
    console.log(`[faux MSFS] événement reçu : ${name}`);
  },
  addToDataDefinition: (id, name) => defs.set(name, id),
  requestDataOnSimObject: () => {},
  close() {},
});
const lib = {
  open: async () => ({ recvOpen: { applicationName: 'Faux MSFS 2024' }, handle }),
  Protocol: { KittyHawk: 5 },
  SimConnectDataType: { FLOAT64: 4 },
  SimConnectPeriod: { NEVER: 0, SIM_FRAME: 3 },
  SimConnectConstants: { OBJECT_ID_USER: 0 },
  DataRequestFlag: { DATA_REQUEST_FLAG_CHANGED: 1 },
  EventFlag: { EVENT_FLAG_GROUPID_IS_PRIORITY: 16 },
};

await startDeckServer({ dryRun: true, dataDir: process.env.DECK_DATA_DIR, msfsLoader: async () => lib });
console.log('Serveur StreamDeck + faux MSFS : http://localhost:3210/');

http
  .createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/set') {
      const simvar = u.searchParams.get('simvar');
      handle.emit('simObjectData', { requestID: defs.get(simvar), data: { readFloat64: () => Number(u.searchParams.get('value')) } });
    }
    res.end(JSON.stringify({ sent }));
  })
  .listen(3299, '127.0.0.1');
