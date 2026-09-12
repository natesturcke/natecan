import { describe, expect, it } from 'vitest';
import type { Bot } from '@/bots/Bot';
import { RandomBot } from '@/bots/RandomBot';
import { ValueFunctionBot } from '@/bots/ValueFunctionBot';
import { SearchBot } from '@/bots/SearchBot';
import { InlineBotRunner } from '@/bots/runner';
import { GameController } from '@/game/GameController';
import { validateAction } from '@/engine/legal';
import { newGame } from '@/engine/state';
import type { PlayerId, PlayerSetup } from '@/engine/types';

function play(seed: number, bots: Bot[]): { winner: PlayerId | null; maxMs: number } {
  const players: PlayerSetup[] = bots.map((b, i) => ({ name: `P${i}`, color: '#000', kind: 'bot', difficulty: b.id }));
  const map = new Map<PlayerId, Bot>(bots.map((b, i) => [i as PlayerId, b]));
  const runner = new InlineBotRunner(map, seed, 300);
  const controller = new GameController(newGame({ seed, players }), { runner, maxActions: 6000 });
  let maxMs = 0;
  controller.runToCompletionSync((p, s, l) => {
    const t = performance.now();
    const a = runner.decideSync(p, s, l);
    maxMs = Math.max(maxMs, performance.now() - t);
    expect(validateAction(s, a)).toBeNull();
    return a;
  });
  return { winner: controller.state.phase.kind === 'ended' ? controller.state.phase.winner : null, maxMs };
}

describe('bot strength', () => {
  it('medium beats three random bots in at least 80% of games', () => {
    let wins = 0;
    const N = 15;
    for (let seed = 100; seed < 100 + N; seed++) {
      const { winner } = play(seed, [new ValueFunctionBot(), new RandomBot(), new RandomBot(), new RandomBot()]);
      if (winner === 0) wins++;
    }
    expect(wins / N).toBeGreaterThanOrEqual(0.8);
  });

  it('hard bot only returns legal actions and stays within its time budget', () => {
    const { maxMs } = play(7, [new SearchBot(), new ValueFunctionBot(), new ValueFunctionBot(), new ValueFunctionBot()]);
    expect(maxMs).toBeLessThan(1500);
  });
});
