import type { GameState, PlayerId } from '@/engine/types';
import { otherPlayers } from '@/engine/state';
import { extractFeatures, type Features } from './features';

export interface Weights {
  vp: number;
  production: number;
  diversity: number;
  reach0: number;
  reach1: number;
  buildableNodes: number;
  roadLength: number;
  hand: number;
  discardRisk: number;
  affordSettlement: number;
  affordCity: number;
  affordRoad: number;
  affordDev: number;
  devInHand: number;
  knightsPlayed: number;
  harbor: number;
  /** Weight on the strongest opponent's score. */
  enemy: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  vp: 100,
  production: 90,
  diversity: 6,
  reach0: 14,
  reach1: 5,
  buildableNodes: 1.5,
  roadLength: 1.2,
  hand: 2,
  discardRisk: -4,
  affordSettlement: 6,
  affordCity: 6,
  affordRoad: 1,
  affordDev: 2,
  devInHand: 7,
  knightsPlayed: 3,
  harbor: 4,
  enemy: 0.35,
};

export function scoreFeatures(f: Features, w: Weights, state: GameState): number {
  let s = 0;
  s += w.vp * (f.publicVP + f.hiddenVP);
  s += w.production * f.productionTotal;
  s += w.diversity * f.diversity;
  // Reach matters only while settlements remain to be built.
  const canSettle = f.settlementsLeft > 0 ? 1 : 0.1;
  s += w.reach0 * Math.min(f.reach0, 0.6) * canSettle;
  s += w.reach1 * Math.min(f.reach1, 0.6) * canSettle;
  s += w.buildableNodes * Math.min(f.buildableNodes, 4) * canSettle;
  // Road length pays off up to the Longest Road threshold and a bit beyond.
  const lrTarget = Math.max(5, state.longestRoad.length + 1);
  s += w.roadLength * Math.min(f.roadLength, lrTarget + 1);
  s += w.hand * Math.min(f.handSize, 7);
  s += w.discardRisk * f.discardRisk;
  if (f.settlementsLeft > 0 && f.buildableNodes > 0) s += w.affordSettlement * Math.max(0, 4 - f.missingSettlement) / 4;
  if (f.citiesLeft > 0) s += w.affordCity * Math.max(0, 5 - f.missingCity) / 5;
  s += w.affordRoad * (f.missingRoad === 0 ? 1 : 0);
  s += w.affordDev * (f.missingDev === 0 ? 1 : 0);
  s += w.devInHand * f.devInHand;
  s += w.knightsPlayed * f.knightsPlayed;
  s += w.harbor * f.harborBonus;
  return s;
}

/** Position value from player p's point of view. Higher is better. */
export function evaluate(state: GameState, p: PlayerId, w: Weights = DEFAULT_WEIGHTS): number {
  if (state.phase.kind === 'ended') return state.phase.winner === p ? 1e6 : -1e6;
  const mine = scoreFeatures(extractFeatures(state, p, true), w, state);
  let enemy = -Infinity;
  for (const o of otherPlayers(p)) {
    const s = scoreFeatures(extractFeatures(state, o, false), w, state);
    if (s > enemy) enemy = s;
  }
  return mine - w.enemy * enemy;
}
