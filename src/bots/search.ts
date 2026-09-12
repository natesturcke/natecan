/**
 * Bounded expectimax for the Hard bot. From the bot's main phase it explores its
 * best few actions, greedily finishes its turn, then models the next opponent's
 * turn as a chance node over the dice followed by that opponent's best greedy reply,
 * and evaluates the result from the bot's perspective.
 */
import type { Action } from '@/engine/actions';
import { DICE_PROBABILITY } from '@/engine/constants';
import { legalActions } from '@/engine/legal';
import { applyAction } from '@/engine/reduce';
import { nextPlayer } from '@/engine/state';
import type { GameState, PlayerId } from '@/engine/types';
import { simulate, valueWithContinuation } from './tactics';
import { evaluate, type Weights } from './valueFunction';

const BUILDS: ReadonlySet<Action['type']> = new Set(['BUILD_ROAD', 'BUILD_SETTLEMENT', 'BUILD_CITY', 'BUY_DEV_CARD', 'MARITIME_TRADE']);

/** Greedily plays out `p`'s main phase with builds that improve `p`'s evaluation, then ends the turn. */
function greedyFinish(state: GameState, p: PlayerId, w: Weights, maxSteps = 3): GameState {
  let s = state;
  for (let i = 0; i < maxSteps; i++) {
    if (s.phase.kind !== 'main' || s.turn.current !== p) break;
    const base = evaluate(s, p, w);
    let bestAction: Action | null = null;
    let bestValue = base;
    for (const a of legalActions(s, p)) {
      if (!BUILDS.has(a.type)) continue;
      const v = evaluate(simulate(s, a), p, w);
      if (v > bestValue + 1e-6) {
        bestValue = v;
        bestAction = a;
      }
    }
    if (!bestAction) break;
    s = simulate(s, bestAction);
  }
  if (s.phase.kind === 'main' && s.turn.current === p) s = applyAction(s, { player: p, type: 'END_TURN' }, { trustForced: true }).state;
  return s;
}

/** Resolves a 7 for the opponent cheaply: no discards modelled, robber onto our best hex, no steal. */
function resolveSeven(state: GameState, mover: PlayerId, me: PlayerId, w: Weights): GameState {
  if (state.phase.kind !== 'moveRobber') return state;
  let best: GameState | null = null;
  let bestValue = Infinity;
  for (let hex = 0; hex < state.board.hexes.length; hex++) {
    if (hex === state.robber) continue;
    const touchesMe = state.buildings.some((b, v) => b && b.owner === me && v >= 0 && state.board.hexes[hex] && touches(v, hex));
    if (!touchesMe) continue;
    const s = { ...state, robber: hex, phase: { kind: 'main' } as const };
    const v = evaluate(s, me, w);
    if (v < bestValue) {
      bestValue = v;
      best = s;
    }
  }
  if (!best) best = { ...state, phase: { kind: 'main' } };
  void mover;
  return best;
}

import { TOPOLOGY } from '@/engine/board/topology';
function touches(vertex: number, hex: number): boolean {
  return TOPOLOGY.vertexHexes[vertex].includes(hex);
}

/** Expected value for `me` after the next opponent takes one turn from `state` (their preRoll). */
export function expectedAfterOpponentTurn(state: GameState, me: PlayerId, w: Weights, deadline: number): number {
  const opp = state.turn.current;
  if (opp === me || state.phase.kind !== 'preRoll') return evaluate(state, me, w);
  let total = 0;
  for (let sum = 2; sum <= 12; sum++) {
    const prob = DICE_PROBABILITY[sum];
    const dice: [number, number] = sum <= 7 ? [1, sum - 1] : [6, sum - 6];
    let s = applyAction(state, { player: opp, type: 'ROLL_DICE' }, { forced: { dice }, trustForced: true }).state;
    if (sum === 7) {
      if (s.phase.kind === 'discard') s = { ...s, phase: { kind: 'moveRobber', then: 'main' } };
      s = resolveSeven(s, opp, me, w);
    }
    if (s.phase.kind === 'main') s = greedyFinish(s, opp, w, performance.now() > deadline ? 1 : 3);
    total += prob * evaluate(s, me, w);
  }
  return total;
}

export interface SearchResult {
  action: Action;
  value: number;
  searched: number;
}

/**
 * Chooses among `candidates` for `me` in the main phase by: apply candidate, greedily
 * finish the turn, then average over the next opponent's dice and greedy reply.
 */
export function searchMainPhase(state: GameState, me: PlayerId, candidates: readonly Action[], w: Weights, deadlineMs: number, topK = 6): SearchResult {
  const start = performance.now();
  const deadline = start + deadlineMs;
  // Order by 1-ply value and keep the top K distinct actions.
  const scored = candidates
    .map((a) => {
      try {
        return { a, v: valueWithContinuation(simulate(state, a), me, w) };
      } catch {
        return null;
      }
    })
    .filter((x): x is { a: Action; v: number } => x !== null)
    .sort((x, y) => y.v - x.v)
    .slice(0, topK);
  if (scored.length === 0) return { action: candidates[0], value: -Infinity, searched: 0 };

  let best = scored[0];
  let bestValue = -Infinity;
  let searched = 0;
  for (const cand of scored) {
    if (performance.now() > deadline) break;
    let s = simulate(state, cand.a);
    if (s.phase.kind === 'main' && s.turn.current === me) s = greedyFinish(s, me, w);
    let value: number;
    if (s.phase.kind === 'preRoll' && s.turn.current === nextPlayer(me)) {
      value = expectedAfterOpponentTurn(s, me, w, deadline);
    } else {
      value = evaluate(s, me, w);
    }
    // Blend with the 1-ply value so the greedy signal is not lost to model noise.
    value = 0.7 * value + 0.3 * cand.v;
    searched++;
    if (value > bestValue) {
      bestValue = value;
      best = cand;
    }
  }
  return { action: best.a, value: bestValue, searched };
}
