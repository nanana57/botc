/**
 * Génération des interventions.
 *
 * Le cerveau du bot décide QUOI dire (une « intention » structurée, qui peut répondre à un
 * message précis). Ce module décide COMMENT le dire : formulation locale (gabarits originaux,
 * longueur et registre selon la personnalité), puis, si un fournisseur IA est configuré côté
 * serveur, une reformulation naturelle — qui ne peut ni ajouter de fait, ni changer un nom, un
 * rôle ou un chiffre (validation stricte, retour au gabarit sinon).
 */
import { ROLES, type RoleId } from '../shared/roles';
import type { InfoPayload, PublicSeat, SpeechClaim } from '../shared/types';
import type { Persona } from './personalities';
import type { Observation } from './reasoner';

interface Thread { to?: string; replyTo?: string }

export type Intent =
  | { kind: 'claim'; role: RoleId; info?: InfoPayload; pressured?: boolean } & Thread
  | { kind: 'info'; role: RoleId; info: InfoPayload }
  | { kind: 'accuse'; target: string; reason?: Observation; strength: number; allies?: string[] }
  | { kind: 'defend'; accuser?: string; role?: RoleId; info?: InfoPayload } & Thread
  | { kind: 'deflect'; to: string } & Thread
  | { kind: 'question'; target: string }
  | { kind: 'trust'; target: string }
  | { kind: 'plan'; targets: string[] }
  | { kind: 'death'; victims: string[]; none: boolean }
  | { kind: 'nominate'; target: string; reason?: Observation }
  | { kind: 'slay'; target: string }
  | { kind: 'vote'; target: string; yes: boolean }
  // --- conversation ---
  | { kind: 'agree'; target: string; reason?: Observation } & Thread
  | { kind: 'disagree'; target: string; reason?: string } & Thread
  | { kind: 'contradict'; about: 'my-role' | 'about-me' | 'my-info'; role?: RoleId; detail?: string } & Thread
  | { kind: 'ask-why'; target: string } & Thread
  | { kind: 'explain'; target: string; reason?: Observation } & Thread
  | { kind: 'react-defense'; convinced: boolean } & Thread
  | { kind: 'retract'; target: string; reason?: string; instead?: string }
  | { kind: 'hypothesis'; pair: [string, string]; p: number }
  | { kind: 'ask-support'; target: string } & Thread
  | { kind: 'answer-support'; target: string; yes: boolean } & Thread
  | { kind: 'ally'; target: string } & Thread
  | { kind: 'confirm'; role: RoleId } & Thread
  | { kind: 'hand-change'; target: string; yes: boolean };

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
    case 'retract': return `retract:${i.target}`;
    case 'hypothesis': return `hypothesis:${day}`;
    case 'ally': return `ally:${i.target}`;
    case 'ask-support': return `ask-support:${i.target}:${day}`;
    case 'agree': case 'disagree': return `stance:${i.target}:${day}`;
    case 'ask-why': return `ask-why:${i.to}:${day}`;
    case 'react-defense': return `react:${i.to}:${day}`;
    default: return `${i.kind}:${day}:${'replyTo' in i && i.replyTo ? i.replyTo : Date.now()}`;
  }
};

/** Fil : à qui l'intervention répond. */
export const threadOf = (i: Intent): Thread => ('replyTo' in i || 'to' in i ? { to: (i as Thread).to, replyTo: (i as Thread).replyTo } : {});

/** Sens public (structuré) de l'intervention, attaché au message pour les autres bots. */
export const claimOf = (i: Intent, me: string): SpeechClaim | undefined => {
  switch (i.kind) {
    case 'claim': return { role: i.role, info: i.info };
    case 'info': return { role: i.role, info: i.info };
    case 'defend': return i.role ? { role: i.role, info: i.info, defend: me } : { defend: me };
    case 'accuse': case 'nominate': return { accuse: i.target, because: i.reason?.kind };
    case 'trust': return { trust: i.target };
    case 'question': return { question: i.target };
    case 'agree': return { accuse: i.target, stance: 'agree', because: i.reason?.kind ?? 'accord' };
    case 'disagree': return { trust: i.target, stance: 'disagree' };
    case 'contradict': return i.about === 'my-role' ? { role: i.role, accuse: i.to, stance: 'disagree', because: 'double-claim' } : { stance: 'disagree', accuse: i.about === 'about-me' ? i.to : undefined, because: 'contradiction' };
    case 'explain': return { accuse: i.target, because: i.reason?.kind ?? 'intuition' };
    case 'react-defense': return i.convinced ? { stance: 'agree', trust: i.to } : { stance: 'disagree', accuse: i.to, because: 'défense faible' };
    case 'retract': return i.instead ? { trust: i.target, accuse: i.instead, because: 'revirement' } : { trust: i.target };
    case 'hypothesis': return { pair: i.pair, accuse: i.pair[0], because: 'hypothèse' };
    case 'ask-support': return { support: i.target, accuse: i.target, because: 'nomination' };
    case 'answer-support': return i.yes ? { accuse: i.target, stance: 'agree', because: 'soutien' } : { stance: 'disagree', trust: i.target };
    case 'ally': return { trust: i.target };
    case 'confirm': return { role: i.role, trust: i.to };
    default: return undefined;
  }
};

let counter = 0;
const pickT = (arr: string[], seed: string) => {
  let h = 7;
  for (const c of seed + counter++) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return arr[h % arr.length];
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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

/** Raison énoncée. Les joueurs peu analytiques donnent des raisons d'intuition (parfois fausses). */
export const reasonText = (o: Observation | undefined, target: string, persona: Persona, name: (id: string) => string): string => {
  if (o) {
    switch (o.kind) {
      case 'my-info': return pickT(['mon information va dans ce sens', 'ce que le Conteur m’a montré colle avec ça', 'mes infos de nuit le désignent'], persona.id);
      case 'claim': if (o.label.startsWith(target + ' (')) return pickT(['sa propre annonce ne tient pas debout', 'son récit se contredit avec les autres infos'], persona.id + target);
        return pickT([`l'info de ${o.label} le met en cause`, `si ${o.label} dit vrai, ça le désigne`, `regardez ce qu'a annoncé ${o.label}`, `${o.label} l'a dans son viseur, et ça se tient`], persona.id + o.label);
      case 'double-claim': return `${o.label}, quelqu'un ment`;
      case 'role-switch': return `${target} a changé de version`;
      case 'night-death': return `la mort de ${o.label.replace(/ a été tué la nuit/, '')} l'arrange bien`;
      case 'slayer-miss': return 'le tir raté ne l’innocente pas totalement';
      default: break;
    }
  }
  const t = persona.traits;
  if (t.analytic > 0.7) return pickT([`personne n'a encore confirmé ce que dit ${target}`, `${target} n'apporte rien de vérifiable`], persona.id);
  return pickT([`${target} parle beaucoup sans rien dire`, `je le sens mal, c'est tout`, `${target} évite les questions`, `sa façon de voter me gêne`, `il y a quelque chose qui cloche chez ${target}`], persona.id + target);
};

/** Ouvertures et tics selon la personnalité (registre). */
const voice = (p: Persona, seed: string) => {
  const V: Record<string, string[]> = {
    analytique: ['Si je reprends les faits,', 'Logiquement,', 'Récapitulons :', ''],
    prudent: ['Je peux me tromper, mais', 'Sans certitude,', 'Doucement :', ''],
    agressif: ['Soyons clairs :', 'Assez tourné en rond.', 'Écoute bien :', ''],
    manipulateur: ['Vous ne trouvez pas étrange que', 'Juste une question :', 'Je dis ça comme ça,', ''],
    discret: ['', '', 'Hm.'],
    charismatique: ['Écoutez-moi tous :', 'Rassemblons-nous :', 'Mes amis,', ''],
    opportuniste: ['Bon,', 'Vu comme ça tourne,', 'Franchement,', ''],
    mefiant: ['Je n’y crois pas.', 'Méfiance :', 'Prouvez-le-moi :', ''],
    suiveur: ['Comme d’autres l’ont dit,', 'Je rejoins l’idée générale :', '', ''],
    stratege: ['Pensons à demain :', 'Sur la durée,', 'Pour la suite,', ''],
  };
  return pickT(V[p.id] ?? [''], seed);
};

/** Longueur : un bavard analytique développe ; un discret coupe court. */
const verbose = (p: Persona) => p.traits.talk * 0.5 + p.traits.analytic * 0.3 + p.traits.charisma * 0.2 > 0.55;

/** Majuscule après une fin de phrase, espaces doublés supprimés. */
const tidy = (t: string) => t.replace(/\s{2,}/g, ' ').replace(/([.!?…]\s+)([a-zà-öø-ÿ])/g, (_m, a: string, b: string) => a + b.toUpperCase()).trim();

export const renderTemplate = (i: Intent, persona: Persona, seats: PublicSeat[], meId: string): string => tidy(renderRaw(i, persona, seats, meId));

const renderRaw = (i: Intent, persona: Persona, seats: PublicSeat[], meId: string): string => {
  const name = (id?: string) => seats.find(s => s.id === id)?.name ?? '?';
  const tr = persona.traits;
  const seed = persona.id + meId;
  const long = verbose(persona);
  const terse = persona.id === 'discret' || tr.talk < 0.3;
  const join = (a: string, b?: string) => (b ? `${a} ${cap(b)}` : a);
  switch (i.kind) {
    case 'claim': {
      const r = ROLES[i.role].name;
      const inf = i.info ? describeInfo(i.info, i.role, name) : '';
      if (terse) return `Je suis ${r}${inf ? `. ${cap(inf)}` : ''}.`;
      const open = i.pressured ? pickT(['Puisqu’on me le demande :', 'Très bien, je me découvre :', 'Vous voulez savoir ?'], seed) : voice(persona, seed);
      const tail = long && i.info ? pickT([' Faites-en bon usage.', ' Notez-le, ça compte.', ''], seed) : '';
      return cap(`${open} je suis ${r}${inf ? `, et ${inf}` : ''}.${tail}`.trim());
    }
    case 'info':
      return `${pickT(['Nouvelle info cette nuit :', 'Mise à jour :', 'Cette nuit,'], seed)} ${describeInfo(i.info, i.role, name)}.`;
    case 'accuse': {
      const t = name(i.target);
      const why = reasonText(i.reason, t, persona, name);
      const allies = i.allies?.length ? ` ${i.allies.map(name).join(' et ')} ${i.allies.length > 1 ? 'le pensent' : 'le pense'} aussi.` : '';
      if (terse) return `${t}. ${cap(why)}.`;
      if (tr.aggression > 0.7) return `${t}, je pense que c'est toi. ${cap(why)}.${allies}`;
      if (tr.caution > 0.7) return `Je commence à douter de ${t} : ${why}. Pas une certitude.${allies}`;
      if (persona.id === 'manipulateur') return `Vous ne trouvez pas étrange que ${t} reste si discret ? ${cap(why)}.${allies}`;
      const v0 = voice(persona, seed);
      const body = `mon soupçon va vers ${t} : ${why}.`;
      return join(cap(v0 ? `${v0} ${/[.!?]$/.test(v0) ? cap(body) : body}` : body), allies.trim() || undefined);
    }
    case 'defend': {
      const a = i.accuser ? name(i.accuser) : '';
      const roleBit = i.role ? ` Je suis ${ROLES[i.role].name}${i.info ? ` et ${describeInfo(i.info, i.role, name)}` : ''}.` : '';
      if (terse) return `Ce n'est pas moi.${roleBit}`;
      if (tr.aggression > 0.7) return `${a ? `${a}, ` : ''}tu fais fausse route.${roleBit} Exécuter un bon joueur, c'est offrir la partie au Démon.`;
      if (tr.caution > 0.7) return `${a ? `${a}, ` : ''}je comprends le doute, vraiment.${roleBit} Mais si vous me tuez, le vrai Démon respire.`;
      if (persona.id === 'manipulateur') return `${a ? `Intéressant, ${a}. ` : ''}Pourquoi tant d'empressement à m'accuser ?${roleBit}`;
      return pickT([`${a ? `${a}, je comprends, mais ` : ''}je ne suis pas le Démon.${roleBit}`, `Vous vous trompez de cible.${roleBit} Regardez plutôt qui pousse si fort.`, `Réfléchissez avant de voter.${roleBit}`, `Je l'ai dit et je le répète.${roleBit}`], seed + (i.accuser ?? ''));
    }
    case 'deflect':
      return pickT([`${name(i.to)}, je préfère garder mon rôle pour plus tard.`, `Pas encore, ${name(i.to)}. Ma carte sera plus utile demain.`, `Non, ${name(i.to)}. Le Démon écoute aussi.`], seed);
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
    case 'nominate': {
      const why = reasonText(i.reason, name(i.target), persona, name);
      return terse ? `Je nomme ${name(i.target)}.` : `Je nomme ${name(i.target)}. ${cap(why)}.`;
    }
    case 'slay':
      return `J'utilise mon pouvoir de Pourfendeur sur ${name(i.target)}.`;
    case 'vote':
      return i.yes ? pickT(['Je lève la main.', 'Pour.', 'Je vote pour.'], seed) : '';
    // ------------------------------------------------------------ conversation
    case 'agree': {
      const to = name(i.to); const t = name(i.target);
      if (terse) return pickT([`D'accord avec ${to}.`, `Pareil. ${t}.`, `Oui.`], seed);
      if (persona.id === 'suiveur') return `${to} a raison, ${t} me paraît louche aussi.`;
      if (persona.id === 'opportuniste') return `Bon, si ${to} le dit… ${t}, ça se tient.`;
      if (tr.caution > 0.7) return pickT([`${to} n'a peut-être pas tort sur ${t}.`, `Je commence à pencher comme ${to}.`], seed);
      if (tr.aggression > 0.7) return pickT([`Exactement, ${to}. ${t}, explique-toi.`, `Voilà. ${t}, on t'écoute.`], seed);
      return pickT([`Je suis d’accord avec ${to} sur ${t}${long && i.reason ? ` : ${reasonText(i.reason, t, persona, name)}` : ''}.`,
        `${to} met le doigt sur quelque chose. ${t}, ça ne colle pas.`,
        `Même impression que ${to}.${long ? ` ${t} n'a rien apporté de concret.` : ''}`,
        `On est au moins deux à penser à ${t}, alors.`], seed + t);
    }
    case 'disagree': {
      const to = name(i.to); const t = name(i.target);
      if (terse) return `Non, pas ${t}.`;
      if (tr.aggression > 0.7) return `${to}, tu te trompes complètement. ${t} n'a rien fait de suspect${i.reason ? ` : ${i.reason}` : ''}.`;
      return `${pickT(['Je ne suis pas d’accord,', 'Attends,', 'Là je décroche,'], seed)} ${to}. ${t} me paraît sincère${i.reason ? ` : ${i.reason}` : ''}${long ? '. On perdrait un vote pour rien.' : '.'}`;
    }
    case 'contradict': {
      const to = name(i.to);
      if (i.about === 'my-role') return tr.aggression > 0.6 ? `Menteur, ${to}. ${ROLES[i.role!].name}, c'est moi.` : `${to}, c'est impossible : ${ROLES[i.role!].name}, c'est moi. L'un de nous deux ment, et ce n'est pas moi.`;
      if (i.about === 'about-me') return `Faux, ${to}. ${i.detail ?? 'Ce que tu dis sur moi ne tient pas'}.`;
      return `${to}, ton info ne colle pas avec la mienne${i.detail ? ` : ${i.detail}` : ''}.`;
    }
    case 'ask-why':
      return terse ? `Pourquoi ${name(i.target)} ?` : pickT([`${name(i.to)}, pourquoi ${name(i.target)} ? Tu as un élément concret ?`, `Sur quoi tu te bases, ${name(i.to)} ?`, `${name(i.to)}, explique-nous : qu'est-ce qui te fait dire ça de ${name(i.target)} ?`], seed);
    case 'explain':
      return `${pickT(['Parce que', 'Simple :', 'Je vais te dire :'], seed)} ${reasonText(i.reason, name(i.target), persona, name)}.`;
    case 'react-defense':
      return i.convinced
        ? pickT([`D'accord, ${name(i.to)}, ça se tient. Je retire.`, `Bon. Tu me convaincs, ${name(i.to)}.`, `Admettons. Je lève le pied.`], seed)
        : (terse ? pickT(['Non.', 'Pas convaincu.'], seed) : pickT([`Ça ne me convainc pas, ${name(i.to)}.`, `Belle défense, mais rien de vérifiable.`, `${name(i.to)}, c'est exactement ce que dirait le Démon.`, `Tu réponds à côté, ${name(i.to)}.`], seed + (i.to ?? '')));
    case 'retract':
      if (i.instead) return pickT([`Je change d'avis : ce n'est plus ${name(i.target)} qui m'inquiète, c'est ${name(i.instead)}.`, `Avec ce qu'on a entendu, je lâche ${name(i.target)}. Je regarde ${name(i.instead)} maintenant.`], seed);
      return pickT([`Je reviens sur ce que j'ai dit à propos de ${name(i.target)}${i.reason ? ` : ${i.reason}` : ''}. Je m'étais trompé.`, `Finalement, ${name(i.target)} ne me semble plus suspect${i.reason ? ` (${i.reason})` : ''}.`], seed);
    case 'hypothesis':
      return long ? `Une hypothèse qui circule dans ma tête : ${name(i.pair[0])} et ${name(i.pair[1])} pourraient travailler ensemble. Regardez comme ils se couvrent.` : `${name(i.pair[0])} et ${name(i.pair[1])}… ensemble ? Ça expliquerait beaucoup.`;
    case 'ask-support':
      return `${name(i.to)}, tu me suis sur ${name(i.target)} ? ${pickT(['J’ai besoin de voix.', 'Seul, ça ne passera pas.', ''], seed)}`.trim();
    case 'answer-support':
      return i.yes ? pickT([`Oui, je te suis, ${name(i.to)}.`, `Compte sur moi.`, `Je lèverai la main.`], seed) : pickT([`Non, ${name(i.to)}, pas sur ${name(i.target)}.`, `Désolé, je ne te suis pas là-dessus.`], seed);
    case 'ally':
      return `${name(i.target)}, je crois qu'on est du même côté. ${pickT(['Avançons ensemble.', 'On vote ensemble aujourd’hui ?', 'Je te couvre.'], seed)}`;
    case 'confirm':
      return `${name(i.to)} dit vrai : je suis bien ${ROLES[i.role].name}.`;
    case 'hand-change':
      return i.yes ? pickT(['Finalement, je lève la main.', 'J’ai changé d’avis : pour.'], seed) : pickT(['Je baisse la main, finalement.', 'Non, tout compte fait.'], seed);
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
