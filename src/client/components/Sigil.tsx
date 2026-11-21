/**
 * Emblèmes ORIGINAUX des rôles, dessinés pour ce projet (style gravure au trait).
 * Aucun rapport avec les illustrations officielles.
 */
import type { ReactNode } from 'react';

const P: Record<string, ReactNode> = {
  basin: <><path d="M9 22h30l-3 11a6 6 0 0 1-6 4H18a6 6 0 0 1-6-4z" /><path d="M14 22c2-4 5-6 10-6s8 2 10 6" /><path d="M18 30c3 2 9 2 12 0" opacity=".6" /><path d="M24 10v3M20 11l1 2M28 11l-1 2" /></>,
  book: <><path d="M8 13c5-2 11-2 16 2 5-4 11-4 16-2v22c-5-2-11-2-16 2-5-4-11-4-16-2z" /><path d="M24 15v22" /><path d="M12 19c3-1 6-1 8 1M12 24c3-1 6-1 8 1M28 20c2-2 5-2 8-1M28 25c2-2 5-2 8-1" opacity=".6" /></>,
  lens: <><circle cx="20" cy="20" r="9" /><path d="M27 27l11 11" strokeWidth="3" /><path d="M15 17a6 6 0 0 1 5-3" opacity=".6" /></>,
  ladle: <><path d="M30 8c-1 9-3 15-7 19" /><path d="M14 27a9 9 0 0 0 18 0z" /><path d="M14 27h18" /><path d="M10 40h28" opacity=".5" /></>,
  heart: <><path d="M24 38s-13-8-13-17a7 7 0 0 1 13-3 7 7 0 0 1 13 3c0 9-13 17-13 17z" /><path d="M8 24h6l2-4 3 8 2-4h6" opacity=".7" /></>,
  orb: <><circle cx="24" cy="21" r="11" /><path d="M16 37h16l-3-5H19z" /><path d="M19 17a6 6 0 0 1 6-3" opacity=".6" /><path d="M24 15v2M21 22l2 1 3-2" opacity=".6" /></>,
  spade: <><path d="M24 7v26" /><path d="M17 30h14l-2 9h-10z" /><path d="M20 7h8" /><path d="M10 41c5-3 23-3 28 0" opacity=".5" /></>,
  hands: <><path d="M17 38V23l4-11 2 1-1 10" /><path d="M31 38V23l-4-11-2 1 1 10" /><path d="M21 23c1 3 5 3 6 0" /><circle cx="24" cy="9" r="2.5" opacity=".7" /></>,
  raven: <><path d="M10 30c6 0 9-3 11-8 2-5 6-8 11-8l5 2-4 2c1 6-3 13-11 15l-6 6v-5l-6-4z" /><circle cx="31" cy="17" r="1" fill="currentColor" /><path d="M20 32l-4 6M24 31l-1 7" opacity=".6" /></>,
  lily: <><path d="M24 40V22" /><path d="M24 22c-6-1-9-7-8-13 4 2 7 6 8 13z" /><path d="M24 22c6-1 9-7 8-13-4 2-7 6-8 13z" /><path d="M24 22c-2-5-1-10 0-14 1 4 2 9 0 14z" /><path d="M24 33c-4-1-7 0-9 3M24 30c3-2 6-2 9 0" opacity=".6" /></>,
  arrow: <><path d="M10 38L36 12" /><path d="M36 12l-8 1M36 12l-1 8" /><path d="M14 34l-4-1M14 34l1 4M17 31l-4-1M17 31l1 4" opacity=".7" /></>,
  shield: <><path d="M24 7l13 5v10c0 9-6 15-13 19-7-4-13-10-13-19V12z" /><path d="M24 12v24M15 21h18" opacity=".6" /></>,
  seal: <><circle cx="24" cy="24" r="13" /><circle cx="24" cy="24" r="8" opacity=".6" /><path d="M20 22l4-4 4 4M20 26h8" /><path d="M14 36l-3 6 5-2 2 4 2-6M34 36l3 6-5-2-2 4-2-6" opacity=".6" /></>,
  key: <><circle cx="16" cy="16" r="7" /><circle cx="16" cy="16" r="2.5" opacity=".6" /><path d="M21 21l17 17M32 32l-4 4M36 36l-3 3" /></>,
  tankard: <><path d="M12 14h18v22a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z" /><path d="M30 18h4a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4h-4" /><path d="M11 14c0-4 4-6 8-4 2-3 8-3 9 1 3 0 3 3 2 4" opacity=".7" /><path d="M17 20v13M24 20v13" opacity=".5" /></>,
  lantern: <><path d="M18 14h12l2 4v14l-2 4H18l-2-4V18z" /><path d="M20 10h8M24 6v4" /><path d="M24 20c-3 3-3 7 0 9 3-2 3-6 0-9z" opacity=".8" /><path d="M16 40h16" opacity=".5" /></>,
  halo: <><ellipse cx="24" cy="11" rx="9" ry="3" /><circle cx="24" cy="22" r="5" /><path d="M15 40c0-7 4-11 9-11s9 4 9 11" /></>,
  vial: <><path d="M20 7h8M21 7v9l-8 15a6 6 0 0 0 5 9h12a6 6 0 0 0 5-9l-8-15V7" /><path d="M15 30h18" opacity=".6" /><circle cx="21" cy="35" r="1.3" /><circle cx="27" cy="33" r="1" /></>,
  eye: <><path d="M6 24s7-11 18-11 18 11 18 11-7 11-18 11S6 24 6 24z" /><circle cx="24" cy="24" r="5" /><circle cx="24" cy="24" r="1.5" fill="currentColor" /><path d="M24 8v3M14 10l2 3M34 10l-2 3" opacity=".6" /></>,
  veil: <><path d="M24 7c-8 0-12 7-12 15 0 6 2 12 2 18h20c0-6 2-12 2-18 0-8-4-15-12-15z" /><path d="M19 21c2 1 3 1 5 0 2 1 3 1 5 0" /><path d="M18 30c4 2 8 2 12 0" opacity=".6" /><path d="M24 34v6" opacity=".6" /></>,
  crown: <><path d="M10 34l-2-18 8 7 8-12 8 12 8-7-2 18z" /><path d="M10 38h28" /><circle cx="24" cy="27" r="2" /></>,
  horns: <><path d="M16 22c-6-2-8-8-7-14 3 4 6 6 10 7" /><path d="M32 22c6-2 8-8 7-14-3 4-6 6-10 7" /><path d="M15 24c0-5 4-9 9-9s9 4 9 9c0 7-4 15-9 15s-9-8-9-15z" /><path d="M19 25l3 1M29 25l-3 1" /><path d="M21 32c2 1 4 1 6 0" /></>,
  unknown: <><circle cx="24" cy="24" r="12" opacity=".5" /><path d="M20 20a4 4 0 1 1 6 3c-2 1-2 2-2 4M24 31v1" /></>,
};

export const Sigil = ({ id, size = 40, className }: { id?: string; size?: number; className?: string }) => (
  <svg viewBox="0 0 48 48" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {P[id ?? 'unknown'] ?? P.unknown}
  </svg>
);

/** Icônes d'interface (même trait). */
const I: Record<string, ReactNode> = {
  moon: <path d="M30 10a14 14 0 1 0 10 22A12 12 0 0 1 30 10z" />,
  sun: <><circle cx="24" cy="24" r="7" /><path d="M24 8v5M24 35v5M8 24h5M35 24h5M13 13l3 3M32 32l3 3M13 35l3-3M32 16l3-3" /></>,
  skull: <><path d="M12 22a12 12 0 1 1 24 0c0 5-2 8-5 9v5H17v-5c-3-1-5-4-5-9z" /><circle cx="19" cy="22" r="2.5" /><circle cx="29" cy="22" r="2.5" /><path d="M22 36v-3M26 36v-3" /></>,
  hand: <path d="M18 40V20a2.5 2.5 0 0 1 5 0v-6a2.5 2.5 0 0 1 5 0v6-3a2.5 2.5 0 0 1 5 0v5a2.5 2.5 0 0 1 5 0v9c0 6-4 10-10 10h-3c-4 0-6-2-8-5l-5-7a2.5 2.5 0 0 1 4-3l2 3" />,
  gavel: <><path d="M20 12l10 10M16 16l10 10M14 18l8-8 12 12-8 8z" /><path d="M24 28L10 42" /><path d="M8 42h16" /></>,
  scroll: <><path d="M14 10h20a4 4 0 0 1 0 8h-2v18a4 4 0 0 1-4 4H12a4 4 0 0 1 0-8h2z" /><path d="M18 20h10M18 25h10M18 30h7" opacity=".6" /></>,
  quill: <><path d="M38 8C24 10 16 20 13 34l3 1c3-6 6-9 11-11-3 0-5 0-7 1 4-3 8-4 12-4-2-1-4-1-6-1 5-3 9-7 12-12z" /><path d="M13 34l-3 7" /></>,
  bell: <><path d="M14 32V22a10 10 0 0 1 20 0v10l3 4H11z" /><path d="M21 38a3 3 0 0 0 6 0" /></>,
  door: <><path d="M14 40V10h20v30" /><path d="M10 40h28" /><circle cx="29" cy="26" r="1.4" /></>,
  copy: <><rect x="16" y="16" width="20" height="22" rx="2" /><path d="M12 32V12a2 2 0 0 1 2-2h16" /></>,
  cog: <><circle cx="24" cy="24" r="5" /><path d="M24 8v5M24 35v5M8 24h5M35 24h5M12.7 12.7l3.5 3.5M31.8 31.8l3.5 3.5M12.7 35.3l3.5-3.5M31.8 16.2l3.5-3.5" /></>,
  plus: <path d="M24 12v24M12 24h24" />,
  x: <path d="M14 14l20 20M34 14L14 34" />,
  eye: <><path d="M6 24s7-11 18-11 18 11 18 11-7 11-18 11S6 24 6 24z" /><circle cx="24" cy="24" r="5" /></>,
  bot: <><rect x="12" y="16" width="24" height="18" rx="4" /><path d="M24 10v6M18 40h12" /><circle cx="19" cy="25" r="2" /><circle cx="29" cy="25" r="2" /></>,
};

export const Icon = ({ name, size = 18, className }: { name: keyof typeof I | string; size?: number; className?: string }) => (
  <svg viewBox="0 0 48 48" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {I[name]}
  </svg>
);
