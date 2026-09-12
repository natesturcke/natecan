import { boardIndex, hexResource } from '../board/index';
import { TOPOLOGY } from '../board/topology';
import { bag, bagAdd } from '../bag';
import type { GameState, PlayerId, Resource, ResourceBag } from '../types';
import { RESOURCES } from '../types';

export interface ProductionResult {
  /** Resources actually paid to each player. */
  gains: ResourceBag[];
  /** Resources for which nobody was paid because the bank ran short. */
  shortages: Resource[];
}

/** Computes what each player would demand for a roll, before bank limits. */
export function productionDemand(state: GameState, roll: number): ResourceBag[] {
  const demand = state.players.map(() => bag());
  const hexes = boardIndex(state.board).hexesByToken.get(roll) ?? [];
  for (const h of hexes) {
    if (h === state.robber) continue;
    const res = hexResource(state.board, h);
    if (!res) continue;
    for (const v of TOPOLOGY.hexVertices[h]) {
      const b = state.buildings[v];
      if (!b) continue;
      demand[b.owner][res] += b.kind === 'city' ? 2 : 1;
    }
  }
  return demand;
}

/**
 * Applies the bank shortage rule: if the bank cannot cover a resource for everyone,
 * nobody receives it, unless only one player is affected, who receives what is left.
 */
export function distributeResources(state: GameState, roll: number): ProductionResult {
  const demand = productionDemand(state, roll);
  const gains = state.players.map(() => bag());
  const shortages: Resource[] = [];
  for (const r of RESOURCES) {
    const total = demand.reduce((s, d) => s + d[r], 0);
    if (total === 0) continue;
    if (total <= state.bank[r]) {
      demand.forEach((d, p) => (gains[p][r] = d[r]));
      continue;
    }
    const claimants = demand.map((d, p) => (d[r] > 0 ? p : -1)).filter((p) => p >= 0);
    if (claimants.length === 1) {
      gains[claimants[0]][r] = Math.min(demand[claimants[0]][r], state.bank[r]);
    } else {
      shortages.push(r);
    }
  }
  return { gains, shortages };
}

/** Resources granted for the hexes around a setup-phase second settlement. */
export function setupResources(state: GameState, vertex: number): ResourceBag {
  let out = bag();
  for (const h of TOPOLOGY.vertexHexes[vertex]) {
    const res = hexResource(state.board, h);
    if (res) out = bagAdd(out, bag({ [res]: 1 }));
  }
  return out;
}

export function playerProduction(state: GameState, player: PlayerId): ResourceBag {
  const idx = boardIndex(state.board);
  let out = bag();
  state.buildings.forEach((b, v) => {
    if (!b || b.owner !== player) return;
    const mult = b.kind === 'city' ? 2 : 1;
    const prod = idx.vertexProduction[v];
    for (const r of RESOURCES) out[r] += prod[r] * mult;
  });
  return out;
}
