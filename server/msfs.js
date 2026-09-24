// Liaison avec Microsoft Flight Simulator (2020 / 2024) par SimConnect.
// - Envoi d'événements (GEAR_TOGGLE, AP_MASTER, A32NX.FCU_HDG_PUSH…) sans passer
//   par le clavier : fonctionne même si la fenêtre du simulateur n'a pas le focus.
// - Lecture et écriture de variables : SimVars standard et variables locales
//   « L: » propres à un avion (FlyByWire, Rafale…).
// - Input Events de MSFS 2024 : liste des commandes de cockpit de l'avion chargé,
//   lecture, modification et suivi de leur valeur.
// SimConnect est intégré au simulateur : aucun fichier de configuration n'est
// nécessaire quand StreamDeck tourne sur le même PC.
import { isValidEventName, isValidSimvar, isValidInputEvent, normalizeVar } from '../shared/msfs.js';

const RETRY_MS = 5000;
const APP_NAME = 'StreamDeck';
const PRIORITY_HIGHEST = 1; // SIMCONNECT_GROUP_PRIORITY_HIGHEST (non exporté par node-simconnect)
const UNIT_RE = /^[A-Za-z0-9 /_.-]{1,40}$/;

export function createMsfs({
  log = console,
  load = () => import('node-simconnect'),
  onStatus = () => {},
  onValue = () => {},
  onInput = () => {},
  onAircraft = () => {},
} = {}) {
  let lib = null;
  let handle = null;
  let status = { available: true, connected: false, simName: null, aircraft: null, reason: 'Recherche du simulateur…' };
  let timer = null;
  let stopped = false;
  let nextId = 1;
  const newId = () => nextId++;

  const eventIds = new Map(); // nom d'événement → id client (par connexion)
  const writeDefs = new Map(); // « VAR|unité » → id de définition d'écriture (par connexion)
  const watched = new Map(); // « VAR|unité » → { id, simvar, unit, value }
  const oneShots = new Map(); // id de requête → { resolve, timer }
  const watchedInputs = new Map(); // nom d'Input Event → { value }
  let inputList = null; // [{ name, hash, type }] de l'avion chargé
  let inputListing = null; // énumération en cours
  const hashToName = new Map();
  // Dernières valeurs écrites : un bouton rotatif qui ajoute des pas en rafale ne doit pas
  // repartir d'une valeur périmée en attendant l'écho du simulateur.
  const recentWrites = new Map(); // clé → { value, at }
  const RECENT_MS = 1500;
  const recent = (k) => {
    const r = recentWrites.get(k);
    return r && Date.now() - r.at < RECENT_MS ? r.value : undefined;
  };
  const AIRCRAFT_EVENT = 900001;
  const AIRCRAFT_STATE_REQ = 900002;

  const keyOf = (simvar, unit) => `${normalizeVar(simvar)}|${String(unit || 'Bool').trim().toLowerCase()}`;
  const setStatus = (patch) => {
    status = { ...status, ...patch };
    onStatus(status);
  };
  const requireHandle = () => {
    if (!handle) throw new Error(`MSFS n’est pas connecté : ${status.reason ?? 'lancez le simulateur.'}`);
  };

  // --- Variables -------------------------------------------------------------------------
  function subscribe(entry) {
    const { SimConnectDataType, SimConnectPeriod, SimConnectConstants, DataRequestFlag } = lib;
    handle.addToDataDefinition(entry.id, entry.simvar, entry.unit, SimConnectDataType.FLOAT64);
    handle.requestDataOnSimObject(entry.id, entry.id, SimConnectConstants.OBJECT_ID_USER, SimConnectPeriod.SIM_FRAME, DataRequestFlag.DATA_REQUEST_FLAG_CHANGED);
  }

  // --- Input Events (MSFS 2024) ------------------------------------------------------------
  function listInputs(force = false) {
    requireHandle();
    if (inputList && !force) return Promise.resolve(inputList);
    if (inputListing) return inputListing;
    const reqId = newId();
    const items = [];
    inputListing = new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        handle?.off('inputEventsList', onList);
        inputListing = null;
        // Aucune réponse : simulateur trop ancien ou avion sans Input Events.
        if (items.length) resolve((inputList = items));
        else reject(new Error('Le simulateur n’a renvoyé aucune commande de cockpit (Input Events : MSFS 2024 ou MSFS 2020 à jour requis).'));
      }, 6000);
      function onList(recv) {
        if (recv.requestID !== reqId) return;
        for (const d of recv.inputEventDescriptors ?? []) {
          items.push({ name: d.name, hash: d.inputEventIdHash, type: d.type === 1 ? 'string' : 'number' });
          hashToName.set(String(d.inputEventIdHash), d.name);
        }
        if (recv.entryNumber >= recv.outOf - 1) {
          clearTimeout(t);
          handle.off('inputEventsList', onList);
          inputListing = null;
          items.sort((a, b) => a.name.localeCompare(b.name));
          resolve((inputList = items));
        }
      }
      handle.on('inputEventsList', onList);
      handle.enumerateInputEvents(reqId);
    });
    return inputListing;
  }

  async function findInput(name) {
    if (!isValidInputEvent(name)) throw new Error(`Nom d’Input Event invalide : « ${name} ».`);
    const list = await listInputs();
    const lower = name.toLowerCase();
    const found = list.find((i) => i.name === name) ?? list.find((i) => i.name.toLowerCase() === lower);
    if (!found) throw new Error(`L’avion chargé n’a pas de commande « ${name} ».`);
    return found;
  }

  async function subscribeInput(name) {
    try {
      const found = await findInput(name);
      handle?.subscribeInputEvent(found.hash);
      readInput(found.name).then((v) => {
        const w = watchedInputs.get(name);
        if (w && v !== null) {
          w.value = v;
          onInput(name, v);
        }
      });
    } catch (e) {
      log.warn?.(`[MSFS] ${e.message}`);
    }
  }

  function readInput(name) {
    return findInput(name).then(
      (found) =>
        new Promise((resolve) => {
          const reqId = newId();
          const t = setTimeout(() => {
            oneShots.delete(reqId);
            resolve(null);
          }, 2000);
          oneShots.set(reqId, { resolve, timer: t });
          handle.getInputEvent(reqId, found.hash);
        }),
    );
  }

  function resubscribeAll() {
    for (const entry of watched.values()) subscribe(entry);
    for (const name of watchedInputs.keys()) subscribeInput(name);
  }

  // --- Connexion ---------------------------------------------------------------------------
  function dropConnection(reason) {
    handle = null;
    eventIds.clear();
    writeDefs.clear();
    inputList = null;
    inputListing = null;
    for (const entry of watched.values()) entry.value = null;
    for (const w of watchedInputs.values()) w.value = null;
    for (const { resolve, timer: t } of oneShots.values()) {
      clearTimeout(t);
      resolve(null);
    }
    oneShots.clear();
    setStatus({ connected: false, simName: null, aircraft: null, reason });
    schedule();
  }

  function schedule() {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(connect, RETRY_MS);
    timer.unref?.();
  }

  function aircraftName(path) {
    const s = String(path || '');
    const m = s.match(/([^\\/]+)[\\/][^\\/]*\.(?:air|cfg|flt)$/i);
    return m ? m[1] : s || null;
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
        const once = oneShots.get(data.requestID);
        if (once) {
          oneShots.delete(data.requestID);
          clearTimeout(once.timer);
          once.resolve(data.data.readFloat64());
          return;
        }
        for (const entry of watched.values()) {
          if (entry.id !== data.requestID) continue;
          entry.value = data.data.readFloat64();
          onValue(entry.simvar, entry.value, entry.unit);
        }
      });
      h.on('getInputEvent', (recv) => {
        const once = oneShots.get(recv.requestID);
        if (!once) return;
        oneShots.delete(recv.requestID);
        clearTimeout(once.timer);
        once.resolve(recv.value);
      });
      h.on('subscribeInputEvent', (recv) => {
        const name = hashToName.get(String(recv.inputEventIdHash));
        const w = name && watchedInputs.get(name);
        if (!w) return;
        w.value = recv.value;
        onInput(name, recv.value);
      });
      // Changement d'avion : la liste des commandes de cockpit change aussi.
      const aircraftChanged = (path) => {
        inputList = null;
        hashToName.clear();
        setStatus({ aircraft: aircraftName(path) });
        onAircraft(status.aircraft);
        for (const name of watchedInputs.keys()) subscribeInput(name);
      };
      h.on('eventFilename', (e) => e.clientEventId === AIRCRAFT_EVENT && aircraftChanged(e.fileName));
      h.on('systemState', (s) => s.requestID === AIRCRAFT_STATE_REQ && setStatus({ aircraft: aircraftName(s.dataString) }));
      h.on('exception', (e) => log.warn?.(`[MSFS] Exception SimConnect ${e.exceptionName ?? e.exception} (paquet ${e.sendId})`));
      h.on('quit', () => dropConnection('Simulateur fermé.'));
      h.on('close', () => handle === h && dropConnection('Connexion au simulateur perdue.'));
      h.on('error', (e) => log.warn?.(`[MSFS] ${e.message}`));
      try {
        h.subscribeToSystemEvent(AIRCRAFT_EVENT, 'AircraftLoaded');
        h.requestSystemState(AIRCRAFT_STATE_REQ, 'AircraftLoaded');
      } catch {}
      setStatus({ connected: true, simName: recvOpen?.applicationName || 'Microsoft Flight Simulator', reason: null });
      resubscribeAll();
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

    /** Envoie un événement au simulateur (ex. « GEAR_TOGGLE », « A32NX.FCU_HDG_PUSH »), avec une valeur facultative. */
    async send(event, value = 0) {
      const name = String(event || '').trim().toUpperCase();
      if (!isValidEventName(name)) throw new Error(`Événement MSFS invalide : « ${event} ».`);
      requireHandle();
      let id = eventIds.get(name);
      if (id === undefined) {
        id = newId();
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

    /** Écrit une variable (ex. « L:A32NX_… » ou une SimVar modifiable). */
    async setVar(name, unit, value) {
      const simvar = normalizeVar(name);
      const u = String(unit || 'number').trim();
      if (!isValidSimvar(simvar) || !UNIT_RE.test(u)) throw new Error(`Variable MSFS invalide : « ${name} ».`);
      requireHandle();
      const k = keyOf(simvar, u);
      let defId = writeDefs.get(k);
      if (defId === undefined) {
        defId = newId();
        handle.addToDataDefinition(defId, simvar, u, lib.SimConnectDataType.FLOAT64);
        writeDefs.set(k, defId);
      }
      const buffer = new lib.RawBuffer(8);
      buffer.writeFloat64(Number(value) || 0);
      handle.setDataOnSimObject(defId, lib.SimConnectConstants.OBJECT_ID_USER, { buffer, arrayCount: 0, tagged: false });
      // Mise à jour immédiate de la valeur connue (les touches n'attendent pas l'écho du simulateur).
      recentWrites.set(k, { value: Number(value) || 0, at: Date.now() });
    },

    /** Lit une variable une seule fois (null si pas de réponse). */
    async readVar(name, unit = 'number', timeoutMs = 2000) {
      const simvar = normalizeVar(name);
      const u = String(unit || 'number').trim();
      if (!isValidSimvar(simvar) || !UNIT_RE.test(u)) throw new Error(`Variable MSFS invalide : « ${name} ».`);
      requireHandle();
      const r = recent(keyOf(simvar, u));
      if (r !== undefined) return r;
      const known = watched.get(keyOf(simvar, u));
      if (known?.value !== null && known?.value !== undefined) return known.value;
      const id = newId();
      return new Promise((resolve) => {
        const t = setTimeout(() => {
          oneShots.delete(id);
          resolve(null);
        }, timeoutMs);
        oneShots.set(id, { resolve, timer: t });
        handle.addToDataDefinition(id, simvar, u, lib.SimConnectDataType.FLOAT64);
        handle.requestDataOnSimObject(id, id, lib.SimConnectConstants.OBJECT_ID_USER, lib.SimConnectPeriod.ONCE);
      });
    },

    /** Commandes de cockpit (Input Events) de l'avion chargé. */
    async inputEvents(force = false) {
      const list = await listInputs(force);
      return list.map(({ name, type }) => ({ name, type }));
    },

    async setInput(name, value) {
      requireHandle();
      const found = await findInput(String(name || '').trim());
      handle.setInputEvent(found.hash, found.type === 'string' ? String(value ?? '') : Number(value) || 0);
      if (found.type !== 'string') recentWrites.set(`input:${found.name}`, { value: Number(value) || 0, at: Date.now() });
    },

    async readInput(name) {
      requireHandle();
      const r = recent(`input:${name}`);
      if (r !== undefined) return r;
      const w = watchedInputs.get(name);
      if (w?.value !== null && w?.value !== undefined) return w.value;
      return readInput(String(name || '').trim());
    },

    /**
     * Déclare ce qu'il faut suivre :
     *  - chaînes ou { simvar, unit } : variables (état on/off par défaut en « Bool ») ;
     *  - { input } : Input Event (MSFS 2024).
     */
    watch(list) {
      const wanted = new Map();
      const wantedInputs = new Set();
      for (const item of list) {
        if (item && typeof item === 'object' && item.input) {
          if (isValidInputEvent(item.input)) wantedInputs.add(item.input);
          continue;
        }
        const simvar = normalizeVar(typeof item === 'string' ? item : item?.simvar ?? '');
        const unit = String((typeof item === 'string' ? null : item?.unit) || 'Bool').trim();
        if (!isValidSimvar(simvar) || !UNIT_RE.test(unit)) continue;
        wanted.set(keyOf(simvar, unit), { simvar, unit });
      }
      for (const [k, { simvar, unit }] of wanted) {
        if (watched.has(k)) continue;
        const entry = { id: newId(), simvar, unit, value: null };
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
      for (const name of wantedInputs) {
        if (watchedInputs.has(name)) continue;
        watchedInputs.set(name, { value: null });
        if (handle) subscribeInput(name);
      }
      for (const name of [...watchedInputs.keys()]) {
        if (wantedInputs.has(name)) continue;
        const hash = inputList?.find((i) => i.name === name)?.hash;
        if (handle && hash !== undefined) {
          try {
            handle.unsubscribeInputEvent(hash);
          } catch {}
        }
        watchedInputs.delete(name);
      }
    },

    /** Dernière valeur connue d'une variable (null si inconnue). */
    value(simvar, unit = 'Bool') {
      return watched.get(keyOf(simvar, unit))?.value ?? null;
    },

    /** Dernière valeur connue d'un Input Event suivi (null si inconnue). */
    inputValue(name) {
      return watchedInputs.get(name)?.value ?? null;
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
