import type { Action } from '@/engine/actions';
import { nextInt } from '@/engine/rng';
import type { GameState } from '@/engine/types';
import type { Bot, BotContext, BotDecision } from './Bot';

/**
 * Easy bot: uniformly random among legal actions, with two tweaks so games finish:
 * it never ends its turn while it could still build, and it does not spam trade offers.
 */
export class RandomBot implements Bot {
  readonly id = 'easy' as const;

  decide(state: GameState, legal: readonly Action[], ctx: BotContext): BotDecision {
    let pool: Action[] = legal.filter((a) => a.type !== 'TRADE_OFFER' && a.type !== 'TRADE_COUNTER');
    const builds = pool.filter((a) => a.type === 'BUILD_ROAD' || a.type === 'BUILD_SETTLEMENT' || a.type === 'BUILD_CITY' || a.type === 'BUY_DEV_CARD');
    if (state.phase.kind === 'main' && builds.length > 0) {
      // Prefer settlements and cities so the game progresses.
      const strong = builds.filter((a) => a.type === 'BUILD_SETTLEMENT' || a.type === 'BUILD_CITY');
      pool = strong.length > 0 ? strong : builds;
    } else if (state.phase.kind === 'main') {
      // Nothing to build: mostly end the turn, occasionally trade with the bank.
      const maritime = pool.filter((a) => a.type === 'MARITIME_TRADE');
      const [coin, rng] = nextInt(ctx.rng, 4);
      ctx = { ...ctx, rng };
      pool = coin === 0 && maritime.length > 0 ? maritime : pool.filter((a) => a.type === 'END_TURN' || a.type.startsWith('PLAY_'));
      if (pool.length === 0) pool = legal.filter((a) => a.type === 'END_TURN');
    }
    if (pool.length === 0) pool = legal.slice();
    const [i, rng] = nextInt(ctx.rng, pool.length);
    return { action: pool[i], rng };
  }
}
