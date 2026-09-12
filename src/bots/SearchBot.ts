import type { Action } from '@/engine/actions';
import { offerKey } from '@/engine/actions';
import type { GameState } from '@/engine/types';
import type { Bot, BotContext, BotDecision } from './Bot';
import { searchMainPhase } from './search';
import { goodOffers } from './tactics';
import { ValueFunctionBot } from './ValueFunctionBot';
import { DEFAULT_WEIGHTS, type Weights } from './valueFunction';

/** Hard bot: the Medium bot's policies everywhere, plus expectimax in the main phase. */
export class SearchBot implements Bot {
  readonly id = 'hard' as const;
  private readonly inner: ValueFunctionBot;

  constructor(private readonly weights: Weights = DEFAULT_WEIGHTS) {
    this.inner = new ValueFunctionBot(weights);
  }

  decide(state: GameState, legal: readonly Action[], ctx: BotContext): BotDecision {
    if (state.phase.kind !== 'main') return this.inner.decide(state, legal, ctx);
    const me = legal[0].player;
    const direct = legal.filter((a) => a.type !== 'TRADE_OFFER');
    const result = searchMainPhase(state, me, direct, this.weights, ctx.deadlineMs);
    if (result.action.type === 'END_TURN' && state.turn.tradesOffered < 2) {
      const offers = goodOffers(state, me, this.weights).filter((o) => !state.turn.rejectedOffers.includes(offerKey(o.give, o.want)));
      if (offers.length > 0) return { action: { player: me, type: 'TRADE_OFFER', give: offers[0].give, want: offers[0].want }, rng: ctx.rng };
    }
    return { action: result.action, rng: ctx.rng };
  }
}
