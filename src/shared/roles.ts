/**
 * Données de rôles — script « Trouble Brewing » (règles du jeu Blood on the Clocktower).
 *
 * IMPORTANT (droits) : les textes de capacité ci-dessous sont des reformulations originales
 * écrites pour ce projet, pas les textes officiels de The Pandemonium Institute. Aucune
 * illustration officielle n'est utilisée : les emblèmes sont des SVG originaux (src/client/components/Sigil.tsx).
 * Les noms de rôles sont isolés ici pour pouvoir être remplacés facilement (voir docs/LEGAL.md).
 */

export type Team = 'townsfolk' | 'outsider' | 'minion' | 'demon';
export type Alignment = 'good' | 'evil';

export type RoleId =
  | 'washerwoman' | 'librarian' | 'investigator' | 'chef' | 'empath' | 'fortuneteller'
  | 'undertaker' | 'monk' | 'ravenkeeper' | 'virgin' | 'slayer' | 'soldier' | 'mayor'
  | 'butler' | 'drunk' | 'recluse' | 'saint'
  | 'poisoner' | 'spy' | 'scarletwoman' | 'baron'
  | 'imp';

/** Type de réveil nocturne : 'info' = reçoit une info, 'choose' = choisit des joueurs. */
export type NightKind = 'info' | 'choose' | 'chooseInfo' | 'grimoire' | 'passive';

export interface RoleDef {
  id: RoleId;
  name: string;
  team: Team;
  /** Reformulation originale de la capacité. */
  ability: string;
  /** Rappel court affiché sur le jeton. */
  short: string;
  /** Rang dans l'ordre de la première nuit (0 = ne se réveille pas). */
  firstNight: number;
  /** Rang dans l'ordre des nuits suivantes (0 = ne se réveille pas). */
  otherNight: number;
  nightKind?: NightKind;
  /** Nombre de joueurs à désigner la nuit. */
  targets?: number;
  /** Peut se désigner soi-même. */
  allowSelf?: boolean;
  /** Ne peut désigner qu'un joueur vivant. */
  aliveOnly?: boolean;
  /** Le rôle produit-il une information (utile pour l'IA et le Mathématicien futur). */
  givesInfo?: boolean;
  /** Emblème (identifiant interne du sigil SVG original). */
  sigil: string;
}

const R = (d: RoleDef) => d;

export const ROLES: Record<RoleId, RoleDef> = {
  washerwoman: R({ id: 'washerwoman', name: 'Lavandière', team: 'townsfolk', sigil: 'basin', givesInfo: true,
    ability: "Au premier soir, on te montre deux joueurs : l'un d'eux porte un rôle de Villageois précis, que l'on te nomme.",
    short: 'Deux joueurs, un Villageois', firstNight: 20, otherNight: 0, nightKind: 'info' }),
  librarian: R({ id: 'librarian', name: 'Bibliothécaire', team: 'townsfolk', sigil: 'book', givesInfo: true,
    ability: "Au premier soir, on te montre deux joueurs : l'un d'eux est un Étranger précis. S'il n'y a aucun Étranger, tu l'apprends.",
    short: 'Deux joueurs, un Étranger', firstNight: 21, otherNight: 0, nightKind: 'info' }),
  investigator: R({ id: 'investigator', name: 'Enquêteur', team: 'townsfolk', sigil: 'lens', givesInfo: true,
    ability: "Au premier soir, on te montre deux joueurs : l'un d'eux est un Sbire précis.",
    short: 'Deux joueurs, un Sbire', firstNight: 22, otherNight: 0, nightKind: 'info' }),
  chef: R({ id: 'chef', name: 'Chef', team: 'townsfolk', sigil: 'ladle', givesInfo: true,
    ability: 'Au premier soir, tu apprends combien de paires de joueurs maléfiques sont assises côte à côte.',
    short: 'Paires maléfiques voisines', firstNight: 23, otherNight: 0, nightKind: 'info' }),
  empath: R({ id: 'empath', name: 'Empathe', team: 'townsfolk', sigil: 'heart', givesInfo: true,
    ability: 'Chaque nuit, tu apprends combien de tes deux voisins vivants les plus proches sont maléfiques.',
    short: 'Voisins vivants maléfiques', firstNight: 24, otherNight: 40, nightKind: 'info' }),
  fortuneteller: R({ id: 'fortuneteller', name: 'Voyante', team: 'townsfolk', sigil: 'orb', givesInfo: true,
    ability: "Chaque nuit, désigne deux joueurs : tu apprends si l'un d'eux est le Démon. Un joueur bon, choisi en secret, se fait passer pour le Démon à tes yeux.",
    short: 'Deux joueurs : Démon ?', firstNight: 25, otherNight: 41, nightKind: 'chooseInfo', targets: 2, allowSelf: true }),
  undertaker: R({ id: 'undertaker', name: 'Fossoyeur', team: 'townsfolk', sigil: 'spade', givesInfo: true,
    ability: "Chaque nuit sauf la première, tu apprends le rôle du joueur exécuté aujourd'hui.",
    short: "Rôle de l'exécuté", firstNight: 0, otherNight: 42, nightKind: 'info' }),
  monk: R({ id: 'monk', name: 'Moine', team: 'townsfolk', sigil: 'hands',
    ability: 'Chaque nuit sauf la première, désigne un autre joueur : le Démon ne peut pas lui nuire cette nuit.',
    short: 'Protège du Démon', firstNight: 0, otherNight: 12, nightKind: 'choose', targets: 1, aliveOnly: true }),
  ravenkeeper: R({ id: 'ravenkeeper', name: 'Gardien des corbeaux', team: 'townsfolk', sigil: 'raven', givesInfo: true,
    ability: 'Si tu meurs pendant la nuit, tu te réveilles pour désigner un joueur et apprendre son rôle.',
    short: 'Mort la nuit : un rôle', firstNight: 0, otherNight: 30, nightKind: 'chooseInfo', targets: 1, allowSelf: true }),
  virgin: R({ id: 'virgin', name: 'Vierge', team: 'townsfolk', sigil: 'lily',
    ability: "La première fois qu'on te nomme, si l'auteur de la nomination est un Villageois, il est exécuté sur-le-champ.",
    short: 'Première nomination', firstNight: 0, otherNight: 0 }),
  slayer: R({ id: 'slayer', name: 'Pourfendeur', team: 'townsfolk', sigil: 'arrow',
    ability: "Une fois par partie, de jour et publiquement, désigne un joueur : s'il est le Démon, il meurt.",
    short: 'Un tir, de jour', firstNight: 0, otherNight: 0 }),
  soldier: R({ id: 'soldier', name: 'Soldat', team: 'townsfolk', sigil: 'shield',
    ability: 'Le Démon ne peut pas te nuire.', short: 'Insensible au Démon', firstNight: 0, otherNight: 0 }),
  mayor: R({ id: 'mayor', name: 'Maire', team: 'townsfolk', sigil: 'seal',
    ability: "S'il ne reste que trois joueurs vivants et qu'aucune exécution n'a lieu, ton camp gagne. Si tu meurs la nuit, un autre joueur peut mourir à ta place.",
    short: 'Victoire à trois', firstNight: 0, otherNight: 0 }),
  butler: R({ id: 'butler', name: 'Majordome', team: 'outsider', sigil: 'key',
    ability: "Chaque nuit, désigne un joueur (pas toi) comme Maître : demain, tu ne peux voter que si ton Maître vote aussi.",
    short: 'Vote après son Maître', firstNight: 30, otherNight: 50, nightKind: 'choose', targets: 1, aliveOnly: true }),
  drunk: R({ id: 'drunk', name: 'Ivrogne', team: 'outsider', sigil: 'tankard',
    ability: "Tu ignores que tu es l'Ivrogne : tu crois porter un rôle de Villageois, mais ta capacité ne fonctionne pas.",
    short: 'Croit être Villageois', firstNight: 0, otherNight: 0 }),
  recluse: R({ id: 'recluse', name: 'Reclus', team: 'outsider', sigil: 'lantern',
    ability: "Tu peux être perçu comme maléfique, voire comme un Sbire ou le Démon, même après ta mort.",
    short: 'Peut paraître maléfique', firstNight: 0, otherNight: 0 }),
  saint: R({ id: 'saint', name: 'Sainte', team: 'outsider', sigil: 'halo',
    ability: 'Si tu meurs exécutée, ton camp perd la partie.', short: 'Exécutée : le Bien perd', firstNight: 0, otherNight: 0 }),
  poisoner: R({ id: 'poisoner', name: 'Empoisonneur', team: 'minion', sigil: 'vial',
    ability: "Chaque nuit, désigne un joueur : il est empoisonné cette nuit et le jour suivant.",
    short: 'Empoisonne', firstNight: 10, otherNight: 10, nightKind: 'choose', targets: 1, allowSelf: true, aliveOnly: true }),
  spy: R({ id: 'spy', name: 'Espion', team: 'minion', sigil: 'eye',
    ability: 'Chaque nuit, tu consultes le Grimoire. Tu peux être perçu comme bon, voire comme Villageois ou Étranger, même après ta mort.',
    short: 'Lit le Grimoire', firstNight: 60, otherNight: 60, nightKind: 'grimoire' }),
  scarletwoman: R({ id: 'scarletwoman', name: 'Femme écarlate', team: 'minion', sigil: 'veil',
    ability: "S'il reste au moins cinq joueurs vivants quand le Démon meurt, tu deviens le Démon.",
    short: 'Hérite du Démon', firstNight: 0, otherNight: 0 }),
  baron: R({ id: 'baron', name: 'Baron', team: 'minion', sigil: 'crown',
    ability: 'Ta présence ajoute deux Étrangers à la partie, à la place de deux Villageois.',
    short: '+2 Étrangers', firstNight: 0, otherNight: 0 }),
  imp: R({ id: 'imp', name: 'Diablotin', team: 'demon', sigil: 'horns',
    ability: "Chaque nuit sauf la première, désigne un joueur : il meurt. Si tu te désignes toi-même, tu meurs et un Sbire devient le Diablotin.",
    short: 'Tue chaque nuit', firstNight: 0, otherNight: 20, nightKind: 'choose', targets: 1, allowSelf: true, aliveOnly: true }),
};

export const TEAM_LABEL: Record<Team, string> = {
  townsfolk: 'Villageois', outsider: 'Étranger', minion: 'Sbire', demon: 'Démon',
};

export const alignmentOfTeam = (t: Team): Alignment => (t === 'minion' || t === 'demon' ? 'evil' : 'good');

export interface ScriptDef {
  id: string;
  name: string;
  tagline: string;
  difficulty: 1 | 2 | 3;
  roles: RoleId[];
  /** false = script listé mais pas encore pris en charge par le moteur. */
  supported: boolean;
}

export const SCRIPTS: ScriptDef[] = [
  {
    id: 'tb', name: 'Trouble Brewing', tagline: 'Le script fondateur : informations franches, mensonges subtils.', difficulty: 1, supported: true,
    roles: ['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller', 'undertaker', 'monk', 'ravenkeeper',
      'virgin', 'slayer', 'soldier', 'mayor', 'butler', 'drunk', 'recluse', 'saint', 'poisoner', 'spy', 'scarletwoman', 'baron', 'imp'],
  },
  { id: 'bmr', name: 'Bad Moon Rising', tagline: 'Morts multiples et protections nocturnes.', difficulty: 2, supported: false, roles: [] },
  { id: 'snv', name: 'Sects & Violets', tagline: 'Folie, métamorphoses et informations troubles.', difficulty: 3, supported: false, roles: [] },
];

/** Répartition officielle par nombre de joueurs : [villageois, étrangers, sbires, démons]. */
export const DISTRIBUTION: Record<number, [number, number, number, number]> = {
  5: [3, 0, 1, 1], 6: [3, 1, 1, 1], 7: [5, 0, 1, 1], 8: [5, 1, 1, 1], 9: [5, 2, 1, 1],
  10: [7, 0, 2, 1], 11: [7, 1, 2, 1], 12: [7, 2, 2, 1], 13: [9, 0, 3, 1], 14: [9, 1, 3, 1], 15: [9, 2, 3, 1],
};

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;

/** Retrouve un rôle à partir d'un texte libre (« je suis l'empathe »). */
export const ROLE_ALIASES: Array<[RegExp, RoleId]> = [
  [/lavandi[eè]re|washer/i, 'washerwoman'], [/biblioth[eé]caire|librar/i, 'librarian'], [/enqu[eê]teu|investig/i, 'investigator'],
  [/\bchef\b|cuisini/i, 'chef'], [/empath/i, 'empath'], [/voyante|diseuse|fortune/i, 'fortuneteller'], [/fossoyeu|croque.?mort|undertaker/i, 'undertaker'],
  [/\bmoine\b|\bmonk\b/i, 'monk'], [/corbeau|ravenkeeper/i, 'ravenkeeper'], [/vierge|virgin/i, 'virgin'], [/pourfendeu|slayer|tueur de d/i, 'slayer'],
  [/soldat|soldier/i, 'soldier'], [/\bmaire\b|mayor/i, 'mayor'], [/majordome|butler/i, 'butler'], [/ivrogne|drunk/i, 'drunk'],
  [/reclus|recluse/i, 'recluse'], [/\bsainte?\b/i, 'saint'], [/empoisonneu|poisoner/i, 'poisoner'], [/espion|\bspy\b/i, 'spy'],
  [/[eé]carlate|scarlet/i, 'scarletwoman'], [/\bbaron\b/i, 'baron'], [/diablotin|\bimp\b/i, 'imp'],
];

export const findRoleInText = (text: string): RoleId | null => {
  for (const [re, id] of ROLE_ALIASES) if (re.test(text)) return id;
  return null;
};
