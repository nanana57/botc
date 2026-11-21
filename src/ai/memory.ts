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

export class BotMemory {
  readonly seatId: string;
  private seenChat = new Set<string>();
  private seenEvents = new Set<string>();
  /** Dernière revendication publique de chaque joueur. */
  claims: Record<string, PublicClaim> = {};
  /** Nombre de changements de rôle revendiqué (indice de mensonge). */
  roleSwitches: Record<string, number> = {};
  accusations: Array<{ from: string; to: string; day: number }> = [];
  trusts: Array<{ from: string; to: string; day: number }> = [];
  /** Questions qui me sont adressées et pas encore traitées. */
  questions: Array<{ from: string; about: string; ts: number }> = [];
  nightDeaths: string[] = [];
  executions: string[] = [];
  slayerMisses: Array<{ shooter: string; target: string }> = [];
  nominations: Array<{ nominator: string; nominee: string; day: number }> = [];
  /** Dernière fois que quelqu'un (n'importe qui) a interrogé tel joueur. */
  askedAt: Record<string, number> = {};
  /** Nombre de défenses prononcées par jour. */
  defenses: Record<number, number> = {};
  /** Intentions déjà exprimées (évite de se répéter). */
  said = new Set<string>();
  lastSpoke = 0;
  spokeCount = 0;
  plan: EvilPlan = { bluff: null, fakeInfo: [], fakeByDay: {} };
  /** Mon dernier passage en revue des messages (pour réagir aux nouveautés). */
  lastChatTs = 0;
  version = 0;

  constructor(seatId: string) { this.seatId = seatId; }

  ingest(view: PlayerView) {
    let changed = false;
    for (const m of view.chat) {
      if (this.seenChat.has(m.id)) continue;
      this.seenChat.add(m.id);
      changed = true;
      if (m.channel !== 'public' || m.fromId === 'storyteller') continue;
      const day = view.day;
      if (m.claim) this.applyClaim(m.fromId, m.claim, day);
      if (m.claim?.question) this.askedAt[m.claim.question] = m.ts;
      if (m.fromId !== this.seatId && m.claim?.question === this.seatId) this.questions.push({ from: m.fromId, about: 'role', ts: m.ts });
      if (m.fromId !== this.seatId && m.claim?.accuse === this.seatId && !this.questions.some(q => q.from === m.fromId)) this.questions.push({ from: m.fromId, about: 'accused', ts: m.ts });
    }
    for (const e of view.publicLog) {
      if (this.seenEvents.has(e.id)) continue;
      this.seenEvents.add(e.id);
      changed = true;
      const ps = e.players || [];
      if (e.kind === 'death' && ps[0]) this.nightDeaths.push(ps[0]);
      if ((e.kind === 'execution' || e.kind === 'virgin') && ps[0]) this.executions.push(ps[0]);
      if (e.kind === 'slayer' && ps.length === 2 && /rien ne se passe/.test(e.text)) this.slayerMisses.push({ shooter: ps[0], target: ps[1] });
      if (e.kind === 'nomination' && ps.length === 2) {
        this.nominations.push({ nominator: ps[0], nominee: ps[1], day: view.day });
        this.accusations.push({ from: ps[0], to: ps[1], day: view.day });
        if (ps[1] === this.seatId) this.questions.push({ from: ps[0], about: 'accused', ts: Date.now() });
      }
    }
    if (changed) this.version++;
  }

  private applyClaim(from: string, c: SpeechClaim, day: number) {
    if (c.role) {
      const prev = this.claims[from];
      if (prev && prev.role !== c.role) this.roleSwitches[from] = (this.roleSwitches[from] || 0) + 1;
      this.claims[from] = { seatId: from, role: c.role, day, info: prev && prev.role === c.role ? [...prev.info] : [] };
    }
    if (c.info) {
      const cl = this.claims[from];
      if (cl && !cl.info.some(i => JSON.stringify(i) === JSON.stringify(c.info))) cl.info.push(c.info);
    }
    if (c.accuse) this.accusations.push({ from, to: c.accuse, day });
    if (c.trust) this.trusts.push({ from, to: c.trust, day });
  }

  /** Pression publique sur un joueur (accusations récentes). */
  pressureOn(seatId: string, day: number): number {
    return this.accusations.filter(a => a.to === seatId && a.day >= day - 1).length;
  }
}
