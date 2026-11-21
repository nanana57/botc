import { describe, it, expect } from 'vitest';
import { createGame, addSeat, startGame, endDay, slay, nominate, openVoting, setHand, RuleError, submitNightChoice, aliveNeighbours, validateComposition, stResolveDecision } from '../src/engine/engine';
import { DISTRIBUTION, ROLES, type RoleId } from '../src/shared/roles';
import { rig, id, playNight, vote, lastMsg, NAMES } from './helpers';

describe('Mise en place', () => {
  it('respecte la répartition officielle pour 5 à 15 joueurs (sur plusieurs graines)', () => {
    for (let n = 5; n <= 15; n++) {
      for (let seed = 1; seed <= 15; seed++) {
        const s = createGame('g', { seed });
        for (let i = 0; i < n; i++) addSeat(s, { id: `p${i}`, name: NAMES[i], isBot: false });
        startGame(s);
        const roles = s.seats.map(x => x.role!) as RoleId[];
        expect(() => validateComposition(roles, n)).not.toThrow();
        const [, os] = DISTRIBUTION[n];
        const out = roles.filter(r => ROLES[r].team === 'outsider').length;
        expect(out).toBe(os + (roles.includes('baron') ? 2 : 0));
      }
    }
  });

  it("donne à l'Ivrogne un faux rôle de Villageois absent de la partie", () => {
    for (let seed = 1; seed < 60; seed++) {
      const s = createGame('g', { seed });
      for (let i = 0; i < 9; i++) addSeat(s, { id: `p${i}`, name: NAMES[i], isBot: false });
      startGame(s);
      const drunk = s.seats.find(x => x.role === 'drunk');
      if (!drunk) continue;
      expect(ROLES[drunk.believedRole!].team).toBe('townsfolk');
      expect(s.seats.some(x => x.role === drunk.believedRole)).toBe(false);
      expect(s.bluffs).not.toContain(drunk.believedRole);
    }
  });

  it('propose au Démon trois bluffs bons absents de la partie', () => {
    const s = rig(['washerwoman', 'chef', 'empath', 'poisoner', 'imp']);
    expect(s.bluffs).toHaveLength(3);
    s.bluffs.forEach(b => { expect(s.seats.some(x => x.role === b)).toBe(false); expect(['townsfolk', 'outsider']).toContain(ROLES[b].team); });
  });

  it('refuse de lancer avec moins de 5 joueurs', () => {
    const s = createGame('g');
    for (let i = 0; i < 4; i++) addSeat(s, { id: `p${i}`, name: NAMES[i], isBot: false });
    expect(() => startGame(s)).toThrow(RuleError);
  });

  it('informe Sbires et Démon à partir de 7 joueurs uniquement', () => {
    const s7 = rig(['washerwoman', 'chef', 'empath', 'monk', 'soldier', 'poisoner', 'imp']);
    expect(s7.privateLog[id(s7, 'Gaëlle')].some(m => m.info?.kind === 'demon-intro')).toBe(true);
    expect(s7.privateLog[id(s7, 'Firmin')].some(m => m.info?.kind === 'evil-team')).toBe(true);
    const s5 = rig(['washerwoman', 'chef', 'empath', 'poisoner', 'imp']);
    expect(s5.privateLog[id(s5, 'Elsa')].some(m => m.info?.kind === 'demon-intro')).toBe(false);
  });
});

describe('Première nuit : informations', () => {
  it('Chef : compte exactement les paires maléfiques voisines', () => {
    // Sièges : Ada chef, Bram poisoner, Cyrielle imp, Dov empath, Elsa soldier → 1 paire (Bram-Cyrielle)
    const s = rig(['chef', 'poisoner', 'imp', 'empath', 'soldier']);
    playNight(s, { poisoner: ['Elsa'] });
    const m = s.privateLog[id(s, 'Ada')].find(x => x.source === 'chef')!;
    expect(m.info).toEqual({ kind: 'number', value: 1 });
  });

  it('Empathe : compte les voisins vivants maléfiques', () => {
    const s = rig(['empath', 'poisoner', 'chef', 'soldier', 'imp']);
    playNight(s, { poisoner: ['Dov'] });
    const m = s.privateLog[id(s, 'Ada')].find(x => x.source === 'empath')!;
    expect(m.info).toEqual({ kind: 'number', value: 2 }); // voisins : Bram (Sbire) et Elsa (Démon)
  });

  it("Empathe empoisonné : reçoit une information fausse", () => {
    const s = rig(['empath', 'poisoner', 'chef', 'soldier', 'imp']);
    playNight(s, { poisoner: ['Ada'] });
    const m = s.privateLog[id(s, 'Ada')].find(x => x.source === 'empath')!;
    expect((m.info as { value: number }).value).not.toBe(2);
  });

  it("Lavandière en bonne santé : l'un des deux joueurs porte bien le rôle annoncé", () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = rig(['washerwoman', 'chef', 'empath', 'poisoner', 'imp'], { seed });
      playNight(s, { poisoner: ['Bram'] });
      const info = s.privateLog[id(s, 'Ada')].find(x => x.source === 'washerwoman')!.info as { players: string[]; role: RoleId };
      expect(info.players).not.toContain(id(s, 'Ada'));
      expect(info.players.some(p => s.seats.find(x => x.id === p)!.role === info.role)).toBe(true);
    }
  });

  it("Bibliothécaire : apprend qu'il n'y a aucun Étranger", () => {
    const s = rig(['librarian', 'chef', 'empath', 'poisoner', 'imp']);
    playNight(s, { poisoner: ['Bram'] });
    expect((lastMsg(s, 'Ada').info as { none?: boolean }).none).toBe(true);
  });

  it("Enquêteur : désigne un vrai Sbire", () => {
    const s = rig(['investigator', 'chef', 'empath', 'spy', 'imp']);
    playNight(s);
    const info = s.privateLog[id(s, 'Ada')].find(x => x.source === 'investigator')!.info as { players: string[]; role: RoleId };
    expect(info.role).toBe('spy');
    expect(info.players).toContain(id(s, 'Dov'));
  });

  it('Voyante : oui si le Démon ou le leurre est désigné', () => {
    const s = rig(['fortuneteller', 'chef', 'empath', 'poisoner', 'imp'], { redHerring: 'p1' });
    playNight(s, { poisoner: ['Bram'], fortuneteller: ['Cyrielle', 'Elsa'] });
    expect((lastMsg(s, 'Ada').info as { value: boolean }).value).toBe(true);
    const s2 = rig(['fortuneteller', 'chef', 'empath', 'poisoner', 'imp'], { redHerring: 'p1' });
    playNight(s2, { poisoner: ['Cyrielle'], fortuneteller: ['Cyrielle', 'Dov'] });
    expect((lastMsg(s2, 'Ada').info as { value: boolean }).value).toBe(false);
    const s3 = rig(['fortuneteller', 'chef', 'empath', 'poisoner', 'imp'], { redHerring: 'p1' });
    playNight(s3, { poisoner: ['Cyrielle'], fortuneteller: ['Bram', 'Dov'] });
    expect((lastMsg(s3, 'Ada').info as { value: boolean }).value).toBe(true); // leurre
  });

  it("L'Ivrogne se réveille comme son faux rôle mais reçoit une info inopérante", () => {
    const s = rig(['drunk', 'chef', 'soldier', 'poisoner', 'imp', 'monk'], { drunkAs: 'empath' });
    playNight(s, { poisoner: ['Bram'] });
    expect(s.seats[0].believedRole).toBe('empath');
    const m = s.privateLog[id(s, 'Ada')].find(x => x.source === 'empath')!;
    expect((m.info as { value: number }).value).not.toBe(0); // vérité : Firmin et Bram sont bons → 0
  });

  it('refuse un choix invalide (Moine qui se protège lui-même)', () => {
    const s = rig(['monk', 'chef', 'empath', 'poisoner', 'imp']);
    playNight(s, { poisoner: ['Bram'] });
    endDay(s);
    expect(s.night.awaiting?.role).toBe('poisoner');
    submitNightChoice(s, id(s, 'Dov'), [id(s, 'Bram')]);
    expect(s.night.awaiting?.role).toBe('monk');
    expect(() => submitNightChoice(s, id(s, 'Ada'), [id(s, 'Ada')])).toThrow(RuleError);
    expect(() => submitNightChoice(s, id(s, 'Bram'), [id(s, 'Cyrielle')])).toThrow(/pas ton tour/);
  });
});

describe('Nuits suivantes : Démon, protections', () => {
  const toNight2 = (roles: RoleId[], opts = {}) => { const s = rig(roles, opts); playNight(s, { poisoner: [s.seats[0].name] }); endDay(s); return s; };

  it('le Diablotin ne tue pas la première nuit, puis tue', () => {
    const s = rig(['chef', 'empath', 'soldier', 'poisoner', 'imp', 'monk', 'mayor']);
    playNight(s, { poisoner: ['Ada'] });
    expect(s.seats.every(x => x.alive)).toBe(true);
    endDay(s);
    playNight(s, { poisoner: ['Ada'], monk: ['Ada'], imp: ['Bram'] });
    expect(s.phase).toBe('day');
    expect(s.seats.find(x => x.name === 'Bram')!.alive).toBe(false);
    expect(s.publicLog.some(e => e.kind === 'death' && e.text.includes('Bram'))).toBe(true);
  });

  it('le Moine protège, le Soldat résiste', () => {
    const s = toNight2(['chef', 'monk', 'soldier', 'poisoner', 'imp', 'empath', 'mayor']);
    playNight(s, { poisoner: ['Ada'], monk: ['Ada'], imp: ['Ada'] });
    expect(s.seats[0].alive).toBe(true);
    endDay(s);
    playNight(s, { poisoner: ['Ada'], monk: ['Ada'], imp: ['Cyrielle'] });
    expect(s.seats[2].alive).toBe(true);
  });

  it('un Soldat empoisonné meurt', () => {
    const s = toNight2(['chef', 'monk', 'soldier', 'poisoner', 'imp', 'empath', 'mayor']);
    playNight(s, { poisoner: ['Cyrielle'], monk: ['Ada'], imp: ['Cyrielle'] });
    expect(s.seats[2].alive).toBe(false);
  });

  it('transmission du Diablotin avec Femme écarlate', () => {
    const roles: RoleId[] = ['chef', 'monk', 'soldier', 'poisoner', 'imp', 'empath', 'scarletwoman', 'mayor', 'virgin', 'slayer'];
    const s = toNight2(roles);
    playNight(s, { poisoner: ['Ada'], monk: ['Ada'], imp: ['Elsa'] });
    const elsa = s.seats.find(x => x.name === 'Elsa')!;
    const sw = s.seats.find(x => x.name === 'Gaëlle')!;
    expect(elsa.alive).toBe(false);
    expect(sw.role).toBe('imp');
    expect(s.seats.filter(x => x.role === 'imp' && x.alive)).toHaveLength(1);
    expect(s.winner).toBeNull();
  });

  it('le Gardien des corbeaux tué la nuit apprend un rôle', () => {
    const s = toNight2(['ravenkeeper', 'monk', 'soldier', 'poisoner', 'imp', 'empath', 'mayor']);
    playNight(s, { poisoner: ['Bram'], monk: ['Cyrielle'], imp: ['Ada'], ravenkeeper: ['Elsa'] });
    const m = lastMsg(s, 'Ada');
    expect(m.source).toBe('ravenkeeper');
    expect((m.info as { role: RoleId }).role).toBe('imp');
  });

  it('le Fossoyeur apprend le rôle du joueur exécuté', () => {
    const s = rig(['undertaker', 'monk', 'soldier', 'poisoner', 'imp', 'empath', 'mayor']);
    playNight(s, { poisoner: ['Bram'] });
    vote(s, 'Ada', 'Cyrielle', ['Ada', 'Bram', 'Dov', 'Elsa', 'Firmin']);
    endDay(s);
    expect(s.seats[2].alive).toBe(false);
    playNight(s, { poisoner: ['Bram'], monk: ['Ada'], imp: ['Firmin'] });
    const m = s.privateLog[id(s, 'Ada')].find(x => x.source === 'undertaker')!;
    expect((m.info as { role: RoleId }).role).toBe('soldier');
  });

  it("Maire visé : le Conteur humain choisit qui meurt à sa place parmi des options valides", () => {
    const s = rig(['mayor', 'monk', 'soldier', 'poisoner', 'imp', 'empath', 'chef'], { storyteller: 'human' });
    const flush = () => { let g = 0; while (s.pendingDecision && s.pendingDecision.kind === 'info' && g++ < 20) stResolveDecision(s, s.pendingDecision.id, s.pendingDecision.proposal); };
    flush();
    playNight(s, { poisoner: ['Bram'] });
    flush();
    expect(s.phase).toBe('day');
    endDay(s);
    playNight(s, { poisoner: ['Bram'], monk: ['Gaëlle'], imp: ['Ada'] });
    const d = s.pendingDecision!;
    expect(d.kind).toBe('mayor-bounce');
    expect(d.options.map(o => o.value)).not.toContain(id(s, 'Elsa')); // jamais le Démon lui-même
    stResolveDecision(s, d.id, d.options.findIndex(o => o.value === id(s, 'Firmin')));
    flush();
    expect(s.phase).toBe('day');
    expect(s.seats[0].alive).toBe(true);
    expect(s.seats[5].alive).toBe(false);
  });
});

describe('Jour : nominations et votes', () => {
  const day1 = () => { const s = rig(['chef', 'monk', 'soldier', 'poisoner', 'imp', 'empath', 'butler', 'mayor']); playNight(s, { poisoner: ['Ada'], butler: ['Ada'] }); return s; };

  it('une nomination par nominateur et par nommé et par jour', () => {
    const s = day1();
    vote(s, 'Ada', 'Bram', []);
    expect(() => nominate(s, id(s, 'Ada'), id(s, 'Cyrielle'))).toThrow(/déjà nommé/);
    expect(() => nominate(s, id(s, 'Cyrielle'), id(s, 'Bram'))).toThrow(/déjà été nommé/);
  });

  it('seuil : la moitié des vivants (arrondie au supérieur), égalité = personne', () => {
    const s = day1(); // 8 vivants → seuil 4
    vote(s, 'Ada', 'Bram', ['Ada', 'Cyrielle', 'Dov']);
    expect(s.dayState.block).toBeNull();
    vote(s, 'Cyrielle', 'Dov', ['Ada', 'Cyrielle', 'Elsa', 'Firmin']);
    expect(s.dayState.block?.playerId).toBe(id(s, 'Dov'));
    vote(s, 'Elsa', 'Firmin', ['Ada', 'Bram', 'Cyrielle', 'Dov']);
    expect(s.dayState.block).toBeNull(); // égalité 4-4
  });

  it("le Majordome ne compte que si son Maître vote", () => {
    const s = day1(); // Gaëlle Majordome, Maître = Ada
    vote(s, 'Bram', 'Cyrielle', ['Bram', 'Dov', 'Elsa', 'Gaëlle']);
    expect(s.dayState.block).toBeNull(); // 3 votes comptés seulement
    vote(s, 'Dov', 'Elsa', ['Ada', 'Bram', 'Dov', 'Gaëlle']);
    expect(s.dayState.block?.votes).toBe(4);
  });

  it('les morts ont un seul vote fantôme et ne nomment pas', () => {
    const s = day1();
    vote(s, 'Ada', 'Bram', ['Ada', 'Bram', 'Cyrielle', 'Dov']);
    endDay(s);
    expect(s.seats[1].alive).toBe(false);
    playNight(s, { poisoner: ['Ada'], monk: ['Ada'], imp: ['Gaëlle'], butler: ['Ada'] });
    expect(() => nominate(s, id(s, 'Bram'), id(s, 'Ada'))).toThrow(/morts/);
    vote(s, 'Ada', 'Cyrielle', ['Bram']);
    expect(s.seats[1].ghostVote).toBe(false);
    nominate(s, id(s, 'Cyrielle'), id(s, 'Dov'));
    openVoting(s);
    expect(() => setHand(s, id(s, 'Bram'), true)).toThrow(/fantôme/);
  });

  it("la Vierge exécute un Villageois qui la nomme en premier", () => {
    const s = rig(['virgin', 'chef', 'empath', 'poisoner', 'imp']);
    playNight(s, { poisoner: ['Dov'] });
    nominate(s, id(s, 'Bram'), id(s, 'Ada'));
    expect(s.seats[1].alive).toBe(false);
    expect(s.dayState.executionDone).toBe(true);
    expect(() => nominate(s, id(s, 'Cyrielle'), id(s, 'Dov'))).toThrow(/exécution/);
  });

  it('la Vierge ne punit pas un Sbire', () => {
    const s = rig(['virgin', 'chef', 'empath', 'poisoner', 'imp']);
    playNight(s, { poisoner: ['Bram'] });
    nominate(s, id(s, 'Dov'), id(s, 'Ada'));
    expect(s.seats[3].alive).toBe(true);
    expect(s.status.virginUsed).toBe(true);
  });
});

describe('Conditions de victoire', () => {
  it('exécuter le Démon : victoire du Bien', () => {
    const s = rig(['chef', 'monk', 'soldier', 'poisoner', 'imp']);
    playNight(s, { poisoner: ['Ada'] });
    vote(s, 'Ada', 'Elsa', ['Ada', 'Bram', 'Cyrielle']);
    endDay(s);
    expect(s.winner).toBe('good');
    expect(s.phase).toBe('ended');
  });

  it('la Femme écarlate reprend le flambeau si 5 joueurs vivants', () => {
    const s = rig(['chef', 'monk', 'soldier', 'scarletwoman', 'imp']);
    playNight(s);
    vote(s, 'Ada', 'Elsa', ['Ada', 'Bram', 'Cyrielle']);
    endDay(s);
    expect(s.winner).toBeNull();
    expect(s.seats[3].role).toBe('imp');
  });

  it('exécuter la Sainte : victoire du Mal', () => {
    const s = rig(['chef', 'monk', 'saint', 'poisoner', 'imp', 'empath']);
    playNight(s, { poisoner: ['Ada'] });
    vote(s, 'Ada', 'Cyrielle', ['Ada', 'Bram', 'Cyrielle', 'Dov']);
    endDay(s);
    expect(s.winner).toBe('evil');
  });

  it('deux survivants : victoire du Mal', () => {
    const s = rig(['chef', 'monk', 'soldier', 'poisoner', 'imp']);
    playNight(s, { poisoner: ['Ada'] });
    vote(s, 'Ada', 'Bram', ['Ada', 'Bram', 'Cyrielle']);
    endDay(s); // Bram exécuté → 4 vivants
    playNight(s, { poisoner: ['Ada'], monk: ['Cyrielle'], imp: ['Ada'] }); // Ada meurt → 3
    vote(s, 'Dov', 'Cyrielle', ['Dov', 'Elsa']);
    endDay(s); // Cyrielle exécutée (Soldat) → 2 vivants
    expect(s.winner).toBe('evil');
  });

  it('le Maire : trois survivants sans exécution', () => {
    const s = rig(['mayor', 'monk', 'soldier', 'poisoner', 'imp']);
    playNight(s, { poisoner: ['Bram'] });
    vote(s, 'Ada', 'Bram', ['Ada', 'Bram', 'Cyrielle']);
    endDay(s); // 4 vivants
    playNight(s, { poisoner: ['Cyrielle'], monk: ['Ada'], imp: ['Cyrielle'] }); // 3 vivants
    expect(s.seats.filter(x => x.alive)).toHaveLength(3);
    endDay(s);
    expect(s.winner).toBe('good');
  });

  it('le Pourfendeur tue le Démon ; un bluff de tir ne fait rien', () => {
    const s = rig(['slayer', 'monk', 'soldier', 'poisoner', 'imp']);
    playNight(s, { poisoner: ['Bram'] });
    slay(s, id(s, 'Dov'), id(s, 'Ada'));
    expect(s.seats[0].alive).toBe(true);
    slay(s, id(s, 'Ada'), id(s, 'Elsa'));
    expect(s.winner).toBe('good');
  });
});

describe('Voisinage', () => {
  it('saute les morts', () => {
    const s = rig(['chef', 'monk', 'soldier', 'poisoner', 'imp']);
    s.seats[1].alive = false;
    expect(aliveNeighbours(s, 'p0').sort()).toEqual(['p2', 'p4']);
  });
});
