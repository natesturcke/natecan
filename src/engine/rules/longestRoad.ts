import { TOPOLOGY } from '../board/topology';
import { LONGEST_ROAD_MIN } from '../constants';
import type { GameState, PlayerId } from '../types';

/**
 * Length of the longest continuous trail of a player's roads. Edges may not repeat;
 * vertices may (loops count). Travel through a vertex holding an opponent's building
 * is blocked.
 */
export function longestTrail(state: GameState, player: PlayerId): number {
  const own: number[] = [];
  for (let e = 0; e < state.roads.length; e++) if (state.roads[e] === player) own.push(e);
  if (own.length === 0) return 0;

  const blocked = (v: number) => {
    const b = state.buildings[v];
    return b !== null && b.owner !== player;
  };

  const used = new Set<number>();
  let best = 0;

  const dfs = (vertex: number, length: number) => {
    if (length > best) best = length;
    if (blocked(vertex)) return;
    for (const e of TOPOLOGY.vertexEdges[vertex]) {
      if (state.roads[e] !== player || used.has(e)) continue;
      used.add(e);
      const [a, b] = TOPOLOGY.edgeVertices[e];
      dfs(a === vertex ? b : a, length + 1);
      used.delete(e);
    }
  };

  for (const e of own) {
    for (const v of TOPOLOGY.edgeVertices[e]) {
      used.add(e);
      const [a, b] = TOPOLOGY.edgeVertices[e];
      // Start at v having traversed e to reach the other endpoint.
      dfs(a === v ? b : a, 1);
      used.delete(e);
    }
  }
  return best;
}

export interface LongestRoadUpdate {
  holder: PlayerId | null;
  length: number;
  changed: boolean;
}

/**
 * Applies the rulebook's holder-transition rules given every player's cached roadLength.
 * The incumbent keeps the card on ties; if the incumbent loses it and two or more players
 * tie for the new longest, the card is set aside.
 */
export function updateLongestRoadHolder(state: GameState): LongestRoadUpdate {
  const lengths = state.players.map((p) => p.roadLength);
  const best = Math.max(...lengths);
  const candidates = lengths
    .map((l, p) => (l === best && l >= LONGEST_ROAD_MIN ? (p as PlayerId) : null))
    .filter((p): p is PlayerId => p !== null);

  const prev = state.longestRoad;
  let holder: PlayerId | null;
  if (prev.holder !== null && lengths[prev.holder] >= LONGEST_ROAD_MIN && lengths[prev.holder] === best) {
    holder = prev.holder;
  } else if (candidates.length === 1) {
    holder = candidates[0];
  } else {
    holder = null;
  }
  const length = holder === null ? 0 : lengths[holder];
  return { holder, length, changed: holder !== prev.holder || length !== prev.length };
}
