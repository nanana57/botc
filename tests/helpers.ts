import { createGame, addSeat, startGame, submitNightChoice, autoNightChoice, nominate, openVoting, setHand, lockNextVote, type ForcedSetup } from '../src/engine/engine';
import type { RoleId } from '../src/shared/roles';
import type { GameState } from '../src/shared/types';

export const NAMES = ['Ada', 'Bram', 'Cyrielle', 'Dov', 'Elsa', 'Firmin', 'Gaëlle', 'Hector', 'Iris', 'Jules', 'Katell', 'Lior', 'Maud', 'Noé', 'Oriane'];

/** Crée une partie avec des rôles imposés dans l'ordre des sièges. */
export const rig = (roles: RoleId[], opts: Omit<ForcedSetup, 'roles'> & { seed?: number; storyteller?: 'auto' | 'human' } = {}): GameState => {
  const s = createGame('test', { seed: opts.seed ?? 42, storyteller: opts.storyteller ?? 'auto' });
  roles.forEach((_, i) => addSeat(s, { id: `p${i}`, name: NAMES[i], isBot: false }));
  startGame(s, { roles, drunkAs: opts.drunkAs, redHerring: opts.redHerring, bluffs: opts.bluffs });
  return s;
};

export const id = (s: GameState, name: string) => s.seats.find(x => x.name === name)!.id;

/** Joue la nuit : `choices` associe un rôle (cru) à des noms de cibles. */
export const playNight = (s: GameState, choices: Partial<Record<RoleId, string[]>> = {}) => {
  let guard = 0;
  while (s.phase === 'night' && s.night.awaiting && guard++ < 50) {
    const a = s.night.awaiting;
    const wanted = choices[a.role];
    submitNightChoice(s, a.seatId, wanted ? wanted.map(n => id(s, n)) : autoNightChoice(s));
  }
};

/** Nomination + vote complet. `yes` = noms qui votent pour. */
export const vote = (s: GameState, nominator: string, nominee: string, yes: string[]) => {
  nominate(s, id(s, nominator), id(s, nominee));
  if (!s.dayState.nomination || s.dayState.nomination.stage === 'closed') return;
  openVoting(s);
  yes.forEach(n => setHand(s, id(s, n), true));
  while (!lockNextVote(s)) { /* l'aiguille tourne */ }
};

export const lastMsg = (s: GameState, name: string) => {
  const m = s.privateLog[id(s, name)];
  return m[m.length - 1];
};
