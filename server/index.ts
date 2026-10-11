import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { levels } from '../src/levels';
import { parseClientMessage, type ServerMessage } from '../src/net/protocol';
import { Lobby, type Peer } from './rooms';

/**
 * Serveur du duel : sert le jeu compilé (dist/) et les salles en WebSocket (/ws) sur le même port,
 * pour qu'un seul tunnel ou un seul hébergement suffise.
 *   PORT (défaut 8787), DIST (défaut ./dist)
 */
const PORT = Number(process.env.PORT ?? 8787);
const DIST = resolve(process.env.DIST ?? 'dist');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, path);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404).end('Jeu non compilé : lancer « npm run build ».');
    return;
  }
  const hashed = file.includes(`${join(DIST, 'assets')}`);
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
});

const lobby = new Lobby(levels);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
let nextId = 1;

wss.on('connection', (socket) => {
  const peer: Peer = {
    id: `p${nextId++}`,
    name: 'Explorateur',
    send: (message: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    },
  };
  // Les connexions mortes (téléphone en veille, réseau coupé) sont fermées par le battement de cœur.
  let alive = true;
  socket.on('pong', () => (alive = true));
  const heartbeat = setInterval(() => {
    if (!alive) return socket.terminate();
    alive = false;
    socket.ping();
  }, 15000);

  socket.on('message', (data) => {
    const message = parseClientMessage(String(data));
    if (message) lobby.handle(peer, message);
  });
  socket.on('close', () => {
    clearInterval(heartbeat);
    lobby.leave(peer);
  });
});

server.listen(PORT, () => {
  console.log(`PyraRush : jeu et duels sur http://localhost:${PORT} (WebSocket /ws)`);
});
