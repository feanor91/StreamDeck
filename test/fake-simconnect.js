// Imitation de node-simconnect pour les tests et le développement sans simulateur.
// Simule : événements, variables (lecture suivie, lecture ponctuelle, écriture),
// Input Events (liste, lecture, écriture, abonnement) et l'événement « avion chargé ».
import { EventEmitter } from 'node:events';

export function fakeSimConnect({ inputs = [], vars = {} } = {}) {
  const calls = [];
  const handle = new EventEmitter();
  const defs = new Map(); // id de définition → nom de variable
  const values = { ...vars }; // nom de variable → valeur
  const inputValues = Object.fromEntries(inputs.map((i) => [i.name, i.value ?? 0]));
  const inputByHash = new Map(inputs.map((i, n) => [String(BigInt(1000 + n)), i.name]));
  const subscribedInputs = new Set();
  const eventNames = new Map();

  class RawBuffer {
    constructor(size) {
      this.buf = Buffer.alloc(typeof size === 'number' ? size : 8);
    }
    writeFloat64(v) {
      this.buf.writeDoubleLE(v, 0);
    }
    getBuffer() {
      return this.buf;
    }
  }

  Object.assign(handle, {
    mapClientEventToSimEvent: (id, name) => {
      eventNames.set(id, name);
      calls.push(['map', id, name]);
    },
    transmitClientEvent: (obj, id, data, group, flags) => calls.push(['send', id, data, group, flags, eventNames.get(id)]),
    addToDataDefinition: (id, name, unit) => {
      defs.set(id, name);
      calls.push(['def', id, name, unit]);
    },
    requestDataOnSimObject: (req, def, obj, period) => {
      calls.push(['req', req, period]);
      if (period === 3 && values[defs.get(def)] !== undefined) {
        // Comme SimConnect : la valeur actuelle est envoyée dès l'abonnement.
        const name = defs.get(def);
        setImmediate(() => handle.emit('simObjectData', { requestID: req, data: { readFloat64: () => values[name] } }));
      }
      if (period === 1) {
        // Lecture ponctuelle (ONCE) : réponse asynchrone.
        const name = defs.get(def);
        setImmediate(() => handle.emit('simObjectData', { requestID: req, data: { readFloat64: () => values[name] ?? 0 } }));
      }
    },
    setDataOnSimObject: (def, obj, { buffer }) => {
      const name = defs.get(def);
      values[name] = buffer.getBuffer().readDoubleLE(0);
      calls.push(['set', name, values[name]]);
    },
    enumerateInputEvents: (req) => {
      setImmediate(() =>
        handle.emit('inputEventsList', {
          requestID: req,
          entryNumber: 0,
          outOf: 1,
          inputEventDescriptors: inputs.map((i, n) => ({ name: i.name, inputEventIdHash: BigInt(1000 + n), type: i.type === 'string' ? 1 : 0 })),
        }),
      );
    },
    getInputEvent: (req, hash) => {
      const name = inputByHash.get(String(hash));
      setImmediate(() => handle.emit('getInputEvent', { requestID: req, type: 0, value: inputValues[name] }));
    },
    setInputEvent: (hash, value) => {
      const name = inputByHash.get(String(hash));
      inputValues[name] = value;
      calls.push(['setInput', name, value]);
      if (subscribedInputs.has(String(hash))) setImmediate(() => handle.emit('subscribeInputEvent', { inputEventIdHash: hash, type: 0, value }));
    },
    subscribeInputEvent: (hash) => subscribedInputs.add(String(hash)),
    unsubscribeInputEvent: (hash) => subscribedInputs.delete(String(hash)),
    subscribeToSystemEvent: () => {},
    requestSystemState: (req) =>
      setImmediate(() => handle.emit('systemState', { requestID: req, dataString: 'SimObjects\\Airplanes\\Faux_Rafale\\aircraft.cfg' })),
    close() {},
  });

  const lib = {
    open: async () => ({ recvOpen: { applicationName: 'Faux MSFS 2024' }, handle }),
    Protocol: { KittyHawk: 5 },
    SimConnectDataType: { FLOAT64: 4 },
    SimConnectPeriod: { NEVER: 0, ONCE: 1, SIM_FRAME: 3 },
    SimConnectConstants: { OBJECT_ID_USER: 0 },
    DataRequestFlag: { DATA_REQUEST_FLAG_CHANGED: 1 },
    EventFlag: { EVENT_FLAG_GROUPID_IS_PRIORITY: 16 },
    RawBuffer,
  };

  // Le simulateur annonce une nouvelle valeur d'une variable suivie.
  const emitValue = (name, value) => {
    values[name] = value;
    for (const c of calls) {
      if (c[0] === 'def' && c[2] === name) handle.emit('simObjectData', { requestID: c[1], data: { readFloat64: () => value } });
    }
  };
  // Le simulateur annonce qu'un Input Event a changé (ex. interrupteur actionné dans le cockpit).
  const emitInput = (name, value) => {
    inputValues[name] = value;
    for (const [hash, n] of inputByHash) {
      if (n === name && subscribedInputs.has(hash)) handle.emit('subscribeInputEvent', { inputEventIdHash: BigInt(hash), type: 0, value });
    }
  };
  const sentEvents = () => calls.filter((c) => c[0] === 'send').map((c) => [c[5], c[2]]);

  return { lib, handle, calls, values, inputValues, emitValue, emitInput, sentEvents };
}
