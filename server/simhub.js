// Liaison avec SimHub, via le plugin « SimHub Property Server » (pre-martin) :
// connexion TCP (port 18082 par défaut), protocole texte ligne par ligne.
//
//   → subscribe dcp.gd.SpeedKmh            ← Property dcp.gd.SpeedKmh double 123.4
//   → trigger-input-pressed deck.pit        (déclenche un « Control » SimHub)
//   → trigger-input-released deck.pit
//   → help                                  ← liste des propriétés et des commandes
//
// La connexion est rétablie automatiquement tant que SimHub n'est pas lancé.
import net from 'node:net';

const RETRY_MS = 5000;
const GREETING = 'SimHub Property Server';

/** Valeur transmise par SimHub → valeur JavaScript (nombre, texte ou null). */
export function parseSimhubValue(type, raw) {
  if (raw === undefined || raw === '(null)') return null;
  switch (type) {
    case 'boolean':
      return /^true$/i.test(raw) ? 1 : 0;
    case 'integer':
    case 'long':
    case 'double': {
      const n = Number(String(raw).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    case 'timespan':
      return parseTimespan(raw);
    default: {
      // Propriétés « génériques » : SimHub devine le type ; on reconnaît au moins nombres et booléens.
      if (/^(true|false)$/i.test(raw)) return /^true$/i.test(raw) ? 1 : 0;
      const n = Number(String(raw).replace(',', '.'));
      return raw !== '' && Number.isFinite(n) ? n : raw;
    }
  }
}

/** Durée .NET (« 00:01:23.4560000 », « 1.02:03:04 ») → secondes. */
export function parseTimespan(raw) {
  const m = String(raw).match(/^(-)?(?:(\d+)\.)?(\d+):(\d+):(\d+)(?:[.,](\d+))?$/);
  if (!m) return null;
  const [, neg, d, hh, mm, ss, frac] = m;
  const s = Number(d ?? 0) * 86400 + Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + (frac ? Number(`0.${frac}`) : 0);
  return neg ? -s : s;
}

export function createSimhub({
  log = console,
  host = process.env.SIMHUB_HOST || '127.0.0.1',
  port = Number(process.env.SIMHUB_PORT) || 18082,
  connect = (opts) => net.createConnection(opts), // tests : remplace la connexion TCP
  onStatus = () => {},
  onValue = () => {},
} = {}) {
  let socket = null;
  let ready = false;
  let closed = false;
  let retry = null;
  let buffer = '';
  let helpRequest = null;
  let warned = false;
  const watched = new Set(); // propriétés demandées par les touches
  const values = new Map(); // propriété → dernière valeur reçue

  const status = { available: true, connected: false, host, port, reason: 'Connexion à SimHub…' };
  const setStatus = (patch) => {
    Object.assign(status, patch);
    onStatus({ ...status });
  };

  const write = (line) => {
    if (ready && socket) socket.write(`${line}\r\n`);
  };

  function scheduleRetry() {
    if (closed || retry) return;
    retry = setTimeout(() => {
      retry = null;
      open();
    }, RETRY_MS);
    retry.unref?.();
  }

  function open() {
    if (closed) return;
    buffer = '';
    ready = false;
    const s = connect({ host, port });
    socket = s;
    s.setEncoding?.('utf8');
    s.setNoDelay?.(true);
    s.on('data', (chunk) => {
      buffer += chunk;
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i).replace(/\r$/, '');
        buffer = buffer.slice(i + 1);
        handleLine(line);
      }
    });
    s.on('error', (e) => {
      if (!warned && e.code !== 'ECONNREFUSED') log.warn?.(`SimHub : ${e.message}`);
    });
    s.on('close', () => {
      if (socket !== s) return;
      socket = null;
      const was = ready;
      ready = false;
      helpRequest?.reject(new Error('Connexion à SimHub perdue.'));
      helpRequest = null;
      if (was) log.log?.('SimHub : connexion perdue.');
      setStatus({
        connected: false,
        reason: `SimHub non détecté (${host}:${port}). Lancez SimHub avec le plugin « Property Server » activé.`,
      });
      warned = true;
      scheduleRetry();
    });
  }

  function handleLine(line) {
    if (!ready) {
      if (!line.startsWith(GREETING)) return;
      ready = true;
      warned = false;
      log.log?.(`SimHub : connecté (${host}:${port}).`);
      setStatus({ connected: true, reason: null });
      for (const name of watched) write(`subscribe ${name}`);
      return;
    }
    if (line.startsWith('Property ')) {
      // Property <nom> <type> <valeur, éventuellement avec des espaces>
      const [, name, type, ...rest] = line.split(' ');
      const value = parseSimhubValue(type, rest.join(' '));
      values.set(name, value);
      if (value !== null) onValue(name, value);
      return;
    }
    if (helpRequest) helpRequest.lines.push(line);
  }

  return {
    get status() {
      return { ...status };
    },
    start() {
      closed = false;
      if (!socket) open();
    },
    /** Liste des propriétés suivies (les autres sont désabonnées). */
    watch(names) {
      const next = new Set(names.filter(Boolean));
      for (const name of watched) {
        if (!next.has(name)) {
          watched.delete(name);
          values.delete(name);
          write(`unsubscribe ${name}`);
        }
      }
      for (const name of next) {
        if (!watched.has(name)) {
          watched.add(name);
          write(`subscribe ${name}`);
        }
      }
    },
    value: (name) => values.get(name) ?? null,
    /** Déclenche un « Control » SimHub : appui bref (click), appui (press) ou relâchement (release). */
    async trigger(input, mode = 'click') {
      const name = String(input ?? '').trim();
      if (!name || /\s/.test(name)) throw new Error('Nom de commande SimHub invalide (pas d’espace).');
      if (!ready) throw new Error(status.reason || 'SimHub non connecté.');
      if (mode === 'press' || mode === 'click') write(`trigger-input-pressed ${name}`);
      if (mode === 'click') await new Promise((r) => setTimeout(r, 60));
      if (mode === 'release' || mode === 'click') write(`trigger-input-released ${name}`);
    },
    /** Propriétés connues de SimHub (réponse à la commande « help »). */
    properties() {
      if (!ready) return Promise.reject(new Error(status.reason || 'SimHub non connecté.'));
      if (helpRequest) return helpRequest.promise;
      let resolve;
      let reject;
      const promise = new Promise((a, b) => ((resolve = a), (reject = b)));
      const req = { lines: [], promise, reject };
      helpRequest = req;
      write('help');
      // La réponse n'a pas de fin explicite : on attend que SimHub ait fini d'écrire.
      let last = -1;
      const poll = setInterval(() => {
        if (helpRequest !== req) return clearInterval(poll);
        if (req.lines.length && req.lines.length === last) {
          clearInterval(poll);
          helpRequest = null;
          const props = [];
          let section = '';
          for (const l of req.lines) {
            if (/^Available properties/i.test(l)) section = 'props';
            else if (/^Available commands/i.test(l)) section = 'cmds';
            else if (section === 'props') {
              const [name, type] = l.trim().split(/\s+/);
              if (name) props.push({ name, type: type ?? '' });
            }
          }
          resolve(props);
        }
        last = req.lines.length;
      }, 300);
      setTimeout(() => {
        if (helpRequest !== req) return;
        clearInterval(poll);
        helpRequest = null;
        reject(new Error('SimHub n’a pas répondu.'));
      }, 8000).unref?.();
      return promise;
    },
    close() {
      closed = true;
      clearTimeout(retry);
      retry = null;
      const s = socket;
      socket = null;
      ready = false;
      s?.destroy();
    },
  };
}
