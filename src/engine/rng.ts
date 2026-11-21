/** Générateur pseudo-aléatoire déterministe (mulberry32). L'état est stocké dans la partie : rejouable et persistant. */
export interface RngHolder { rng: number }

export const nextFloat = (h: RngHolder): number => {
  h.rng = (h.rng + 0x6d2b79f5) >>> 0;
  let t = h.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const randInt = (h: RngHolder, n: number): number => Math.floor(nextFloat(h) * n);

export const pick = <T>(h: RngHolder, arr: readonly T[]): T => {
  if (!arr.length) throw new Error('pick: tableau vide');
  return arr[randInt(h, arr.length)];
};

export const shuffle = <T>(h: RngHolder, arr: readonly T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(h, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const chance = (h: RngHolder, p: number): boolean => nextFloat(h) < p;
