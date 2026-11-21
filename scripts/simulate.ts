/**
 * Simulation accélérée d'une partie entre bots (sans réseau, sans API).
 * Usage : npm run simulate -- [nbJoueurs] [graine]
 */
import { Room } from '../src/server/room';
import { ROLES } from '../src/shared/roles';
import { playerView } from '../src/engine/views';

export const simulate = async (n = 9, seed = 7, verbose = true) => {
  const room = new Room('SIMUL', { seed, storyteller: 'auto', dayDuration: 240 }, null);
  let t = 1_000_000;
  room.clock = () => t;
  for (let i = 0; i < n; i++) room.addBot();
  room.handle({ host: true, name: 'hôte' }, { t: 'start' });
  const s = room.state;
  if (verbose) console.log(s.seats.map(x => `${x.name} [${x.persona}] = ${ROLES[x.role!].name}${x.role !== x.believedRole ? ` (croit ${ROLES[x.believedRole!].name})` : ''}`).join('\n'));
  let steps = 0;
  while (s.phase !== 'ended' && steps++ < 20000) {
    t += 400;
    room.tick(t);
    await new Promise(r => setImmediate(r));
  }
  if (verbose) {
    console.log('\n--- Journal public ---');
    const lines = [...s.publicLog.map(e => ({ at: e.at, txt: `· ${e.text}` })), ...s.chat.filter(m => m.channel === 'public').map(m => ({ at: m.at, txt: `${m.fromName} : ${m.text}` }))];
    for (const m of s.chat.filter(c => c.channel === 'public')) void m;
    // ordre chronologique approximatif : on mêle par jour
    const order = (a: string) => (a.startsWith('N') ? Number(a.slice(1)) * 2 - 1 : a.startsWith('J') ? Number(a.slice(1)) * 2 : 999);
    lines.sort((a, b) => order(a.at) - order(b.at)).forEach(l => console.log(`[${l.at}] ${l.txt}`));
    console.log(`\nRésultat : ${s.winner} — ${s.winReason} (jour ${s.day}, ${steps} pas)`);
  }
  // contrôle anti-fuite : chaque bot n'a reçu que sa vue
  for (const seat of s.seats) playerView(s, seat.id);
  return room;
};

if (process.argv[1] && process.argv[1].includes('simulate')) {
  simulate(Number(process.argv[2] || 9), Number(process.argv[3] || 7));
}
