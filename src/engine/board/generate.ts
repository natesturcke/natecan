import { HARBOR_KINDS, TERRAIN_COUNTS, TOKEN_SPIRAL } from '../constants';
import type { Board, Harbor, HexTile, RngState, SetupVariant, Terrain } from '../types';
import { nextInt, shuffle } from '../rng';
import { HEX_COUNT, spiralFromCorner } from './layout';
import { HARBOR_EDGES, TOPOLOGY } from './topology';

function terrainDeck(): Terrain[] {
  const out: Terrain[] = [];
  for (const [terrain, count] of Object.entries(TERRAIN_COUNTS) as [Terrain, number][]) {
    for (let i = 0; i < count; i++) out.push(terrain);
  }
  return out;
}

function hasAdjacentRedTokens(tokens: (number | null)[]): boolean {
  for (let h = 0; h < HEX_COUNT; h++) {
    const t = tokens[h];
    if (t !== 6 && t !== 8) continue;
    for (const n of TOPOLOGY.hexNeighbors[h]) {
      const u = tokens[n];
      if (u === 6 || u === 8) return true;
    }
  }
  return false;
}

/** Generates a variable board per the rulebook. Returns the board and the advanced RNG. */
export function generateBoard(rng: RngState, variant: SetupVariant): [Board, RngState] {
  let state = rng;
  const [terrains, s1] = shuffle(state, terrainDeck());
  state = s1;

  let tokens: (number | null)[] = Array<number | null>(HEX_COUNT).fill(null);

  if (variant === 'spiral') {
    const [corner, s2] = nextInt(state, 6);
    state = s2;
    const order = spiralFromCorner(corner);
    let i = 0;
    for (const h of order) {
      if (terrains[h] === 'desert') continue;
      tokens[h] = TOKEN_SPIRAL[i++];
    }
  } else {
    // Fully random: shuffle tokens onto non-desert hexes until no 6/8 are adjacent.
    const land = [...Array(HEX_COUNT).keys()].filter((h) => terrains[h] !== 'desert');
    for (let attempt = 0; attempt < 1000; attempt++) {
      const [shuffled, s2] = shuffle(state, TOKEN_SPIRAL);
      state = s2;
      tokens = Array<number | null>(HEX_COUNT).fill(null);
      land.forEach((h, i) => (tokens[h] = shuffled[i]));
      if (!hasAdjacentRedTokens(tokens)) break;
    }
  }

  const hexes: HexTile[] = terrains.map((terrain, h) => ({ terrain, token: tokens[h] }));

  const [kinds, s3] = shuffle(state, HARBOR_KINDS);
  state = s3;
  const harbors: Harbor[] = HARBOR_EDGES.map((edge, i) => ({
    kind: kinds[i],
    edge,
    vertices: [TOPOLOGY.edgeVertices[edge][0], TOPOLOGY.edgeVertices[edge][1]],
  }));

  return [{ hexes, harbors }, state];
}
