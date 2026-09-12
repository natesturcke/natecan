import { TOPOLOGY } from '../board/topology';
import type { EdgeId, GameState, PlayerId, VertexId } from '../types';

/** Distance rule: the vertex and all its neighbours must be free of buildings. */
export function satisfiesDistanceRule(state: GameState, vertex: VertexId): boolean {
  if (state.buildings[vertex]) return false;
  return TOPOLOGY.vertexNeighbors[vertex].every((n) => state.buildings[n] === null);
}

export function hasOwnRoadAt(state: GameState, player: PlayerId, vertex: VertexId): boolean {
  return TOPOLOGY.vertexEdges[vertex].some((e) => state.roads[e] === player);
}

export function canPlaceSettlement(state: GameState, player: PlayerId, vertex: VertexId, setup: boolean): boolean {
  if (!satisfiesDistanceRule(state, vertex)) return false;
  if (setup) return true;
  return hasOwnRoadAt(state, player, vertex);
}

/**
 * A road must connect to the player's network at one endpoint: either a building
 * of theirs, or an empty vertex with one of their roads (you cannot build through
 * an opponent's settlement).
 */
export function canPlaceRoad(state: GameState, player: PlayerId, edge: EdgeId): boolean {
  if (state.roads[edge] !== -1) return false;
  for (const v of TOPOLOGY.edgeVertices[edge]) {
    const b = state.buildings[v];
    if (b) {
      if (b.owner === player) return true;
      continue;
    }
    if (hasOwnRoadAt(state, player, v)) return true;
  }
  return false;
}

/** During setup the road must touch the settlement just placed. */
export function canPlaceSetupRoad(state: GameState, edge: EdgeId, lastSettlement: VertexId): boolean {
  if (state.roads[edge] !== -1) return false;
  return TOPOLOGY.edgeVertices[edge].includes(lastSettlement);
}

export function canUpgradeToCity(state: GameState, player: PlayerId, vertex: VertexId): boolean {
  const b = state.buildings[vertex];
  return b !== null && b.owner === player && b.kind === 'settlement';
}

export function legalSettlementVertices(state: GameState, player: PlayerId, setup: boolean): VertexId[] {
  const out: VertexId[] = [];
  for (let v = 0; v < state.buildings.length; v++) {
    if (canPlaceSettlement(state, player, v, setup)) out.push(v);
  }
  return out;
}

export function legalRoadEdges(state: GameState, player: PlayerId): EdgeId[] {
  const out: EdgeId[] = [];
  for (let e = 0; e < state.roads.length; e++) {
    if (canPlaceRoad(state, player, e)) out.push(e);
  }
  return out;
}

export function legalCityVertices(state: GameState, player: PlayerId): VertexId[] {
  const out: VertexId[] = [];
  for (let v = 0; v < state.buildings.length; v++) {
    if (canUpgradeToCity(state, player, v)) out.push(v);
  }
  return out;
}
