// Liaison avec Microsoft Flight Simulator (2020 / 2024) par SimConnect.
// - Envoi d'événements (GEAR_TOGGLE, AP_MASTER…) sans passer par le clavier :
//   fonctionne même si la fenêtre du simulateur n'a pas le focus.
// - Lecture de variables (GEAR HANDLE POSITION…) pour afficher l'état réel
//   sur les touches à bascule.
// SimConnect est intégré au simulateur : aucun fichier de configuration n'est
// nécessaire quand StreamDeck tourne sur le même PC.
import { isValidEventName, isValidSimvar } from '../shared/msfs.js';

const RETRY_MS = 5000;
const APP_NAME = 'StreamDeck';
const PRIORITY_HIGHEST = 1; // SIMCONNECT_GROUP_PRIORITY_HIGHEST (non exporté par node-simconnect)

export function createMsfs({ log = console, load = () => import('node-simconnect'), onStatus = () => {}, onValue = () => {} } = {}) {
  let lib = null;
  let handle = null;
  let status = { available: true, connected: false, simName: null, reason: 'Recherche du simulateur…' };
  let timer = null;
  let stopped = false;
  let nextId = 1;
  const eventIds = new Map(); // nom d'événement → id client (par connexion)
  const watched = new Map(); // « SIMVAR|UNITÉ » → { id, simvar, unit, value }
  const UNIT_RE = /^[A-Za-z0-9 /_.-]{1,40}$/;
  const keyOf = (simvar, unit) => `${String(simvar).trim().toUpperCase()}|${String(unit || 'Bool').trim().toLowerCase()}`;

  const setStatus = (patch) => {
    status = { ...status, ...patch };
    onStatus(status);
  };

  function subscribe(entry) {
    const { SimConnectDataType, SimConnectPeriod, SimConnectConstants, DataRequestFlag } = lib;
    handle.addToDataDefinition(entry.id, entry.simvar, entry.unit, SimConnectDataType.FLOAT64);
    handle.requestDataOnSimObject(entry.id, entry.id, SimConnectConstants.OBJECT_ID_USER, SimConnectPeriod.SIM_FRAME, DataRequestFlag.DATA_REQUEST_FLAG_CHANGED);
  }

  function dropConnection(reason) {
    handle = null;
    eventIds.clear();
    for (const entry of watched.values()) entry.value = null;
    setStatus({ connected: false, simName: null, reason });
    schedule();
  }

  function schedule() {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(connect, RETRY_MS);
    timer.unref?.();
  }

  async function connect() {
    if (stopped || handle) return;
    try {
      lib ??= await load();
    } catch {
      setStatus({ available: false, connected: false, reason: 'Module SimConnect absent (installez les dépendances avec npm install).' });
      return;
    }
    try {
      // Protocole « KittyHawk » : le plus ancien accepté par MSFS 2020 et 2024.
      const { recvOpen, handle: h } = await lib.open(APP_NAME, lib.Protocol.KittyHawk);
      handle = h;
      h.on('simObjectData', (data) => {
        for (const entry of watched.values()) {
          if (entry.id !== data.requestID) continue;
          entry.value = data.data.readFloat64();
          onValue(entry.simvar, entry.value, entry.unit);
        }
      });
      h.on('exception', (e) => log.warn?.(`[MSFS] Exception SimConnect ${e.exceptionName ?? e.exception} (paquet ${e.sendId})`));
      h.on('quit', () => dropConnection('Simulateur fermé.'));
      h.on('close', () => handle === h && dropConnection('Connexion au simulateur perdue.'));
      h.on('error', (e) => log.warn?.(`[MSFS] ${e.message}`));
      for (const entry of watched.values()) subscribe(entry);
      setStatus({ connected: true, simName: recvOpen?.applicationName || 'Microsoft Flight Simulator', reason: null });
    } catch {
      // Simulateur non lancé : on réessaie plus tard, sans bruit.
      setStatus({ connected: false, simName: null, reason: 'Simulateur non détecté (lancez MSFS).' });
      schedule();
    }
  }

  return {
    start() {
      stopped = false;
      connect();
    },
    get status() {
      return status;
    },

    /** Envoie un événement au simulateur (ex. « GEAR_TOGGLE »), avec une valeur facultative. */
    async send(event, value = 0) {
      const name = String(event || '').trim().toUpperCase();
      if (!isValidEventName(name)) throw new Error(`Événement MSFS invalide : « ${event} ».`);
      if (!handle) throw new Error(`MSFS n’est pas connecté : ${status.reason ?? 'lancez le simulateur.'}`);
      let id = eventIds.get(name);
      if (id === undefined) {
        id = nextId++;
        handle.mapClientEventToSimEvent(id, name);
        eventIds.set(name, id);
      }
      const v = Math.trunc(Number(value) || 0);
      handle.transmitClientEvent(
        lib.SimConnectConstants.OBJECT_ID_USER,
        id,
        v >>> 0, // SimConnect attend un entier non signé (les valeurs négatives en complément à deux)
        PRIORITY_HIGHEST,
        lib.EventFlag.EVENT_FLAG_GROUPID_IS_PRIORITY,
      );
    },

    /**
     * Déclare les variables à suivre : chaînes (état on/off, unité « Bool ») ou
     * objets { simvar, unit } pour une valeur numérique (ex. « degrees », « feet »).
     */
    watch(list) {
      const wanted = new Map();
      for (const item of list) {
        const simvar = String(typeof item === 'string' ? item : item?.simvar ?? '').trim().toUpperCase();
        const unit = String((typeof item === 'string' ? null : item?.unit) || 'Bool').trim();
        if (!isValidSimvar(simvar) || !UNIT_RE.test(unit)) continue;
        wanted.set(keyOf(simvar, unit), { simvar, unit });
      }
      for (const [k, { simvar, unit }] of wanted) {
        if (watched.has(k)) continue;
        const entry = { id: nextId++, simvar, unit, value: null };
        watched.set(k, entry);
        if (handle) subscribe(entry);
      }
      for (const [k, entry] of watched) {
        if (wanted.has(k)) continue;
        if (handle) {
          handle.requestDataOnSimObject(entry.id, entry.id, lib.SimConnectConstants.OBJECT_ID_USER, lib.SimConnectPeriod.NEVER);
        }
        watched.delete(k);
      }
    },

    /** Dernière valeur connue d'une variable (null si inconnue). */
    value(simvar, unit = 'Bool') {
      return watched.get(keyOf(simvar, unit))?.value ?? null;
    },

    close() {
      stopped = true;
      clearTimeout(timer);
      try {
        handle?.close();
      } catch {}
      handle = null;
    },
  };
}
