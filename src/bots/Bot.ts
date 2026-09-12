import type { Action } from '@/engine/actions';
import { boardIndex, type BoardIndex } from '@/engine/board/index';
import { seedRng } from '@/engine/rng';
import type { Difficulty, GameState, PlayerId, RngState } from '@/engine/types';

export interface BotContext {
  /** The bot's private PRNG state; bots return the advanced state through `rng` on the result. */
  rng: RngState;
  /** Wall-clock budget for the decision in milliseconds. */
  deadlineMs: number;
  boardIndex: BoardIndex;
}

export interface BotDecision {
  action: Action;
  rng: RngState;
}

export interface Bot {
  readonly id: Difficulty;
  decide(state: GameState, legal: readonly Action[], ctx: BotContext): BotDecision;
}

export function makeContext(state: GameState, rng: RngState, deadlineMs = 800): BotContext {
  return { rng, deadlineMs, boardIndex: boardIndex(state.board) };
}

export function botSeed(gameSeed: number, player: PlayerId): RngState {
  return seedRng((gameSeed ^ (0x9e37 * (player + 1))) >>> 0);
}
