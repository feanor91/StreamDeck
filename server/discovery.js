import dgram from 'node:dgram';
import os from 'node:os';

// Découverte automatique sur le réseau local : l'application Android diffuse
// « STREAMDECK_DISCOVER » en UDP, chaque serveur répond avec son nom et son port.
export const DISCOVERY_PORT = 3211;
export const DISCOVERY_MAGIC = 'STREAMDECK_DISCOVER';

export function startDiscovery({ port, version, name = os.hostname(), log = console }) {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const reply = Buffer.from(JSON.stringify({ app: 'streamdeck', name, port, version }));

  socket.on('message', (msg, rinfo) => {
    if (msg.toString('utf8').trim() !== DISCOVERY_MAGIC) return;
    socket.send(reply, rinfo.port, rinfo.address);
  });
  socket.on('error', (e) => {
    log.warn?.(`  ⚠  Découverte réseau indisponible (UDP ${DISCOVERY_PORT}) : ${e.message}`);
    socket.close();
  });
  socket.bind(DISCOVERY_PORT);
  return {
    close: () => {
      try {
        socket.close();
      } catch {}
    },
  };
}
