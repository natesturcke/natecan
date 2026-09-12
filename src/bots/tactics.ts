/**
 * Shared decision helpers used by the value-function and search bots: applying an
 * action without peeking at hidden information, greedy own-turn continuations, and
 * simple policies for robber, steal and trade responses.
 */
import type { Action } from '@/engine/actions';
import { bag, bagAdd, bagCovers, bagSub, bagTotal } from '@/engine/bag';
import { COSTS } from '@/engine/constants';
import { legalActions } from '@/engine/legal';
import { applyAction } from '@/engine/reduce';
import { publicVictoryPoints } from '@/engine/rules/victory';
import type { GameState, PlayerId, ResourceBag } from '@/engine/types';
import { evaluate, type Weights } from './valueFunction';

/**
 * Applies an action for evaluation purposes. Buying a development card would reveal
 * the deck, so it is simulated as paying the cost and receiving an unknown card
 * (counted as a knight-like card in hand).
 */
export function simulate(state: GameState, action: Action): GameState {
  if (action.type === 'BUY_DEV_CARD') {
    const players = state.players.slice();
    const me = players[action.player];
    players[action.player] = {
      ...me,
      resources: bagSub(me.resources, COSTS.devCard),
      newDevCards: [...me.newDevCards, 'knight'],
    };
    return { ...state, players, bank: bagAdd(state.bank, COSTS.devCard) };
  }
  return applyAction(state, action, { trustForced: true }).state;
}

const BUILD_TYPES: ReadonlySet<Action['type']> = new Set(['BUILD_ROAD', 'BUILD_SETTLEMENT', 'BUILD_CITY', 'BUY_DEV_CARD', 'MARITIME_TRADE', 'PLAY_ROAD_BUILDING']);

/**
 * Value of a state after greedily continuing the player's own turn with builds and
 * bank trades that improve the evaluation. Lets a 1-ply bot see that a 4:1 trade
 * enabling a settlement is worth it.
 */
export function valueWithContinuation(state: GameState, p: PlayerId, w: Weights, depth = 3): number {
  let s = state;
  let best = evaluate(s, p, w);
  for (let i = 0; i < depth; i++) {
    if (s.phase.kind !== 'main' || s.turn.current !== p) break;
    const legal = legalActions(s, p).filter((a) => BUILD_TYPES.has(a.type) && a.type !== 'PLAY_ROAD_BUILDING');
    let bestAction: Action | null = null;
    let bestValue = best;
    for (const a of legal) {
      const next = simulate(s, a);
      const v = evaluate(next, p, w);
      if (v > bestValue + 1e-6) {
        bestValue = v;
        bestAction = a;
      }
    }
    if (!bestAction) break;
    s = simulate(s, bestAction);
    best = bestValue;
  }
  return best;
}

export function richestVictim(state: GameState, victims: readonly PlayerId[]): PlayerId {
  let best = victims[0];
  let bestScore = -1;
  for (const v of victims) {
    const score = bagTotal(state.players[v].resources) + publicVictoryPoints(state, v) * 2;
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

/** Hypothetical hand after a domestic trade from `me`'s side. */
export function swapHand(state: GameState, me: PlayerId, give: ResourceBag, get: ResourceBag): GameState {
  const players = state.players.slice();
  const p = players[me];
  players[me] = { ...p, resources: bagAdd(bagSub(p.resources, give), get) };
  return { ...state, players };
}

/** Whether accepting an offer (from the responder's perspective) improves the position. */
export function shouldAccept(state: GameState, me: PlayerId, offerer: PlayerId, iGive: ResourceBag, iGet: ResourceBag, w: Weights): boolean {
  if (!bagCovers(state.players[me].resources, iGive)) return false;
  const leaderVP = publicVictoryPoints(state, offerer);
  if (leaderVP >= 8 && publicVictoryPoints(state, me) < leaderVP) return false;
  const before = evaluate(state, me, w);
  const after = valueWithContinuation(mainFor(swapHand(state, me, iGive, iGet), me), me, w, 2);
  return after > before + 0.5;
}

/** Puts a hypothetical state into `p`'s main phase so continuations can be explored. */
export function mainFor(state: GameState, p: PlayerId): GameState {
  return { ...state, phase: { kind: 'main' }, turn: { ...state.turn, current: p, hasRolled: true } };
}

/** Offers worth making: one surplus card for one card that completes a purchase. */
export function goodOffers(state: GameState, me: PlayerId, w: Weights, limit = 3): { give: ResourceBag; want: ResourceBag; gain: number }[] {
  const hand = state.players[me].resources;
  const base = valueWithContinuation(state, me, w, 2);
  const out: { give: ResourceBag; want: ResourceBag; gain: number }[] = [];
  const RES = ['brick', 'lumber', 'ore', 'grain', 'wool'] as const;
  for (const g of RES) {
    if (hand[g] === 0) continue;
    for (const wnt of RES) {
      if (wnt === g) continue;
      const give = bag({ [g]: 1 });
      const want = bag({ [wnt]: 1 });
      const after = valueWithContinuation(swapHand(state, me, give, want), me, w, 2);
      const gain = after - base;
      if (gain > 3) out.push({ give, want, gain });
    }
  }
  return out.sort((a, b) => b.gain - a.gain).slice(0, limit);
}
