/**
 * Moteur de règles déterministe — Trouble Brewing.
 *
 * Principes :
 *  - Le moteur est la seule autorité : toute action (humaine, bot ou Conteur) passe par une
 *    fonction qui la VALIDE avant de modifier l'état. Un modèle de langage n'appelle jamais
 *    directement l'état : il propose, le moteur dispose.
 *  - Le hasard passe par un générateur à graine stocké dans l'état (parties rejouables).
 *  - Les choix laissés au Conteur (quelle info donner à un joueur empoisonné, qui hérite du
 *    Démon…) sont énumérés par le moteur : le Conteur (humain ou automatique) choisit parmi des
 *    options valides uniquement.
 */
import {
  ROLES, DISTRIBUTION, MIN_PLAYERS, MAX_PLAYERS, SCRIPTS, TEAM_LABEL, alignmentOfTeam,
  type RoleId, type Alignment,
} from '../shared/roles';
import type {
  GameState, GameSettings, Seat, PrivateMessage, InfoPayload, PublicEvent, StDecision,
  ChatMessage, NightChoiceRequest, VoteRecord, SpeechClaim,
} from '../shared/types';
import { chance, pick, randInt, shuffle } from './rng';

export class RuleError extends Error {
  constructor(message: string) { super(message); this.name = 'RuleError'; }
}

const fail = (msg: string): never => { throw new RuleError(msg); };

let idCounter = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}${(idCounter++).toString(36)}`;

// ---------------------------------------------------------------------------
// Création et lobby
// ---------------------------------------------------------------------------

export const createGame = (id: string, settings: Partial<GameSettings> = {}): GameState => ({
  id,
  version: 0,
  settings: {
    scriptId: 'tb', storyteller: 'auto', dayDuration: 300, nightChoiceTimeout: 60, ...settings,
  },
  rng: (settings.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0,
  phase: 'lobby',
  day: 0,
  seats: [],
  bluffs: [],
  status: {
    poisoned: null, protected: null, redHerring: null, butlerMaster: null, slayerUsedBy: [], virginUsed: false,
    executedToday: null, executedYesterday: null, killedTonight: [], demonChanges: [],
  },
  night: { queue: [], cursor: 0, awaiting: null, awaitingSince: 0, log: [] },
  dayState: { nominators: [], nominees: [], nomination: null, block: null, endsAt: null, executionDone: false },
  pendingDecision: null,
  resumeContext: null,
  privateLog: {},
  publicLog: [],
  chat: [],
  grimoireLog: [],
  voteHistory: [],
  winner: null,
  winReason: null,
  createdAt: Date.now(),
});

export const addSeat = (s: GameState, seat: { id: string; name: string; isBot: boolean; persona?: string }): Seat => {
  if (s.phase !== 'lobby') fail('La partie a déjà commencé.');
  if (s.seats.length >= MAX_PLAYERS) fail(`Le village est complet (${MAX_PLAYERS} joueurs).`);
  const name = seat.name.trim().slice(0, 24);
  if (!name) fail('Un nom est nécessaire.');
  if (s.seats.some(x => x.name.toLowerCase() === name.toLowerCase())) fail('Ce nom est déjà pris.');
  const full: Seat = { ...seat, name, role: null, believedRole: null, alignment: null, alive: true, ghostVote: true };
  s.seats.push(full);
  s.privateLog[full.id] = [];
  return full;
};

export const removeSeat = (s: GameState, seatId: string) => {
  if (s.phase !== 'lobby') fail('Impossible de retirer un joueur en cours de partie.');
  s.seats = s.seats.filter(x => x.id !== seatId);
  delete s.privateLog[seatId];
};

export const moveSeat = (s: GameState, seatId: string, toIndex: number) => {
  if (s.phase !== 'lobby') fail('Les places sont figées une fois la partie lancée.');
  const i = s.seats.findIndex(x => x.id === seatId);
  if (i < 0) fail('Joueur introuvable.');
  const [seat] = s.seats.splice(i, 1);
  s.seats.splice(Math.max(0, Math.min(s.seats.length, toIndex)), 0, seat);
};

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

export const tag = (s: GameState) => (s.phase === 'lobby' && s.seats.some(x => x.role) ? 'N1' : s.phase === 'night' ? `N${s.day}` : s.phase === 'day' ? `J${s.day}` : s.phase === 'ended' ? 'Fin' : 'Lobby');
export const seatById = (s: GameState, id: string | null | undefined) => s.seats.find(x => x.id === id);
const mustSeat = (s: GameState, id: string) => seatById(s, id) ?? fail('Joueur introuvable.');
const nameOf = (s: GameState, id: string | null | undefined) => seatById(s, id)?.name ?? '?';
export const alive = (s: GameState) => s.seats.filter(x => x.alive);
export const teamOf = (seat: Seat) => (seat.role ? ROLES[seat.role].team : null);
export const isEvil = (seat: Seat) => seat.alignment === 'evil';

export const isPoisoned = (s: GameState, id: string) =>
  s.status.poisoned === id && s.seats.some(x => x.role === 'poisoner' && x.alive);
/** Capacité inopérante : Ivrogne ou empoisonné. */
export const isImpaired = (s: GameState, seat: Seat) => seat.role === 'drunk' || isPoisoned(s, seat.id);
/** La capacité « réelle » fonctionne-t-elle pour ce rôle ? */
const works = (s: GameState, seat: Seat, role: RoleId) => seat.role === role && !isImpaired(s, seat);

const grim = (s: GameState, text: string) => { s.grimoireLog.push({ at: tag(s), text }); };
const pub = (s: GameState, kind: PublicEvent['kind'], text: string, players?: string[]) => {
  s.publicLog.push({ id: uid('ev'), at: tag(s), kind, text, players });
};
const tell = (s: GameState, seatId: string, text: string, info?: InfoPayload, source?: RoleId) => {
  const m: PrivateMessage = { id: uid('pm'), at: tag(s), text, info, source };
  (s.privateLog[seatId] ||= []).push(m);
  grim(s, `→ ${nameOf(s, seatId)} : ${text}`);
};

/** Voisins vivants les plus proches (sens horaire puis anti-horaire). */
export const aliveNeighbours = (s: GameState, seatId: string): string[] => {
  const n = s.seats.length;
  const i = s.seats.findIndex(x => x.id === seatId);
  const out: string[] = [];
  for (const dir of [-1, 1]) {
    for (let k = 1; k < n; k++) {
      const seat = s.seats[(i + dir * k + n * k) % n];
      if (seat.id === seatId) break;
      if (seat.alive) { if (!out.includes(seat.id)) out.push(seat.id); break; }
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// Mise en place
// ---------------------------------------------------------------------------

export interface ForcedSetup { roles?: RoleId[]; drunkAs?: RoleId; redHerring?: string; bluffs?: RoleId[] }

/** Lance la partie. `forced` sert aux tests et au Conteur humain qui compose sa table. */
export const startGame = (s: GameState, forced: ForcedSetup = {}) => {
  if (s.phase !== 'lobby') fail('La partie a déjà commencé.');
  const n = s.seats.length;
  if (n < MIN_PLAYERS) fail(`Il faut au moins ${MIN_PLAYERS} joueurs.`);
  const script = SCRIPTS.find(x => x.id === s.settings.scriptId);
  if (!script || !script.supported) fail("Ce script n'est pas encore pris en charge par le moteur.");
  const [tf, os, mn, dm] = DISTRIBUTION[Math.min(n, MAX_PLAYERS)];
  const of = (team: string) => script!.roles.filter(r => ROLES[r].team === team);
  const demons = shuffle(s, of('demon')).slice(0, dm);
  const minions = shuffle(s, of('minion')).slice(0, mn);
  const baron = minions.includes('baron') ? 2 : 0;
  const outsiders = shuffle(s, of('outsider')).slice(0, os + baron);
  const townsfolk = shuffle(s, of('townsfolk')).slice(0, tf - baron);
  const bag = forced.roles ? [...forced.roles] : shuffle(s, [...townsfolk, ...outsiders, ...minions, ...demons]);
  if (bag.length !== n) fail('Composition invalide.');
  if (forced.roles) validateComposition(bag, n);
  s.seats.forEach((seat, i) => {
    seat.role = bag[i];
    seat.believedRole = bag[i];
    seat.alignment = alignmentOfTeam(ROLES[bag[i]].team);
    seat.alive = true;
    seat.ghostVote = true;
  });
  const inPlay = new Set(bag);
  const notInPlayGood = script!.roles.filter(r => !inPlay.has(r) && ROLES[r].team === 'townsfolk');
  // L'Ivrogne croit être un Villageois absent de la partie
  const drunk = s.seats.find(x => x.role === 'drunk');
  if (drunk) drunk.believedRole = forced.drunkAs ?? pick(s, notInPlayGood);
  // Bluffs du Démon : trois rôles bons absents (sans le faux rôle de l'Ivrogne)
  const bluffPool = script!.roles.filter(r => !inPlay.has(r) && alignmentOfTeam(ROLES[r].team) === 'good' && r !== drunk?.believedRole && r !== 'drunk');
  s.bluffs = forced.bluffs ?? shuffle(s, bluffPool).slice(0, 3);
  // Leurre de la Voyante : un joueur bon (si une Voyante — vraie ou crue — est en jeu)
  if (s.seats.some(x => x.believedRole === 'fortuneteller')) s.status.redHerring = forced.redHerring ?? pick(s, s.seats.filter(x => x.alignment === 'good')).id;
  grim(s, `Mise en place (${n} joueurs) : ${s.seats.map(x => `${x.name}=${ROLES[x.role!].name}${x.role !== x.believedRole ? ` (croit ${ROLES[x.believedRole!].name})` : ''}`).join(', ')}`);
  grim(s, `Bluffs du Démon : ${s.bluffs.map(r => ROLES[r].name).join(', ')}${s.status.redHerring ? ` · Leurre de la Voyante : ${nameOf(s, s.status.redHerring)}` : ''}`);
  s.seats.forEach(seat => {
    const r = ROLES[seat.believedRole!];
    tell(s, seat.id, `Tu es ${r.name} (${TEAM_LABEL[r.team]}). ${r.ability}`, { kind: 'role-change', role: seat.believedRole! });
  });
  beginNight(s);
};

/** Vérifie qu'une composition respecte la répartition (Baron compris). */
export const validateComposition = (roles: RoleId[], n: number) => {
  const d = DISTRIBUTION[Math.min(n, MAX_PLAYERS)];
  if (!d) fail('Nombre de joueurs invalide.');
  if (new Set(roles).size !== roles.length) fail("Un rôle ne peut apparaître qu'une fois.");
  const cnt = (t: string) => roles.filter(r => ROLES[r].team === t).length;
  const baron = roles.includes('baron') ? 2 : 0;
  const ok = cnt('townsfolk') === d[0] - baron && cnt('outsider') === d[1] + baron && cnt('minion') === d[2] && cnt('demon') === d[3];
  if (!ok) fail(`Répartition attendue : ${d[0] - baron} Villageois, ${d[1] + baron} Étrangers, ${d[2]} Sbire(s), ${d[3]} Démon.`);
};

// ---------------------------------------------------------------------------
// Nuit
// ---------------------------------------------------------------------------

const beginNight = (s: GameState) => {
  s.phase = 'night';
  s.day += 1;
  const first = s.day === 1;
  s.status.protected = null;
  s.status.killedTonight = [];
  s.status.executedYesterday = s.status.executedToday;
  s.status.executedToday = null;
  s.dayState = { nominators: [], nominees: [], nomination: null, block: null, endsAt: null, executionDone: false };
  const queue: GameState['night']['queue'] = [];
  if (first && s.seats.length >= 7) {
    s.seats.filter(x => teamOf(x) === 'minion').forEach(x => queue.push({ seatId: x.id, role: x.role!, special: 'minion-info' }));
    s.seats.filter(x => teamOf(x) === 'demon').forEach(x => queue.push({ seatId: x.id, role: x.role!, special: 'demon-info' }));
  }
  const key = first ? 'firstNight' : 'otherNight';
  s.seats
    .filter(x => x.believedRole && ROLES[x.believedRole][key] > 0)
    .sort((a, b) => ROLES[a.believedRole!][key] - ROLES[b.believedRole!][key])
    .forEach(x => queue.push({ seatId: x.id, role: x.believedRole! }));
  s.night = { queue, cursor: 0, awaiting: null, awaitingSince: 0, log: [] };
  s.resumeContext = null;
  pub(s, 'phase', first ? 'La première nuit tombe sur le village.' : `La nuit ${s.day} tombe. Le village s'endort.`);
  grim(s, `— Nuit ${s.day} —`);
  advance(s);
};

/** Données de l'étape courante (choix du joueur, décision du Conteur). */
interface StepData { choice?: string[]; decision?: unknown; decisionKind?: string }
const stepData = (s: GameState): StepData => ((s.resumeContext as StepData) ||= {});

/** Un joueur doit-il réellement se réveiller à cette étape ? */
const stepApplies = (s: GameState, seat: Seat, role: RoleId): boolean => {
  if (role === 'ravenkeeper') return s.status.killedTonight.includes(seat.id);
  if (!seat.alive) return false;
  if (role === 'undertaker') return !!s.status.executedYesterday;
  if (role === 'imp' && s.day === 1) return false;
  return true;
};

/**
 * Fait progresser la nuit jusqu'à ce qu'une entrée soit nécessaire (choix d'un joueur, décision
 * du Conteur humain) ou jusqu'à l'aube.
 */
export const advance = (s: GameState) => {
  let guard = 0;
  while (s.phase === 'night' && !s.night.awaiting && !s.pendingDecision && guard++ < 200) {
    const step = s.night.queue[s.night.cursor];
    if (!step) { dawn(s); return; }
    const seat = mustSeat(s, step.seatId);
    if (step.special) { runSpecial(s, seat, step.special); nextStep(s); continue; }
    // L'acteur a pu changer de rôle pendant la nuit (Diablotin transmis)
    if (seat.believedRole !== step.role || !stepApplies(s, seat, step.role)) { nextStep(s); continue; }
    const def = ROLES[step.role];
    const data = stepData(s);
    if ((def.nightKind === 'choose' || def.nightKind === 'chooseInfo') && !data.choice) {
      s.night.awaiting = {
        seatId: seat.id, role: step.role, count: def.targets ?? 1, allowSelf: !!def.allowSelf, aliveOnly: !!def.aliveOnly,
        prompt: choicePrompt(step.role),
      };
      s.night.awaitingSince = Date.now();
      return;
    }
    const done = resolveStep(s, seat, step.role, data);
    if (!done) return; // décision du Conteur en attente
    nextStep(s);
  }
};

const nextStep = (s: GameState) => { s.night.cursor += 1; s.resumeContext = null; };

const choicePrompt = (role: RoleId): string => ({
  poisoner: 'Choisis le joueur à empoisonner cette nuit.',
  monk: 'Choisis un joueur (pas toi) à protéger du Démon cette nuit.',
  imp: 'Choisis ta victime. Te désigner toi-même transmet ta nature à un Sbire.',
  fortuneteller: "Désigne deux joueurs : l'un d'eux est-il le Démon ?",
  ravenkeeper: 'Tu as été tué cette nuit. Désigne un joueur pour apprendre son rôle.',
  butler: 'Désigne ton Maître pour demain (pas toi).',
} as Record<string, string>)[role] ?? 'Fais ton choix.';

const runSpecial = (s: GameState, seat: Seat, kind: 'minion-info' | 'demon-info') => {
  const demon = s.seats.find(x => teamOf(x) === 'demon');
  const minions = s.seats.filter(x => teamOf(x) === 'minion');
  if (kind === 'minion-info') {
    const others = minions.filter(x => x.id !== seat.id).map(x => x.name);
    tell(s, seat.id, `Le Démon est ${demon?.name ?? 'inconnu'}.${others.length ? ` Tes complices Sbires : ${others.join(', ')}.` : ''}`,
      { kind: 'evil-team', demon: demon?.id ?? null, minions: minions.filter(x => x.id !== seat.id).map(x => x.id) });
  } else {
    tell(s, seat.id, `Tes Sbires : ${minions.map(x => x.name).join(', ') || 'aucun'}. Rôles absents que tu peux revendiquer : ${s.bluffs.map(r => ROLES[r].name).join(', ')}.`,
      { kind: 'demon-intro', minions: minions.map(x => x.id), bluffs: [...s.bluffs] });
  }
};

/** Valide et enregistre le choix nocturne d'un joueur. */
export const submitNightChoice = (s: GameState, seatId: string, targets: string[]) => {
  const a = s.night.awaiting;
  if (s.phase !== 'night' || !a) fail("Aucun choix n'est attendu.");
  if (a!.seatId !== seatId) fail("Ce n'est pas ton tour.");
  const uniq = [...new Set(targets)];
  if (uniq.length !== a!.count) fail(`Il faut désigner ${a!.count} joueur${a!.count > 1 ? 's' : ''} différent${a!.count > 1 ? 's' : ''}.`);
  for (const t of uniq) {
    const seat = seatById(s, t) ?? fail('Cible inconnue.');
    if (!a!.allowSelf && t === seatId) fail('Tu ne peux pas te désigner toi-même.');
    if (a!.aliveOnly && !seat.alive) fail('Ce joueur est mort.');
  }
  s.night.awaiting = null;
  stepData(s).choice = uniq;
  s.night.log.push(`${nameOf(s, seatId)} (${ROLES[a!.role].name}) → ${uniq.map(t => nameOf(s, t)).join(', ')}`);
  advance(s);
};

/** Choix aléatoire valide (joueur absent / délai dépassé). */
export const autoNightChoice = (s: GameState): string[] => {
  const a = s.night.awaiting;
  if (!a) return [];
  const pool = s.seats.filter(x => (a.allowSelf || x.id !== a.seatId) && (!a.aliveOnly || x.alive) && !(a.role === 'imp' && x.id === a.seatId));
  return shuffle(s, pool).slice(0, a.count).map(x => x.id);
};

/**
 * Demande au Conteur de choisir parmi des options valides. En mode automatique, la proposition
 * de la politique est appliquée immédiatement. En mode humain, la partie se met en pause.
 */
const decide = <T>(s: GameState, d: Omit<StDecision, 'id'> & { options: Array<{ label: string; value: T }> }): T | undefined => {
  const data = stepData(s);
  if (data.decision !== undefined && data.decisionKind === d.kind) return data.decision as T;
  if (d.options.length === 1 || s.settings.storyteller === 'auto') return d.options[d.proposal].value;
  s.pendingDecision = { ...d, id: uid('dec') };
  return undefined;
};

/** Le Conteur humain valide une option. */
export const stResolveDecision = (s: GameState, decisionId: string, optionIndex: number) => {
  const d = s.pendingDecision;
  if (!d || d.id !== decisionId) fail('Décision expirée.');
  const opt = d!.options[optionIndex] ?? fail('Option invalide.');
  const data = stepData(s);
  data.decision = opt!.value;
  data.decisionKind = d!.kind;
  s.pendingDecision = null;
  advance(s);
};

// ---- Registres (Espion / Reclus) : comment un joueur « apparaît » pour une capacité ----

type RegQuery = 'evil' | 'demon' | 'minion' | 'outsider' | 'townsfolk';
/** Options d'apparence possibles d'un joueur pour une question donnée. */
const canRegisterAs = (seat: Seat, q: RegQuery): boolean[] => {
  const team = teamOf(seat);
  const truth = q === 'evil' ? seat.alignment === 'evil' : team === q;
  if (seat.role === 'recluse' && (q === 'evil' || q === 'demon' || q === 'minion')) return [false, true];
  if (seat.role === 'spy' && (q === 'evil' || q === 'minion')) return [true, false];
  if (seat.role === 'spy' && (q === 'townsfolk' || q === 'outsider')) return [false, true];
  return [truth];
};

const roleLabel = (r: RoleId | null) => (r ? ROLES[r].name : '—');

/** Résout l'effet d'une étape. Renvoie false si une décision du Conteur est attendue. */
const resolveStep = (s: GameState, seat: Seat, role: RoleId, data: StepData): boolean => {
  const impaired = isImpaired(s, seat) || seat.role !== role;
  const script = SCRIPTS.find(x => x.id === s.settings.scriptId)!;
  const others = s.seats.filter(x => x.id !== seat.id);
  // Une fausse info ne doit jamais souffler à l'Ivrogne qu'il est l'Ivrogne
  const scriptOf = (team: string) => script.roles.filter(r => ROLES[r].team === team && !(seat.role === 'drunk' && r === 'drunk'));

  const deliver = (opts: Array<{ label: string; value: InfoPayload }>, proposal: number, title: string, render: (p: InfoPayload) => string) => {
    const v = decide<InfoPayload>(s, { kind: 'info', seatId: seat.id, role, title, options: opts, proposal });
    if (v === undefined) return false;
    tell(s, seat.id, render(v), v, role);
    return true;
  };

  switch (role) {
    case 'poisoner': {
      const t = data.choice![0];
      if (works(s, seat, 'poisoner')) s.status.poisoned = t; // l'ancien poison prend fin
      grim(s, `${seat.name} empoisonne ${nameOf(s, t)}${impaired ? ' (sans effet)' : ''}`);
      return true;
    }
    case 'monk': {
      const t = data.choice![0];
      if (works(s, seat, 'monk')) s.status.protected = t;
      grim(s, `${seat.name} protège ${nameOf(s, t)}${impaired ? ' (sans effet)' : ''}`);
      return true;
    }
    case 'butler': {
      const t = data.choice![0];
      s.status.butlerMaster = t;
      tell(s, seat.id, `Ton Maître pour demain : ${nameOf(s, t)}.`, { kind: 'text' }, role);
      return true;
    }
    case 'imp': return resolveImp(s, seat, data);
    case 'spy': {
      tell(s, seat.id, 'Tu consultes le Grimoire.', {
        kind: 'grimoire',
        seats: s.seats.map(x => ({ id: x.id, role: x.role, alive: x.alive, isPoisoned: isPoisoned(s, x.id), isDrunk: x.role === 'drunk' })),
      }, role);
      return true;
    }
    case 'washerwoman': case 'librarian': case 'investigator': {
      const team = role === 'washerwoman' ? 'townsfolk' : role === 'librarian' ? 'outsider' : 'minion';
      const opts: Array<{ label: string; value: InfoPayload }> = [];
      if (!impaired) {
        for (const t of others) {
          if (!canRegisterAs(t, team).includes(true)) continue;
          const roles: RoleId[] = teamOf(t) === team ? [t.role!] : scriptOf(team).filter(r => r !== 'drunk' || team === 'outsider');
          for (const r of roles.slice(0, 2)) {
            const decoys = shuffle(s, others.filter(x => x.id !== t.id)).slice(0, 2);
            for (const d of decoys) opts.push({ label: '', value: { kind: 'pair-role', players: shuffle(s, [t.id, d.id]) as [string, string], role: r } });
          }
        }
        if (!opts.length || (team === 'outsider' && !others.some(t => teamOf(t) === 'outsider'))) {
          if (team === 'outsider' && !s.seats.some(x => teamOf(x) === 'outsider')) opts.unshift({ label: '', value: { kind: 'pair-role', players: ['', ''], role: null, none: true } });
        }
      } else {
        for (let k = 0; k < 6; k++) {
          const pair = shuffle(s, others).slice(0, 2).map(x => x.id) as [string, string];
          opts.push({ label: '', value: { kind: 'pair-role', players: pair, role: pick(s, scriptOf(team)) } });
        }
        if (team === 'outsider') opts.push({ label: '', value: { kind: 'pair-role', players: ['', ''], role: null, none: true } });
      }
      const realIdx = opts.map((o, i) => {
        const v = o.value as Extract<InfoPayload, { kind: 'pair-role' }>;
        return v.none || v.players.some(p => seatById(s, p)?.role === v.role) ? i : -1;
      }).filter(i => i >= 0);
      const noneIdx = opts.findIndex(o => (o.value as { none?: boolean }).none);
      const real = noneIdx >= 0 && !impaired ? noneIdx : realIdx.length ? realIdx[randInt(s, realIdx.length)] : 0;
      const render = (p: InfoPayload) => {
        const v = p as Extract<InfoPayload, { kind: 'pair-role' }>;
        return v.none ? "Il n'y a aucun Étranger en jeu." : `L'un de ces deux joueurs est ${roleLabel(v.role)} : ${nameOf(s, v.players[0])} ou ${nameOf(s, v.players[1])}.`;
      };
      opts.forEach(o => { o.label = render(o.value); });
      return deliver(opts, impaired ? randInt(s, opts.length) : Math.max(0, real), `Information pour ${ROLES[role].name}`, render);
    }
    case 'chef': {
      const values = new Set<number>();
      const regs = s.seats.map(x => canRegisterAs(x, 'evil'));
      const combos = regs.reduce<boolean[][]>((acc, r) => acc.flatMap(c => r.map(v => [...c, v])), [[]]);
      const count = (ev: boolean[]) => ev.reduce((n, e, i) => n + (e && ev[(i + 1) % ev.length] ? 1 : 0), 0);
      combos.forEach(c => values.add(count(c)));
      const truth = count(s.seats.map(x => x.alignment === 'evil'));
      const evils = s.seats.filter(x => x.alignment === 'evil').length;
      const pool = impaired ? Array.from({ length: evils + 1 }, (_, i) => i) : [...values].sort();
      const opts = pool.map(v => ({ label: `${v} paire(s)`, value: { kind: 'number', value: v } as InfoPayload }));
      const prop = impaired ? Math.max(0, pool.findIndex(v => v !== truth)) : Math.max(0, pool.indexOf(truth));
      return deliver(opts, prop, 'Information pour Chef', p => `Nombre de paires de joueurs maléfiques assis côte à côte : ${(p as { value: number }).value}.`);
    }
    case 'empath': {
      const nb = aliveNeighbours(s, seat.id).map(id => mustSeat(s, id));
      const values = new Set<number>();
      const regs = nb.map(x => canRegisterAs(x, 'evil'));
      const combos = regs.reduce<boolean[][]>((acc, r) => acc.flatMap(c => r.map(v => [...c, v])), [[]]);
      combos.forEach(c => values.add(c.filter(Boolean).length));
      const truth = nb.filter(x => x.alignment === 'evil').length;
      const pool = impaired ? Array.from({ length: nb.length + 1 }, (_, i) => i) : [...values].sort();
      const opts = pool.map(v => ({ label: `${v}`, value: { kind: 'number', value: v, players: nb.map(x => x.id) } as InfoPayload }));
      const prop = impaired ? Math.max(0, pool.findIndex(v => v !== truth)) : Math.max(0, pool.indexOf(truth));
      return deliver(opts, prop, 'Information pour Empathe', p => `Parmi tes voisins vivants (${nb.map(x => x.name).join(' et ')}), ${(p as { value: number }).value} ${(p as { value: number }).value > 1 ? 'sont maléfiques' : 'est maléfique'}.`);
    }
    case 'fortuneteller': {
      const pair = data.choice!;
      const ps = pair.map(id => mustSeat(s, id));
      const truthful = ps.some(x => teamOf(x) === 'demon' || x.id === s.status.redHerring);
      const possible = new Set<boolean>([truthful]);
      if (ps.some(x => x.role === 'recluse')) possible.add(true);
      const pool = impaired ? [true, false] : [...possible];
      const opts = pool.map(v => ({ label: v ? 'Oui' : 'Non', value: { kind: 'yesno', value: v, players: pair } as InfoPayload }));
      const prop = impaired ? pool.indexOf(!truthful) : pool.indexOf(truthful);
      return deliver(opts, Math.max(0, prop), 'Information pour Voyante',
        p => `${ps.map(x => x.name).join(' et ')} : ${(p as { value: boolean }).value ? "oui, l'un d'eux est le Démon." : "non, aucun n'est le Démon."}`);
    }
    case 'undertaker': case 'ravenkeeper': {
      const targetId = role === 'undertaker' ? s.status.executedYesterday! : data.choice![0];
      const t = mustSeat(s, targetId);
      let pool: RoleId[] = [t.role!];
      if (t.role === 'spy') pool = [...pool, ...shuffle(s, script.roles.filter(r => alignmentOfTeam(ROLES[r].team) === 'good')).slice(0, 4)];
      if (t.role === 'recluse') pool = [...pool, ...script.roles.filter(r => ['minion', 'demon'].includes(ROLES[r].team))];
      if (impaired) pool = shuffle(s, script.roles.filter(r => r !== t.role && !(seat.role === 'drunk' && r === 'drunk'))).slice(0, 5);
      const opts = pool.map(r => ({ label: ROLES[r].name, value: { kind: 'role-of', player: t.id, role: r } as InfoPayload }));
      return deliver(opts, 0, `Information pour ${ROLES[role].name}`,
        p => `${role === 'undertaker' ? 'Le joueur exécuté, ' : ''}${t.name}${role === 'undertaker' ? ',' : ''} est ${roleLabel((p as { role: RoleId }).role)}.`);
    }
    default:
      return true;
  }
};

const resolveImp = (s: GameState, imp: Seat, data: StepData): boolean => {
  const targetId = data.choice![0];
  const target = mustSeat(s, targetId);
  if (isImpaired(s, imp) || imp.role !== 'imp') { grim(s, `${imp.name} vise ${target.name} (sans effet : capacité inopérante)`); return true; }
  if (!target.alive) { grim(s, `${imp.name} vise ${target.name}, déjà mort.`); return true; }
  // Transmission : le Diablotin se tue lui-même, un Sbire vivant hérite (la Femme écarlate en priorité)
  if (target.id === imp.id) {
    const heirs = s.seats.filter(x => x.alive && teamOf(x) === 'minion');
    if (!heirs.length) { kill(s, imp, 'night'); grim(s, `${imp.name} se tue sans héritier.`); return true; }
    const sw = heirs.findIndex(x => x.role === 'scarletwoman');
    const heirId = decide<string>(s, {
      kind: 'starpass', seatId: imp.id, role: 'imp', title: 'Quel Sbire devient le Diablotin ?',
      options: heirs.map(h => ({ label: h.name, value: h.id })), proposal: sw >= 0 ? sw : randInt(s, heirs.length),
    });
    if (heirId === undefined) return false;
    kill(s, imp, 'night', true);
    becomeDemon(s, mustSeat(s, heirId), "Le Diablotin s'est sacrifié : tu es désormais le Diablotin.");
    grim(s, `${imp.name} se sacrifie : ${nameOf(s, heirId)} devient le Diablotin.`);
    return true;
  }
  if (s.status.protected === target.id) { grim(s, `${imp.name} vise ${target.name}, protégé par le Moine.`); return true; }
  if (works(s, target, 'soldier')) { grim(s, `${imp.name} vise ${target.name}, Soldat : rien ne se passe.`); return true; }
  let victim = target;
  if (works(s, target, 'mayor')) {
    const pool = s.seats.filter(x => x.alive && x.id !== imp.id);
    const v = decide<string>(s, {
      kind: 'mayor-bounce', seatId: target.id, role: 'mayor', title: 'Le Démon vise le Maire : qui meurt ?',
      options: pool.map(x => ({ label: x.id === target.id ? `${x.name} (le Maire)` : x.name, value: x.id })),
      proposal: chance(s, 0.5) ? pool.findIndex(x => x.id === target.id) : randInt(s, pool.length),
    });
    if (v === undefined) return false;
    victim = mustSeat(s, v);
    if (victim.id !== target.id) grim(s, `La mort du Maire est déviée vers ${victim.name}.`);
    if (works(s, victim, 'soldier') || s.status.protected === victim.id) { grim(s, `${victim.name} survit.`); return true; }
  }
  kill(s, victim, 'night');
  grim(s, `${imp.name} tue ${victim.name}.`);
  return true;
};

const becomeDemon = (s: GameState, seat: Seat, text: string) => {
  seat.role = 'imp';
  seat.believedRole = 'imp';
  seat.alignment = 'evil';
  s.status.demonChanges.push(seat.id);
  tell(s, seat.id, text, { kind: 'role-change', role: 'imp' });
};

/** Mort d'un joueur + effets déclenchés (Femme écarlate). */
const kill = (s: GameState, seat: Seat, how: 'night' | 'execution' | 'slayer', starpass = false) => {
  if (!seat.alive) return;
  const aliveBefore = alive(s).length;
  seat.alive = false;
  if (how === 'night') s.status.killedTonight.push(seat.id);
  if (teamOf(seat) === 'demon' && !starpass) {
    const sw = s.seats.find(x => x.alive && works(s, x, 'scarletwoman'));
    if (sw && aliveBefore >= 5) {
      becomeDemon(s, sw, 'Le Démon est mort : tu es désormais le Diablotin.');
      grim(s, `${sw.name} (Femme écarlate) devient le Diablotin.`);
    }
  }
};

const dawn = (s: GameState) => {
  s.night.awaiting = null;
  s.phase = 'day';
  const dead = s.status.killedTonight.map(id => mustSeat(s, id));
  pub(s, 'phase', `Le jour ${s.day} se lève.`);
  if (dead.length) dead.forEach(d => pub(s, 'death', `${d.name} a été retrouvé mort cette nuit.`, [d.id]));
  else if (s.day > 1) pub(s, 'death', "Personne n'est mort cette nuit.");
  grim(s, `— Jour ${s.day} —`);
  s.dayState.endsAt = s.settings.storyteller === 'auto' ? Date.now() + s.settings.dayDuration * 1000 : null;
  checkWin(s);
};

// ---------------------------------------------------------------------------
// Victoire
// ---------------------------------------------------------------------------

const endGame = (s: GameState, winner: Alignment, reason: string) => {
  if (s.winner) return;
  s.winner = winner;
  s.winReason = reason;
  s.phase = 'ended';
  s.night.awaiting = null;
  s.pendingDecision = null;
  pub(s, 'win', `${winner === 'good' ? 'Le Bien' : 'Le Mal'} l'emporte : ${reason}`);
  grim(s, `Fin de partie : victoire du ${winner === 'good' ? 'Bien' : 'Mal'} (${reason}).`);
};

export const checkWin = (s: GameState): Alignment | null => {
  if (s.winner) return s.winner;
  const demonAlive = s.seats.some(x => x.alive && teamOf(x) === 'demon');
  if (!demonAlive) { endGame(s, 'good', 'le Démon est mort.'); return 'good'; }
  if (alive(s).length <= 2) { endGame(s, 'evil', 'il ne reste que deux joueurs en vie.'); return 'evil'; }
  return null;
};

// ---------------------------------------------------------------------------
// Jour : nominations, votes, exécutions, Pourfendeur
// ---------------------------------------------------------------------------

const mustDay = (s: GameState) => { if (s.phase !== 'day') fail("Ce n'est possible que de jour."); };

export const canNominate = (s: GameState, seatId: string) => {
  const seat = seatById(s, seatId);
  return s.phase === 'day' && !!seat && seat.alive && !s.dayState.executionDone
    && !s.dayState.nominators.includes(seatId) && (!s.dayState.nomination || s.dayState.nomination.stage === 'closed');
};

export const nominate = (s: GameState, nominatorId: string, nomineeId: string) => {
  mustDay(s);
  const nominator = mustSeat(s, nominatorId);
  const nominee = mustSeat(s, nomineeId);
  if (s.dayState.executionDone) fail("Une exécution a déjà eu lieu aujourd'hui.");
  if (s.dayState.nomination && s.dayState.nomination.stage !== 'closed') fail('Une nomination est déjà en cours.');
  if (!nominator.alive) fail('Les morts ne peuvent pas nommer.');
  if (s.dayState.nominators.includes(nominatorId)) fail("Tu as déjà nommé quelqu'un aujourd'hui.");
  if (s.dayState.nominees.includes(nomineeId)) fail(`${nominee.name} a déjà été nommé aujourd'hui.`);
  s.dayState.nominators.push(nominatorId);
  s.dayState.nominees.push(nomineeId);
  pub(s, 'nomination', `${nominator.name} nomme ${nominee.name}.`, [nominatorId, nomineeId]);
  // Vierge
  if (nominee.role === 'virgin' && nominee.alive && !s.status.virginUsed) {
    s.status.virginUsed = true;
    const registersTownsfolk = canRegisterAs(nominator, 'townsfolk');
    const tf = registersTownsfolk.length > 1 ? chance(s, 0.5) : registersTownsfolk[0];
    if (!isImpaired(s, nominee) && tf) {
      pub(s, 'virgin', `${nominator.name} est exécuté sur-le-champ.`, [nominatorId]);
      grim(s, `Vierge : ${nominator.name} est exécuté.`);
      executeSeat(s, nominator);
      return;
    }
  }
  const n = s.seats.length;
  const start = s.seats.findIndex(x => x.id === nomineeId);
  const order = Array.from({ length: n }, (_, k) => s.seats[(start + 1 + k) % n].id);
  s.dayState.nomination = { nominatorId, nomineeId, stage: 'defense', order, cursor: 0, hands: {}, votes: [] };
};

export const openVoting = (s: GameState) => {
  mustDay(s);
  const nm = s.dayState.nomination;
  if (!nm || nm.stage !== 'defense') fail("Aucune nomination en attente de vote.");
  nm!.stage = 'voting';
};

export const canVote = (s: GameState, seat: Seat) => seat.alive || seat.ghostVote;

/** Lever / baisser la main avant que l'aiguille n'atteigne le votant. */
export const setHand = (s: GameState, voterId: string, yes: boolean) => {
  mustDay(s);
  const nm = s.dayState.nomination;
  if (!nm || nm.stage === 'closed') fail('Aucun vote en cours.');
  const seat = mustSeat(s, voterId);
  const idx = nm!.order.indexOf(voterId);
  if (idx < nm!.cursor) fail('Ton vote est déjà verrouillé.');
  if (yes && !canVote(s, seat)) fail("Tu as déjà utilisé ton vote de fantôme.");
  nm!.hands[voterId] = yes;
};

/** L'aiguille avance d'un cran : verrouille le vote du joueur suivant. Renvoie true si le vote est terminé. */
export const lockNextVote = (s: GameState): boolean => {
  mustDay(s);
  const nm = s.dayState.nomination;
  if (!nm || nm.stage !== 'voting') fail("Le vote n'est pas ouvert.");
  const voterId = nm!.order[nm!.cursor];
  const seat = mustSeat(s, voterId);
  const yes = !!nm!.hands[voterId] && canVote(s, seat);
  const ghost = yes && !seat.alive;
  if (ghost) seat.ghostVote = false;
  nm!.votes.push({ voterId, yes, ghost, counted: yes });
  nm!.cursor += 1;
  if (nm!.cursor >= nm!.order.length) { closeVote(s); return true; }
  return false;
};

const closeVote = (s: GameState) => {
  const nm = s.dayState.nomination!;
  // Majordome : son vote ne compte que si son Maître a aussi voté
  const butler = s.seats.find(x => x.role === 'butler');
  if (butler && !isImpaired(s, butler) && s.status.butlerMaster) {
    const master = nm.votes.find(v => v.voterId === s.status.butlerMaster);
    const bv = nm.votes.find(v => v.voterId === butler.id);
    if (bv && bv.yes && !(master && master.yes)) { bv.counted = false; grim(s, `Le vote du Majordome ${butler.name} ne compte pas (son Maître n'a pas voté).`); }
  }
  const total = nm.votes.filter(v => v.counted).length;
  const required = Math.ceil(alive(s).length / 2);
  nm.total = total;
  nm.required = required;
  nm.stage = 'closed';
  const nominee = mustSeat(s, nm.nomineeId);
  s.voteHistory.push({ at: tag(s), nominatorId: nm.nominatorId, nomineeId: nm.nomineeId, votes: nm.votes, total, required });
  const block = s.dayState.block;
  let text: string;
  if (total >= required && (!block || total > block.votes)) {
    s.dayState.block = { playerId: nominee.id, votes: total };
    text = `${nominee.name} reçoit ${total} voix (seuil ${required}) et monte sur le billot.`;
  } else if (total >= required && block && total === block.votes) {
    s.dayState.block = null;
    text = `${nominee.name} reçoit ${total} voix : égalité, personne n'est sur le billot.`;
  } else {
    text = `${nominee.name} reçoit ${total} voix (seuil ${required}${block ? `, à battre : ${block.votes}` : ''}) : rien ne change.`;
  }
  pub(s, 'vote-result', text, [nominee.id]);
};

const executeSeat = (s: GameState, seat: Seat) => {
  s.dayState.executionDone = true;
  s.status.executedToday = seat.id;
  if (s.dayState.nomination) s.dayState.nomination.stage = 'closed';
  const wasAlive = seat.alive;
  kill(s, seat, 'execution');
  pub(s, 'execution', `${seat.name} est exécuté${wasAlive ? '' : ' (déjà mort)'}.`, [seat.id]);
  if (works(s, seat, 'saint')) { endGame(s, 'evil', 'la Sainte a été exécutée.'); return; }
  checkWin(s);
};

/** Fin du jour : exécution éventuelle puis tombée de la nuit. */
export const endDay = (s: GameState) => {
  mustDay(s);
  if (s.dayState.nomination && s.dayState.nomination.stage === 'voting') fail('Un vote est en cours.');
  if (!s.dayState.executionDone) {
    const block = s.dayState.block;
    if (block) executeSeat(s, mustSeat(s, block.playerId));
    else {
      pub(s, 'execution', "Personne n'est exécuté aujourd'hui.");
      const mayor = s.seats.find(x => x.alive && works(s, x, 'mayor'));
      if (mayor && alive(s).length === 3) { endGame(s, 'good', 'trois survivants et aucune exécution, le Maire triomphe.'); return; }
    }
  }
  if (s.phase === 'ended') return;
  beginNight(s);
};

/** Tir public du Pourfendeur (n'importe qui peut l'annoncer ; seul le vrai Pourfendeur en bonne santé a un effet). */
export const slay = (s: GameState, shooterId: string, targetId: string) => {
  mustDay(s);
  const shooter = mustSeat(s, shooterId);
  const target = mustSeat(s, targetId);
  if (!shooter.alive) fail('Les morts ne peuvent pas agir.');
  if (s.status.slayerUsedBy.includes(shooterId)) fail('Tu as déjà tiré.');
  s.status.slayerUsedBy.push(shooterId);
  const realShot = works(s, shooter, 'slayer');
  const reg = canRegisterAs(target, 'demon');
  const hits = realShot && (reg.length > 1 ? chance(s, 0.4) : reg[0]);
  if (hits && target.alive) {
    pub(s, 'slayer', `${shooter.name} vise ${target.name}… qui s'effondre, mort !`, [shooterId, targetId]);
    grim(s, `Pourfendeur : ${target.name} meurt.`);
    kill(s, target, 'slayer');
    checkWin(s);
  } else {
    pub(s, 'slayer', `${shooter.name} vise ${target.name}… rien ne se passe.`, [shooterId, targetId]);
  }
};

// ---------------------------------------------------------------------------
// Messagerie
// ---------------------------------------------------------------------------

export const addChat = (s: GameState, m: Omit<ChatMessage, 'id' | 'ts' | 'at'> & { claim?: SpeechClaim; ts?: number }) => {
  const text = m.text.trim().slice(0, 400);
  if (!text) fail('Message vide.');
  if (m.channel === 'public' && m.fromId !== 'storyteller') {
    const seat = seatById(s, m.fromId);
    if (!seat) fail('Joueur inconnu.');
    if (s.phase === 'night') fail('La nuit, le village se tait. Tu peux écrire au Conteur.');
  }
  const msg: ChatMessage = { ...m, text, id: uid('msg'), ts: m.ts ?? Date.now(), at: tag(s) };
  s.chat.push(msg);
  if (s.chat.length > 800) s.chat.splice(0, s.chat.length - 800);
  return msg;
};

// ---------------------------------------------------------------------------
// Conteur humain : outils de contrôle
// ---------------------------------------------------------------------------

export const stSetAlive = (s: GameState, seatId: string, isAlive: boolean) => {
  const seat = mustSeat(s, seatId);
  seat.alive = isAlive;
  grim(s, `Le Conteur ${isAlive ? 'ressuscite' : 'retire'} ${seat.name}.`);
  if (!isAlive) checkWin(s);
};

export const stSkipAwaiting = (s: GameState) => {
  if (!s.night.awaiting) fail("Aucun choix n'est attendu.");
  submitNightChoice(s, s.night.awaiting!.seatId, autoNightChoice(s));
};

export { DISTRIBUTION };
export type { NightChoiceRequest, VoteRecord };
