/**
 * Génération des interventions.
 *
 * Le cerveau du bot décide QUOI dire (une « intention » structurée). Ce module décide COMMENT le
 * dire : d'abord une formulation locale (gabarits originaux, variés selon la personnalité), puis,
 * si un fournisseur IA est configuré côté serveur, une reformulation naturelle par le modèle de
 * langage — qui ne peut ni ajouter de fait, ni changer de rôle revendiqué (validation stricte,
 * retour au gabarit sinon).
 */
import { ROLES, type RoleId } from '../shared/roles';
import type { InfoPayload, PublicSeat, SpeechClaim } from '../shared/types';
import type { Persona } from './personalities';
import type { Observation } from './reasoner';

export type Intent =
  | { kind: 'claim'; role: RoleId; info?: InfoPayload; pressured?: boolean }
  | { kind: 'info'; role: RoleId; info: InfoPayload }
  | { kind: 'accuse'; target: string; reason?: Observation; strength: number }
  | { kind: 'defend'; accuser?: string; role?: RoleId; info?: InfoPayload }
  | { kind: 'deflect'; to: string }
  | { kind: 'question'; target: string }
  | { kind: 'trust'; target: string }
  | { kind: 'plan'; targets: string[] }
  | { kind: 'death'; victims: string[]; none: boolean }
  | { kind: 'nominate'; target: string; reason?: Observation }
  | { kind: 'slay'; target: string }
  | { kind: 'vote'; target: string; yes: boolean };

export const intentKey = (i: Intent, day: number): string => {
  switch (i.kind) {
    case 'claim': return `claim:${i.role}`;
    case 'info': return `info:${JSON.stringify(i.info)}`;
    case 'accuse': return `accuse:${i.target}:${day}`;
    case 'question': return `question:${i.target}:${day}`;
    case 'trust': return `trust:${i.target}:${day}`;
    case 'plan': return `plan:${day}`;
    case 'death': return `death:${day}`;
    case 'deflect': return `deflect:${i.to}:${day}`;
    default: return `${i.kind}:${day}:${Date.now()}`;
  }
};

/** Sens public (structuré) de l'intervention, attaché au message pour les autres bots. */
export const claimOf = (i: Intent, me: string): SpeechClaim | undefined => {
  switch (i.kind) {
    case 'claim': return { role: i.role, info: i.info };
    case 'info': return { role: i.role, info: i.info };
    case 'defend': return i.role ? { role: i.role, info: i.info, defend: me } : { defend: me };
    case 'accuse': case 'nominate': return { accuse: i.target };
    case 'trust': return { trust: i.target };
    case 'question': return { question: i.target };
    default: return undefined;
  }
};

let counter = 0;
const pickT = (arr: string[], seed: string) => {
  let h = 7;
  for (const c of seed + counter++) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return arr[h % arr.length];
};

export const describeInfo = (info: InfoPayload, role: RoleId, name: (id: string) => string): string => {
  switch (info.kind) {
    case 'number':
      if (role === 'empath') return `j'ai eu ${info.value}${info.players?.length ? ` entre ${info.players.map(name).join(' et ')}` : ''}`;
      return `j'ai eu ${info.value} paire${info.value > 1 ? 's' : ''}`;
    case 'pair-role':
      return info.none ? "il n'y a aucun Étranger en jeu" : `${name(info.players[0])} ou ${name(info.players[1])} est ${ROLES[info.role!].name}`;
    case 'yesno':
      return `${info.players.map(name).join(' et ')} : ${info.value ? "oui, l'un des deux est le Démon" : 'non, aucun Démon'}`;
    case 'role-of':
      return `${name(info.player)} ${role === 'undertaker' ? 'était' : 'est'} ${ROLES[info.role].name}`;
    default:
      return '';
  }
};

const reasonText = (o: Observation | undefined, target: string): string => {
  if (!o) return '';
  switch (o.kind) {
    case 'my-info': return 'mon information va dans ce sens';
    case 'claim': return `l'info de ${o.label} le met en cause`;
    case 'double-claim': return `${o.label}, quelqu'un ment`;
    case 'role-switch': return `${target} a changé de version`;
    case 'slayer-miss': return '';
    default: return '';
  }
};

export const renderTemplate = (i: Intent, persona: Persona, seats: PublicSeat[], meId: string): string => {
  const name = (id: string) => seats.find(s => s.id === id)?.name ?? '?';
  const tr = persona.traits;
  const seed = persona.id + meId;
  switch (i.kind) {
    case 'claim': {
      const r = ROLES[i.role].name;
      const inf = i.info ? describeInfo(i.info, i.role, name) : '';
      const open = tr.aggression > 0.7 ? pickT(['Bon, cartes sur table :', 'Je ne vais pas tourner autour :', 'Écoutez-moi bien :'], seed)
        : tr.caution > 0.7 ? pickT(["Puisqu'il le faut :", 'Je préfère le dire maintenant :', 'Pour être transparent :'], seed)
          : pickT(['', 'Alors,', 'Pour ma part,', 'De mon côté,'], seed);
      return `${open} je suis ${r}${inf ? `, et ${inf}` : ''}.`.replace(/^\s*,?\s*/, '').replace(/^./, c => c.toUpperCase());
    }
    case 'info':
      return `${pickT(['Nouvelle info cette nuit :', 'Mise à jour :', 'Cette nuit,'], seed)} ${describeInfo(i.info, i.role, name)}.`;
    case 'accuse': {
      const t = name(i.target);
      const why = reasonText(i.reason, t);
      if (tr.aggression > 0.7) return `${t}, je pense que c'est toi.${why ? ` ${why[0].toUpperCase() + why.slice(1)}.` : ''}`;
      if (tr.caution > 0.7) return `Je commence à douter de ${t}${why ? ` : ${why}` : ''}. Pas une certitude, mais à surveiller.`;
      if (persona.id === 'manipulateur') return `Vous n'avez pas remarqué ? ${t} reste très discret sur les points importants${why ? ` — et ${why}` : ''}.`;
      return pickT([`${t} me paraît le plus suspect${why ? ` : ${why}` : ''}.`, `Je regarde ${t} de près${why ? `, ${why}` : ''}.`, `Mon soupçon va vers ${t}${why ? ` ; ${why}` : ''}.`], seed);
    }
    case 'defend': {
      const a = i.accuser ? name(i.accuser) : '';
      const roleBit = i.role ? ` Je suis ${ROLES[i.role].name}${i.info ? ` et ${describeInfo(i.info, i.role, name)}` : ''}.` : '';
      if (tr.aggression > 0.7) return `${a ? `${a}, ` : ''}tu fais fausse route.${roleBit} Exécuter un bon joueur, c'est offrir la partie au Démon.`;
      return pickT([`${a ? `${a}, je comprends, mais ` : ''}je ne suis pas le Démon.${roleBit}`, `Vous vous trompez de cible.${roleBit}`, `Réfléchissez avant de voter.${roleBit}`], seed);
    }
    case 'deflect':
      return pickT([`${name(i.to)}, je préfère garder mon rôle pour plus tard.`, `Pas encore, ${name(i.to)}. Je le dirai quand ce sera utile.`, `Patience, ${name(i.to)} : ma carte sera plus utile demain.`], seed);
    case 'question':
      return tr.trust < 0.3 ? `${name(i.target)}, tu n'as toujours rien dit sur ton rôle. Pourquoi ?` : pickT([`${name(i.target)}, tu es quoi, toi ?`, `${name(i.target)}, qu'as-tu appris jusqu'ici ?`, `On n'a pas entendu ${name(i.target)}. Ton rôle ?`], seed);
    case 'trust':
      return pickT([`Je fais plutôt confiance à ${name(i.target)}.`, `${name(i.target)} me semble sincère.`, `Pour moi, ${name(i.target)} est du bon côté.`], seed);
    case 'plan':
      return i.targets.length > 1
        ? pickT([`Je propose un plan : on nomme ${name(i.targets[0])}, et si ça ne passe pas, ${name(i.targets[1])}.`,
          `Organisons-nous : ${name(i.targets[0])} d'abord, ${name(i.targets[1])} ensuite si besoin.`,
          `Pour aujourd'hui, je vois deux noms : ${name(i.targets[0])}, puis ${name(i.targets[1])}.`], seed)
        : `Je propose qu'on se concentre sur ${name(i.targets[0])} aujourd'hui.`;
    case 'death':
      return i.none ? pickT(['Personne n’est mort… le Moine ou le Soldat ont peut-être joué.', 'Une nuit sans mort, ça mérite réflexion.'], seed)
        : pickT([`${i.victims.map(name).join(' et ')} ne se réveillera pas… Qui avait intérêt à ça ?`, `On perd ${i.victims.map(name).join(' et ')}. Le Démon choisit ses cibles : demandons-nous pourquoi.`], seed);
    case 'nominate':
      return `Je nomme ${name(i.target)}.${i.reason ? ` ${reasonText(i.reason, name(i.target))[0]?.toUpperCase() ?? ''}${reasonText(i.reason, name(i.target)).slice(1)}.` : ''}`.replace(/\s\.$/, '');
    case 'slay':
      return `J'utilise mon pouvoir de Pourfendeur sur ${name(i.target)}.`;
    case 'vote':
      return i.yes ? pickT(['Je lève la main.', 'Pour.', 'Je vote pour.'], seed) : '';
  }
};

/** Prompt de reformulation : minimal (coût), sans aucun secret au-delà de ce que le bot dit. */
export const buildRealizePrompt = (text: string, persona: Persona, recent: string[]) => ({
  system: `Tu reformules une réplique d'un joueur dans un jeu de déduction sociale se déroulant dans un village. Style du personnage : ${persona.voice}. Règles : garde EXACTEMENT le même sens, les mêmes noms, les mêmes rôles et les mêmes chiffres ; n'ajoute aucune information ; français oral naturel ; 1 à 2 phrases, 40 mots maximum ; aucune balise, aucune explication.`,
  user: `Derniers échanges :\n${recent.slice(-6).join('\n') || '(aucun)'}\n\nRéplique à reformuler :\n${text}`,
});

/** Vérifie qu'une reformulation conserve les noms et rôles et n'en ajoute pas. */
export const validateRealization = (original: string, candidate: string, seats: PublicSeat[]): boolean => {
  const c = candidate.trim();
  if (!c || c.length > 320 || /[<>{}]|\bIA\b|intelligence artificielle|en tant que/i.test(c)) return false;
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const o = norm(original);
  const k = norm(c);
  for (const s of seats) {
    const n = norm(s.name);
    if (o.includes(n) !== k.includes(n)) return false;
  }
  for (const r of Object.values(ROLES)) {
    const n = norm(r.name);
    if (o.includes(n) !== k.includes(n)) return false;
  }
  const digits = (s: string) => (s.match(/\d/g) || []).join('');
  return digits(o) === digits(k);
};
