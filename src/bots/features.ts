import { boardIndex } from '@/engine/board/index';
import { TOPOLOGY } from '@/engine/board/topology';
import { bagCovers, bagMissing, bagTotal } from '@/engine/bag';
import { COSTS, DISCARD_THRESHOLD } from '@/engine/constants';
import { canPlaceRoad, satisfiesDistanceRule } from '@/engine/rules/placement';
import { hiddenVictoryPoints, publicVictoryPoints } from '@/engine/rules/victory';
import type { GameState, PlayerId, ResourceBag } from '@/engine/types';
import { RESOURCES } from '@/engine/types';

/** Numeric summary of a player's position. Opponent features use public information only. */
export interface Features {
  publicVP: number;
  hiddenVP: number;
  /** Expected cards per roll, per resource, robber applied. */
  production: ResourceBag;
  productionTotal: number;
  /** Number of resource types this player produces at all. */
  diversity: number;
  /** Production available at corners the player could settle right now. */
  reach0: number;
  /** Production at corners reachable with one more road. */
  reach1: number;
  buildableNodes: number;
  roadLength: number;
  handSize: number;
  discardRisk: number;
  /** Missing cards for each purchase (0 = affordable). */
  missingSettlement: number;
  missingCity: number;
  missingRoad: number;
  missingDev: number;
  devInHand: number;
  knightsPlayed: number;
  settlementsLeft: number;
  citiesLeft: number;
  roadsLeft: number;
  harborBonus: number;
}

function vertexProdTotal(state: GameState, v: number): number {
  const idx = boardIndex(state.board);
  let total = 0;
  const prod = idx.vertexProduction[v];
  for (const r of RESOURCES) total += prod[r];
  // Remove the robber's hex contribution.
  if (TOPOLOGY.vertexHexes[v].includes(state.robber)) {
    const tile = state.board.hexes[state.robber];
    if (tile.token !== null) total -= (6 - Math.abs(7 - tile.token)) / 36;
  }
  return Math.max(0, total);
}

export function extractFeatures(state: GameState, p: PlayerId, includeHidden: boolean): Features {
  const idx = boardIndex(state.board);
  const me = state.players[p];
  const production: ResourceBag = { brick: 0, lumber: 0, ore: 0, grain: 0, wool: 0 };
  let productionTotal = 0;
  let harborBonus = 0;
  state.buildings.forEach((b, v) => {
    if (!b || b.owner !== p) return;
    const mult = b.kind === 'city' ? 2 : 1;
    const prod = idx.vertexProduction[v];
    const onRobber = TOPOLOGY.vertexHexes[v].includes(state.robber);
    for (const r of RESOURCES) {
      let value = prod[r] * mult;
      if (onRobber) {
        const tile = state.board.hexes[state.robber];
        const res = tile.terrain === 'desert' ? null : ({ hills: 'brick', forest: 'lumber', mountains: 'ore', fields: 'grain', pasture: 'wool' } as const)[tile.terrain];
        if (res === r && tile.token !== null) value -= ((6 - Math.abs(7 - tile.token)) / 36) * mult;
      }
      production[r] += Math.max(0, value);
    }
    const harbor = idx.vertexHarbor[v];
    if (harbor) harborBonus += harbor === 'generic' ? 0.5 : production[harbor] > 0.1 ? 1.5 : 0.75;
  });
  for (const r of RESOURCES) productionTotal += production[r];
  const diversity = RESOURCES.filter((r) => production[r] > 0.01).length;

  // Reachable corners.
  let reach0 = 0;
  let buildableNodes = 0;
  const frontier = new Set<number>();
  for (let v = 0; v < state.buildings.length; v++) {
    if (!satisfiesDistanceRule(state, v)) continue;
    const hasRoad = TOPOLOGY.vertexEdges[v].some((e) => state.roads[e] === p);
    if (hasRoad) {
      buildableNodes++;
      reach0 += vertexProdTotal(state, v);
    }
  }
  // One more road: edges the player could build, leading to a new vertex.
  for (let e = 0; e < state.roads.length; e++) {
    if (!canPlaceRoad(state, p, e)) continue;
    for (const v of TOPOLOGY.edgeVertices[e]) {
      if (satisfiesDistanceRule(state, v) && !TOPOLOGY.vertexEdges[v].some((x) => state.roads[x] === p)) frontier.add(v);
    }
  }
  let reach1 = 0;
  for (const v of frontier) reach1 += vertexProdTotal(state, v);

  const handSize = bagTotal(me.resources);
  const missing = (cost: ResourceBag) => (bagCovers(me.resources, cost) ? 0 : bagTotal(bagMissing(me.resources, cost)));

  return {
    publicVP: publicVictoryPoints(state, p),
    hiddenVP: includeHidden ? hiddenVictoryPoints(state, p) : 0,
    production,
    productionTotal,
    diversity,
    reach0,
    reach1,
    buildableNodes,
    roadLength: me.roadLength,
    handSize,
    discardRisk: Math.max(0, handSize - DISCARD_THRESHOLD),
    missingSettlement: missing(COSTS.settlement),
    missingCity: missing(COSTS.city),
    missingRoad: missing(COSTS.road),
    missingDev: missing(COSTS.devCard),
    devInHand: includeHidden ? me.devCards.filter((c) => c !== 'victoryPoint').length + me.newDevCards.length : me.devCards.length + me.newDevCards.length,
    knightsPlayed: me.knightsPlayed,
    settlementsLeft: me.pieces.settlements,
    citiesLeft: me.pieces.cities,
    roadsLeft: me.pieces.roads,
    harborBonus,
  };
}
