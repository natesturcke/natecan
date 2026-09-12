import type { Action } from '@/engine/actions';
import { offerKey } from '@/engine/actions';
import { nextInt } from '@/engine/rng';
import type { GameState, PlayerId } from '@/engine/types';
import { TOPOLOGY } from '@/engine/board/topology';
import type { Bot, BotContext, BotDecision } from './Bot';
import { goodOffers, richestVictim, shouldAccept, simulate, valueWithContinuation } from './tactics';
import { DEFAULT_WEIGHTS, evaluate, type Weights } from './valueFunction';

/**
 * Medium bot: scores every legal action by the value of the resulting position
 * (with a short greedy continuation of its own turn) and picks the best.
 */
export class ValueFunctionBot implements Bot {
  readonly id = 'medium' as const;

  constructor(private readonly weights: Weights = DEFAULT_WEIGHTS) {}

  decide(state: GameState, legal: readonly Action[], ctx: BotContext): BotDecision {
    const me = legal[0].player;
    const w = this.weights;
    const phase = state.phase;
    let rng = ctx.rng;

    const pick = (candidates: readonly Action[]): Action => {
      let best: Action[] = [];
      let bestValue = -Infinity;
      for (const a of candidates) {
        let v: number;
        try {
          v = valueWithContinuation(simulate(state, a), me, w);
        } catch {
          continue;
        }
        if (v > bestValue + 1e-9) {
          bestValue = v;
          best = [a];
        } else if (Math.abs(v - bestValue) <= 1e-9) {
          best.push(a);
        }
      }
      if (best.length === 0) return candidates[0];
      const [i, next] = nextInt(rng, best.length);
      rng = next;
      return best[i];
    };

    switch (phase.kind) {
      case 'preRoll': {
        const knight = legal.find((a) => a.type === 'PLAY_KNIGHT');
        if (knight && this.knightBeforeRoll(state, me)) return { action: knight, rng };
        return { action: legal.find((a) => a.type === 'ROLL_DICE')!, rng };
      }
      case 'steal': {
        return { action: { player: me, type: 'STEAL', victim: richestVictim(state, phase.victims) }, rng };
      }
      case 'moveRobber': {
        // Evaluate robber spots without peeking at the stolen card: score the blocked
        // production and the victim's hand, not the RNG outcome.
        const candidates = legal.filter((a) => a.type === 'MOVE_ROBBER');
        return { action: pick(candidates), rng };
      }
      case 'tradeOffer': {
        const offer = phase.offer;
        const accept = legal.find((a) => a.type === 'TRADE_ACCEPT');
        if (accept && shouldAccept(state, me, offer.from, offer.want, offer.give, w)) return { action: accept, rng };
        return { action: legal.find((a) => a.type === 'TRADE_REJECT')!, rng };
      }
      case 'tradeResolve': {
        const confirms = legal.filter((a) => a.type === 'TRADE_CONFIRM');
        const cancel = legal.find((a) => a.type === 'TRADE_CANCEL')!;
        const base = valueWithContinuation(state, me, w, 2);
        let best: Action = cancel;
        let bestValue = base + 0.5;
        for (const a of confirms) {
          const v = valueWithContinuation(simulate(state, a), me, w, 2);
          if (v > bestValue) {
            bestValue = v;
            best = a;
          }
        }
        return { action: best, rng };
      }
      case 'main': {
        const direct = legal.filter((a) => a.type !== 'TRADE_OFFER' && a.type !== 'ROLL_DICE');
        const best = pick(direct);
        // Consider a trade offer only when nothing better than ending the turn is on the table.
        if (best.type === 'END_TURN' && state.turn.tradesOffered < 2) {
          const offers = goodOffers(state, me, w).filter((o) => !state.turn.rejectedOffers.includes(offerKey(o.give, o.want)));
          if (offers.length > 0) return { action: { player: me, type: 'TRADE_OFFER', give: offers[0].give, want: offers[0].want }, rng };
        }
        return { action: best, rng };
      }
      default:
        return { action: pick(legal), rng };
    }
  }

  private knightBeforeRoll(state: GameState, me: PlayerId): boolean {
    // Play early if the robber sits on one of our hexes, or if it wins Largest Army.
    const onUs = TOPOLOGY.hexVertices[state.robber].some((v) => state.buildings[v]?.owner === me);
    const knights = state.players[me].knightsPlayed + 1;
    const winsArmy = knights >= 3 && knights > state.largestArmy.size;
    return onUs || winsArmy;
  }
}

export { evaluate };
