/**
 * Conteur automatique — voix et rythme.
 *
 * Le Conteur automatique ne décide d'AUCUNE règle : les résultats viennent du moteur et les
 * choix laissés au Conteur sont tranchés par la politique du moteur (options valides).
 * Ce module ne fait que mettre en scène : annonces d'ambiance et minutage des phases.
 */
import type { GameState, PublicEvent } from '../shared/types';

const pick = (arr: string[], seed: number) => arr[Math.abs(seed) % arr.length];

export const STORYTELLER_NAME = 'Le Conteur';

export const narrate = (s: GameState, e: PublicEvent): string | null => {
  const seed = s.publicLog.length + s.day;
  switch (e.kind) {
    case 'phase':
      if (s.phase === 'night' && s.day === 1) return pick(['Les volets se ferment, les lanternes s’éteignent une à une. Que chacun regagne sa chaumière.', 'La brume monte du marais. Première nuit : fermez les yeux, je passe de porte en porte.'], seed);
      if (s.phase === 'night') return pick(['Le glas sonne. Le village retient son souffle et s’endort.', 'La nuit retombe, plus lourde que la veille. Fermez les yeux.'], seed);
      if (s.phase === 'day') return pick(['Les coqs se taisent trop tôt ce matin. Venez sur la place.', 'L’aube est grise. Rassemblez-vous autour du puits.'], seed);
      return null;
    case 'death':
      return null;
    case 'execution':
      return /Personne/.test(e.text) ? 'La corde reste vide ce soir.' : pick(['La foule se disperse en silence.', 'Le village a tranché. Puisse-t-il avoir eu raison.'], seed);
    case 'win':
      return e.text.startsWith('Le Bien') ? 'Les cloches sonnent à toute volée : le mal a quitté le village.' : 'Les lanternes s’éteignent pour de bon. Le village appartient désormais aux ombres.';
    default:
      return null;
  }
};

/** Délais du Conteur automatique (ms). */
export const PACE = {
  botNightThink: [1200, 2800] as const,
  defenseHuman: 18000,
  defenseBot: 9000,
  voteStep: 1300,
  afterVirgin: 6000,
  botGap: 3200,
};
