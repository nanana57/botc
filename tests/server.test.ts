import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { startServer } from '../src/server/server';
import { ROLES } from '../src/shared/roles';

type Msg = Record<string, any>;

class Client {
  ws: WebSocket;
  inbox: Msg[] = [];
  view: Msg | null = null;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', d => { const m = JSON.parse(String(d)); this.inbox.push(m); if (m.t === 'view') this.view = m.view; });
  }
  open() { return new Promise<void>(r => this.ws.once('open', () => r())); }
  send(m: Msg) { this.ws.send(JSON.stringify(m)); }
  async wait(pred: (m: Msg) => boolean, ms = 4000): Promise<Msg> {
    const t0 = Date.now();
    for (;;) {
      const found = this.inbox.find(pred);
      if (found) { this.inbox.splice(this.inbox.indexOf(found), 1); return found; }
      if (Date.now() - t0 > ms) throw new Error('délai dépassé : ' + JSON.stringify(this.inbox.map(m => m.t === 'view' ? ['view', m.view.phase, m.view.seats?.length] : m)).slice(0, 400));
      await new Promise(r => setTimeout(r, 20));
    }
  }
  close() { this.ws.close(); }
}

let srv: Awaited<ReturnType<typeof startServer>>;
let dir: string;
let url: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'botc-'));
  srv = await startServer({ port: 0, dataDir: dir, gateway: null, tickMs: 50 });
  url = `ws://localhost:${srv.port}/ws`;
});
afterAll(async () => { await srv.close(); rmSync(dir, { recursive: true, force: true }); });

describe('Serveur temps réel', () => {
  it('création, arrivée des joueurs, bots, lancement, vues isolées', async () => {
    const host = new Client(url); await host.open();
    host.send({ t: 'create', name: 'Aurore', mode: 'auto' });
    const joined = await host.wait(m => m.t === 'joined');
    expect(joined.host).toBe(true);
    const guest = new Client(url); await guest.open();
    guest.send({ t: 'join', roomId: joined.roomId, name: 'Basile' });
    const gj = await guest.wait(m => m.t === 'joined');
    expect(gj.seatId).toBeTruthy();
    // un invité ne peut pas ajouter de bot
    guest.send({ t: 'addBot' });
    expect((await guest.wait(m => m.t === 'error')).msg).toMatch(/hôte/);
    for (let i = 0; i < 5; i++) host.send({ t: 'addBot' });
    await host.wait(m => m.t === 'view' && m.view.seats.length === 7);
    host.send({ t: 'start' });
    await host.wait(m => m.t === 'view' && m.view.phase !== 'lobby');
    await new Promise(r => setTimeout(r, 150));
    const hv = host.view!; const gv = guest.view!;
    expect(hv.me.role).toBeTruthy();
    expect(gv.me.role).toBeTruthy();
    // Aucun autre rôle dans la vue de l'invité (hors info légitime)
    const otherIds = gv.seats.filter((x: Msg) => x.id !== gv.me.seatId).map((x: Msg) => x.id);
    for (const sx of gv.seats) expect(sx.revealedRole).toBeUndefined();
    expect(JSON.stringify(gv)).not.toContain('grimoireLog');
    expect(otherIds.length).toBe(6);
    // Le serveur refuse une action non autorisée (un joueur qui se prend pour le Conteur)
    guest.send({ t: 'st', op: 'endDay' });
    expect((await guest.wait(m => m.t === 'error')).msg).toMatch(/Conteur/);
    // … et une action illégale selon les règles (voter sans nomination)
    guest.send({ t: 'hand', yes: true });
    expect((await guest.wait(m => m.t === 'error')).msg).toMatch(/vote|jour/i);
    host.close(); guest.close();
  });

  it('reprise de session par jeton et persistance sur disque', async () => {
    const c = new Client(url); await c.open();
    c.send({ t: 'create', name: 'Conteuse', mode: 'human' });
    const j = await c.wait(m => m.t === 'joined');
    expect(j.storyteller).toBe(true);
    for (let i = 0; i < 6; i++) c.send({ t: 'addBot' });
    await c.wait(m => m.t === 'view' && m.view.state?.seats.length === 6);
    c.send({ t: 'start' });
    const v = await c.wait(m => m.t === 'view' && m.view.state?.phase === 'night');
    // Le Conteur voit le grimoire complet
    expect(v.view.state.seats.every((x: Msg) => !!ROLES[x.role as keyof typeof ROLES])).toBe(true);
    c.close();
    await new Promise(r => setTimeout(r, 600));
    expect(readdirSync(dir).some(f => f.startsWith(j.roomId))).toBe(true);
    const c2 = new Client(url); await c2.open();
    c2.send({ t: 'resume', roomId: j.roomId, token: j.token });
    const back = await c2.wait(m => m.t === 'joined');
    expect(back.storyteller).toBe(true);
    c2.send({ t: 'resume', roomId: j.roomId, token: 'faux' });
    expect((await c2.wait(m => m.t === 'error')).msg).toMatch(/Jeton/);
    c2.close();
  });

  it('restaure une partie en cours après redémarrage du serveur', async () => {
    const c = new Client(url); await c.open();
    c.send({ t: 'create', name: 'Hôte', mode: 'auto' });
    const j = await c.wait(m => m.t === 'joined');
    for (let i = 0; i < 6; i++) c.send({ t: 'addBot' });
    await c.wait(m => m.t === 'view' && m.view.seats.length === 7);
    c.send({ t: 'start' });
    await c.wait(m => m.t === 'view' && m.view.phase !== 'lobby');
    const role = c.view!.me.role;
    c.close();
    await srv.close();
    srv = await startServer({ port: 0, dataDir: dir, gateway: null, tickMs: 50 });
    url = `ws://localhost:${srv.port}/ws`;
    const c2 = new Client(url); await c2.open();
    c2.send({ t: 'resume', roomId: j.roomId, token: j.token });
    await c2.wait(m => m.t === 'view');
    expect(c2.view!.me.role).toBe(role);
    expect(srv.rooms.get(j.roomId)!.brains.size).toBe(6);
    c2.close();
  });
});
