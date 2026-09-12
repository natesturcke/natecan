import { describe, expect, it } from 'vitest';
import { TOPOLOGY, HARBOR_EDGES, EDGE_COUNT, VERTEX_COUNT } from '@/engine/board/topology';
import { HEX_COUNT, SPIRAL_ORDER, spiralFromCorner } from '@/engine/board/layout';

describe('topology', () => {
  it('has 19 hexes, 54 vertices and 72 edges', () => {
    expect(HEX_COUNT).toBe(19);
    expect(VERTEX_COUNT).toBe(54);
    expect(EDGE_COUNT).toBe(72);
  });

  it('every hex has six distinct vertices and edges', () => {
    for (let h = 0; h < HEX_COUNT; h++) {
      expect(new Set(TOPOLOGY.hexVertices[h]).size).toBe(6);
      expect(new Set(TOPOLOGY.hexEdges[h]).size).toBe(6);
    }
  });

  it('edge endpoints are neighbours and tables are symmetric', () => {
    for (let e = 0; e < EDGE_COUNT; e++) {
      const [a, b] = TOPOLOGY.edgeVertices[e];
      expect(a).not.toBe(b);
      expect(TOPOLOGY.vertexNeighbors[a]).toContain(b);
      expect(TOPOLOGY.vertexNeighbors[b]).toContain(a);
      expect(TOPOLOGY.vertexEdges[a]).toContain(e);
      expect(TOPOLOGY.vertexEdges[b]).toContain(e);
      expect(TOPOLOGY.edgeHexes[e].length).toBeGreaterThanOrEqual(1);
      expect(TOPOLOGY.edgeHexes[e].length).toBeLessThanOrEqual(2);
    }
  });

  it('vertex degrees: corner vertices have 2 edges, all others have 3', () => {
    const byHexCount: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    for (let v = 0; v < VERTEX_COUNT; v++) {
      const deg = TOPOLOGY.vertexEdges[v].length;
      const hexes = TOPOLOGY.vertexHexes[v].length;
      byHexCount[hexes]++;
      expect(deg).toBe(hexes === 1 ? 2 : 3);
    }
    expect(byHexCount).toEqual({ 1: 18, 2: 12, 3: 24 });
  });

  it('rim cycle covers all 30 rim edges exactly once', () => {
    expect(TOPOLOGY.rimEdgeCycle.length).toBe(30);
    expect(new Set(TOPOLOGY.rimEdgeCycle).size).toBe(30);
    for (const e of TOPOLOGY.rimEdgeCycle) expect(TOPOLOGY.edgeHexes[e].length).toBe(1);
  });

  it('harbor slots do not share vertices', () => {
    const seen = new Set<number>();
    for (const e of HARBOR_EDGES) {
      for (const v of TOPOLOGY.edgeVertices[e]) {
        expect(seen.has(v)).toBe(false);
        seen.add(v);
      }
    }
  });

  it('spiral order visits every hex once and rotations are permutations', () => {
    expect(new Set(SPIRAL_ORDER).size).toBe(19);
    for (let c = 0; c < 6; c++) expect(new Set(spiralFromCorner(c)).size).toBe(19);
    // consecutive spiral hexes are neighbours (except the jump from the outer ring to the inner ring)
    for (let i = 0; i < 11; i++) {
      expect(TOPOLOGY.hexNeighbors[SPIRAL_ORDER[i]]).toContain(SPIRAL_ORDER[i + 1]);
    }
  });
});
