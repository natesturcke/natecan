import { describe, expect, it } from 'vitest';
import { RandomBot } from '@/bots/RandomBot';
import { InlineBotRunner } from '@/bots/runner';
import { GameController } from '@/game/GameController';
import { legalActions } from '@/engine/legal';
import { currentActor, newGame } from '@/engine/state';
import type { GameState, PlayerId, PlayerSetup } from '@/engine/types';
import { RESOURCES } from '@/engine/types';
import { bagTotal } from '@/engine/bag';
import { BANK_PER_RESOURCE, PIECE_LIMITS } from '@/engine/constants';
import { validateAction } from '@/engine/legal';

const BOTS: PlayerSetup[] = [
  { name: 'A', color: '#d33', kind: 'bot', difficulty: 'easy' },
  { name: 'B', color: '#36c', kind: 'bot', difficulty: 'easy' },
  { name: 'C', color: '#e83', kind: 'bot', difficulty: 'easy' },
  { name: 'D', color: '#eee', kind: 'bot', difficulty: 'easy' },
];

function assertInvariants(s: GameState): void {
  for (const r of RESOURCES) {
    const total = s.bank[r] + s.players.reduce((n, p) => n + p.resources[r], 0);
    expect(total).toBe(BANK_PER_RESOURCE);
    for (const p of s.players) expect(p.resources[r]).toBeGreaterThanOrEqual(0);
  }
  const devTotal = s.devDeck.length + s.players.reduce((n, p) => n + p.devCards.length + p.newDevCards.length + p.knightsPlayed, 0);
  // Progress cards are removed from the game when played; count them via history is not needed for the bound.
  expect(devTotal).toBeLessThanOrEqual(25);
  for (const p of s.players) {
    const roads = s.roads.filter((o) => o === p.id).length;
    const settlements = s.buildings.filter((b) => b && b.owner === p.id && b.kind === 'settlement').length;
    const cities = s.buildings.filter((b) => b && b.owner === p.id && b.kind === 'city').length;
    expect(roads + p.pieces.roads).toBe(PIECE_LIMITS.roads);
    expect(settlements + p.pieces.settlements).toBe(PIECE_LIMITS.settlements);
    expect(cities + p.pieces.cities).toBe(PIECE_LIMITS.cities);
  }
  if (s.phase.kind !== 'ended') {
    const actor = currentActor(s);
    const legal = legalActions(s, actor);
    expect(legal.length).toBeGreaterThan(0);
    for (const a of legal) expect(validateAction(s, a)).toBeNull();
  }
}

describe('random games', () => {
  it('play to completion without illegal actions and keep invariants', () => {
    let finished = 0;
    const SEEDS = 60;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const bots = new Map<PlayerId, RandomBot>([0, 1, 2, 3].map((p) => [p as PlayerId, new RandomBot()]));
      const runner = new InlineBotRunner(bots, seed);
      const controller = new GameController(newGame({ seed, players: BOTS }), { runner, maxActions: 6000 });
      let steps = 0;
      controller.runToCompletionSync((player, state, legal) => {
        if (steps++ % 25 === 0) assertInvariants(state);
        return runner.decideSync(player, state, legal);
      });
      assertInvariants(controller.state);
      if (controller.state.phase.kind === 'ended') finished++;
    }
    expect(finished).toBeGreaterThanOrEqual(Math.floor(SEEDS * 0.9));
  });

  it('is deterministic for a given seed', () => {
    const run = () => {
      const bots = new Map<PlayerId, RandomBot>([0, 1, 2, 3].map((p) => [p as PlayerId, new RandomBot()]));
      const runner = new InlineBotRunner(bots, 7);
      const controller = new GameController(newGame({ seed: 7, players: BOTS }), { runner, maxActions: 6000 });
      controller.runToCompletionSync((p, s, l) => runner.decideSync(p, s, l));
      return controller.history.map((h) => JSON.stringify(h.action)).join('\n');
    };
    expect(run()).toBe(run());
  });
});
