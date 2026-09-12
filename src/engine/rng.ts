import type { RngState } from './types';

/** Seeded xoshiro128** PRNG expressed as pure functions over a small tuple. */

function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

export function seedRng(seed: number): RngState {
  const next = splitmix32(seed);
  const s: [number, number, number, number] = [next(), next(), next(), next()];
  if (s.every((x) => x === 0)) s[0] = 1;
  return s;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Returns a uint32 and the advanced state. */
export function nextU32(rng: RngState): [number, RngState] {
  let [s0, s1, s2, s3] = rng;
  const result = (Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0) >>> 0;
  const t = (s1 << 9) >>> 0;
  s2 ^= s0;
  s3 ^= s1;
  s1 ^= s2;
  s0 ^= s3;
  s2 ^= t;
  s3 = rotl(s3, 11);
  return [result, [s0 >>> 0, s1 >>> 0, s2 >>> 0, s3 >>> 0]];
}

/** Uniform float in [0, 1). */
export function nextFloat(rng: RngState): [number, RngState] {
  const [u, next] = nextU32(rng);
  return [u / 4294967296, next];
}

/** Uniform integer in [0, n). */
export function nextInt(rng: RngState, n: number): [number, RngState] {
  const [f, next] = nextFloat(rng);
  return [Math.floor(f * n), next];
}

/** Fisher-Yates shuffle returning a new array. */
export function shuffle<T>(rng: RngState, items: readonly T[]): [T[], RngState] {
  const out = items.slice();
  let state = rng;
  for (let i = out.length - 1; i > 0; i--) {
    const [j, next] = nextInt(state, i + 1);
    state = next;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return [out, state];
}

export function rollDie(rng: RngState): [number, RngState] {
  const [v, next] = nextInt(rng, 6);
  return [v + 1, next];
}
