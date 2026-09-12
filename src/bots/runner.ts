import type { Action } from '@/engine/actions';
import type { GameState, PlayerId, RngState } from '@/engine/types';
import { botSeed, makeContext, type Bot } from './Bot';

export interface BotRunner {
  decide(player: PlayerId, state: GameState, legal: readonly Action[]): Promise<Action>;
  dispose(): void;
}

/** Runs bots synchronously on the calling thread. Used headless and as a fallback. */
export class InlineBotRunner implements BotRunner {
  private rngs = new Map<PlayerId, RngState>();

  constructor(
    private readonly bots: ReadonlyMap<PlayerId, Bot>,
    private readonly gameSeed: number,
    private readonly deadlineMs = 800,
  ) {}

  decideSync(player: PlayerId, state: GameState, legal: readonly Action[]): Action {
    const bot = this.bots.get(player);
    if (!bot) throw new Error(`No bot for player ${player}`);
    const rng = this.rngs.get(player) ?? botSeed(this.gameSeed, player);
    const result = bot.decide(state, legal, makeContext(state, rng, this.deadlineMs));
    this.rngs.set(player, result.rng);
    return result.action;
  }

  async decide(player: PlayerId, state: GameState, legal: readonly Action[]): Promise<Action> {
    return this.decideSync(player, state, legal);
  }

  dispose(): void {
    this.rngs.clear();
  }
}
