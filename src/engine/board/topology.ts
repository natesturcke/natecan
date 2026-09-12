/**
 * Hex-parts topology for the fixed 19-hex island, after Red Blob Games
 * (https://www.redblobgames.com/grids/parts/). Pointy-top hexes in axial (q, r).
 *
 * Each hex owns two canonical vertices (N, S) and three canonical edges (NE, NW, W);
 * its other parts belong to neighbours. Only parts touched by at least one land hex
 * receive a dense id: 54 vertices and 72 edges.
 */
import { HEX_COORDS, HEX_COUNT, hexIdAt } from './layout';

/** Vertex directions clockwise from north (screen y down). */
export const VERTEX_DIRS = ['N', 'NE', 'SE', 'S', 'SW', 'NW'] as const;
export type VertexDir = (typeof VERTEX_DIRS)[number];

/** Edge i joins vertex i and vertex i+1 (mod 6), clockwise from north. */
export const EDGE_DIRS = ['NE', 'E', 'SE', 'SW', 'W', 'NW'] as const;
export type EdgeDir = (typeof EDGE_DIRS)[number];

/** Axial neighbour offsets, indexed like EDGE_DIRS (the neighbour across that edge). */
export const NEIGHBOR_OFFSETS: readonly { q: number; r: number }[] = [
  { q: 1, r: -1 }, // NE
  { q: 1, r: 0 }, // E
  { q: 0, r: 1 }, // SE
  { q: -1, r: 1 }, // SW
  { q: -1, r: 0 }, // W
  { q: 0, r: -1 }, // NW
];

function canonicalVertex(q: number, r: number, dir: VertexDir): string {
  switch (dir) {
    case 'N':
      return `v:${q},${r},N`;
    case 'S':
      return `v:${q},${r},S`;
    case 'NE':
      return `v:${q + 1},${r - 1},S`;
    case 'SE':
      return `v:${q},${r + 1},N`;
    case 'SW':
      return `v:${q - 1},${r + 1},N`;
    case 'NW':
      return `v:${q},${r - 1},S`;
  }
}

function canonicalEdge(q: number, r: number, dir: EdgeDir): string {
  switch (dir) {
    case 'NE':
      return `e:${q},${r},NE`;
    case 'NW':
      return `e:${q},${r},NW`;
    case 'W':
      return `e:${q},${r},W`;
    case 'E':
      return `e:${q + 1},${r},W`;
    case 'SE':
      return `e:${q},${r + 1},NW`;
    case 'SW':
      return `e:${q - 1},${r + 1},NE`;
  }
}

export interface Topology {
  hexVertices: readonly (readonly number[])[]; // [19][6] clockwise from N
  hexEdges: readonly (readonly number[])[]; // [19][6] clockwise from NE
  vertexHexes: readonly (readonly number[])[]; // [54][1..3]
  vertexEdges: readonly (readonly number[])[]; // [54][2..3]
  vertexNeighbors: readonly (readonly number[])[]; // [54][2..3]
  edgeVertices: readonly (readonly [number, number])[]; // [72]
  edgeHexes: readonly (readonly number[])[]; // [72][1..2]
  /** Edges sharing a vertex with the given edge. */
  edgeNeighbors: readonly (readonly number[])[]; // [72]
  hexNeighbors: readonly (readonly number[])[]; // [19][2..6]
  /** Rim edges (one adjacent hex) in a continuous cycle around the island. */
  rimEdgeCycle: readonly number[];
  vertexCount: number;
  edgeCount: number;
}

function build(): Topology {
  const vIds = new Map<string, number>();
  const eIds = new Map<string, number>();
  const hexVertices: number[][] = [];
  const hexEdges: number[][] = [];

  const vid = (key: string) => {
    let id = vIds.get(key);
    if (id === undefined) {
      id = vIds.size;
      vIds.set(key, id);
    }
    return id;
  };
  const eid = (key: string) => {
    let id = eIds.get(key);
    if (id === undefined) {
      id = eIds.size;
      eIds.set(key, id);
    }
    return id;
  };

  for (let h = 0; h < HEX_COUNT; h++) {
    const { q, r } = HEX_COORDS[h];
    hexVertices.push(VERTEX_DIRS.map((d) => vid(canonicalVertex(q, r, d))));
    hexEdges.push(EDGE_DIRS.map((d) => eid(canonicalEdge(q, r, d))));
  }

  const vertexCount = vIds.size;
  const edgeCount = eIds.size;
  const vertexHexes: number[][] = Array.from({ length: vertexCount }, () => []);
  const vertexEdgesSet: Set<number>[] = Array.from({ length: vertexCount }, () => new Set());
  const edgeVerticesArr: [number, number][] = Array.from({ length: edgeCount }, () => [-1, -1]);
  const edgeHexes: number[][] = Array.from({ length: edgeCount }, () => []);

  for (let h = 0; h < HEX_COUNT; h++) {
    for (let i = 0; i < 6; i++) {
      const v = hexVertices[h][i];
      vertexHexes[v].push(h);
      const e = hexEdges[h][i];
      const a = hexVertices[h][i];
      const b = hexVertices[h][(i + 1) % 6];
      edgeVerticesArr[e] = [Math.min(a, b), Math.max(a, b)];
      if (!edgeHexes[e].includes(h)) edgeHexes[e].push(h);
      vertexEdgesSet[a].add(e);
      vertexEdgesSet[b].add(e);
    }
  }

  const vertexEdges = vertexEdgesSet.map((s) => [...s].sort((x, y) => x - y));
  const vertexNeighbors = vertexEdges.map((edges, v) =>
    edges.map((e) => (edgeVerticesArr[e][0] === v ? edgeVerticesArr[e][1] : edgeVerticesArr[e][0])),
  );
  const edgeNeighbors = edgeVerticesArr.map(([a, b], e) =>
    [...vertexEdges[a], ...vertexEdges[b]].filter((x) => x !== e),
  );

  const hexNeighbors: number[][] = HEX_COORDS.map(({ q, r }) =>
    NEIGHBOR_OFFSETS.map((o) => hexIdAt(q + o.q, r + o.r)).filter((x): x is number => x !== undefined),
  );

  // Rim cycle: walk rim edges around the island starting from the NW edge of hex 0.
  const rim = new Set<number>();
  for (let e = 0; e < edgeCount; e++) if (edgeHexes[e].length === 1) rim.add(e);
  const start = hexEdges[0][EDGE_DIRS.indexOf('NW')];
  const cycle: number[] = [start];
  const seen = new Set<number>([start]);
  // Walk so that the traversal proceeds clockwise on screen from hex 0's NW edge (towards its NE edge).
  let current = start;
  let currentVertex = hexVertices[0][VERTEX_DIRS.indexOf('N')];
  while (true) {
    const next = vertexEdges[currentVertex].find((e) => rim.has(e) && !seen.has(e));
    if (next === undefined) break;
    cycle.push(next);
    seen.add(next);
    const [a, b] = edgeVerticesArr[next];
    currentVertex = a === currentVertex ? b : a;
    current = next;
  }
  void current;

  return {
    hexVertices,
    hexEdges,
    vertexHexes,
    vertexEdges,
    vertexNeighbors,
    edgeVertices: edgeVerticesArr,
    edgeHexes,
    edgeNeighbors,
    hexNeighbors,
    rimEdgeCycle: cycle,
    vertexCount,
    edgeCount,
  };
}

export const TOPOLOGY: Topology = build();

export const VERTEX_COUNT = TOPOLOGY.vertexCount;
export const EDGE_COUNT = TOPOLOGY.edgeCount;

/**
 * Harbor slots: positions in the rim cycle (30 rim edges) chosen so no two harbors
 * share a vertex and spacing mirrors the printed frame (3-4-3-3-4-3-3-4-3).
 */
export const HARBOR_SLOT_OFFSETS: readonly number[] = [0, 3, 7, 10, 13, 17, 20, 23, 27];

export const HARBOR_EDGES: readonly number[] = HARBOR_SLOT_OFFSETS.map((i) => TOPOLOGY.rimEdgeCycle[i]);
