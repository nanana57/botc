import { describe, it, expect } from 'vitest';
import { BotBrain } from '../src/ai/brain';
import { reason } from '../src/ai/reasoner';
import { parseHumanMessage } from '../src/ai/parse';
import { validateRealization, renderTemplate } from '../src/ai/speech';
import { PERSONAS, personaById } from '../src/ai/personalities';
import { LlmGateway } from '../src/ai/providers';
import { playerView } from '../src/engine/views';
import { addChat, endDay, submitNightChoice, autoNightChoice } from '../src/engine/engine';
import { ROLES } from '../src/shared/roles';
import { rig, id, playNight } from './helpers';
import { simulate } from '../scripts/simulate';

describe('Raisonnement par mondes possibles', () => {
  it("un Empathe qui a eu 0 innocente ses deux voisins", () => {
    const s = rig(['empath', 'chef', 'soldier', 'poisoner', 'imp', 'monk', 'mayor']);
    playNight(s, { poisoner: ['Cyrielle'] });
    // voisins d'Ada : Bram (Chef) et Hortense? 7 sièges → Gaëlle (Maire)
    const v = playerView(s, id(s, 'Ada'));
    const b = new BotBrain(id(s, 'Ada'), 'analytique');
    b.observe(v);
    const { b: bel } = b.beliefs(v);
    expect(bel.pEvil[id(s, 'Ada')]).toBe(0);
    expect(bel.pEvil[id(s, 'Bram')]).toBeLessThan(0.2);
    expect(bel.pEvil[id(s, 'Gaëlle')]).toBeLessThan(0.2);
    expect(bel.pEvil[id(s, 'Elsa')]).toBeGreaterThan(bel.pEvil[id(s, 'Bram')]);
  });

  it('une double revendication rend les deux joueurs suspects, et un bon joueur qui voit son rôle revendiqué accuse le menteur', () => {
    const s = rig(['empath', 'chef', 'soldier', 'poisoner', 'imp', 'monk', 'mayor']);
    playNight(s, { poisoner: ['Cyrielle'] });
    addChat(s, { fromId: id(s, 'Bram'), fromName: 'Bram', text: 'Je suis Chef', channel: 'public', claim: { role: 'chef' } });
    addChat(s, { fromId: id(s, 'Elsa'), fromName: 'Elsa', text: 'Je suis Chef', channel: 'public', claim: { role: 'chef' } });
    const bram = new BotBrain(id(s, 'Bram'), 'analytique');
    const v = playerView(s, id(s, 'Bram'));
    bram.observe(v);
    const { b } = bram.beliefs(v);
    expect(b.pEvil[id(s, 'Elsa')]).toBeGreaterThan(0.6);
    expect(b.topReason[id(s, 'Elsa')]?.kind).toBe('double-claim');
  });

  it('le Démon connaît son équipe : aucune incertitude sur ses alliés', () => {
    const s = rig(['empath', 'chef', 'soldier', 'poisoner', 'imp', 'monk', 'mayor']);
    playNight(s, { poisoner: ['Cyrielle'] });
    const v = playerView(s, id(s, 'Elsa'));
    const bel = reason({ view: v, mem: new BotBrain(id(s, 'Elsa'), 'stratege').mem, traits: personaById('stratege').traits });
    expect(bel.worlds).toBe(1);
    expect(bel.pEvil[id(s, 'Dov')]).toBe(1);
  });
});

describe('Personnalités : impact réel sur les décisions', () => {
  it('le seuil de vote dépend de la personnalité (agressif vote plus volontiers que prudent)', () => {
    let aggrYes = 0; let prudYes = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = rig(['empath', 'chef', 'soldier', 'poisoner', 'imp', 'monk', 'mayor'], { seed });
      playNight(s, { poisoner: ['Cyrielle'] });
      addChat(s, { fromId: id(s, 'Bram'), fromName: 'Bram', text: 'Je suis Chef', channel: 'public', claim: { role: 'chef' } });
      addChat(s, { fromId: id(s, 'Elsa'), fromName: 'Elsa', text: 'Je suis Chef', channel: 'public', claim: { role: 'chef' } });
      s.dayState.nomination = { nominatorId: id(s, 'Ada'), nomineeId: id(s, 'Elsa'), stage: 'voting', order: s.seats.map(x => x.id), cursor: 0, hands: {}, votes: [] };
      for (const [persona, inc] of [['agressif', () => aggrYes++], ['prudent', () => prudYes++]] as const) {
        const b = new BotBrain(id(s, 'Cyrielle'), persona, seed);
        const v = playerView(s, id(s, 'Cyrielle'));
        b.observe(v);
        if (b.decideVote(v)) inc();
      }
    }
    expect(aggrYes).toBeGreaterThan(prudYes);
  });

  it('dix profils distincts avec des traits différents', () => {
    expect(PERSONAS).toHaveLength(10);
    const sigs = new Set(PERSONAS.map(p => JSON.stringify(p.traits)));
    expect(sigs.size).toBe(10);
  });

  it('les bots maléfiques bluffent un rôle bon et ne votent pas contre leur Démon', () => {
    const s = rig(['empath', 'chef', 'soldier', 'poisoner', 'imp', 'monk', 'mayor']);
    playNight(s, { poisoner: ['Cyrielle'] });
    const dov = new BotBrain(id(s, 'Dov'), 'manipulateur');
    const v = playerView(s, id(s, 'Dov'));
    dov.observe(v);
    const ident = dov.publicIdentity(v)!;
    expect(['townsfolk', 'outsider']).toContain(ROLES[ident.role].team);
    expect(ident.role).not.toBe('saint');
    s.dayState.nomination = { nominatorId: id(s, 'Ada'), nomineeId: id(s, 'Elsa'), stage: 'voting', order: s.seats.map(x => x.id), cursor: 0, hands: {}, votes: [] };
    expect(dov.decideVote(playerView(s, id(s, 'Dov')))).toBe(false);
  });

  it('le Démon ne tue jamais un allié', () => {
    for (let seed = 1; seed < 25; seed++) {
      const s = rig(['empath', 'chef', 'soldier', 'poisoner', 'imp', 'monk', 'mayor'], { seed });
      playNight(s, { poisoner: ['Cyrielle'] });
      endDay(s);
      const imp = new BotBrain(id(s, 'Elsa'), PERSONAS[seed % 10].id, seed);
      let g = 0;
      while (s.phase === 'night' && s.night.awaiting && g++ < 20) {
        const a = s.night.awaiting;
        if (a.role === 'imp') {
          const v = playerView(s, a.seatId);
          imp.observe(v);
          const t = imp.nightChoice(v);
          expect(t).not.toContain(id(s, 'Dov'));
          submitNightChoice(s, a.seatId, t);
        } else submitNightChoice(s, a.seatId, autoNightChoice(s));
      }
    }
  });
});

describe('Interprétation des messages humains', () => {
  const seats = ['Ada', 'Bram', 'Cyrielle', 'Dov'].map((n, i) => ({ id: `p${i}`, name: n, isBot: false, alive: true, ghostVote: true }));
  it('repère une revendication et une info chiffrée', () => {
    expect(parseHumanMessage("Je suis l'Empathe, j'ai eu 1", seats, 'p0', ['p1', 'p3'])).toMatchObject({ role: 'empath', info: { kind: 'number', value: 1, players: ['p1', 'p3'] } });
  });
  it('repère une accusation par prénom', () => {
    expect(parseHumanMessage('Je soupçonne Cyrielle, elle ment', seats, 'p0')?.accuse).toBe('p2');
  });
  it('repère une info de Voyante', () => {
    expect(parseHumanMessage('Je suis la voyante : Bram et Dov, non', seats, 'p0')).toMatchObject({ role: 'fortuneteller', info: { kind: 'yesno', value: false, players: ['p1', 'p3'] } });
  });
});

describe('Génération et validation des répliques', () => {
  const seats = ['Ada', 'Bram'].map((n, i) => ({ id: `p${i}`, name: n, isBot: true, alive: true, ghostVote: true }));
  it('refuse une reformulation qui change un nom, un rôle ou un chiffre', () => {
    const orig = renderTemplate({ kind: 'claim', role: 'empath', info: { kind: 'number', value: 1, players: ['p1'] } }, PERSONAS[0], seats, 'p0');
    expect(validateRealization(orig, 'Je suis Empathe et j’ai senti 1 mal près de Bram.', seats)).toBe(true);
    expect(validateRealization(orig, 'Je suis Chef et j’ai eu 1 près de Bram.', seats)).toBe(false);
    expect(validateRealization(orig, 'Je suis Empathe et j’ai eu 2 près de Bram.', seats)).toBe(false);
    expect(validateRealization(orig, 'En tant que IA, je suis Empathe, 1, Bram.', seats)).toBe(false);
  });
});

describe('Passerelle des fournisseurs IA', () => {
  const cfg = { provider: 'anthropic' as const, model: 'claude-haiku-5-5', apiKey: 'test', timeoutMs: 200 };
  const resp = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it('renvoie le texte du modèle', async () => {
    const g = new LlmGateway(cfg, 2, (async () => resp(200, { content: [{ text: 'Bonjour.' }] })) as typeof fetch);
    expect(await g.complete('s', 'u')).toMatchObject({ ok: true, text: 'Bonjour.' });
  });

  it('réessaie une fois sur erreur passagère (529)', async () => {
    let n = 0;
    const g = new LlmGateway(cfg, 2, (async () => (++n === 1 ? resp(529, { error: { message: 'overloaded' } }) : resp(200, { content: [{ text: 'ok' }] }))) as typeof fetch);
    expect((await g.complete('s', 'u')).ok).toBe(true);
    expect(n).toBe(2);
  });

  it('se met en pause après une clé refusée (401) et ne réessaie pas', async () => {
    let n = 0;
    const g = new LlmGateway(cfg, 2, (async () => { n++; return resp(401, { error: { message: 'invalid key' } }); }) as typeof fetch);
    expect((await g.complete('s', 'u')).ok).toBe(false);
    expect(n).toBe(1);
    expect(g.available).toBe(false);
    expect((await g.complete('s', 'u')).error).toMatch(/indisponible/);
  });

  it('expire proprement si le fournisseur ne répond pas', async () => {
    const g = new LlmGateway(cfg, 2, ((_u: string, o: RequestInit) => new Promise((_r, rej) => o.signal!.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))))) as unknown as typeof fetch);
    const r = await g.complete('s', 'u');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/timeout/);
  });
});

describe('Parties complètes entre bots', () => {
  it('cinq parties de tailles variées vont à leur terme sans erreur', async () => {
    const winners: string[] = [];
    for (const [n, seed] of [[5, 1], [7, 2], [9, 3], [12, 4], [15, 5]]) {
      const room = await simulate(n, seed, false);
      expect(room.state.phase).toBe('ended');
      expect(room.state.winner).not.toBeNull();
      expect(room.aiLog.filter(l => l.kind === 'erreur')).toEqual([]);
      winners.push(room.state.winner!);
    }
    expect(winners).toHaveLength(5);
  }, 120000);
});
