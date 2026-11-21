/**
 * Raisonnement stratégique : énumération des mondes possibles.
 *
 * Un « monde » = une hypothèse complète sur l'équipe maléfique (qui est le Démon, qui sont les
 * Sbires). Avec au plus 15 joueurs, il y a au plus quelques milliers de mondes : on peut tous les
 * évaluer. Chaque observation (ma propre info, une revendication publique, une mort nocturne, un
 * tir de Pourfendeur raté…) donne une vraisemblance à chaque monde. On en déduit, pour chaque
 * joueur, la probabilité d'être maléfique et d'être le Démon — et l'observation qui pèse le plus
 * (pour pouvoir expliquer une accusation).
 *
 * La personnalité intervient dans les paramètres (confiance dans les revendications des autres,
 * confiance dans sa propre info), pas seulement dans la formulation.
 */
import { DISTRIBUTION, ROLES, type RoleId } from '../shared/roles';
import type { InfoPayload, PlayerView } from '../shared/types';
import type { BotMemory } from './memory';
import type { Traits } from './personalities';

export interface Observation {
  label: string;
  kind: 'my-info' | 'claim' | 'double-claim' | 'night-death' | 'demon-dead' | 'slayer-miss' | 'role-switch';
  about: string[];
  /** Vraisemblance du monde (démon, ensemble maléfique). */
  f: (demon: string, evil: Set<string>) => number;
}

export interface Beliefs {
  pEvil: Record<string, number>;
  pDemon: Record<string, number>;
  /** Observation qui augmente le plus la suspicion envers chaque joueur. */
  topReason: Record<string, Observation | undefined>;
  worlds: number;
  /** Paire de complices la plus probable (parmi les suspects principaux). */
  pair?: { a: string; b: string; p: number };
  /** Indices effectivement remarqués / disponibles. */
  noticed: number;
  available: number;
}

const h32 = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };

const combos = <T>(arr: T[], k: number): T[][] => {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [h, ...t] = arr;
  return [...combos(t, k - 1).map(c => [h, ...c]), ...combos(t, k)];
};

const evilRole = (r: RoleId | null | undefined) => !!r && (ROLES[r].team === 'minion' || ROLES[r].team === 'demon');

/** Vraisemblance d'une information « saine » dans un monde donné (0 → 1). */
export const infoLikelihood = (info: InfoPayload, source: RoleId | undefined, seats: string[], demon: string, evil: Set<string>): number => {
  switch (info.kind) {
    case 'number': {
      if (info.players && info.players.length) return info.players.filter(p => evil.has(p)).length === info.value ? 1 : 0;
      if (source === 'chef' || !info.players) {
        let pairs = 0;
        for (let i = 0; i < seats.length; i++) if (evil.has(seats[i]) && evil.has(seats[(i + 1) % seats.length])) pairs++;
        return pairs === info.value ? 1 : 0;
      }
      return 1;
    }
    case 'pair-role': {
      if (info.none || !info.role) return 1;
      const team = ROLES[info.role].team;
      if (team === 'minion') return info.players.some(p => evil.has(p) && p !== demon) ? 1 : 0.05;
      if (team === 'demon') return info.players.includes(demon) ? 1 : 0.05;
      return info.players.some(p => !evil.has(p)) ? 1 : 0.1;
    }
    case 'yesno':
      if (info.value) return info.players.includes(demon) ? 1 : 0.22; // leurre possible
      return info.players.includes(demon) ? 0.03 : 1;
    case 'role-of': {
      if (info.role === 'imp') return info.player === demon ? 1 : 0.1;
      if (evilRole(info.role)) return evil.has(info.player) && info.player !== demon ? 1 : 0.1;
      return evil.has(info.player) ? 0.1 : 1;
    }
    default:
      return 1;
  }
};

export interface ReasonContext {
  view: PlayerView;
  mem: BotMemory;
  traits: Traits;
  /** true = point de vue d'un observateur neutre (sans info privée) : sert au Mal pour anticiper le village. */
  publicOnly?: boolean;
}

export const buildObservations = ({ view, mem, traits, publicOnly }: ReasonContext): Observation[] => {
  const obs: Observation[] = [];
  const seats = view.seats.map(s => s.id);
  const name = (id: string) => view.seats.find(s => s.id === id)?.name ?? '?';
  const me = view.me.seatId;
  // 1. Mes propres informations (je peux être ivre ou empoisonné : confiance < 1)
  if (!publicOnly) {
    const tMe = 0.72 + 0.18 * traits.analytic;
    for (const m of view.me.messages) {
      if (!m.info || !m.source || ['role-change', 'evil-team', 'demon-intro', 'grimoire', 'text'].includes(m.info.kind)) continue;
      const info = m.info;
      const source = m.source;
      obs.push({
        label: m.text, kind: 'my-info', about: 'players' in info && Array.isArray(info.players) ? info.players : 'player' in info ? [info.player] : [],
        f: (d, e) => tMe * infoLikelihood(info, source, seats, d, e) + (1 - tMe) * 0.5,
      });
    }
  }
  // 2. Revendications publiques : si le joueur est bon dans ce monde, son info doit coller
  const eps = 0.08 + 0.35 * (1 - (publicOnly ? 0.5 : traits.trust));
  for (const c of Object.values(mem.claims)) {
    if (!publicOnly && c.seatId === me) continue;
    for (const info of c.info) {
      obs.push({
        label: `${name(c.seatId)} (${ROLES[c.role].name})`, kind: 'claim', about: [c.seatId, ...('players' in info && Array.isArray(info.players) ? info.players : 'player' in info ? [info.player] : [])],
        f: (d, e) => (e.has(c.seatId) ? 1 : Math.max(eps, infoLikelihood(info, c.role, seats, d, e))),
      });
    }
    // Revendiquer un rôle maléfique n'arrive que par bluff extrême : ignoré.
  }
  // 3. Doubles revendications : deux bons ne peuvent pas porter le même rôle (sauf Ivrogne)
  const byRole: Record<string, string[]> = {};
  Object.values(mem.claims).forEach(c => { (byRole[c.role] ||= []).push(c.seatId); });
  for (const [role, ids] of Object.entries(byRole)) {
    if (ids.length < 2) continue;
    for (const [a, b] of combos(ids, 2)) {
      if (!publicOnly && (a === me || b === me)) {
        const other = a === me ? b : a;
        obs.push({ label: `${name(other)} revendique mon rôle (${ROLES[role as RoleId].name})`, kind: 'double-claim', about: [other], f: (_d, e) => (e.has(other) ? 1 : 0.12) });
      } else {
        obs.push({ label: `${name(a)} et ${name(b)} revendiquent tous deux ${ROLES[role as RoleId].name}`, kind: 'double-claim', about: [a, b], f: (_d, e) => (e.has(a) || e.has(b) ? 1 : 0.1) });
      }
    }
  }
  // 4. Changements de rôle revendiqué
  for (const [p, n] of Object.entries(mem.roleSwitches)) {
    obs.push({ label: `${name(p)} a changé de version sur son rôle`, kind: 'role-switch', about: [p], f: (_d, e) => (e.has(p) ? 1 : Math.pow(0.45, n)) });
  }
  // 5. Morts nocturnes : le Démon tue rarement un allié
  for (const v of mem.nightDeaths) {
    obs.push({ label: `${name(v)} a été tué la nuit`, kind: 'night-death', about: [v], f: (d, e) => (v === d ? 0.12 : e.has(v) ? 0.3 : 1) });
  }
  // 6. La partie continue alors qu'un Démon hypothétique est mort (Femme écarlate possible)
  const deadIds = view.seats.filter(s => !s.alive).map(s => s.id);
  if (view.phase !== 'ended') {
    for (const dId of deadIds) obs.push({ label: `${name(dId)} est mort et la partie continue`, kind: 'demon-dead', about: [dId], f: d => (d === dId ? 0.2 : 1) });
  }
  // 7. Tir de Pourfendeur raté (si le tireur dit vrai, la cible n'est pas le Démon)
  for (const sm of mem.slayerMisses) {
    obs.push({ label: `le tir de ${name(sm.shooter)} sur ${name(sm.target)} a échoué`, kind: 'slayer-miss', about: [sm.target], f: (d, e) => (!e.has(sm.shooter) && d === sm.target ? 0.15 : 1) });
  }
  return obs;
};

/**
 * Calcule les croyances. `fixedEvil` : équipe connue (bots maléfiques informés).
 */
export const reason = (ctx: ReasonContext): Beliefs => {
  const { view, publicOnly } = ctx;
  const seats = view.seats.map(s => s.id);
  const n = seats.length;
  const dist = DISTRIBUTION[Math.min(Math.max(n, 5), 15)];
  const mn = dist[2];
  const me = view.me.seatId;
  const myTeam = view.me.team;
  const iAmEvil = view.me.alignment === 'evil';

  // Mondes candidats
  const worlds: Array<{ d: string; e: Set<string> }> = [];
  const teamInfo = view.me.messages.find(m => m.info?.kind === 'evil-team' || m.info?.kind === 'demon-intro')?.info;
  if (!publicOnly && iAmEvil && teamInfo) {
    if (teamInfo.kind === 'evil-team') worlds.push({ d: teamInfo.demon ?? '', e: new Set([teamInfo.demon ?? '', me, ...teamInfo.minions]) });
    else if (teamInfo.kind === 'demon-intro') worlds.push({ d: me, e: new Set([me, ...teamInfo.minions]) });
  } else {
    const pool = publicOnly ? seats : seats.filter(s => !(view.me.alignment === 'good' && s === me));
    for (const d of pool) {
      if (!publicOnly && iAmEvil && myTeam === 'demon' && d !== me) continue;
      if (!publicOnly && iAmEvil && myTeam === 'minion' && d === me) continue;
      const rest = pool.filter(x => x !== d);
      for (const M of combos(rest, mn)) {
        if (!publicOnly && iAmEvil && myTeam === 'minion' && !M.includes(me)) continue;
        worlds.push({ d, e: new Set([d, ...M]) });
      }
    }
  }

  const all = buildObservations(ctx);
  // Attention imparfaite : un joueur peu analytique ne remarque pas tous les indices publics.
  // Le tirage est stable (même bot, même indice → même résultat) : ses erreurs sont cohérentes.
  const attention = publicOnly ? 1 : 0.5 + 0.5 * ctx.traits.analytic;
  const obs = all.filter(o => o.kind === 'my-info' || (h32(me + o.label) % 1000) / 1000 < attention);
  const F = worlds.map(w => obs.map(o => Math.max(1e-6, o.f(w.d, w.e))));
  const L = F.map(row => row.reduce((a, b) => a * b, 1));
  const total = L.reduce((a, b) => a + b, 0) || 1;
  const pEvil: Record<string, number> = {};
  const pDemon: Record<string, number> = {};
  seats.forEach(id => { pEvil[id] = 0; pDemon[id] = 0; });
  worlds.forEach((w, i) => {
    const p = L[i] / total;
    w.e.forEach(id => { if (id in pEvil) pEvil[id] += p; });
    if (w.d in pDemon) pDemon[w.d] += p;
  });

  // Explication : pour chaque joueur, l'observation dont le retrait fait le plus baisser sa suspicion.
  // Une seule passe par observation : on accumule, pour chaque joueur, sa masse « maléfique » sans cette observation.
  const topReason: Record<string, Observation | undefined> = {};
  const bestDelta: Record<string, number> = {};
  obs.forEach((o, k) => {
    const concerned = o.kind === 'my-info' ? seats : o.about;
    if (!concerned.length) return;
    let tot = 0;
    const ev: Record<string, number> = {};
    worlds.forEach((w, i) => {
      const l = L[i] / F[i][k];
      tot += l;
      w.e.forEach(id => { ev[id] = (ev[id] || 0) + l; });
    });
    if (!tot) return;
    for (const id of concerned) {
      if (id === me && !publicOnly) continue;
      const delta = pEvil[id] - (ev[id] || 0) / tot;
      if (delta > (bestDelta[id] ?? 0.04)) { bestDelta[id] = delta; topReason[id] = o; }
    }
  });

  // Hypothèse de complicité : paire la plus probable parmi les 5 plus suspects
  let pair: Beliefs['pair'];
  const top = seats.filter(id => publicOnly || id !== me).sort((a, b) => pEvil[b] - pEvil[a]).slice(0, 5);
  for (const [a, b] of combos(top, 2)) {
    let p = 0;
    worlds.forEach((w, i) => { if (w.e.has(a) && w.e.has(b)) p += L[i] / total; });
    if (!pair || p > pair.p) pair = { a, b, p };
  }
  return { pEvil, pDemon, topReason, worlds: worlds.length, pair, noticed: obs.length, available: all.length };
};
