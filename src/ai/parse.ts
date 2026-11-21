/**
 * Extraction du sens public d'un message humain (revendication de rôle, info chiffrée,
 * accusation, confiance, question). Analyse locale, sans appel API. Le résultat est attaché au
 * message et devient lisible par tous les bots — c'est l'équivalent de ce que chacun entend.
 */
import { findRoleInText, ROLES, type RoleId } from '../shared/roles';
import type { InfoPayload, PublicSeat, SpeechClaim } from '../shared/types';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const findNames = (text: string, seats: PublicSeat[], exclude?: string): string[] => {
  const t = ` ${norm(text)} `;
  return seats
    .filter(s => s.id !== exclude)
    .map(s => ({ s, i: t.search(new RegExp(`[^a-z0-9]${norm(s.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z0-9]`)) }))
    .filter(x => x.i >= 0)
    .sort((a, b) => a.i - b.i)
    .map(x => x.s.id);
};

const NUM: Record<string, number> = { zero: 0, aucun: 0, aucune: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4 };

export const parseHumanMessage = (text: string, seats: PublicSeat[], fromId: string, neighbours: string[] = []): SpeechClaim | undefined => {
  const t = norm(text);
  const claim: SpeechClaim = {};
  const names = findNames(text, seats, fromId);
  // « je suis (le|la|l') X », « je suis X », « moi c'est X »
  const m = /(je suis|moi c'est|mon role (c'est|est)|je joue)\s+(l'|le |la |un |une )?([a-z' -]{3,30})/.exec(t);
  if (m) {
    const r = findRoleInText(m[4]);
    if (r) claim.role = r;
  }
  const role: RoleId | undefined = claim.role;
  // Info chiffrée : « j'ai eu 1 », « j'ai un 2 », « mon chiffre est 0 »
  const num = /(j'ai eu|j'ai|mon chiffre (est|c'est)|j'ai recu|j'ai vu)\s+(un |une |le )?(\d|zero|aucun|aucune|un|une|deux|trois|quatre)\b/.exec(t);
  if (num && role && (role === 'empath' || role === 'chef')) {
    const v = /\d/.test(num[4]) ? Number(num[4]) : NUM[num[4]];
    const info: InfoPayload = role === 'empath' ? { kind: 'number', value: v, players: neighbours } : { kind: 'number', value: v };
    claim.info = info;
  }
  // Voyante : « X et Y : non / oui »
  if (role === 'fortuneteller' && names.length >= 2 && /(oui|non|pas le demon|demon)/.test(t)) {
    claim.info = { kind: 'yesno', value: /\boui\b/.test(t) || (/demon/.test(t) && !/(pas|non|aucun)/.test(t)), players: names.slice(0, 2) };
  }
  // Lavandière / Bibliothécaire / Enquêteur : « X ou Y est (le|la) R »
  if (role && ['washerwoman', 'librarian', 'investigator'].includes(role) && names.length >= 2) {
    const r2 = findRoleInText(t.replace(/je suis[^,.;:!?]*/, ''));
    if (r2 && r2 !== role) claim.info = { kind: 'pair-role', players: [names[0], names[1]], role: r2 };
  }
  // Fossoyeur / Gardien des corbeaux : « X était (le|la) R »
  if (role && ['undertaker', 'ravenkeeper'].includes(role) && names.length >= 1) {
    const r2 = findRoleInText(t.replace(/je suis[^,.;:!?]*/, ''));
    if (r2 && r2 !== role) claim.info = { kind: 'role-of', player: names[0], role: r2 };
  }
  // Accusation / confiance / question
  if (names.length) {
    if (/(soupconne|suspect|accuse|c'est (le|lui|elle)|demon|ment|menteur|menteuse|louche|mauvais|evil|mal\b|vote contre|nomme)/.test(t) && !claim.info) claim.accuse = names[0];
    else if (/(confiance|innocent|je crois|il est bon|elle est bonne|clean|je le crois|je la crois)/.test(t)) claim.trust = names[0];
    if (/\?/.test(text) && /(qui es|ton role|tu es quoi|t'es quoi|tu as eu|ton info|tu joues)/.test(t)) claim.question = names[0];
  }
  return Object.keys(claim).length ? claim : undefined;
};

export const roleName = (r: RoleId) => ROLES[r].name;
