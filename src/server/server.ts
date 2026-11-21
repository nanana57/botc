/**
 * Serveur HTTP + WebSocket.
 *  - Sert l'interface compilée (dist/) et une petite API d'état.
 *  - /ws : protocole temps réel. Chaque connexion s'authentifie par un jeton de salon.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { Room, type ClientMsg, type RoomClient } from './room';
import { RoomStore } from './store';
import { LlmGateway, configFromEnv, isConfigured } from '../ai/providers';
import { PERSONAS } from '../ai/personalities';
import { ROLES, SCRIPTS } from '../shared/roles';
import { RuleError } from '../engine/engine';

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.ico': 'image/x-icon' };

const code = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(5), b => alphabet[b % alphabet.length]).join('');
};

export interface ServerOptions { port: number; dataDir: string; staticDir?: string; tickMs?: number; gateway?: LlmGateway | null; llmBudget?: number }

export const startServer = (opts: ServerOptions) => {
  const cfg = configFromEnv();
  const gateway = opts.gateway !== undefined ? opts.gateway : isConfigured(cfg) ? new LlmGateway(cfg) : null;
  const budget = opts.llmBudget ?? Number(process.env.AI_CALL_BUDGET_PER_GAME || 300);
  const store = new RoomStore(opts.dataDir);
  const rooms = new Map<string, Room>();
  const wire = (r: Room) => { r.onChange = room => store.save(room); rooms.set(r.id, r); };
  store.loadAll(gateway, budget).forEach(wire);

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  const serveStatic = (req: IncomingMessage, res: ServerResponse) => {
    if (!opts.staticDir || !existsSync(opts.staticDir)) { res.writeHead(404); res.end('Interface non compilée : lance « npm run build » ou « npm run dev ».'); return; }
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = normalize(join(opts.staticDir, url));
    if (!file.startsWith(normalize(opts.staticDir))) { res.writeHead(403); res.end(); return; }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(opts.staticDir, 'index.html');
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
    res.end(readFileSync(file));
  };

  const http = createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    if (url === '/api/status') return json(res, 200, { ok: true, rooms: rooms.size, ai: gateway?.status() ?? { configured: false, provider: 'none' } });
    if (url === '/api/catalog') return json(res, 200, { scripts: SCRIPTS, roles: ROLES, personas: PERSONAS });
    const m = /^\/api\/rooms\/([A-Z0-9]{5})$/.exec(url);
    if (m) {
      const r = rooms.get(m[1]);
      return r ? json(res, 200, { id: r.id, phase: r.state.phase, seats: r.state.seats.length, mode: r.state.settings.storyteller }) : json(res, 404, { error: 'Salon introuvable' });
    }
    serveStatic(req, res);
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });
  wss.on('connection', (ws: WebSocket) => {
    let room: Room | null = null;
    let client: RoomClient | null = null;
    const send = (msg: unknown) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
    const err = (e: unknown) => send({ t: 'error', msg: e instanceof RuleError ? e.message : 'Action impossible.' });
    const attach = (r: Room, tk: string) => {
      const grant = r.grantOf(tk);
      if (!grant) throw new RuleError('Jeton invalide pour ce salon.');
      if (client && room) room.clients.delete(client);
      room = r;
      client = { grant, send };
      r.clients.add(client);
      send({ t: 'joined', roomId: r.id, token: tk, seatId: grant.seatId ?? null, storyteller: !!grant.storyteller, host: !!grant.host });
      send({ t: 'view', view: r.viewFor(grant) });
    };
    let msgCount = 0;
    const rate = setInterval(() => { msgCount = 0; }, 5000);
    ws.on('message', raw => {
      if (++msgCount > 60) return err(new RuleError('Trop de messages, ralentis.'));
      let m: Record<string, unknown>;
      try { m = JSON.parse(String(raw)); } catch { return err(new RuleError('Message illisible.')); }
      try {
        if (m.t === 'create') {
          const mode = m.mode === 'human' ? 'human' : 'auto';
          let id = code(); while (rooms.has(id)) id = code();
          const r = new Room(id, { storyteller: mode, dayDuration: Number(m.dayDuration) || 300 }, gateway, budget);
          wire(r);
          let tk: string;
          if (mode === 'human') tk = r.issue({ storyteller: true, host: true, name: String(m.name || 'Conteur').slice(0, 24) });
          else {
            const j = r.join(String(m.name || '').slice(0, 24));
            tk = j.token;
            r.tokens[tk].host = true;
          }
          attach(r, tk);
          r.touch(); r.flush();
          return;
        }
        if (m.t === 'join') {
          const r = rooms.get(String(m.roomId || '').toUpperCase());
          if (!r) throw new RuleError('Salon introuvable.');
          if (m.spectate) { const tk = r.issue({ name: 'Spectateur' }); attach(r, tk); return; }
          const j = r.join(String(m.name || ''));
          attach(r, j.token);
          r.touch(); r.flush();
          return;
        }
        if (m.t === 'resume') {
          const r = rooms.get(String(m.roomId || '').toUpperCase());
          if (!r) throw new RuleError('Ce salon n’existe plus.');
          attach(r, String(m.token || ''));
          return;
        }
        if (!room || !client) throw new RuleError("Rejoins d'abord un salon.");
        room.handle(client.grant, m as unknown as ClientMsg);
        room.flush();
      } catch (e) {
        if (!(e instanceof RuleError)) console.error(e);
        err(e);
      }
    });
    ws.on('close', () => { clearInterval(rate); if (room && client) room.clients.delete(client); });
  });

  const tick = setInterval(() => { for (const r of rooms.values()) if (r.state.phase === 'night' || r.state.phase === 'day') r.tick(); }, opts.tickMs ?? 400);

  return new Promise<{ port: number; close: () => Promise<void>; rooms: Map<string, Room> }>(resolve => {
    http.listen(opts.port, () => {
      const addr = http.address();
      const port = typeof addr === 'object' && addr ? addr.port : opts.port;
      resolve({
        port, rooms,
        close: () => new Promise(res => { clearInterval(tick); for (const r of rooms.values()) store.saveNow(r); wss.clients.forEach(c => c.terminate()); wss.close(); http.close(() => res()); }),
      });
    });
  });
};
