import { useEffect, useMemo, useState } from 'react';
import type { GameEvent } from '@/engine/events';
import type { GameState, PlayerId } from '@/engine/types';
import { createBot } from '@/bots/registry';
import '@/bots/register-all';
import { InlineBotRunner } from '@/bots/runner';
import type { Bot } from '@/bots/Bot';
import { GameController } from '@/game/GameController';
import { gameIdFromUrl, loadGame, newGameId, saveGame, setUrlGameId } from '@/game/persistence';
import { GameScreen } from './GameScreen';
import { MainMenu, type MenuChoice } from './MainMenu';

function botDelay(state: GameState, lastEvents: readonly GameEvent[]): number {
  // Leave time for the dice animation to play out before the next bot action.
  if (lastEvents.some((e) => e.type === 'diceRolled')) return 5600;
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

interface Session {
  id: string;
  choice: MenuChoice;
  controller: GameController;
}

/** Opens the game named in the URL, if it was saved in this browser. */
function sessionFromUrl(): Session | null {
  const id = gameIdFromUrl();
  if (!id) return null;
  const saved = loadGame(id);
  if (!saved) return null;
  const controller = createController(saved.choice);
  try {
    controller.replay(saved.actions);
  } catch {
    // A save from an older rules version may no longer replay; start it fresh rather than crash.
    return { id, choice: saved.choice, controller: createController(saved.choice) };
  }
  return { id, choice: saved.choice, controller };
}

export function App(): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(() => sessionFromUrl());

  // Every action is saved under the game's id, so the URL can bring the game back.
  useEffect(() => {
    if (!session) return;
    const { id, choice, controller } = session;
    setUrlGameId(id);
    const persist = () => saveGame(id, choice, controller.history.map((h) => h.action));
    persist();
    return controller.subscribe(persist);
  }, [session]);

  const start = useMemo(
    () => (choice: MenuChoice) => {
      const id = newGameId();
      setSession({ id, choice, controller: createController(choice) });
    },
    [],
  );
  const resume = (id: string) => {
    setUrlGameId(id);
    const s = sessionFromUrl();
    if (s) setSession(s);
  };

  if (!session) return <MainMenu onStart={start} onResume={resume} />;
  return (
    <GameScreen
      key={session.id}
      controller={session.controller}
      human={0}
      onQuit={() => {
        setUrlGameId(null);
        setSession(null);
      }}
    />
  );
}
