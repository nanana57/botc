/**
 * Simulations accélérées (sans réseau, sans API) et export des traces.
 *
 * Usage :
 *   npm run simulate -- [nbJoueurs] [graine] [mode]
 *   mode : auto (bots + Conteur automatique, défaut) | humain (un joueur humain simulé + bots)
 * La transcription complète est écrite dans simulations/<mode>-<n>-<graine>.md
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { Room, type TraceEvent } from '../src/server/room';
import { ROLES } from '../src/shared/roles';
import { playerView } from '../src/engine/views';
import { PERSONAS } from '../src/ai/personalities';
import * as E from '../src/engine/engine';

export interface SimOptions { n?: number; seed?: number; human?: boolean; personas?: string[]; dayDuration?: number }

/** Un « humain » scripté : il écrit en français libre (analysé comme un vrai message), nomme et vote. */
const humanAct = (room: Room, seatId: string, now: number, st: { lastSay: number; said: Set<string> }) => {
  const s = room.state;
  const v = playerView(s, seatId);
  const grant = { seatId, name: 'Humain' };
  const say = (text: string) => { room.handle(grant, { t: 'chat', text }); st.lastSay = now; };
  if (s.phase === 'night' && v.me.awaiting && now - s.night.awaitingSince > 0) {
    const t = E.autoNightChoice(s);
    room.handle(grant, { t: 'night', targets: t });
    return;
  }
  if (s.phase !== 'day' || now - st.lastSay < 25000) return;
  const role = v.me.role ? ROLES[v.me.role].name : '';
  const nameOf = (id: string) => s.seats.find(x => x.id === id)?.name ?? '?';
  const last = [...v.me.messages].reverse().find(m => m.source === v.me.role && m.info)?.info;
  const infoText = !last ? '' : last.kind === 'number' ? `, j'ai eu ${last.value}`
    : last.kind === 'pair-role' && !last.none && last.role ? ` : ${nameOf(last.players[0])} ou ${nameOf(last.players[1])} est ${ROLES[last.role].name}`
    : last.kind === 'yesno' ? ` : ${last.players.map(nameOf).join(' et ')}, ${last.value ? 'oui' : 'non'}` : '';
  const key = `claim:${s.day}`;
  if (!st.said.has('claim') && s.day >= 1) {
    st.said.add('claim');
    if (v.me.alignment === 'evil') return say("Je préfère attendre un peu avant de dire mon rôle, je vous écoute d'abord.");
    return say(`Je suis ${role}${infoText}.`);
  }
  // Interpeller quelqu'un qui ne s'est pas encore dévoilé
  const silent = s.seats.find(x => x.alive && x.id !== seatId && !s.chat.some(m => m.fromId === x.id && m.claim?.role));
  if (silent && !st.said.has(`ask:${s.day}`)) { st.said.add(`ask:${s.day}`); return say(`${silent.name}, tu es quoi ? On ne t'a pas entendu.`); }
  const nm = s.dayState.nomination;
  if (nm && nm.stage === 'voting') {
    const accusers = s.chat.filter(m => m.claim?.accuse === nm.nomineeId && m.at === `J${s.day}`).length;
    try { room.handle(grant, { t: 'hand', yes: accusers >= 2 && nm.nomineeId !== seatId }); } catch { /* */ }
    return;
  }
  if (!st.said.has(key)) {
    st.said.add(key);
    const counts: Record<string, number> = {};
    s.chat.filter(m => m.claim?.accuse && m.at === `J${s.day}`).forEach(m => { counts[m.claim!.accuse!] = (counts[m.claim!.accuse!] || 0) + 1; });
    const top = Object.entries(counts).filter(([id]) => id !== seatId).sort((a, b) => b[1] - a[1])[0];
    const target = top ? s.seats.find(x => x.id === top[0]) : undefined;
    if (target) {
      say(`Je soupçonne ${target.name}, beaucoup de monde le pointe et il reste flou.`);
      if (v.me.canNominate && v.me.canBeNominatedIds.includes(target.id) && (!nm || nm.stage === 'closed')) { try { room.handle(grant, { t: 'nominate', nomineeId: target.id }); } catch { /* */ } }
    } else say('Quelqu’un a une piste solide ? Je ne vois rien de clair pour le moment.');
  }
};

export const simulate = async (opts: SimOptions | number = {}, seedArg?: number, verbose = true): Promise<Room> => {
  const o: SimOptions = typeof opts === 'number' ? { n: opts, seed: seedArg } : opts;
  const n = o.n ?? 9;
  const seed = o.seed ?? 7;
  const room = new Room('SIMUL', { seed, storyteller: 'auto', dayDuration: o.dayDuration ?? 240 }, null);
  let t = Date.UTC(2026, 10, 21, 20, 0, 0);
  room.clock = () => t;
  let humanId: string | null = null;
  if (o.human) humanId = room.join('Camille').seatId;
  for (let i = humanId ? 1 : 0; i < n; i++) room.addBot(o.personas?.[i % o.personas.length]);
  room.handle({ host: true, name: 'hôte' }, { t: 'start' });
  const s = room.state;
  const hst = { lastSay: 0, said: new Set<string>() };
  let steps = 0;
  while (s.phase !== 'ended' && steps++ < 30000) {
    t += 400;
    if (humanId) { try { humanAct(room, humanId, t, hst); } catch { /* action refusée par le moteur : ignorée */ } }
    room.tick(t);
    await new Promise(r => setImmediate(r));
  }
  if (verbose) {
    const md = transcript(room);
    mkdirSync('simulations', { recursive: true });
    const file = `simulations/${humanId ? 'humain' : 'auto'}-${n}-${seed}.md`;
    writeFileSync(file, md);
    console.log(md.split('\n').slice(0, 30).join('\n'));
    console.log(`\n… transcription complète : ${file}`);
    console.log(`Résultat : ${s.winner} — ${s.winReason} (jour ${s.day})`);
  }
  return room;
};

const fmt = (e: TraceEvent) => {
  const d = (e.data || {}) as Record<string, unknown>;
  const who = e.actor ? `**${e.actor}**` : '';
  switch (e.kind) {
    case 'parole': return `- ${who}${d.intention ? ` _[${d.intention}]_` : d.humain ? ' _[humain]_' : ''} : « ${e.text} »${d.en_reponse_a ? `\n  ↪ en réponse à ${d.en_reponse_a}` : ''}`;
    case 'nuit:reveil': return `- 🌙 ${who} ${e.text}`;
    case 'nuit:choix': return `- 🌙 ${who} ${e.text} — _raisonnement : ${d.raisonnement || '—'}_`;
    case 'info-secrete': return '';
    case 'conteur': {
      // Le journal du Grimoire est chronologique : il sert de source pour les messages secrets
      const m = /^→ ([^:]+) : (.*)$/.exec(e.text);
      if (m) return /^Tu es /.test(m[2]) ? '' : `- 🔒 Le Conteur → **${m[1]}** : ${m[2]}`;
      return `- 📜 _Grimoire : ${e.text}_`;
    }
    case 'croyances': return `- 🧠 ${who} (${d.persona}, indices remarqués ${d.indices}) — ${e.text}`;
    case 'vote:intention': return `- ✋ ${who} ${e.text} — _${d.raisonnement}_`;
    case 'vote:changement': return `- 🔁 ${who} ${e.text} — _${d.raisonnement}_`;
    case 'vote': return `- ⏱ ${who} ${e.text}`;
    case 'nomination': return `- ⚖️ ${who} ${e.text}${d.motif ? ` _(motif : ${d.motif})_` : ''}`;
    default: return e.kind.startsWith('public:') ? `- **${e.text}**` : `- ${who} ${e.text}`;
  }
};

export const transcript = (room: Room): string => {
  const s = room.state;
  const out: string[] = [`# Simulation — ${s.seats.length} joueurs, graine ${s.settings.seed ?? '?'}`, '', '## Distribution (secrète)', ''];
  for (const x of s.seats) out.push(`- ${x.name}${x.isBot ? ` (${PERSONAS.find(p => p.id === x.persona)?.label ?? 'bot'})` : ' (humain)'} : ${ROLES[x.role!].name}${x.role !== x.believedRole ? ` — croit être ${ROLES[x.believedRole!].name}` : ''} [${x.alignment === 'evil' ? 'Mal' : 'Bien'}]`);
  // Regroupement par phase (ordre stable à l'intérieur d'une phase)
  const rank = (x: string) => (x.startsWith('N') ? Number(x.slice(1)) * 2 - 1 : x.startsWith('J') ? Number(x.slice(1)) * 2 : x === 'Fin' ? 1e6 : 0);
  const ordered = room.trace.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e.at) - rank(b.e.at) || a.i - b.i).map(x => x.e);
  let at = '';
  for (const e of ordered) {
    if (e.at !== at) { at = e.at; out.push('', `## ${at.startsWith('N') ? `Nuit ${at.slice(1)}` : at.startsWith('J') ? `Jour ${at.slice(1)}` : at}`, ''); }
    const line = fmt(e);
    if (line) out.push(line);
  }
  out.push('', `**Résultat : ${s.winner === 'good' ? 'victoire du Bien' : 'victoire du Mal'} — ${s.winReason}**`);
  return out.join('\n');
};

if (process.argv[1] && process.argv[1].includes('simulate')) {
  const [n, seed, mode] = process.argv.slice(2);
  simulate({ n: Number(n || 9), seed: Number(seed || 7), human: mode === 'humain' });
}
