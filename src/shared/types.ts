import type { Alignment, RoleId, Team } from './roles';

export type Phase = 'lobby' | 'night' | 'day' | 'ended';
export type StorytellerMode = 'auto' | 'human';

export interface Seat {
  id: string;
  name: string;
  isBot: boolean;
  /** Personnalité (bots). */
  persona?: string;
  /** Rôle réel (secret). */
  role: RoleId | null;
  /** Rôle que le joueur croit avoir (diffère pour l'Ivrogne). */
  believedRole: RoleId | null;
  alignment: Alignment | null;
  alive: boolean;
  /** Vote fantôme encore disponible (morts). */
  ghostVote: boolean;
}

/** Information structurée remise par le Conteur. Toujours vérifiable par le moteur. */
export type InfoPayload =
  | { kind: 'pair-role'; players: [string, string]; role: RoleId | null; none?: boolean }
  | { kind: 'number'; value: number; players?: string[] }
  | { kind: 'yesno'; value: boolean; players: string[] }
  | { kind: 'role-of'; player: string; role: RoleId }
  | { kind: 'evil-team'; demon: string | null; minions: string[] }
  | { kind: 'demon-intro'; minions: string[]; bluffs: RoleId[] }
  | { kind: 'grimoire'; seats: Array<{ id: string; role: RoleId | null; alive: boolean; isPoisoned: boolean; isDrunk: boolean }> }
  | { kind: 'role-change'; role: RoleId }
  | { kind: 'text' };

export interface PrivateMessage {
  id: string;
  /** Moment : 'N1', 'J2'… */
  at: string;
  text: string;
  info?: InfoPayload;
  /** Rôle (cru) qui a produit l'info. */
  source?: RoleId;
}

export type PublicEventKind =
  | 'phase' | 'death' | 'execution' | 'nomination' | 'vote-result' | 'slayer' | 'virgin' | 'win' | 'system' | 'block';

export interface PublicEvent {
  id: string;
  at: string;
  kind: PublicEventKind;
  text: string;
  players?: string[];
}

export interface ChatMessage {
  id: string;
  ts: number;
  at: string;
  fromId: string; // seat id | 'storyteller'
  fromName: string;
  text: string;
  /** 'public' ou id de joueur (message privé échangé avec le Conteur). */
  channel: 'public' | 'storyteller';
  /** Pour un message privé : le joueur concerné. */
  seatId?: string;
  /** Sémantique publique extraite (revendication, accusation…) — utilisable par les bots. */
  claim?: SpeechClaim;
  bot?: boolean;
}

/** Sens public d'une déclaration (ce que le joueur affirme). */
export interface SpeechClaim {
  role?: RoleId;
  info?: InfoPayload;
  accuse?: string;
  defend?: string;
  trust?: string;
  question?: string;
}

export interface VoteRecord {
  voterId: string;
  yes: boolean;
  ghost: boolean;
  /** Vote compté (le Majordome sans son Maître ne compte pas). */
  counted: boolean;
}

export interface Nomination {
  nominatorId: string;
  nomineeId: string;
  /** 'defense' → débat ; 'voting' → l'aiguille tourne ; 'closed'. */
  stage: 'defense' | 'voting' | 'closed';
  order: string[];
  /** Index du prochain votant à verrouiller. */
  cursor: number;
  /** Intentions de vote (main levée) en cours. */
  hands: Record<string, boolean>;
  votes: VoteRecord[];
  total?: number;
  required?: number;
}

export interface BlockState { playerId: string; votes: number }

export type NightChoiceRequest = {
  seatId: string;
  role: RoleId;
  count: number;
  allowSelf: boolean;
  aliveOnly: boolean;
  prompt: string;
};

export interface StDecision {
  id: string;
  kind: 'info' | 'mayor-bounce' | 'starpass' | 'registration';
  seatId: string;
  role: RoleId;
  title: string;
  options: Array<{ label: string; value: unknown }>;
  proposal: number;
}

export interface GameSettings {
  scriptId: string;
  storyteller: StorytellerMode;
  /** Durée de débat (secondes) par jour en mode Conteur automatique. */
  dayDuration: number;
  /** Délai max pour qu'un humain fasse son choix de nuit. */
  nightChoiceTimeout: number;
  seed?: number;
}

export interface GameState {
  id: string;
  version: number;
  settings: GameSettings;
  rng: number;
  phase: Phase;
  /** Numéro de nuit/jour courant (Nuit 1 → Jour 1 → Nuit 2…). */
  day: number;
  seats: Seat[];
  bluffs: RoleId[];
  status: {
    poisoned: string | null;
    protected: string | null;
    redHerring: string | null;
    butlerMaster: string | null;
    /** Joueurs ayant déjà annoncé un tir de Pourfendeur (vrai ou bluff). */
    slayerUsedBy: string[];
    virginUsed: boolean;
    /** Exécuté au jour courant (pour le Fossoyeur, nuit suivante). */
    executedToday: string | null;
    executedYesterday: string | null;
    killedTonight: string[];
    /** Joueurs dont le rôle a changé (Diablotin transmis, Femme écarlate). */
    demonChanges: string[];
  };
  night: {
    queue: Array<{ seatId: string; role: RoleId; special?: 'minion-info' | 'demon-info' }>;
    cursor: number;
    awaiting: NightChoiceRequest | null;
    awaitingSince: number;
    /** Choix enregistrés pendant la nuit (pour le Grimoire). */
    log: string[];
  };
  dayState: {
    nominators: string[];
    nominees: string[];
    nomination: Nomination | null;
    block: BlockState | null;
    endsAt: number | null;
    executionDone: boolean;
  };
  pendingDecision: StDecision | null;
  /** Décision suspendue en attente du Conteur humain : contexte pour reprendre. */
  resumeContext: unknown;
  privateLog: Record<string, PrivateMessage[]>;
  publicLog: PublicEvent[];
  chat: ChatMessage[];
  /** Historique complet pour le Grimoire (tout, y compris secrets). */
  grimoireLog: Array<{ at: string; text: string }>;
  voteHistory: Array<{ at: string; nominatorId: string; nomineeId: string; votes: VoteRecord[]; total: number; required: number }>;
  winner: Alignment | null;
  winReason: string | null;
  createdAt: number;
}

/** Vue publique d'un siège (aucune information secrète). */
export interface PublicSeat {
  id: string;
  name: string;
  isBot: boolean;
  persona?: string;
  alive: boolean;
  ghostVote: boolean;
  /** Révélé uniquement en fin de partie. */
  revealedRole?: RoleId | null;
  revealedAlignment?: Alignment | null;
}

export interface PlayerView {
  role: 'player';
  gameId: string;
  version: number;
  phase: Phase;
  day: number;
  settings: GameSettings;
  seats: PublicSeat[];
  me: {
    seatId: string;
    name: string;
    /** Rôle tel que le joueur le connaît (l'Ivrogne voit son faux rôle). */
    role: RoleId | null;
    team: Team | null;
    alignment: Alignment | null;
    alive: boolean;
    ghostVote: boolean;
    messages: PrivateMessage[];
    awaiting: NightChoiceRequest | null;
    canNominate: boolean;
    canBeNominatedIds: string[];
    canSlay: boolean;
  };
  dayState: GameState['dayState'];
  publicLog: PublicEvent[];
  chat: ChatMessage[];
  voteHistory: GameState['voteHistory'];
  winner: Alignment | null;
  winReason: string | null;
}

export interface StorytellerView {
  role: 'storyteller';
  gameId: string;
  version: number;
  state: GameState;
}

export type AnyView = PlayerView | StorytellerView;
