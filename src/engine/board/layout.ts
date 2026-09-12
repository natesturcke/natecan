/**
 * Axial coordinates (pointy-top) of the 19 land hexes, listed in reading order:
 * rows top to bottom, each row left to right. Hex ids index this array.
 */
export interface Axial {
  q: number;
  r: number;
}

export const HEX_COORDS: readonly Axial[] = (() => {
  const out: Axial[] = [];
  for (let r = -2; r <= 2; r++) {
    const qMin = Math.max(-2, -2 - r);
    const qMax = Math.min(2, 2 - r);
    for (let q = qMin; q <= qMax; q++) out.push({ q, r });
  }
  return out;
})();

export const HEX_COUNT = HEX_COORDS.length; // 19

export function axialKey(q: number, r: number): string {
  return `${q},${r}`;
}

const HEX_INDEX = new Map(HEX_COORDS.map((c, i) => [axialKey(c.q, c.r), i]));

export function hexIdAt(q: number, r: number): number | undefined {
  return HEX_INDEX.get(axialKey(q, r));
}

/**
 * Counter-clockwise spiral (as seen on screen with y pointing down) starting at the
 * top-left corner hex, outer ring first, ending at the centre. Used for token placement.
 */
export const SPIRAL_ORDER: readonly number[] = (() => {
  const outer: Axial[] = [
    { q: 0, r: -2 },
    { q: -1, r: -1 },
    { q: -2, r: 0 },
    { q: -2, r: 1 },
    { q: -2, r: 2 },
    { q: -1, r: 2 },
    { q: 0, r: 2 },
    { q: 1, r: 1 },
    { q: 2, r: 0 },
    { q: 2, r: -1 },
    { q: 2, r: -2 },
    { q: 1, r: -2 },
  ];
  const inner: Axial[] = [
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
    { q: 1, r: 0 },
    { q: 1, r: -1 },
  ];
  return [...outer, ...inner, { q: 0, r: 0 }].map((c) => hexIdAt(c.q, c.r)!);
})();

/**
 * Rotates the spiral so it starts at one of the six corner hexes (0..5), still
 * counter-clockwise, still spiralling inward. Corner 0 is the top-left hex.
 */
export function spiralFromCorner(corner: number): number[] {
  const k = ((corner % 6) + 6) % 6;
  const outer = SPIRAL_ORDER.slice(0, 12);
  const inner = SPIRAL_ORDER.slice(12, 18);
  const rot = <T>(a: T[], n: number) => [...a.slice(n), ...a.slice(0, n)];
  return [...rot(outer, 2 * k), ...rot(inner, k), SPIRAL_ORDER[18]];
}
