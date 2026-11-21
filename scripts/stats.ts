/**
 * Statistiques de comportement sur plusieurs parties simulées (sans API).
 * Usage : npx tsx scripts/stats.ts [nbParties] [nbJoueurs]
 */
import { simulate } from './simulate';

export const behaviourStats = async (games = 8, n = 9, firstSeed = 100) => {
  const agg: Record<string, number> = {};
  const add = (k: string, v = 1) => { agg[k] = (agg[k] || 0) + v; };
  const winners: string[] = [];
  for (let g = 0; g < games; g++) {
    const room = await simulate({ n, seed: firstSeed + g }, undefined, false);
    winners.push(room.state.winner ?? '?');
    const chat = room.state.chat.filter(m => m.channel === 'public' && m.bot);
    const ids = new Set(chat.map(m => m.id));
    add('messages de bots', chat.length);
    add('réponses à un autre bot', chat.filter(m => m.replyTo && ids.has(m.replyTo)).length);
    for (const m of chat) add(`intention:${m.intent}`);
    add('nominations par des bots', room.trace.filter(e => e.kind === 'nomination').length);
    add('changements de vote', room.trace.filter(e => e.kind === 'vote:changement').length);
    add('défenses jugées convaincantes', chat.filter(m => m.intent === 'react-defense' && m.claim?.stance === 'agree').length);
    add('jours joués', room.state.day);
  }
  return { agg, winners };
};

if (process.argv[1] && process.argv[1].includes('stats')) {
  behaviourStats(Number(process.argv[2] || 8), Number(process.argv[3] || 9)).then(({ agg, winners }) => {
    console.log(Object.entries(agg).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.padEnd(34)} ${v}`).join('\n'));
    console.log(`\nVictoires : Bien ${winners.filter(w => w === 'good').length} · Mal ${winners.filter(w => w === 'evil').length}`);
  });
}
