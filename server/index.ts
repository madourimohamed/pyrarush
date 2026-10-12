import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { levels } from '../src/levels';
import { parseClientMessage, type ServerMessage } from '../src/net/protocol';
import { AccountService } from './accounts';
import { createApi } from './api';
import { openDatabase } from './db';
import { Lobby, type Peer } from './rooms';
import { clientIp, LIMITS, MessageBudget, originAllowed, SECURITY_HEADERS } from './security';
import { resolveStatic } from './static';

/**
 * Serveur du jeu : sert le jeu compilé (dist/), l'API des comptes (/api) et les salles multijoueur en WebSocket (/ws),
 * sur le même port, pour qu'un seul tunnel ou un seul hébergement suffise.
 *   PORT (défaut 8787), DIST (défaut ./dist), DATABASE (défaut ./data/pyrarush.sqlite),
 *   TURNSTILE_SECRET (anti-robot ; absent en local), TRUST_CLOUDFLARE=1 (derrière Cloudflare : vraie adresse des joueurs),
 *   ALLOWED_ORIGINS (origines supplémentaires autorisées en multijoueur, séparées par des virgules, ex. une appli mobile).
 */
const PORT = Number(process.env.PORT ?? 8787);
const DIST = resolve(process.env.DIST ?? 'dist');
const DATABASE = resolve(process.env.DATABASE ?? 'data/pyrarush.sqlite');
const TRUST_CLOUDFLARE = process.env.TRUST_CLOUDFLARE === '1';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);

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

mkdirSync(dirname(DATABASE), { recursive: true });
const accounts = new AccountService(openDatabase(DATABASE), levels.map((l) => l.config.id));
const api = createApi(accounts, { turnstileSecret: process.env.TURNSTILE_SECRET });
setInterval(() => accounts.purgeExpiredSessions(), 3600_000).unref();

/**
 * Aucune requête ne doit pouvoir arrêter le serveur (les parties en cours de tout le monde seraient coupées) :
 * toute erreur inattendue est journalisée et ne concerne que la requête ou la connexion fautive.
 */
const server = createServer((req, res) => {
  api
    .serve(req, res, clientIp(req, TRUST_CLOUDFLARE))
    .then((handled) => {
      if (!handled) serveStatic(req.url ?? '/', res);
    })
    .catch((error) => {
      console.error('Requête en erreur :', error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
});

function serveStatic(url: string, res: import('node:http').ServerResponse): void {
  const file = resolveStatic(DIST, url);
  if (!file) {
    res.writeHead(400, SECURITY_HEADERS).end('Adresse invalide.');
    return;
  }
  if (!existsSync(file)) {
    res.writeHead(404, SECURITY_HEADERS).end('Jeu non compilé : lancer « npm run build ».');
    return;
  }
  const hashed = file.includes(`${join(DIST, 'assets')}`);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

const lobby = new Lobby(levels);
const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 4096,
  // Un autre site ne peut pas ouvrir de connexion multijoueur depuis le navigateur d'un visiteur.
  verifyClient: ({ origin, req }: { origin: string; req: import('node:http').IncomingMessage }) => originAllowed(origin, req.headers.host, ALLOWED_ORIGINS),
});
const socketsPerIp = new Map<string, number>();
let nextId = 1;

wss.on('connection', (socket, req) => {
  // Connexion authentifiée : le jeton du compte (invité ou sécurisé) est passé dans l'adresse (/ws?token=…).
  const ip = clientIp(req, TRUST_CLOUDFLARE);
  const token = new URL(req.url ?? '/', 'http://localhost').searchParams.get('token') ?? '';
  const account = token ? accounts.authenticate(token) : null;
  if (!account) return socket.close(4001, 'Session invalide');
  const open = socketsPerIp.get(ip) ?? 0;
  if (open >= LIMITS.socketsPerIp) return socket.close(4029, 'Trop de connexions');
  socketsPerIp.set(ip, open + 1);

  const peer: Peer = {
    id: `p${nextId++}`,
    name: account.name,
    userId: account.id,
    ip,
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

  const budget = new MessageBudget();
  socket.on('message', (data) => {
    const verdict = budget.take();
    if (verdict === 'flood') return socket.close(4008, 'Trop de messages');
    if (verdict === 'drop') return;
    const message = parseClientMessage(String(data));
    if (!message) return;
    try {
      lobby.handle(peer, message);
    } catch (error) {
      // Un bug du moteur ne doit faire tomber que cette connexion, jamais le serveur.
      console.error('Message en erreur :', message.t, error);
      socket.close(1011, 'Erreur du serveur');
    }
  });
  socket.on('close', () => {
    clearInterval(heartbeat);
    socketsPerIp.set(ip, Math.max(0, (socketsPerIp.get(ip) ?? 1) - 1));
    if (socketsPerIp.get(ip) === 0) socketsPerIp.delete(ip);
    try {
      lobby.leave(peer);
    } catch (error) {
      console.error('Départ en erreur :', error);
    }
  });
  socket.on('error', (error) => console.error('Connexion en erreur :', error.message));
});

server.listen(PORT, () => {
  console.log(`PyraRush : jeu, comptes et multijoueur sur http://localhost:${PORT} (API /api, WebSocket /ws)`);
});
