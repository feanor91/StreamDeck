// Imitation du plugin « SimHub Property Server » : vrai serveur TCP local, même protocole.
import net from 'node:net';

export async function fakeSimhub({ properties = {} } = {}) {
  const values = { ...properties }; // nom → [type, valeur brute]
  const sockets = new Set();
  const subs = new Map(); // socket → Set de propriétés
  const received = []; // commandes reçues
  const server = net.createServer((s) => {
    sockets.add(s);
    subs.set(s, new Set());
    s.setEncoding('utf8');
    s.write('SimHub Property Server\r\n');
    let buf = '';
    s.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        received.push(line);
        const [cmd, arg] = line.split(' ');
        if (cmd === 'subscribe') {
          subs.get(s).add(arg);
          const [type, raw] = values[arg] ?? ['object', '(null)'];
          s.write(`Property ${arg} ${type} ${raw}\r\n`);
        } else if (cmd === 'unsubscribe') subs.get(s).delete(arg);
        else if (cmd === 'help') {
          s.write('Available properties:\r\n');
          for (const [name, [type]] of Object.entries(values)) s.write(`  ${name} ${type}\r\n`);
          s.write('Available commands:\r\n  subscribe propertyName\r\n  disconnect\r\n');
        }
      }
    });
    s.on('close', () => {
      sockets.delete(s);
      subs.delete(s);
    });
    s.on('error', () => {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    port: server.address().port,
    received,
    /** Le jeu fait évoluer une propriété : envoyée aux clients abonnés. */
    emit(name, type, raw) {
      values[name] = [type, raw];
      for (const [s, set] of subs) if (set.has(name)) s.write(`Property ${name} ${type} ${raw}\r\n`);
    },
    close: () => {
      for (const s of sockets) s.destroy();
      return new Promise((r) => server.close(r));
    },
  };
}
