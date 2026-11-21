import { describe, it, expect } from 'vitest';
import { createGame, addSeat, startGame, endDay } from '../src/engine/engine';
import { playerView, spectatorView } from '../src/engine/views';
import { ROLES, type RoleId } from '../src/shared/roles';
import { NAMES, playNight } from './helpers';
import type { GameState } from '../src/shared/types';

const ALL_ROLE_IDS = Object.keys(ROLES) as RoleId[];

/** Rôles qu'un joueur a légitimement le droit de connaître. */
const allowedRoles = (s: GameState, seatId: string): Set<string> => {
  const v = playerView(s, seatId);
  const ok = new Set<string>();
  if (v.me.role) ok.add(v.me.role);
  for (const m of v.me.messages) {
    const i = m.info;
    if (!i) continue;
    if (i.kind === 'pair-role' && i.role) ok.add(i.role);
    if (i.kind === 'role-of') ok.add(i.role);
    if (i.kind === 'demon-intro') i.bluffs.forEach(b => ok.add(b));
    if (i.kind === 'role-change') ok.add(i.role);
    if (i.kind === 'grimoire') i.seats.forEach(x => x.role && ok.add(x.role));
  }
  // Les revendications publiques (bluffs compris) sont des informations publiques
  for (const c of v.chat) if (c.claim?.role) ok.add(c.claim.role);
  return ok;
};

const roleIdsIn = (json: string) => ALL_ROLE_IDS.filter(r => new RegExp(`"${r}"`).test(json));

const game = (n: number, seed: number) => {
  const s = createGame('g', { seed });
  for (let i = 0; i < n; i++) addSeat(s, { id: `p${i}`, name: NAMES[i], isBot: false });
  startGame(s);
  return s;
};

describe('Isolation des informations secrètes', () => {
  it("aucune vue de joueur ne contient un rôle qu'il n'a pas le droit de connaître (5 à 15 joueurs, 3 nuits)", () => {
    for (let n = 5; n <= 15; n += 2) {
      for (let seed = 1; seed <= 6; seed++) {
        const s = game(n, seed);
        for (let round = 0; round < 3 && s.phase !== 'ended'; round++) {
          playNight(s);
          for (const seat of s.seats) {
            const json = JSON.stringify(playerView(s, seat.id));
            const leaked = roleIdsIn(json).filter(r => !allowedRoles(s, seat.id).has(r));
            expect(leaked, `fuite pour ${seat.name} (${seat.role}) : ${leaked}`).toEqual([]);
            expect(json).not.toContain('"redHerring"');
            expect(json).not.toContain('"poisoned"');
            expect(json).not.toContain('grimoireLog');
            expect(json).not.toContain('"rng"');
          }
          if (s.phase === 'day') endDay(s);
        }
      }
    }
  });

  it("l'Ivrogne ne voit jamais son vrai rôle", () => {
    for (let seed = 1; seed < 80; seed++) {
      const s = game(9, seed);
      const drunk = s.seats.find(x => x.role === 'drunk');
      if (!drunk) continue;
      const json = JSON.stringify(playerView(s, drunk.id));
      expect(json).not.toContain('"drunk"');
      expect(playerView(s, drunk.id).me.role).toBe(drunk.believedRole);
    }
  });

  it('le spectateur ne voit aucun rôle avant la fin', () => {
    const s = game(8, 3);
    playNight(s);
    expect(roleIdsIn(JSON.stringify(spectatorView(s)))).toEqual([]);
  });

  it('les messages privés du Conteur ne sont visibles que par leur destinataire', () => {
    const s = game(7, 4);
    s.chat.push({ id: 'x', ts: 1, at: 'N1', fromId: 'storyteller', fromName: 'Le Conteur', text: 'secret pour p0', channel: 'storyteller', seatId: 'p0' });
    expect(JSON.stringify(playerView(s, 'p0'))).toContain('secret pour p0');
    expect(JSON.stringify(playerView(s, 'p1'))).not.toContain('secret pour p0');
  });

  it('les rôles sont révélés à tous en fin de partie', () => {
    const s = game(5, 2);
    s.phase = 'ended';
    expect(playerView(s, 'p0').seats.every(x => x.revealedRole)).toBe(true);
  });
});
