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
  const watched = new Map(); // simvar → { id, value }

  const setStatus = (patch) => {
    status = { ...status, ...patch };
    onStatus(status);
  };

  function subscribe(simvar, entry) {
    const { SimConnectDataType, SimConnectPeriod, SimConnectConstants, DataRequestFlag } = lib;
    handle.addToDataDefinition(entry.id, simvar, 'Bool', SimConnectDataType.FLOAT64);
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
        for (const [simvar, entry] of watched) {
          if (entry.id !== data.requestID) continue;
          entry.value = data.data.readFloat64();
          onValue(simvar, entry.value);
        }
      });
      h.on('exception', (e) => log.warn?.(`[MSFS] Exception SimConnect ${e.exceptionName ?? e.exception} (paquet ${e.sendId})`));
      h.on('quit', () => dropConnection('Simulateur fermé.'));
      h.on('close', () => handle === h && dropConnection('Connexion au simulateur perdue.'));
      h.on('error', (e) => log.warn?.(`[MSFS] ${e.message}`));
      for (const [simvar, entry] of watched) subscribe(simvar, entry);
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

    /** Déclare les variables à suivre (celles des bascules synchronisées). */
    watch(simvars) {
      const wanted = new Set([...simvars].map((s) => String(s).trim().toUpperCase()).filter(isValidSimvar));
      for (const simvar of wanted) {
        if (watched.has(simvar)) continue;
        const entry = { id: nextId++, value: null };
        watched.set(simvar, entry);
        if (handle) subscribe(simvar, entry);
      }
      for (const [simvar, entry] of watched) {
        if (wanted.has(simvar)) continue;
        if (handle) {
          handle.requestDataOnSimObject(entry.id, entry.id, lib.SimConnectConstants.OBJECT_ID_USER, lib.SimConnectPeriod.NEVER);
        }
        watched.delete(simvar);
      }
    },

    /** Dernière valeur connue d'une variable (null si inconnue). */
    value(simvar) {
      return watched.get(String(simvar).trim().toUpperCase())?.value ?? null;
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
