/**
 * Mémoire individuelle d'un joueur IA.
 * Elle n'est alimentée QUE par la vue du joueur (PlayerView) : messages publics, événements
 * publics, ses propres messages privés. Elle n'a aucun accès à l'état complet de la partie.
 */
import type { RoleId } from '../shared/roles';
import type { InfoPayload, PlayerView, SpeechClaim } from '../shared/types';

export interface PublicClaim { seatId: string; role: RoleId; day: number; info: InfoPayload[] }

export interface EvilPlan {
  bluff: RoleId | null;
  fakeInfo: InfoPayload[];
  /** Fausse info déjà inventée pour tel jour (clé = jour). */
  fakeByDay: Record<number, InfoPayload>;
}

/** Message public tel que le bot l'a entendu. */
export interface Heard {
  id: string;
  from: string;
  ts: number;
  day: number;
  text: string;
  claim?: SpeechClaim;
  intent?: string;
  to?: string;
  replyTo?: string;
}

export class BotMemory {
  readonly seatId: string;
  private seenChat = new Set<string>();
  private seenEvents = new Set<string>();
  /** Dernière revendication publique de chaque joueur. */
  claims: Record<string, PublicClaim> = {};
  /** Nombre de changements de rôle revendiqué (indice de mensonge). */
  roleSwitches: Record<string, number> = {};
  accusations: Array<{ from: string; to: string; day: number; reasoned: boolean }> = [];
  trusts: Array<{ from: string; to: string; day: number }> = [];
  /** Questions qui me sont adressées et pas encore traitées. */
  questions: Array<{ from: string; about: string; ts: number; msgId?: string }> = [];
  nightDeaths: string[] = [];
  executions: string[] = [];
  slayerMisses: Array<{ shooter: string; target: string }> = [];
  nominations: Array<{ nominator: string; nominee: string; day: number }> = [];
  /** Fil des messages publics récents (pour répondre de façon contextuelle). */
  heard: Heard[] = [];
  /** Messages auxquels j'ai déjà réagi. */
  handled = new Set<string>();
  /** Dernière fois que quelqu'un (n'importe qui) a interrogé tel joueur. */
  askedAt: Record<string, number> = {};
  /** Nombre de défenses prononcées par jour. */
  defenses: Record<number, number> = {};
  /** Joueurs que j'ai publiquement accusés (et quand), pour pouvoir me rétracter. */
  myAccusations: Record<string, { day: number; level: number }> = {};
  /** Joueurs que j'ai publiquement soutenus. */
  myTrusts: Record<string, number> = {};
  /** Joueurs dont la défense m'a convaincu (jour). */
  persuaded: Record<string, number> = {};
  /** Intentions déjà exprimées (évite de se répéter). */
  said = new Set<string>();
  lastSpoke = 0;
  spokeCount = 0;
  spokeToday: Record<number, number> = {};
  plan: EvilPlan = { bluff: null, fakeInfo: [], fakeByDay: {} };
  /** Change quand une donnée utile au raisonnement change (revendications, morts, nominations…). */
  version = 0;
  /** Nombre de messages entendus (n'invalide pas le raisonnement). */
  chatSeen = 0;

  constructor(seatId: string) { this.seatId = seatId; }

  ingest(view: PlayerView, now = Date.now()) {
    for (const m of view.chat) {
      if (this.seenChat.has(m.id)) continue;
      this.seenChat.add(m.id);
      this.chatSeen++;
      if (m.channel !== 'public' || m.fromId === 'storyteller') continue;
      const day = Number(m.at.slice(1)) || view.day;
      this.heard.push({ id: m.id, from: m.fromId, ts: m.ts, day, text: m.text, claim: m.claim, intent: m.intent, to: m.to, replyTo: m.replyTo });
      if (this.heard.length > 120) this.heard.shift();
      if (m.claim && this.applyClaim(m.fromId, m.claim, day)) this.version++;
      if (m.claim?.question) this.askedAt[m.claim.question] = m.ts;
      if (m.fromId === this.seatId) { this.handled.add(m.id); continue; }
      if (m.claim?.question === this.seatId && !this.questions.some(q => q.msgId === m.id)) this.questions.push({ from: m.fromId, about: 'role', ts: m.ts, msgId: m.id });
      if (m.claim?.accuse === this.seatId && !this.questions.some(q => q.from === m.fromId && q.about === 'accused')) this.questions.push({ from: m.fromId, about: 'accused', ts: m.ts, msgId: m.id });
    }
    for (const e of view.publicLog) {
      if (this.seenEvents.has(e.id)) continue;
      this.seenEvents.add(e.id);
      const ps = e.players || [];
      if (['death', 'execution', 'virgin', 'slayer', 'win'].includes(e.kind)) this.version++;
      if (e.kind === 'death' && ps[0]) this.nightDeaths.push(ps[0]);
      if ((e.kind === 'execution' || e.kind === 'virgin') && ps[0]) this.executions.push(ps[0]);
      if (e.kind === 'slayer' && ps.length === 2 && /rien ne se passe/.test(e.text)) this.slayerMisses.push({ shooter: ps[0], target: ps[1] });
      if (e.kind === 'nomination' && ps.length === 2) {
        this.nominations.push({ nominator: ps[0], nominee: ps[1], day: view.day });
        this.accusations.push({ from: ps[0], to: ps[1], day: view.day, reasoned: true });
        if (ps[1] === this.seatId) this.questions.push({ from: ps[0], about: 'accused', ts: now });
      }
    }
  }

  /** Renvoie true si la revendication change ce qui compte pour le raisonnement (rôle, info). */
  private applyClaim(from: string, c: SpeechClaim, day: number): boolean {
    let changed = false;
    if (c.role && this.claims[from]?.role !== c.role) changed = true;
    if (c.role) {
      const prev = this.claims[from];
      if (prev && prev.role !== c.role) this.roleSwitches[from] = (this.roleSwitches[from] || 0) + 1;
      this.claims[from] = { seatId: from, role: c.role, day, info: prev && prev.role === c.role ? [...prev.info] : [] };
    }
    if (c.info) {
      const cl = this.claims[from];
      if (cl && !cl.info.some(i => JSON.stringify(i) === JSON.stringify(c.info))) { cl.info.push(c.info); changed = true; }
    }
    if (c.accuse) this.accusations.push({ from, to: c.accuse, day, reasoned: !!c.because });
    if (c.trust) this.trusts.push({ from, to: c.trust, day });
    if (from === this.seatId) {
      if (c.accuse) this.myAccusations[c.accuse] = { day, level: 1 };
      if (c.trust) this.myTrusts[c.trust] = day;
    }
    return changed;
  }

  /** Pression publique sur un joueur (accusations récentes). */
  pressureOn(seatId: string, day: number): number {
    return this.accusations.filter(a => a.to === seatId && a.day >= day - 1).length;
  }

  /** Qui a accusé tel joueur aujourd'hui (pour chercher des alliés de vote). */
  accusersOf(seatId: string, day: number): string[] {
    return [...new Set(this.accusations.filter(a => a.to === seatId && a.day === day).map(a => a.from))];
  }

  /** Messages récents d'autres joueurs, pas encore traités. */
  fresh(now: number, maxAgeMs = 70000): Heard[] {
    return this.heard.filter(h => !this.handled.has(h.id) && h.from !== this.seatId && now - h.ts < maxAgeMs);
  }
}
