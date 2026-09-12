import { describe, expect, it } from 'vitest';
import { TOPOLOGY } from '@/engine/board/topology';
import { longestTrail, updateLongestRoadHolder } from '@/engine/rules/longestRoad';
import { applyAction } from '@/engine/reduce';
import { freshGame, mainPhaseFor, stateWith, throughSetup } from '../helpers/fixtures';
import type { GameState, PlayerId } from '@/engine/types';

/** Finds a simple path of `n` edges from a vertex by depth-first search, avoiding occupied parts. */
function chain(start: number, n: number, avoid?: GameState): number[] {
  const visited = new Set<number>([start]);
  const path: number[] = [];
  const dfs = (v: number): boolean => {
    if (path.length === n) return true;
    for (const edge of TOPOLOGY.vertexEdges[v]) {
      const [a, b] = TOPOLOGY.edgeVertices[edge];
      const next = a === v ? b : a;
      if (visited.has(next)) continue;
      if (avoid && (avoid.roads[edge] !== -1 || avoid.buildings[next] !== null)) continue;
      visited.add(next);
      path.push(edge);
      if (dfs(next)) return true;
      path.pop();
      visited.delete(next);
    }
    return false;
  };
  if (!dfs(start)) throw new Error('chain too long');
  return path;
}

function verticesOf(edges: number[]): number[] {
  const out: number[] = [];
  for (const e of edges) for (const v of TOPOLOGY.edgeVertices[e]) if (!out.includes(v)) out.push(v);
  return out;
}

function withRoads(base: GameState, owner: PlayerId, edges: number[]): GameState {
  const roads: Record<number, PlayerId> = {};
  for (const e of edges) roads[e] = owner;
  return stateWith(base, { roads });
}

describe('longest road', () => {
  const base = freshGame(3); // empty board, no buildings

  it('counts a straight chain', () => {
    const s = withRoads(base, 0, chain(TOPOLOGY.hexVertices[9][0], 5));
    expect(longestTrail(s, 0)).toBe(5);
  });

  it('counts only the longest branch of a fork', () => {
    const trunk = chain(TOPOLOGY.hexVertices[9][0], 4);
    const forkVertex = verticesOf(trunk)[2];
    const branch = TOPOLOGY.vertexEdges[forkVertex].filter((e) => !trunk.includes(e)).slice(0, 1);
    const s = withRoads(base, 0, [...trunk, ...branch]);
    // trunk 4 long, branch attaches in the middle: longest simple trail = 2 + 1 + ... = 3 or 4 along trunk
    expect(longestTrail(s, 0)).toBe(4);
  });

  it('counts a loop around a hex as 6', () => {
    const s = withRoads(base, 0, [...TOPOLOGY.hexEdges[9]]);
    expect(longestTrail(s, 0)).toBe(6);
  });

  it('is broken by an opponent settlement in the middle', () => {
    const edges = chain(TOPOLOGY.hexVertices[9][0], 7);
    const middle = verticesOf(edges)[3];
    let s = withRoads(base, 0, edges);
    expect(longestTrail(s, 0)).toBe(7);
    s = stateWith(s, { buildings: { [middle]: { owner: 1, kind: 'settlement' } } });
    expect(longestTrail(s, 0)).toBe(4);
  });

  it('holder keeps the card on a tie; card set aside when broken into a tie between others', () => {
    let s = base;
    s = { ...s, players: s.players.map((p, i) => ({ ...p, roadLength: [6, 6, 0, 0][i] })) };
    s = { ...s, longestRoad: { holder: 0, length: 6 } };
    expect(updateLongestRoadHolder(s).holder).toBe(0);

    // Holder drops to 4, two others tie at 5: nobody holds it.
    s = { ...s, players: s.players.map((p, i) => ({ ...p, roadLength: [4, 5, 5, 0][i] })) };
    expect(updateLongestRoadHolder(s).holder).toBeNull();

    // Then one player reaches 6: they take it.
    s = { ...s, longestRoad: { holder: null, length: 0 } };
    s = { ...s, players: s.players.map((p, i) => ({ ...p, roadLength: [4, 5, 6, 0][i] })) };
    expect(updateLongestRoadHolder(s).holder).toBe(2);
  });

  it('transfers when an opponent builds a longer road, and shows as an event', () => {
    let s = throughSetup(freshGame(5));
    const p = s.turn.current;
    // Give player p roads along a chain from one of their settlements.
    // Start from any vertex where p already has presence (a settlement or a road end).
    const starts = new Set<number>();
    s.buildings.forEach((b, v) => b && b.owner === p && starts.add(v));
    s.roads.forEach((o, e) => o === p && TOPOLOGY.edgeVertices[e].forEach((v) => starts.add(v)));
    let edges: number[] = [];
    for (const v of starts) {
      try {
        edges = chain(v, 5, s);
        break;
      } catch {
        /* try the next start */
      }
    }
    expect(edges.length).toBe(5);
    s = mainPhaseFor(stateWith(s, { resources: { [p]: { brick: 10, lumber: 10 } } }), p);
    const allEvents = [];
    for (const e of edges) {
      const res = applyAction(s, { player: p, type: 'BUILD_ROAD', edge: e });
      s = res.state;
      allEvents.push(...res.events);
    }
    expect(s.players[p].roadLength).toBeGreaterThanOrEqual(5);
    expect(s.longestRoad.holder).toBe(p);
    expect(allEvents.some((e) => e.type === 'longestRoad' && e.holder === p)).toBe(true);
  });
});
