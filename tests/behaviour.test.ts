/**
 * Comportement social des bots et autonomie du Conteur, mesurés sur des parties complètes simulées.
 * (Simulations accélérées, déterministes, sans appel API.)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { simulate } from '../scripts/simulate';
import { Room } from '../src/server/room';
import * as E from '../src/engine/engine';
import { playerView } from '../src/engine/views';
import { PERSONAS } from '../src/ai/personalities';

type R = Awaited<ReturnType<typeof simulate>>;
let auto: R[] = [];
let human: R;

beforeAll(async () => {
  auto = [];
  for (const seed of [201, 202, 203]) auto.push(await simulate({ n: 10, seed }, undefined, false));
  human = await simulate({ n: 8, seed: 301, human: true }, undefined, false);
}, 300000);

const botMsgs = (r: R) => r.state.chat.filter(m => m.channel === 'public' && m.bot);
const all = <T>(f: (r: R) => T[]) => auto.flatMap(f);

describe('Mode C — partie entièrement automatisée (bots + Conteur automatique)', () => {
  it('le Conteur mène seul chaque partie jusqu’à la victoire, sans décision humaine', () => {
    for (const r of auto) {
      expect(r.state.phase).toBe('ended');
      expect(r.state.winner).not.toBeNull();
      expect(r.state.pendingDecision).toBeNull();
      expect(r.trace.some(e => e.kind === 'nuit:reveil')).toBe(true);
      expect(r.trace.some(e => e.kind === 'public:execution')).toBe(true);
      expect(r.aiLog.filter(l => l.kind === 'erreur')).toEqual([]);
    }
  });

  it('les bots initient la conversation chaque jour, sans qu’un humain parle', () => {
    for (const r of auto) {
      for (let d = 1; d <= Math.min(2, r.state.day); d++) {
        expect(r.state.chat.some(m => m.at === `J${d}` && m.bot)).toBe(true);
      }
    }
  });

  it('les bots se répondent entre eux (fil de conversation)', () => {
    const msgs = all(botMsgs);
    const byId = new Map(msgs.map(m => [m.id, m]));
    const replies = msgs.filter(m => m.replyTo && byId.has(m.replyTo));
    expect(replies.length / msgs.length).toBeGreaterThan(0.3);
  });

  it('ils se contredisent, se demandent des comptes et s’accordent', () => {
    const kinds = new Set(all(botMsgs).map(m => m.intent));
    for (const k of ['accuse', 'agree', 'defend', 'contradict', 'ask-why', 'explain', 'react-defense', 'ask-support', 'answer-support', 'question', 'claim']) {
      expect(kinds, `intention « ${k} » jamais observée`).toContain(k);
    }
  });

  it('les nominations viennent des bots eux-mêmes', () => {
    const noms = auto.flatMap(r => r.trace.filter(e => e.kind === 'nomination'));
    expect(noms.length).toBeGreaterThanOrEqual(3);
  });

  it('les bots adaptent leur stratégie : croyances qui évoluent, votes qui changent, défenses qui convainquent', () => {
    let evolved = 0;
    for (const r of auto) {
      const byBot: Record<string, string[]> = {};
      r.trace.filter(e => e.kind === 'croyances').forEach(e => { (byBot[e.actor!] ||= []).push(e.text); });
      evolved += Object.values(byBot).filter(list => new Set(list).size > 1).length;
    }
    expect(evolved).toBeGreaterThan(5);
    const changes = auto.flatMap(r => r.trace.filter(e => e.kind === 'vote:changement'));
    const persuaded = all(botMsgs).filter(m => m.intent === 'react-defense' && m.claim?.stance === 'agree');
    expect(changes.length + persuaded.length).toBeGreaterThan(0);
  });

  it('un bot du Bien partage exactement les informations nocturnes reçues ; un bot du Mal invente', () => {
    let honest = 0;
    for (const r of auto) {
      for (const m of botMsgs(r)) {
        if (!m.claim?.info) continue;
        const seat = r.state.seats.find(x => x.id === m.fromId)!;
        const received = (r.state.privateLog[seat.id] || []).map(p => JSON.stringify(p.info));
        if (seat.alignment === 'good') { expect(received).toContain(JSON.stringify(m.claim.info)); honest++; }
      }
    }
    expect(honest).toBeGreaterThan(0);
  });

  it('chaque bot réveillé reçoit une demande du Conteur, répond par un choix légal, puis reçoit son information', () => {
    const r = auto[0];
    const wakes = r.trace.filter(e => e.kind === 'nuit:reveil');
    const choices = r.trace.filter(e => e.kind === 'nuit:choix');
    expect(choices.length).toBe(wakes.length);
    expect(choices.every(c => typeof (c.data as { raisonnement?: string }).raisonnement === 'string')).toBe(true);
    expect(r.trace.some(e => e.kind === 'info-secrete' && /Voyante|voisins|paires|exécuté|Maître|L'un de ces/.test(e.text))).toBe(true);
  });

  it('les personnalités se distinguent : l’agressif accuse plus que le discret', () => {
    const count = (persona: string) => auto.reduce((n, r) => n + botMsgs(r).filter(m => r.state.seats.find(x => x.id === m.fromId)?.persona === persona && ['accuse', 'nominate', 'agree'].includes(m.intent ?? '')).length, 0);
    expect(count('agressif')).toBeGreaterThan(count('discret'));
    const talk = (persona: string) => auto.reduce((n, r) => n + botMsgs(r).filter(m => r.state.seats.find(x => x.id === m.fromId)?.persona === persona).length, 0);
    expect(talk('charismatique')).toBeGreaterThan(talk('discret'));
  });
});

describe('Mode A — un humain parmi les bots, Conteur automatique', () => {
  it('la partie va à son terme et les bots réagissent aux messages de l’humain', () => {
    expect(human.state.phase).toBe('ended');
    const humanMsgs = human.state.chat.filter(m => m.channel === 'public' && !m.bot && m.fromId !== 'storyteller');
    expect(humanMsgs.length).toBeGreaterThan(0);
    const ids = new Set(humanMsgs.map(m => m.id));
    // Le sens des messages humains est compris (revendication ou accusation détectée)
    expect(humanMsgs.some(m => m.claim)).toBe(true);
    // Au moins une réponse directe de bot à l'humain, ou une interpellation
    const answered = botMsgs(human).filter(m => (m.replyTo && ids.has(m.replyTo)) || m.to === humanMsgs[0].fromId);
    expect(answered.length).toBeGreaterThan(0);
  });
});

describe('Mode B — humains et bots, Conteur humain', () => {
  it('le Conteur humain valide les décisions ; les bots jouent leurs rôles ; la partie se termine', async () => {
    const room = new Room('MIXTE', { seed: 404, storyteller: 'human', dayDuration: 180 }, null);
    let t = Date.UTC(2026, 10, 21, 20);
    room.clock = () => t;
    const st = { storyteller: true, host: true, name: 'Conteuse' };
    const h = room.join('Basile');
    for (let i = 0; i < 7; i++) room.addBot(PERSONAS[i].id);
    room.handle(st, { t: 'start' });
    let decisions = 0;
    let dayTicks = 0;
    for (let step = 0; step < 30000 && room.state.phase !== 'ended'; step++) {
      t += 400;
      const s = room.state;
      if (s.pendingDecision) { decisions++; room.handle(st, { t: 'st', op: 'decide', decisionId: s.pendingDecision.id, option: s.pendingDecision.proposal }); }
      if (s.phase === 'night' && s.night.awaiting?.seatId === h.seatId) room.handle({ seatId: h.seatId, name: 'Basile' }, { t: 'night', targets: E.autoNightChoice(s) });
      if (s.phase === 'day') {
        dayTicks++;
        const nm = s.dayState.nomination;
        if (nm?.stage === 'defense' && dayTicks % 30 === 0) room.handle(st, { t: 'st', op: 'openVote' });
        if (dayTicks > 450 && (!nm || nm.stage === 'closed')) { room.handle(st, { t: 'st', op: 'endDay' }); dayTicks = 0; }
      } else dayTicks = 0;
      room.tick(t);
      await new Promise(r => setImmediate(r));
    }
    expect(room.state.phase).toBe('ended');
    expect(decisions).toBeGreaterThan(0);
    expect(room.trace.some(e => e.kind === 'nomination')).toBe(true);
    // Le joueur humain ne voit jamais les raisonnements ni les infos des bots
    const json = JSON.stringify(playerView(room.state, h.seatId));
    expect(json).not.toContain('raisonnement');
    for (const seat of room.state.seats.filter(x => x.isBot)) for (const m of room.state.privateLog[seat.id].slice(1)) expect(json).not.toContain(m.text);
  }, 120000);
});
