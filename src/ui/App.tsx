import { useMemo, useState } from 'react';
import type { Action } from '@/engine/actions';
import type { GameState, PlayerId } from '@/engine/types';
import { createBot } from '@/bots/registry';
import '@/bots/register-all';
import { InlineBotRunner } from '@/bots/runner';
import type { Bot } from '@/bots/Bot';
import { GameController } from '@/game/GameController';
import { GameScreen } from './GameScreen';
import { MainMenu, type MenuChoice } from './MainMenu';

function botDelay(_action: Action | null, state: GameState): number {
  switch (state.phase.kind) {
    case 'setup':
      return 550;
    case 'preRoll':
      return 500;
    case 'tradeOffer':
      return 350;
    case 'discard':
      return 300;
    default:
      return 450;
  }
}

export function createController(choice: MenuChoice): GameController {
  const bots = new Map<PlayerId, Bot>();
  choice.players.forEach((p, i) => {
    if (p.kind === 'bot') bots.set(i as PlayerId, createBot(p.difficulty ?? 'easy'));
  });
  const runner = new InlineBotRunner(bots, choice.seed);
  const controller = new GameController({ seed: choice.seed, players: choice.players, config: { setupVariant: choice.setupVariant } }, { runner, botDelayMs: botDelay });
  return controller;
}

export function App(): React.JSX.Element {
  const [choice, setChoice] = useState<MenuChoice | null>(null);
  const controller = useMemo(() => (choice ? createController(choice) : null), [choice]);
  if (!choice || !controller) return <MainMenu onStart={setChoice} />;
  return <GameScreen key={choice.seed} controller={controller} human={0} onQuit={() => setChoice(null)} />;
}
