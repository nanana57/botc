/**
 * Isolation des informations secrètes.
 *
 * `playerView` est l'UNIQUE fonction qui produit ce qu'un joueur (humain ou bot) peut voir.
 * Le serveur n'envoie jamais l'état complet à un joueur, et les bots ne reçoivent que cette vue.
 * Les tests (tests/views.test.ts) vérifient qu'aucun rôle d'un autre joueur n'y apparaît.
 */
import { ROLES } from '../shared/roles';
import type { GameState, PlayerView, PublicSeat, StorytellerView } from '../shared/types';
import { canNominate } from './engine';

export const publicSeats = (s: GameState): PublicSeat[] =>
  s.seats.map(x => ({
    id: x.id, name: x.name, isBot: x.isBot, persona: x.persona, alive: x.alive, ghostVote: x.ghostVote,
    ...(s.phase === 'ended' ? { revealedRole: x.role, revealedAlignment: x.alignment } : {}),
  }));

export const playerView = (s: GameState, seatId: string): PlayerView => {
  const seat = s.seats.find(x => x.id === seatId);
  if (!seat) throw new Error('Siège inconnu');
  const believed = seat.believedRole;
  const team = believed ? ROLES[believed].team : null;
  // L'Ivrogne croit être bon et Villageois : on lui montre l'alignement de son rôle cru (identique : bon).
  const alignment = seat.alignment;
  const nm = s.dayState.nomination;
  const dayState = {
    ...s.dayState,
    // Les intentions de vote (mains) des autres restent visibles : c'est public autour de la table.
    nomination: nm ? { ...nm, votes: nm.votes.map(v => ({ ...v })) } : null,
  };
  return {
    role: 'player',
    gameId: s.id,
    version: s.version,
    phase: s.phase,
    day: s.day,
    settings: { ...s.settings, seed: undefined },
    seats: publicSeats(s),
    me: {
      seatId: seat.id,
      name: seat.name,
      role: believed,
      team,
      alignment,
      alive: seat.alive,
      ghostVote: seat.ghostVote,
      messages: (s.privateLog[seat.id] || []).map(m => ({ ...m })),
      awaiting: s.night.awaiting && s.night.awaiting.seatId === seat.id ? { ...s.night.awaiting } : null,
      canNominate: canNominate(s, seat.id),
      canBeNominatedIds: s.phase === 'day' ? s.seats.filter(x => !s.dayState.nominees.includes(x.id)).map(x => x.id) : [],
      canSlay: s.phase === 'day' && seat.alive && believed === 'slayer' && !s.status.slayerUsedBy.includes(seat.id),
    },
    dayState,
    publicLog: s.publicLog.slice(-120),
    chat: s.chat.filter(m => m.channel === 'public' || m.seatId === seat.id).slice(-250),
    voteHistory: s.voteHistory,
    winner: s.winner,
    winReason: s.winReason,
  };
};

/** Vue publique d'un spectateur (aucune info privée). */
export const spectatorView = (s: GameState) => ({
  role: 'spectator' as const,
  gameId: s.id,
  version: s.version,
  phase: s.phase,
  day: s.day,
  seats: publicSeats(s),
  dayState: s.dayState,
  publicLog: s.publicLog.slice(-120),
  chat: s.chat.filter(m => m.channel === 'public').slice(-250),
  winner: s.winner,
});

export const storytellerView = (s: GameState): StorytellerView => ({
  role: 'storyteller', gameId: s.id, version: s.version, state: s,
});
