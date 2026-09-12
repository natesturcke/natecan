import { bag, bagCovers, bagIsEmpty, bagNonNegative, bagOverlap, bagTotal } from '../bag';
import type { GameState, PlayerId, Resource, ResourceBag } from '../types';
import { RESOURCES } from '../types';

/** Validates the shape of a domestic offer independent of who can afford it. */
export function offerShapeError(give: ResourceBag, want: ResourceBag): string | null {
  if (!bagNonNegative(give) || !bagNonNegative(want)) return 'Trade amounts must be whole numbers';
  if (bagIsEmpty(give) || bagIsEmpty(want)) return 'Both sides of a trade must include at least one card';
  if (bagOverlap(give, want)) return 'You cannot trade a resource for the same resource';
  return null;
}

export function canAffordBag(state: GameState, player: PlayerId, need: ResourceBag): boolean {
  return bagCovers(state.players[player].resources, need);
}

export function maritimeRate(state: GameState, player: PlayerId, give: Resource): number {
  return state.players[player].harborRates[give];
}

export function maritimeTradeError(state: GameState, player: PlayerId, give: Resource, receive: Resource): string | null {
  if (give === receive) return 'Choose a different resource to receive';
  const rate = maritimeRate(state, player, give);
  if (state.players[player].resources[give] < rate) return `You need ${rate} ${give} for this trade`;
  if (state.bank[receive] < 1) return `The bank has no ${receive} left`;
  return null;
}

/**
 * Bounded set of domestic offers for the action enumerator: one or two of a held
 * resource for one of a resource the player lacks, capped so bots do not explode
 * the action space.
 */
export function offerCandidates(state: GameState, player: PlayerId, limit = 12): { give: ResourceBag; want: ResourceBag }[] {
  const hand = state.players[player].resources;
  const out: { give: ResourceBag; want: ResourceBag }[] = [];
  for (const g of RESOURCES) {
    if (hand[g] === 0) continue;
    for (const w of RESOURCES) {
      if (w === g) continue;
      out.push({ give: bag({ [g]: 1 }), want: bag({ [w]: 1 }) });
      if (hand[g] >= 2) out.push({ give: bag({ [g]: 2 }), want: bag({ [w]: 1 }) });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * Enumerates a bounded set of discard combinations of exactly `count` cards.
 * Exhaustive when small; otherwise a handful of heuristic candidates.
 */
export function discardCandidates(hand: ResourceBag, count: number, cap = 200): ResourceBag[] {
  const combos: ResourceBag[] = [];
  const rec = (i: number, remaining: number, current: ResourceBag) => {
    if (combos.length > cap) return;
    if (i === RESOURCES.length) {
      if (remaining === 0) combos.push({ ...current });
      return;
    }
    const r = RESOURCES[i];
    const max = Math.min(hand[r], remaining);
    for (let k = max; k >= 0; k--) {
      current[r] = k;
      rec(i + 1, remaining - k, current);
    }
    current[r] = 0;
  };
  rec(0, count, bag());
  if (combos.length <= cap) return combos;

  // Heuristic fallback: shed the most abundant resources first, plus a couple of variants.
  const greedy = (order: Resource[]): ResourceBag => {
    const out = bag();
    let left = count;
    const h = { ...hand };
    while (left > 0) {
      const r = order.slice().sort((a, b) => h[b] - h[a])[0];
      out[r]++;
      h[r]--;
      left--;
    }
    return out;
  };
  const base = [...RESOURCES];
  return [greedy(base), greedy(base.slice().reverse()), greedy([...base.slice(2), ...base.slice(0, 2)])];
}

export function discardCount(hand: ResourceBag, threshold: number): number {
  const total = bagTotal(hand);
  return total > threshold ? Math.floor(total / 2) : 0;
}
