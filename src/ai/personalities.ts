/**
 * Personnalités des joueurs IA.
 *
 * Chaque profil est un vecteur de traits numériques (0 → 1) utilisé PAR LES DÉCISIONS
 * (seuils de nomination, de vote, confiance accordée aux revendications, moment de révéler son
 * rôle, choix de bluff…), pas seulement par le style de langage. Le style (`voice`) ne sert
 * qu'à la formulation des phrases.
 */
export interface Traits {
  /** Fréquence de prise de parole. */
  talk: number;
  /** Propension à accuser / nommer (abaisse les seuils). */
  aggression: number;
  /** Prudence : relève les seuils, évite les votes risqués. */
  caution: number;
  /** Poids accordé aux revendications des autres (confiance). */
  trust: number;
  /** Suit l'avis du groupe (mains levées, accusations des autres). */
  follow: number;
  /** Rigueur analytique : se fie au modèle logique plutôt qu'à l'intuition. */
  analytic: number;
  /** Talent et goût pour le mensonge (bluffs riches, fausses infos). */
  deception: number;
  /** Goût du risque (tir du Pourfendeur, transmission du Démon, votes fantômes). */
  risk: number;
  /** Influence : propose des plans, fédère. */
  charisma: number;
  /** Jour où le joueur révèle volontiers son rôle (1 = d'emblée, 3 = tard). */
  claimDay: number;
  /** Opportunisme : rejoint les majorités qui vont passer. */
  opportunism: number;
}

export interface Persona {
  id: string;
  label: string;
  summary: string;
  traits: Traits;
  /** Indications de style pour la formulation (jamais pour les décisions). */
  voice: string;
}

const P = (p: Persona) => p;

export const PERSONAS: Persona[] = [
  P({ id: 'analytique', label: 'Analytique', summary: 'Raisonne sur les faits, recoupe chaque information, accuse sur preuves.',
    voice: 'phrases posées, raisonnement explicite, chiffres et noms précis',
    traits: { talk: 0.6, aggression: 0.4, caution: 0.55, trust: 0.6, follow: 0.15, analytic: 0.95, deception: 0.4, risk: 0.35, charisma: 0.45, claimDay: 1, opportunism: 0.2 } }),
  P({ id: 'prudent', label: 'Prudent', summary: 'Garde ses cartes, vote rarement, ne tranche que sur certitude.',
    voice: 'nuancé, conditionnel, demande des confirmations',
    traits: { talk: 0.4, aggression: 0.2, caution: 0.9, trust: 0.45, follow: 0.3, analytic: 0.7, deception: 0.3, risk: 0.1, charisma: 0.3, claimDay: 2, opportunism: 0.25 } }),
  P({ id: 'agressif', label: 'Agressif', summary: 'Met la pression, nomme tôt, pousse aux exécutions.',
    voice: 'direct, tranchant, interpelle par le prénom',
    traits: { talk: 0.85, aggression: 0.95, caution: 0.15, trust: 0.35, follow: 0.25, analytic: 0.45, deception: 0.55, risk: 0.8, charisma: 0.6, claimDay: 1, opportunism: 0.4 } }),
  P({ id: 'manipulateur', label: 'Manipulateur', summary: 'Oriente les débats, sème le doute, bluffe volontiers même dans le Bien.',
    voice: 'insinuant, questions rhétoriques, flatte puis pique',
    traits: { talk: 0.7, aggression: 0.55, caution: 0.4, trust: 0.4, follow: 0.2, analytic: 0.6, deception: 0.95, risk: 0.6, charisma: 0.75, claimDay: 2, opportunism: 0.7 } }),
  P({ id: 'discret', label: 'Discret', summary: 'Observe beaucoup, parle peu, frappe juste.',
    voice: 'très bref, une idée par intervention',
    traits: { talk: 0.2, aggression: 0.35, caution: 0.6, trust: 0.5, follow: 0.35, analytic: 0.75, deception: 0.5, risk: 0.3, charisma: 0.2, claimDay: 3, opportunism: 0.3 } }),
  P({ id: 'charismatique', label: 'Charismatique', summary: 'Prend la parole, propose des plans de vote, rassemble.',
    voice: 'chaleureux, fédérateur, propose des plans',
    traits: { talk: 0.8, aggression: 0.55, caution: 0.4, trust: 0.65, follow: 0.1, analytic: 0.55, deception: 0.6, risk: 0.5, charisma: 0.95, claimDay: 1, opportunism: 0.35 } }),
  P({ id: 'opportuniste', label: 'Opportuniste', summary: 'Suit le vent, rejoint les majorités, change de camp sans état d’âme.',
    voice: 'souple, rebondit sur les autres, change d’avis',
    traits: { talk: 0.55, aggression: 0.45, caution: 0.35, trust: 0.5, follow: 0.7, analytic: 0.35, deception: 0.7, risk: 0.45, charisma: 0.4, claimDay: 2, opportunism: 0.95 } }),
  P({ id: 'mefiant', label: 'Méfiant', summary: 'Doute de tout, exige des preuves, se fie surtout à ses propres infos.',
    voice: 'sceptique, pointe les incohérences',
    traits: { talk: 0.6, aggression: 0.6, caution: 0.55, trust: 0.15, follow: 0.05, analytic: 0.7, deception: 0.35, risk: 0.4, charisma: 0.35, claimDay: 2, opportunism: 0.15 } }),
  P({ id: 'suiveur', label: 'Suiveur', summary: 'Fait confiance aux voix fortes, vote avec le groupe.',
    voice: 'approuve, reprend les arguments des autres',
    traits: { talk: 0.45, aggression: 0.25, caution: 0.45, trust: 0.8, follow: 0.95, analytic: 0.25, deception: 0.25, risk: 0.3, charisma: 0.15, claimDay: 1, opportunism: 0.6 } }),
  P({ id: 'stratege', label: 'Stratège', summary: 'Pense plusieurs coups à l’avance : gère le tempo, choisit ses cibles.',
    voice: 'calme, parle de plans sur plusieurs jours',
    traits: { talk: 0.55, aggression: 0.5, caution: 0.6, trust: 0.55, follow: 0.15, analytic: 0.85, deception: 0.8, risk: 0.55, charisma: 0.7, claimDay: 2, opportunism: 0.3 } }),
];

export const personaById = (id?: string): Persona => PERSONAS.find(p => p.id === id) ?? PERSONAS[0];

export const BOT_NAMES = ['Aldric', 'Bérangère', 'Corentin', 'Domitille', 'Éloi', 'Fantine', 'Gaspard', 'Hortense', 'Ignace',
  'Joséphine', 'Lazare', 'Mahaut', 'Néréé', 'Ombeline', 'Prosper', 'Quitterie', 'Romuald', 'Séraphine', 'Thibault', 'Ursule'];
