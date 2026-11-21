/**
 * Cerveau d'un joueur IA : décisions stratégiques.
 *
 * Entrées : uniquement la vue du joueur (PlayerView) + sa mémoire + sa personnalité.
 * Sorties : des PROPOSITIONS d'action (parler, nommer, voter, choisir une cible la nuit, tirer)
 * que le serveur soumet ensuite au moteur de règles, qui les valide ou les refuse.
 */
import { ROLES, SCRIPTS, type RoleId } from '../shared/roles';
import type { InfoPayload, PlayerView } from '../shared/types';
import { BotMemory } from './memory';
import { personaById, type Persona } from './personalities';
import { reason, type Beliefs } from './reasoner';
import { intentKey, type Intent } from './speech';

export interface Proposal { kind: 'say' | 'nominate' | 'slay'; intent: Intent; urgency: number; target?: string }

const INFO_ROLES: RoleId[] = ['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller', 'undertaker', 'ravenkeeper'];

export class BotBrain {
  readonly seatId: string;
  readonly persona: Persona;
  readonly mem: BotMemory;
  private rng: number;
  private cache: { key: string; b: Beliefs; pub: Beliefs } | null = null;
  /** Dernier jour pour lequel le bot a réagi aux morts de la nuit. */
  private reactedDay = 0;

  constructor(seatId: string, personaId: string | undefined, seed = 1) {
    this.seatId = seatId;
    this.persona = personaById(personaId);
    this.mem = new BotMemory(seatId);
    this.rng = (seed ^ hash(seatId)) >>> 0;
  }

  private rand() { this.rng = (Math.imul(this.rng ^ (this.rng >>> 15), 2246822519) + 0x9e3779b9) >>> 0; return this.rng / 4294967296; }

  observe(view: PlayerView, now = Date.now()) { this.mem.ingest(view, now); }

  beliefs(view: PlayerView): { b: Beliefs; pub: Beliefs } {
    const key = `${this.mem.version}:${view.me.messages.length}:${view.seats.map(x => (x.alive ? 1 : 0)).join('')}:${view.phase === 'ended'}`;
    if (this.cache?.key === key) return this.cache;
    const t = this.persona.traits;
    const b = reason({ view, mem: this.mem, traits: t });
    const pub = view.me.alignment === 'evil' ? reason({ view, mem: this.mem, traits: t, publicOnly: true }) : b;
    this.cache = { key, b, pub };
    return this.cache;
  }

  /** Suspicion subjective : modèle logique + pression du groupe + intuition, selon la personnalité. */
  suspicion(view: PlayerView): Record<string, number> {
    const { b } = this.beliefs(view);
    const t = this.persona.traits;
    const out: Record<string, number> = {};
    for (const s of view.seats) {
      if (s.id === this.seatId) { out[s.id] = 0; continue; }
      const crowd = Math.min(1, this.mem.pressureOn(s.id, view.day) / 3);
      const unclaimed = !this.mem.claims[s.id] && view.day >= 2 ? 0.06 : 0;
      const persuaded = this.mem.persuaded[s.id] === view.day ? 0.14 : 0;
      const gut = (hash(this.seatId + s.id + view.day) % 100) / 100 - 0.5;
      const wModel = 0.55 + 0.4 * t.analytic;
      const wCrowd = 0.35 * t.follow;
      out[s.id] = Math.max(0, Math.min(1, (wModel * b.pEvil[s.id] + wCrowd * crowd) / (wModel + wCrowd) + unclaimed - persuaded + gut * 0.12 * (1 - t.analytic)));
    }
    return out;
  }

  private evilTeam(view: PlayerView): Set<string> {
    const info = view.me.messages.find(m => m.info?.kind === 'evil-team' || m.info?.kind === 'demon-intro')?.info;
    const team = new Set<string>([this.seatId]);
    if (info?.kind === 'evil-team') { if (info.demon) team.add(info.demon); info.minions.forEach(x => team.add(x)); }
    if (info?.kind === 'demon-intro') info.minions.forEach(x => team.add(x));
    return team;
  }

  private knownRoles(view: PlayerView): Record<string, RoleId | null> | null {
    const g = [...view.me.messages].reverse().find(m => m.info?.kind === 'grimoire')?.info;
    if (g?.kind !== 'grimoire') return null;
    return Object.fromEntries(g.seats.map(x => [x.id, x.role]));
  }

  // -------------------------------------------------------------------------
  // Bluff (camp du Mal)
  // -------------------------------------------------------------------------

  ensurePlan(view: PlayerView) {
    if (view.me.alignment !== 'evil' || this.mem.plan.bluff) return;
    const t = this.persona.traits;
    const script = SCRIPTS.find(s => s.id === view.settings.scriptId)!;
    const claimed = new Set(Object.values(this.mem.claims).filter(c => c.seatId !== this.seatId).map(c => c.role));
    const intro = view.me.messages.find(m => m.info?.kind === 'demon-intro')?.info;
    const known = this.knownRoles(view);
    let pool: RoleId[] = intro?.kind === 'demon-intro' ? intro.bluffs : script.roles.filter(r => ROLES[r].team === 'townsfolk');
    if (known) pool = pool.filter(r => !Object.values(known).includes(r));
    pool = pool.filter(r => !claimed.has(r) && ROLES[r].team !== 'minion' && ROLES[r].team !== 'demon' && r !== 'saint' && r !== 'drunk');
    if (!pool.length) pool = script.roles.filter(r => ROLES[r].team === 'townsfolk' && !claimed.has(r));
    // Les menteurs talentueux choisissent un rôle d'information (plus crédible, plus d'influence),
    // les prudents un rôle sans information (moins vérifiable).
    const score = (r: RoleId) => (INFO_ROLES.includes(r) ? t.deception : 1 - t.deception) + (r === 'virgin' || r === 'slayer' ? -0.4 * t.caution : 0) + this.rand() * 0.35;
    this.mem.plan.bluff = [...pool].sort((a, b) => score(b) - score(a))[0] ?? 'soldier';
  }

  /** Fausse information cohérente avec le bluff, pensée pour aider le Mal. */
  private fakeInfo(view: PlayerView, role: RoleId): InfoPayload | undefined {
    if (this.mem.plan.fakeByDay[view.day]) return this.mem.plan.fakeByDay[view.day];
    if (!INFO_ROLES.includes(role)) return undefined;
    const team = this.evilTeam(view);
    const known = this.knownRoles(view);
    const { pub } = this.beliefs(view);
    const others = view.seats.filter(s => s.id !== this.seatId);
    const good = others.filter(s => !team.has(s.id));
    const scapegoats = [...good].sort((a, b) => pub.pEvil[b.id] - pub.pEvil[a.id]);
    const goat = scapegoats[0] ?? others[0];
    const pickOther = (ex: string[]) => others.filter(s => !ex.includes(s.id))[Math.floor(this.rand() * Math.max(1, others.length - ex.length))] ?? others[0];
    const t = this.persona.traits;
    let info: InfoPayload | undefined;
    const firstOnly = ['washerwoman', 'librarian', 'investigator', 'chef'].includes(role);
    if (firstOnly && this.mem.plan.fakeInfo.length) return this.mem.plan.fakeInfo[0];
    switch (role) {
      case 'investigator': {
        const minion = SCRIPTS[0].roles.filter(r => ROLES[r].team === 'minion')[Math.floor(this.rand() * 4)];
        info = { kind: 'pair-role', players: [goat.id, pickOther([goat.id, this.seatId]).id], role: minion };
        break;
      }
      case 'washerwoman': case 'librarian': {
        // Confirmer un vrai bon joueur qui a déjà revendiqué : on gagne sa confiance
        const ally = good.find(s => this.mem.claims[s.id] && ROLES[this.mem.claims[s.id].role].team === (role === 'washerwoman' ? 'townsfolk' : 'outsider'));
        const truth = known ? good.find(s => known[s.id] && ROLES[known[s.id]!].team === (role === 'washerwoman' ? 'townsfolk' : 'outsider')) : undefined;
        const target = truth ?? ally;
        const r: RoleId | null = truth ? known![truth.id] : ally ? this.mem.claims[ally.id].role : null;
        if (target && r) info = { kind: 'pair-role', players: [target.id, pickOther([target.id]).id], role: r };
        else if (role === 'librarian') info = { kind: 'pair-role', players: ['', ''], role: null, none: true };
        else info = { kind: 'pair-role', players: [goat.id, pickOther([goat.id]).id], role: 'chef' };
        break;
      }
      case 'chef': info = { kind: 'number', value: t.deception > 0.6 ? 0 : 1 }; break;
      case 'empath': {
        const idx = view.seats.findIndex(s => s.id === this.seatId);
        const n = view.seats.length;
        const nb: string[] = [];
        for (const dir of [-1, 1]) for (let k = 1; k < n; k++) { const s = view.seats[(idx + dir * k + n * k) % n]; if (s.alive && s.id !== this.seatId) { nb.push(s.id); break; } }
        const goodNb = nb.filter(x => !team.has(x));
        info = { kind: 'number', value: Math.min(1, goodNb.length) && t.aggression > 0.4 ? 1 : 0, players: nb };
        break;
      }
      case 'fortuneteller': {
        const yes = t.aggression > 0.6 && this.rand() < 0.5;
        info = yes ? { kind: 'yesno', value: true, players: [goat.id, pickOther([goat.id, this.seatId]).id] }
          : { kind: 'yesno', value: false, players: [[...team].find(x => x !== this.seatId) ?? goat.id, pickOther([this.seatId]).id] };
        break;
      }
      case 'undertaker': {
        const ex = this.mem.executions[this.mem.executions.length - 1];
        if (!ex || view.day < 2) return undefined;
        const theirClaim = this.mem.claims[ex]?.role;
        info = { kind: 'role-of', player: ex, role: team.has(ex) ? (theirClaim ?? 'soldier') : (theirClaim ?? 'poisoner') };
        break;
      }
      default: return undefined;
    }
    if (info) { this.mem.plan.fakeByDay[view.day] = info; this.mem.plan.fakeInfo.push(info); }
    return info;
  }

  /** Rôle et info que je présente publiquement. */
  publicIdentity(view: PlayerView): { role: RoleId; info?: InfoPayload } | null {
    if (view.me.alignment === 'evil') {
      // Si quelqu'un a revendiqué mon bluff avant que je ne l'annonce, j'en change
      const takenByOther = Object.values(this.mem.claims).some(c => c.seatId !== this.seatId && c.role === this.mem.plan.bluff);
      if (this.mem.plan.bluff && takenByOther && !this.mem.claims[this.seatId]) this.mem.plan = { bluff: null, fakeInfo: [], fakeByDay: {} };
      this.ensurePlan(view);
      const role = this.mem.plan.bluff!;
      return { role, info: this.fakeInfo(view, role) };
    }
    const role = view.me.role;
    if (!role) return null;
    const infos = view.me.messages.filter(m => m.source === role && m.info && !['text', 'role-change'].includes(m.info.kind));
    return { role, info: infos[infos.length - 1]?.info };
  }

  // -------------------------------------------------------------------------
  // Nuit
  // -------------------------------------------------------------------------

  nightChoice(view: PlayerView): string[] {
    const a = view.me.awaiting;
    if (!a) return [];
    const t = this.persona.traits;
    const susp = this.suspicion(view);
    const team = this.evilTeam(view);
    const name = (id: string) => view.seats.find(s => s.id === id)?.name ?? '?';
    const valid = view.seats.filter(s => (a.allowSelf || s.id !== this.seatId) && (!a.aliveOnly || s.alive));
    const claimedInfo = (s: { id: string }) => (this.mem.claims[s.id] && INFO_ROLES.includes(this.mem.claims[s.id].role) ? 1 : 0);
    const byScore = (f: (id: string) => number) => [...valid].sort((x, y) => f(y.id) - f(x.id));
    const jitter = (id: string) => (hash(id + view.day + this.seatId) % 100) / 400;
    const pct = (x: number) => `${Math.round(x * 100)} %`;
    switch (a.role) {
      case 'poisoner': {
        const x = byScore(id => (team.has(id) ? -5 : 0) + claimedInfo({ id }) * (0.6 + t.analytic * 0.4) + jitter(id))[0].id;
        this.rationale = this.mem.claims[x] ? `${name(x)} revendique ${ROLES[this.mem.claims[x].role].name} : son information doit être faussée.` : `Personne n'a encore révélé d'information : ${name(x)}, au jugé.`;
        return [x];
      }
      case 'imp': {
        const { pub } = this.beliefs(view);
        // Apprendre de ses échecs : une victime qui a survécu est sans doute Soldat ou protégée
        if (this.lastKill && this.lastKill.day === view.day - 1 && view.seats.find(x => x.id === this.lastKill!.target)?.alive) {
          this.failedKills[this.lastKill.target] = (this.failedKills[this.lastKill.target] || 0) + 1;
        }
        const minionsAlive = [...team].filter(x => x !== this.seatId && view.seats.find(s => s.id === x)?.alive);
        if (pub.pDemon[this.seatId] > 0.6 && minionsAlive.length && t.risk > 0.55 && view.day >= 3) {
          this.rationale = `Le village me soupçonne (${pct(pub.pDemon[this.seatId])}) : je transmets mon rôle à un Sbire.`;
          return [this.seatId];
        }
        const pool = valid.filter(s => !team.has(s.id) && s.id !== this.seatId);
        const claimedSoldier = (id: string) => this.mem.claims[id]?.role === 'soldier';
        const accuser = (id: string) => this.mem.accusations.filter(x => x.from === id && team.has(x.to)).length;
        const score = (id: string) => claimedInfo({ id }) * (0.5 + t.analytic) + accuser(id) * (0.3 + t.aggression) * 0.5
          - (claimedSoldier(id) ? 0.8 * t.caution + 0.2 : 0) - pub.pEvil[id] * 0.8 + jitter(id) * 2;
        const x = [...pool].sort((p, q) => score(q.id) - score(p.id) - 2.5 * ((this.failedKills[q.id] || 0) - (this.failedKills[p.id] || 0)))[0]?.id ?? valid[0].id;
        this.lastKill = { target: x, day: view.day };
        this.rationale = (this.failedKills[x] ? `(malgré un échec précédent) ` : '') + (accuser(x) ? `${name(x)} accuse mes alliés : il doit disparaître.` : this.mem.claims[x] ? `${name(x)} (${ROLES[this.mem.claims[x].role].name}) est trop crédible.` : `${name(x)} paraît bon et on l'écoute.`);
        return [x];
      }
      case 'monk': {
        const x = byScore(id => (1 - susp[id]) * (1 + 0.5 * claimedInfo({ id })) + jitter(id))[0].id;
        this.rationale = `Je protège ${name(x)}, qui me paraît fiable (suspicion ${pct(susp[x])}).`;
        return [x];
      }
      case 'butler': {
        const x = byScore(id => (1 - susp[id]) + jitter(id))[0].id;
        this.rationale = `${name(x)} sera mon Maître : c'est le joueur en qui j'ai le plus confiance.`;
        return [x];
      }
      case 'fortuneteller': {
        const { b } = this.beliefs(view);
        const pool = view.seats.filter(s => s.id !== this.seatId);
        const ranked = [...pool].sort((x, y) => b.pDemon[y.id] + jitter(y.id) - (b.pDemon[x.id] + jitter(x.id)));
        if (view.day === 1 && t.analytic > 0.8 && this.rand() < 0.3) {
          this.rationale = `Je me teste avec ${name(ranked[0].id)} pour repérer mon leurre.`;
          return [this.seatId, ranked[0].id];
        }
        this.rationale = `Je teste ${name(ranked[0].id)} et ${name(ranked[1].id)} (Démon probable : ${pct(b.pDemon[ranked[0].id])} et ${pct(b.pDemon[ranked[1].id])}).`;
        return [ranked[0].id, ranked[1].id];
      }
      case 'ravenkeeper': {
        const { b } = this.beliefs(view);
        const x = byScore(id => (id === this.seatId ? -5 : 0) + (0.5 - Math.abs(b.pEvil[id] - 0.5)) + b.pDemon[id] + jitter(id))[0].id;
        this.rationale = `Je veux en avoir le cœur net sur ${name(x)}.`;
        return [x];
      }
      default:
        this.rationale = '';
        return valid.slice(0, a.count).map(s => s.id);
    }
  }

  /** Dernière justification interne (traces, jamais publiée). */
  rationale = '';
  /** Démon : victimes visées qui ont survécu (Soldat, Moine…). */
  private failedKills: Record<string, number> = {};
  private lastKill: { target: string; day: number } | null = null;

  // -------------------------------------------------------------------------
  // Votes
  // -------------------------------------------------------------------------

  /** `blind` : avis personnel, avant de voir les mains des autres. */
  decideVote(view: PlayerView, blind = false): boolean {
    const nm = view.dayState.nomination;
    if (!nm) return false;
    const me = view.seats.find(s => s.id === this.seatId)!;
    if (!me.alive && !me.ghostVote) { this.rationale = 'Mort, sans vote fantôme.'; return false; }
    if (nm.nomineeId === this.seatId) { this.rationale = 'On ne vote pas contre soi.'; return false; }
    const t = this.persona.traits;
    const aliveN = view.seats.filter(s => s.alive).length;
    const required = Math.ceil(aliveN / 2);
    const myIdx = nm.order.indexOf(this.seatId);
    const yesSoFar = blind ? 0 : nm.votes.filter(v => v.yes).length + nm.order.slice(nm.cursor, Math.max(nm.cursor, myIdx)).filter(id => nm.hands[id]).length;
    const block = view.dayState.block;
    const ghost = !me.alive;
    const pct = (x: number) => `${Math.round(x * 100)} %`;
    if (view.me.alignment === 'evil') {
      const team = this.evilTeam(view);
      const { pub } = this.beliefs(view);
      if (team.has(nm.nomineeId)) {
        const bus = !ghost && yesSoFar >= required && t.opportunism > 0.6 && this.rand() < 0.6;
        this.rationale = bus ? 'Mon allié est perdu : je vote avec la majorité pour paraître du Bien.' : 'Je protège mon allié.';
        return bus;
      }
      if (block && team.has(block.playerId)) { this.rationale = 'Faire descendre mon allié du billot.'; return !ghost || yesSoFar + 1 >= Math.max(required, block.votes + 1); }
      if (ghost) { this.rationale = 'Vote fantôme réservé à un moment décisif.'; return yesSoFar + 1 >= required && aliveN <= 5; }
      const yes = pub.pEvil[nm.nomineeId] >= 0.25 - 0.15 * t.aggression || yesSoFar >= required - 2;
      this.rationale = yes ? `Un joueur du Bien sur le billot (soupçon public ${pct(pub.pEvil[nm.nomineeId])}) : tant mieux.` : 'Voter seul contre un innocent me ferait remarquer.';
      return yes;
    }
    const s = this.suspicion(view);
    let thr = 0.42 + 0.18 * t.caution - 0.14 * t.aggression - (aliveN <= 5 ? 0.06 : 0);
    if (block && block.playerId !== nm.nomineeId && (s[block.playerId] ?? 0) >= s[nm.nomineeId]) {
      this.rationale = 'Je préfère le joueur déjà sur le billot.';
      return false;
    }
    if (t.follow > 0.6 && yesSoFar >= required - 1) thr -= 0.12;
    // Hésitation de départ chez les prudents ; pression sociale proportionnelle au suivisme ensuite
    if (blind) thr += 0.08 * t.caution;
    else thr -= 0.18 * t.follow * Math.min(1, yesSoFar / required);
    // Prudence : la majorité est déjà acquise et je ne suis pas sûr de moi
    if (!blind && t.caution > 0.6 && yesSoFar >= required + 1 && s[nm.nomineeId] < thr + 0.12) {
      this.rationale = `La majorité est acquise (${yesSoFar} voix) et je ne suis pas sûr (${pct(s[nm.nomineeId])}) : je m'abstiens.`;
      return false;
    }
    if (t.opportunism > 0.7 && yesSoFar >= required - 1) thr -= 0.08;
    if (ghost) thr = aliveN <= 4 ? Math.max(thr, 0.5) : Math.max(thr, 0.68);
    const yes = s[nm.nomineeId] >= thr;
    this.rationale = `Suspicion ${pct(s[nm.nomineeId])}, seuil ${pct(thr)}${yesSoFar ? `, ${yesSoFar} main(s) déjà levée(s)` : ''}.`;
    return yes;
  }

  // -------------------------------------------------------------------------
  // Jour : que faire maintenant ?
  // -------------------------------------------------------------------------

  think(view: PlayerView, now: number): Proposal | null {
    if (view.phase !== 'day') return null;
    const t = this.persona.traits;
    const me = view.seats.find(s => s.id === this.seatId)!;
    const day = view.day;
    const said = (i: Intent) => this.mem.said.has(intentKey(i, day));
    const props: Proposal[] = [];
    const nm = view.dayState.nomination;
    const id = this.publicIdentity(view);
    const susp = this.suspicion(view);
    const evil = view.me.alignment === 'evil';
    const team = evil ? this.evilTeam(view) : new Set<string>();
    const alreadyClaimed = !!this.mem.claims[this.seatId];
    const { pub, b } = this.beliefs(view);
    const scoreOf = (sid: string) => (evil ? (team.has(sid) ? 0 : pub.pEvil[sid] + (this.mem.claims[sid] && INFO_ROLES.includes(this.mem.claims[sid].role) ? 0.15 * t.deception : 0)) : susp[sid] ?? 0);
    const accuseThr = 0.5 - 0.22 * t.aggression + 0.1 * t.caution;

    // Défense quand je suis nommé
    if (nm && nm.stage === 'defense' && nm.nomineeId === this.seatId && !this.mem.said.has(`defend:${day}:${nm.nominatorId}`)) {
      this.mem.said.add(`defend:${day}:${nm.nominatorId}`);
      this.mem.defenses[day] = (this.mem.defenses[day] || 0) + 1;
      this.mem.questions = this.mem.questions.filter(x => x.from !== nm.nominatorId);
      return { kind: 'say', urgency: 1, intent: { kind: 'defend', accuser: nm.nominatorId, role: id?.role, info: id?.info, to: nm.nominatorId } };
    }
    // Demander du soutien pour ma nomination
    if (nm && nm.stage === 'defense' && nm.nominatorId === this.seatId) {
      const helpers = this.mem.accusersOf(nm.nomineeId, day).filter(x => x !== this.seatId && x !== nm.nomineeId);
      const target = helpers[0] ?? [...view.seats].filter(s => s.alive && s.id !== this.seatId && s.id !== nm.nomineeId && !team.has(s.id)).sort((x, y) => scoreOf(x.id) - scoreOf(y.id))[0]?.id;
      const intent: Intent = { kind: 'ask-support', target: nm.nomineeId, to: target };
      if (target && !said(intent) && t.charisma + t.aggression > 0.8) props.push({ kind: 'say', urgency: 0.95, intent });
    }
    const quietMs = 8000 + (1 - t.talk) * 24000;
    const quiet = now - this.mem.lastSpoke < quietMs;
    // Les morts parlent encore, mais beaucoup moins
    const maxToday = me.alive ? 2 + Math.round(12 * t.talk) : 1 + Math.round(3 * t.talk);
    const tired = (this.mem.spokeToday[day] || 0) >= maxToday;

    // Questions ou accusations qui me visent
    const q = this.mem.questions.shift();
    const defensesToday = this.mem.defenses[day] || 0;
    if (q && q.about === 'accused' && defensesToday >= 2 && alreadyClaimed) { /* déjà défendu : on n'insiste pas */ }
    else if (q && now - q.ts < 90000) {
      if (q.about === 'accused') this.mem.defenses[day] = defensesToday + 1;
      const pressured = q.about === 'accused' || day >= t.claimDay;
      if (id && !alreadyClaimed && (pressured || t.caution < 0.6)) props.push({ kind: 'say', urgency: 0.85, intent: { kind: 'claim', role: id.role, info: id.info, pressured: true, to: q.from, replyTo: q.msgId } });
      else if (q.about === 'accused') props.push({ kind: 'say', urgency: 0.8, intent: { kind: 'defend', accuser: q.from, role: alreadyClaimed ? id?.role : undefined, to: q.from, replyTo: q.msgId } });
      else props.push({ kind: 'say', urgency: 0.6, intent: { kind: 'deflect', to: q.from, replyTo: q.msgId } });
    }
    // Réactions aux messages récents (fil de conversation)
    props.push(...this.reactions(view, now, scoreOf, accuseThr, team));

    // Réaction aux morts de la nuit
    if (this.reactedDay < day && day > 1) {
      this.reactedDay = day;
      const victims = this.mem.nightDeaths.slice(-2);
      if (t.talk > 0.5 && this.rand() < 0.4) props.push({ kind: 'say', urgency: 0.33, intent: { kind: 'death', victims, none: !view.publicLog.some(e => e.kind === 'death' && e.at === `J${day}` && e.players?.length) } });
    }
    // Révéler son rôle (bon : vrai rôle cru ; mal : bluff)
    if (id && !alreadyClaimed && (day >= t.claimDay || view.seats.filter(s => s.alive).length <= 5)) {
      const intent: Intent = { kind: 'claim', role: id.role, info: id.info };
      if (!said(intent)) props.push({ kind: 'say', urgency: 0.5 + 0.25 * t.talk, intent });
    }
    // Nouvelle info depuis ma revendication
    if (id && alreadyClaimed && id.info) {
      const intent: Intent = { kind: 'info', role: id.role, info: id.info };
      const known = this.mem.claims[this.seatId].info.some(i => JSON.stringify(i) === JSON.stringify(id.info));
      if (!known && !said(intent)) props.push({ kind: 'say', urgency: 0.82, intent });
    }
    // Se rétracter : j'ai accusé quelqu'un que je ne soupçonne plus
    for (const [target, acc] of Object.entries(this.mem.myAccusations)) {
      if (acc.level <= 0 || !view.seats.find(s => s.id === target)?.alive) continue;
      const best = view.seats.filter(x => x.alive && x.id !== this.seatId && !team.has(x.id)).sort((x, y) => scoreOf(y.id) - scoreOf(x.id))[0];
      const shifted = best && best.id !== target && scoreOf(best.id) - scoreOf(target) > 0.15 && scoreOf(target) < accuseThr;
      if (scoreOf(target) < accuseThr - 0.15 || shifted) {
        acc.level = 0;
        const intent: Intent = { kind: 'retract', target, instead: shifted ? best.id : undefined, reason: this.mem.claims[target] ? 'son récit tient la route' : undefined };
        if (!said(intent)) props.push({ kind: 'say', urgency: 0.45 + 0.2 * t.analytic, intent });
      }
    }
    // Cible principale
    const candidates = view.seats.filter(s => s.alive && s.id !== this.seatId && !(evil && team.has(s.id)));
    const top = [...candidates].sort((x, y) => scoreOf(y.id) - scoreOf(x.id));
    const target = top[0];
    const timeLeft = view.dayState.endsAt ? (view.dayState.endsAt - now) / 1000 : 120;
    if (target) {
      const sc = scoreOf(target.id);
      const reason = evil ? pub.topReason[target.id] : b.topReason[target.id];
      const allies = this.mem.accusersOf(target.id, day).filter(x => x !== this.seatId && x !== target.id).slice(0, 2);
      const ai: Intent = { kind: 'accuse', target: target.id, reason, strength: sc, allies: t.charisma > 0.5 ? allies : undefined };
      if (sc >= accuseThr && !said(ai)) props.push({ kind: 'say', urgency: 0.3 + 0.35 * t.aggression + (sc - accuseThr), intent: ai });
      // Pression de fin de journée : un jour sans exécution profite au Mal, il faut finir par nommer
      const frac = Math.max(0, Math.min(1, timeLeft / view.settings.dayDuration));
      const noNomYet = view.dayState.nominees.length === 0 && !view.dayState.block;
      const late = (timeLeft < 120 ? 0.12 : 0) + (noNomYet ? Math.max(0, 0.45 - frac) * 0.9 : 0) + (view.seats.filter(x => x.alive).length <= 5 ? 0.08 : 0);
      const nomThr = 0.62 - 0.25 * t.aggression + 0.12 * t.caution - late - (evil ? 0.1 * t.deception : 0);
      const free = !nm || nm.stage === 'closed';
      const canTarget = view.me.canBeNominatedIds.includes(target.id);
      const blockBetter = view.dayState.block && (scoreOf(view.dayState.block.playerId) >= sc || (evil && !team.has(view.dayState.block.playerId)));
      const talkedToday = view.chat.filter(m => m.channel === 'public' && m.at === `J${day}` && m.fromId !== 'storyteller').length;
      const debated = talkedToday >= 8 || timeLeft < view.settings.dayDuration * 0.55;
      if (free && view.me.canNominate && me.alive && canTarget && sc >= nomThr && !blockBetter && debated && (day > 1 || timeLeft < view.settings.dayDuration * 0.6 || t.aggression > 0.8)) {
        props.push({ kind: 'nominate', target: target.id, urgency: 0.55 + 0.3 * t.aggression + (sc - nomThr), intent: { kind: 'nominate', target: target.id, reason } });
      }
      const planVoiced = view.chat.some(m => m.at === `J${day}` && m.intent === 'plan');
      if (t.charisma > 0.7 && top[1] && !planVoiced && !said({ kind: 'plan', targets: [] }) && timeLeft < view.settings.dayDuration * 0.75) {
        props.push({ kind: 'say', urgency: 0.32 + 0.2 * t.charisma, intent: { kind: 'plan', targets: [target.id, top[1].id] } });
      }
    }
    // Faire circuler une hypothèse de complicité
    const pr = evil ? pub.pair : b.pair;
    if (pr && pr.p > 0.22 && t.analytic + t.deception > 1.1 && day >= 2 && !said({ kind: 'hypothesis', pair: ['', ''], p: 0 })
      && !(evil && (team.has(pr.a) || team.has(pr.b)))) {
      props.push({ kind: 'say', urgency: 0.36, intent: { kind: 'hypothesis', pair: [pr.a, pr.b], p: pr.p } });
    }
    // Interroger un silencieux
    const silent = view.seats.find(s => s.alive && s.id !== this.seatId && !this.mem.claims[s.id] && !said({ kind: 'question', target: s.id }) && now - (this.mem.askedAt[s.id] || 0) > 120000);
    if (silent && (t.analytic > 0.6 || t.trust < 0.3)) props.push({ kind: 'say', urgency: 0.28 + 0.15 * (1 - t.trust), intent: { kind: 'question', target: silent.id } });
    // Marquer sa confiance
    const trusted = [...candidates].sort((x, y) => scoreOf(x.id) - scoreOf(y.id))[0];
    if (trusted && t.charisma > 0.5 && !said({ kind: 'trust', target: trusted.id }) && !this.mem.myTrusts[trusted.id] && (evil ? team.size > 1 : susp[trusted.id] < 0.2)) {
      props.push({ kind: 'say', urgency: 0.2 + 0.1 * t.charisma, intent: { kind: 'trust', target: trusted.id } });
    }
    // Pourfendeur
    if (view.me.canSlay && me.alive) {
      const best = [...candidates].sort((x, y) => b.pDemon[y.id] - b.pDemon[x.id])[0];
      if (best && (b.pDemon[best.id] > 0.62 - 0.25 * t.risk || (view.seats.filter(s => s.alive).length <= 4 && b.pDemon[best.id] > 0.3))) {
        props.push({ kind: 'slay', target: best.id, urgency: 0.7, intent: { kind: 'slay', target: best.id } });
      }
    }
    if (!props.length) return null;
    props.sort((x, y) => y.urgency - x.urgency);
    const best = props[0];
    if ((quiet || tired) && best.urgency < 0.8) return null;
    // Silences : la personnalité module la probabilité de prendre la parole maintenant
    if (best.urgency < 0.8 && this.rand() > (0.3 + 0.6 * t.talk) * (me.alive ? 1 : 0.4)) return null;
    return best;
  }

  /** Couche sociale : réagir à ce que les autres viennent de dire. */
  private reactions(view: PlayerView, now: number, scoreOf: (id: string) => number, accuseThr: number, team: Set<string>): Proposal[] {
    const t = this.persona.traits;
    const me = this.seatId;
    const evil = view.me.alignment === 'evil';
    const { b, pub } = this.beliefs(view);
    const myRole = evil ? this.mem.plan.bluff : view.me.role;
    const out: Proposal[] = [];
    const evilRole = (r: RoleId | null | undefined) => !!r && (ROLES[r].team === 'minion' || ROLES[r].team === 'demon');
    for (const h of this.mem.fresh(now).slice(-8)) {
      const c = h.claim || {};
      const from = h.from;
      const th = { to: from, replyTo: h.id };
      // On me demande de justifier une accusation
      if (h.intent === 'ask-why' && h.to === me) {
        const tgt = Object.keys(this.mem.myAccusations).pop();
        if (tgt) out.push({ kind: 'say', urgency: 0.85, intent: { kind: 'explain', target: tgt, reason: (evil ? pub : b).topReason[tgt], ...th } });
        continue;
      }
      // On me demande de soutenir une nomination
      if (h.intent === 'ask-support' && h.to === me && c.support) {
        // Une réponse n'a de sens que tant que le vote concerné n'est pas joué
        const nmNow = view.dayState.nomination;
        if (!nmNow || nmNow.stage === 'closed' || nmNow.nomineeId !== c.support || (nmNow.stage === 'voting' && nmNow.order.indexOf(me) < nmNow.cursor)) { this.mem.handled.add(h.id); continue; }
        const yes = evil ? !team.has(c.support) : scoreOf(c.support) >= accuseThr - 0.05;
        out.push({ kind: 'say', urgency: 0.97, intent: { kind: 'answer-support', target: c.support, yes, ...th } });
        continue;
      }
      // Quelqu'un revendique MON rôle
      if (c.role && myRole && c.role === myRole && h.intent !== 'contradict') {
        const iClaimed = !!this.mem.claims[me];
        if (!evil || (iClaimed && t.deception > 0.6)) { out.push({ kind: 'say', urgency: 0.9, intent: { kind: 'contradict', about: 'my-role', role: myRole, ...th } }); continue; }
      }
      // Une info me met en cause, ou me confirme
      const info = c.info;
      if (info) {
        const aboutMe = (info.kind === 'pair-role' && info.players.includes(me)) || (info.kind === 'role-of' && info.player === me) || (info.kind === 'yesno' && info.players.includes(me));
        if (aboutMe) {
          const bad = (info.kind === 'pair-role' && evilRole(info.role)) || (info.kind === 'role-of' && evilRole(info.role)) || (info.kind === 'yesno' && info.value);
          if (bad) { out.push({ kind: 'say', urgency: 0.82, intent: { kind: 'contradict', about: 'about-me', detail: myRole ? `Je suis ${ROLES[myRole].name}` : undefined, ...th } }); continue; }
          if (info.kind === 'pair-role' && myRole && info.role === myRole && this.mem.claims[me]) { out.push({ kind: 'say', urgency: 0.5, intent: { kind: 'confirm', role: myRole, ...th } }); continue; }
        }
      }
      // Hypothèse de complicité qui me vise
      if (c.pair && c.pair.includes(me)) {
        const other = view.seats.find(s => s.id === c.pair!.find(x => x !== me))?.name;
        out.push({ kind: 'say', urgency: 0.7, intent: { kind: 'contradict', about: 'about-me', detail: `Je n'ai rien à voir avec ${other}`, ...th } });
        continue;
      }
      // Réaction à la défense d'un joueur que j'accuse
      if (h.intent === 'defend' && this.mem.myAccusations[from]?.level > 0) {
        if (this.mem.said.has(`react:${from}:${view.day}`)) continue;
        // Persuasion : une défense peut convaincre, surtout les joueurs confiants ou suiveurs
        const sc = scoreOf(from);
        const pPersuade = (t.trust * 0.45 + t.follow * 0.15 + (1 - t.analytic) * 0.1) * (sc < 0.6 ? 1 : 0.3);
        const convinced = evil ? team.has(from) : sc < accuseThr - 0.08 || this.rand() < pPersuade;
        if (convinced) { this.mem.myAccusations[from].level = 0; this.mem.persuaded[from] = view.day; this.cache = null; }
        out.push({ kind: 'say', urgency: 0.55, intent: { kind: 'react-defense', convinced, ...th } });
        continue;
      }
      // Accusation d'un tiers : accord, désaccord, ou demande d'explication
      const original = !h.intent || ['accuse', 'nominate', 'explain', 'hypothesis', 'plan'].includes(h.intent);
      if (c.accuse && c.accuse !== me && c.accuse !== from && original) {
        const tgt = c.accuse;
        if (this.mem.said.has(`stance:${tgt}:${view.day}`)) continue;
        const sc = scoreOf(tgt);
        if (evil && team.has(tgt)) {
          // Défendre un allié se voit : seuls les menteurs prudents s'y risquent
          if (t.deception < 0.6 && t.caution > 0.4) out.push({ kind: 'say', urgency: 0.3, intent: { kind: 'disagree', target: tgt, ...th } });
          continue;
        }
        if (sc >= accuseThr - 0.1 * t.follow) out.push({ kind: 'say', urgency: 0.34 + 0.25 * t.follow + 0.1 * t.charisma, intent: { kind: 'agree', target: tgt, reason: (evil ? pub : b).topReason[tgt], ...th } });
        else if (!evil && sc < 0.2) out.push({ kind: 'say', urgency: 0.36 + 0.22 * (1 - t.follow) + 0.15 * t.aggression, intent: { kind: 'disagree', target: tgt, reason: this.mem.claims[tgt] && !this.mem.roleSwitches[tgt] ? 'son récit est cohérent' : undefined, ...th } });
        else if (!c.because && (t.analytic > 0.6 || t.trust < 0.3)) out.push({ kind: 'say', urgency: 0.4, intent: { kind: 'ask-why', target: tgt, ...th } });
        continue;
      }
      // On me fait confiance : proposer une alliance
      if (c.trust === me && !(evil && team.has(from)) && (evil ? t.deception > 0.5 : scoreOf(from) < 0.25) && !this.mem.said.has(`ally:${from}`) && t.charisma + t.follow > 0.8) {
        out.push({ kind: 'say', urgency: 0.3 + 0.2 * t.charisma, intent: { kind: 'ally', target: from, ...th } });
      }
    }
    return out;
  }

  /** Le serveur confirme qu'une intervention a été faite. */
  didSpeak(intent: Intent, day: number, now: number) {
    this.mem.said.add(intentKey(intent, day));
    if ('replyTo' in intent && intent.replyTo) this.mem.handled.add(intent.replyTo);
    this.mem.lastSpoke = now;
    this.mem.spokeCount++;
    this.mem.spokeToday[day] = (this.mem.spokeToday[day] || 0) + 1;
  }
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}
