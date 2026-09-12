import { DICE_PROBABILITY, EMPTY_BAG, TERRAIN_RESOURCE } from '../constants';
import type { Board, HarborKind, HexId, Resource, ResourceBag, VertexId } from '../types';
import { TOPOLOGY, VERTEX_COUNT } from './topology';

/** Derived, memoized lookups for a static board. */
export interface BoardIndex {
  /** Expected resource production per roll for a settlement at each vertex (ignoring the robber). */
  vertexProduction: readonly ResourceBag[];
  /** Harbor kind reachable from each vertex, or null. */
  vertexHarbor: readonly (HarborKind | null)[];
  /** Hex ids per token number. */
  hexesByToken: ReadonlyMap<number, readonly HexId[]>;
  desert: HexId;
}

const cache = new WeakMap<Board, BoardIndex>();

export function boardIndex(board: Board): BoardIndex {
  let idx = cache.get(board);
  if (idx) return idx;

  const vertexProduction: ResourceBag[] = [];
  for (let v = 0; v < VERTEX_COUNT; v++) {
    const bag: ResourceBag = { ...EMPTY_BAG };
    for (const h of TOPOLOGY.vertexHexes[v]) {
      const tile = board.hexes[h];
      const res = TERRAIN_RESOURCE[tile.terrain];
      if (res && tile.token !== null) bag[res] += DICE_PROBABILITY[tile.token];
    }
    vertexProduction.push(bag);
  }

  const vertexHarbor: (HarborKind | null)[] = Array<HarborKind | null>(VERTEX_COUNT).fill(null);
  for (const harbor of board.harbors) {
    for (const v of harbor.vertices) vertexHarbor[v] = harbor.kind;
  }

  const hexesByToken = new Map<number, HexId[]>();
  let desert = 0;
  board.hexes.forEach((tile, h) => {
    if (tile.terrain === 'desert') desert = h;
    if (tile.token === null) return;
    const list = hexesByToken.get(tile.token) ?? [];
    list.push(h);
    hexesByToken.set(tile.token, list);
  });

  idx = { vertexProduction, vertexHarbor, hexesByToken, desert };
  cache.set(board, idx);
  return idx;
}

/** Production contributed by one hex to a vertex on it, as a resource, or null for desert. */
export function hexResource(board: Board, hex: HexId): Resource | null {
  return TERRAIN_RESOURCE[board.hexes[hex].terrain];
}

export function vertexTouchesHex(vertex: VertexId, hex: HexId): boolean {
  return TOPOLOGY.vertexHexes[vertex].includes(hex);
}
