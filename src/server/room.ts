/**
 * Salon de jeu : état autoritaire, permissions, chef d'orchestre (bots + Conteur automatique).
 *
 * Toute action client arrive ici, est AUTORISÉE (qui a le droit ?) puis VALIDÉE par le moteur
 * (est-ce légal ?). Chaque client ne reçoit que sa vue : joueur, Conteur ou spectateur.
 */
import { randomBytes } from 'node:crypto';
import * as E from '../engine/engine';
import { playerView, spectatorView, storytellerView } from '../engine/views';
import type { GameSettings, GameState, PlayerView } from '../shared/types';
import { BotBrain } from '../ai/brain';
import { BOT_NAMES, PERSONAS } from '../ai/personalities';
import { buildRealizePrompt, claimOf, renderTemplate, validateRealization, type Intent } from '../ai/speech';
import { parseHumanMessage } from '../ai/parse';
import type { LlmGateway } from '../ai/providers';
import { narrate, PACE, STORYTELLER_NAME } from '../storyteller/narrator';
import { ROLES } from '../shared/roles';

export interface Grant { seatId?: string; storyteller?: boolean; host?: boolean; name: string }

export type ClientMsg =
  | { t: 'addBot'; persona?: string; name?: string }
  | { t: 'removeSeat'; seatId: string }
  | { t: 'moveSeat'; seatId: string; to: number }
  | { t: 'setPersona'; seatId: string; persona: string }
  | { t: 'settings'; patch: Partial<GameSettings> }
  | { t: 'start' }
  | { t: 'chat'; text: string; channel?: 'public' | 'storyteller'; seatId?: string }
  | { t: 'night'; targets: string[] }
  | { t: 'nominate'; nomineeId: string }
  | { t: 'hand'; yes: boolean }
  | { t: 'slay'; targetId: string }
  | { t: 'st'; op: 'openVote' | 'endDay' | 'skip' | 'pauseBots' | 'resumeBots'; }
  | { t: 'st'; op: 'decide'; decisionId: string; option: number }
  | { t: 'st'; op: 'setAlive'; seatId: string; alive: boolean };

export interface RoomClient { grant: Grant; send: (msg: unknown) => void }

export interface AiLogEntry { ts: number; seat: string; kind: string; text: string; llm?: boolean; ms?: number; ok?: boolean }

const token = () => randomBytes(18).toString('base64url');

export class Room {
  state: GameState;
  tokens: Record<string, Grant> = {};
  brains = new Map<string, BotBrain>();
  clients = new Set<RoomClient>();
  aiLog: AiLogEntry[] = [];
  llmCallsThisGame = 0;
  botsPaused = false;
  private botBusy = false;
  private lastBotSpeech = 0;
  private lastVoteStep = 0;
  private nightThinkUntil = 0;
  private narrated = new Set<string>();
  private dirty = true;
  onChange?: (room: Room) => void;
  /** Horloge injectable (simulation accélérée dans les tests). */
  clock: () => number = Date.now;
  private dayKey = 0;
  private awaitKey = '';
  private awaitSince = 0;

  constructor(id: string, settings: Partial<GameSettings>, public gateway: LlmGateway | null, public llmBudget = 300) {
    this.state = E.createGame(id, settings);
  }

  get id() { return this.state.id; }

  // ---------------------------------------------------------------- accès

  issue(grant: Grant): string { const t = token(); this.tokens[t] = grant; this.touch(); return t; }
  grantOf(t: string): Grant | undefined { return this.tokens[t]; }

  join(name: string): { token: string; seatId: string } {
    const seatId = `s_${randomBytes(5).toString('hex')}`;
    E.addSeat(this.state, { id: seatId, name, isBot: false });
    const tk = this.issue({ seatId, name });
    return { token: tk, seatId };
  }

  addBot(persona?: string, name?: string) {
    const used = new Set(this.state.seats.map(s => s.name));
    const botName = name?.trim() || BOT_NAMES.find(n => !used.has(n)) || `Bot ${this.state.seats.length + 1}`;
    const p = PERSONAS.find(x => x.id === persona) ?? PERSONAS[this.state.seats.filter(s => s.isBot).length % PERSONAS.length];
    const seatId = `b_${randomBytes(5).toString('hex')}`;
    E.addSeat(this.state, { id: seatId, name: botName, isBot: true, persona: p.id });
    this.brains.set(seatId, new BotBrain(seatId, p.id, this.state.rng));
  }

  rebuildBrains() {
    for (const s of this.state.seats.filter(x => x.isBot)) {
      if (this.brains.has(s.id)) continue;
      const b = new BotBrain(s.id, s.persona, this.state.rng);
      if (this.state.phase !== 'lobby') b.observe(playerView(this.state, s.id));
      this.brains.set(s.id, b);
    }
  }

  viewFor(grant: Grant) {
    if (grant.storyteller) return { ...storytellerView(this.state), aiLog: this.aiLog.slice(0, 80), ai: this.aiStatus() };
    if (grant.seatId && this.state.seats.some(s => s.id === grant.seatId)) return playerView(this.state, grant.seatId);
    return spectatorView(this.state);
  }

  aiStatus() {
    return { gateway: this.gateway?.status() ?? null, llmCallsThisGame: this.llmCallsThisGame, budget: this.llmBudget, botsPaused: this.botsPaused };
  }

  // ---------------------------------------------------------------- actions

  handle(grant: Grant, m: ClientMsg) {
    const s = this.state;
    const isHost = !!grant.host || !!grant.storyteller;
    const seat = grant.seatId;
    const need = (cond: boolean, msg: string) => { if (!cond) throw new E.RuleError(msg); };
    switch (m.t) {
      case 'addBot': need(isHost, "Seul l'hôte peut ajouter des bots."); this.addBot(m.persona, m.name); break;
      case 'removeSeat': need(isHost || m.seatId === seat, 'Action réservée à l’hôte.'); E.removeSeat(s, m.seatId); this.brains.delete(m.seatId); break;
      case 'moveSeat': need(isHost, 'Action réservée à l’hôte.'); E.moveSeat(s, m.seatId, m.to); break;
      case 'setPersona': {
        need(isHost && s.phase === 'lobby', 'Action réservée à l’hôte, avant la partie.');
        const st = E.seatById(s, m.seatId);
        need(!!st?.isBot && PERSONAS.some(p => p.id === m.persona), 'Personnalité inconnue.');
        st!.persona = m.persona;
        this.brains.set(st!.id, new BotBrain(st!.id, m.persona, s.rng));
        break;
      }
      case 'settings': {
        need(isHost && s.phase === 'lobby', 'Réglages modifiables par l’hôte avant la partie.');
        const p = m.patch;
        if (p.dayDuration !== undefined) s.settings.dayDuration = Math.max(60, Math.min(1200, Number(p.dayDuration) || 300));
        if (p.scriptId) s.settings.scriptId = String(p.scriptId);
        if (p.nightChoiceTimeout !== undefined) s.settings.nightChoiceTimeout = Math.max(15, Math.min(300, Number(p.nightChoiceTimeout) || 60));
        break;
      }
      case 'start': need(isHost, "Seul l'hôte lance la partie."); E.startGame(s); this.llmCallsThisGame = 0; break;
      case 'chat': {
        if (grant.storyteller) {
          if (m.channel === 'storyteller' && m.seatId) E.addChat(s, { fromId: 'storyteller', fromName: STORYTELLER_NAME, text: m.text, channel: 'storyteller', seatId: m.seatId });
          else E.addChat(s, { fromId: 'storyteller', fromName: STORYTELLER_NAME, text: m.text, channel: 'public' });
          break;
        }
        need(!!seat, 'Seuls les joueurs assis peuvent parler.');
        const st = E.seatById(s, seat)!;
        if (m.channel === 'storyteller') { E.addChat(s, { fromId: seat!, fromName: st.name, text: m.text, channel: 'storyteller', seatId: seat }); break; }
        const nb = E.aliveNeighbours(s, seat!);
        const claim = parseHumanMessage(m.text, playerView(s, seat!).seats, seat!, nb);
        E.addChat(s, { fromId: seat!, fromName: st.name, text: m.text, channel: 'public', claim });
        break;
      }
      case 'night': need(!!seat, 'Réservé aux joueurs.'); E.submitNightChoice(s, seat!, m.targets); break;
      case 'nominate': need(!!seat, 'Réservé aux joueurs.'); E.nominate(s, seat!, m.nomineeId); break;
      case 'hand': need(!!seat, 'Réservé aux joueurs.'); E.setHand(s, seat!, m.yes); break;
      case 'slay': need(!!seat, 'Réservé aux joueurs.'); E.slay(s, seat!, m.targetId); break;
      case 'st': {
        need(!!grant.storyteller || (!!grant.host && s.settings.storyteller === 'auto' && (m.op === 'pauseBots' || m.op === 'resumeBots')), 'Action réservée au Conteur.');
        if (m.op === 'openVote') E.openVoting(s);
        else if (m.op === 'endDay') E.endDay(s);
        else if (m.op === 'skip') E.stSkipAwaiting(s);
        else if (m.op === 'decide') E.stResolveDecision(s, m.decisionId, m.option);
        else if (m.op === 'setAlive') E.stSetAlive(s, m.seatId, m.alive);
        else if (m.op === 'pauseBots') this.botsPaused = true;
        else if (m.op === 'resumeBots') this.botsPaused = false;
        break;
      }
      default: throw new E.RuleError('Action inconnue.');
    }
    this.touch();
  }

  touch() { this.state.version++; this.dirty = true; }

  // ---------------------------------------------------------------- diffusion

  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    this.narrate();
    for (const c of this.clients) { try { c.send({ t: 'view', view: this.viewFor(c.grant) }); } catch { /* client fermé */ } }
    this.onChange?.(this);
  }

  private narrate() {
    for (const e of this.state.publicLog) {
      if (this.narrated.has(e.id)) continue;
      this.narrated.add(e.id);
      if (this.state.settings.storyteller !== 'auto') continue;
      const line = narrate(this.state, e);
      if (line) { try { E.addChat(this.state, { fromId: 'storyteller', fromName: STORYTELLER_NAME, text: line, channel: 'public' }); } catch { /* nuit */ } }
    }
  }

  // ---------------------------------------------------------------- chef d'orchestre

  /** Appelé régulièrement par le serveur. */
  tick(now = this.clock()) {
    const s = this.state;
    try {
      for (const [id, b] of this.brains) if (s.phase !== 'lobby' && E.seatById(s, id)) b.observe(playerView(s, id));
      if (s.phase === 'night') this.tickNight(now);
      else if (s.phase === 'day') this.tickDay(now);
    } catch (e) {
      this.log('système', 'erreur', String((e as Error).message || e));
    }
    this.flush();
  }

  private tickNight(now: number) {
    const s = this.state;
    if (s.pendingDecision) return; // le Conteur humain tranche
    const a = s.night.awaiting;
    if (!a) return;
    const key = `${s.day}:${s.night.cursor}:${a.seatId}`;
    if (key !== this.awaitKey) { this.awaitKey = key; this.awaitSince = now; }
    const seat = E.seatById(s, a.seatId)!;
    if (seat.isBot) {
      if (!this.nightThinkUntil) { this.nightThinkUntil = now + PACE.botNightThink[0] + Math.random() * (PACE.botNightThink[1] - PACE.botNightThink[0]); return; }
      if (now < this.nightThinkUntil) return;
      this.nightThinkUntil = 0;
      const brain = this.brains.get(seat.id)!;
      const targets = brain.nightChoice(playerView(s, seat.id));
      try { E.submitNightChoice(s, seat.id, targets); this.log(seat.name, 'nuit', `${ROLES[a.role].name} → ${targets.map(t => E.seatById(s, t)?.name).join(', ')}`); }
      catch (err) { this.log(seat.name, 'nuit', `choix refusé par le moteur (${(err as Error).message}) : choix automatique`); E.submitNightChoice(s, seat.id, E.autoNightChoice(s)); }
      this.touch();
      return;
    }
    if (s.settings.storyteller === 'auto' && now - this.awaitSince > s.settings.nightChoiceTimeout * 1000) {
      E.submitNightChoice(s, seat.id, E.autoNightChoice(s));
      this.log(seat.name, 'nuit', 'délai dépassé : choix automatique');
      this.touch();
    }
  }

  private tickDay(now: number) {
    const s = this.state;
    const auto = s.settings.storyteller === 'auto';
    if (this.dayKey !== s.day) { this.dayKey = s.day; if (auto) s.dayState.endsAt = now + s.settings.dayDuration * 1000; this.touch(); }
    const nm = s.dayState.nomination;
    // Débat de la nomination puis ouverture du vote
    if (nm && nm.stage === 'defense' && auto) {
      const started = this.nominationStarted ??= now;
      const nomineeBot = E.seatById(s, nm.nomineeId)?.isBot;
      if (now - started > (nomineeBot ? PACE.defenseBot : PACE.defenseHuman)) { E.openVoting(s); this.touch(); this.nominationStarted = undefined; }
    }
    if (!nm || nm.stage !== 'defense') this.nominationStarted = undefined;
    // L'aiguille tourne : les bots décident au moment où elle les atteint
    if (nm && nm.stage === 'voting' && now - this.lastVoteStep > PACE.voteStep) {
      this.lastVoteStep = now;
      const voter = nm.order[nm.cursor];
      const vs = E.seatById(s, voter);
      if (vs?.isBot) {
        const yes = this.brains.get(voter)!.decideVote(playerView(s, voter));
        try { E.setHand(s, voter, yes); } catch { /* vote fantôme épuisé */ }
      }
      E.lockNextVote(s);
      this.touch();
      return;
    }
    // Fin du jour (Conteur automatique)
    if (auto && (!nm || nm.stage === 'closed')) {
      const ends = s.dayState.endsAt ?? 0;
      if (s.dayState.executionDone && !this.virginAt) this.virginAt = now;
      if ((ends && now > ends) || (this.virginAt && now - this.virginAt > PACE.afterVirgin)) {
        this.virginAt = undefined;
        E.endDay(s);
        this.touch();
        return;
      }
    }
    if (!s.dayState.executionDone) this.virginAt = undefined;
    // Les bots prennent la parole, nomment, tirent
    if (this.botsPaused || this.botBusy || now - this.lastBotSpeech < PACE.botGap) return;
    if (nm && nm.stage === 'voting') return;
    let best: { id: string; p: NonNullable<ReturnType<BotBrain['think']>> } | null = null;
    for (const [id, b] of this.brains) {
      if (!E.seatById(s, id)) continue;
      const p = b.think(playerView(s, id), now);
      if (p && (!best || p.urgency > best.p.urgency)) best = { id, p };
    }
    if (!best) return;
    const { id, p } = best;
    const brain = this.brains.get(id)!;
    const seat = E.seatById(s, id)!;
    try {
      if (p.kind === 'nominate') {
        E.nominate(s, id, p.target!);
        brain.didSpeak(p.intent, s.day, now);
        this.lastBotSpeech = now;
        this.log(seat.name, 'nomination', E.seatById(s, p.target!)?.name ?? '');
        void this.say(id, p.intent);
      } else if (p.kind === 'slay') {
        brain.didSpeak(p.intent, s.day, now);
        void this.say(id, p.intent).then(() => { try { E.slay(this.state, id, p.target!); this.touch(); } catch (err) { this.log(seat.name, 'tir', (err as Error).message); } });
      } else {
        brain.didSpeak(p.intent, s.day, now);
        void this.say(id, p.intent);
      }
    } catch (err) {
      this.log(seat.name, 'refus', (err as Error).message);
      brain.didSpeak(p.intent, s.day, now);
    }
    this.touch();
  }

  private nominationStarted?: number;
  private virginAt?: number;

  /** Formule (gabarit, puis reformulation LLM éventuelle) et publie une intervention. */
  async say(seatId: string, intent: Intent) {
    const s = this.state;
    const seat = E.seatById(s, seatId);
    const brain = this.brains.get(seatId);
    if (!seat || !brain) return;
    const view: PlayerView = playerView(s, seatId);
    let text = renderTemplate(intent, brain.persona, view.seats, seatId);
    if (!text) return;
    this.botBusy = true;
    this.lastBotSpeech = this.clock();
    let llm = false; let ms = 0; let ok: boolean | undefined;
    try {
      if (this.gateway?.available && this.llmCallsThisGame < this.llmBudget) {
        this.llmCallsThisGame++;
        const recent = view.chat.filter(m => m.channel === 'public').slice(-6).map(m => `${m.fromName} : ${m.text}`);
        const { system, user } = buildRealizePrompt(text, brain.persona, recent);
        const r = await this.gateway.complete(system, user, 120);
        ms = r.ms; llm = true; ok = r.ok && !!r.text && validateRealization(text, r.text, view.seats);
        if (ok) text = r.text!.replace(/^["«\s]+|["»\s]+$/g, '');
      }
      if (this.state.phase === 'day' || intent.kind === 'defend') {
        E.addChat(this.state, { fromId: seatId, fromName: seat.name, text, channel: 'public', claim: claimOf(intent, seatId), bot: true });
        this.log(seat.name, intent.kind, text, llm, ms, ok);
      }
    } catch (e) {
      this.log(seat.name, 'erreur', String((e as Error).message));
    } finally {
      this.botBusy = false;
      this.lastBotSpeech = this.clock();
      this.touch();
    }
  }

  log(seat: string, kind: string, text: string, llm?: boolean, ms?: number, ok?: boolean) {
    this.aiLog.unshift({ ts: this.clock(), seat, kind, text, llm, ms, ok });
    if (this.aiLog.length > 200) this.aiLog.pop();
  }

  // ---------------------------------------------------------------- persistance

  serialize() { return { state: this.state, tokens: this.tokens, llmCallsThisGame: this.llmCallsThisGame }; }

  static restore(data: ReturnType<Room['serialize']>, gateway: LlmGateway | null, budget?: number): Room {
    const r = new Room(data.state.id, data.state.settings, gateway, budget);
    r.state = data.state;
    r.tokens = data.tokens;
    r.llmCallsThisGame = data.llmCallsThisGame || 0;
    r.state.publicLog.forEach(e => r.narrated.add(e.id));
    r.rebuildBrains();
    return r;
  }
}
