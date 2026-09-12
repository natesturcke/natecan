import { useMemo, useSyncExternalStore } from 'react';
import type { GameController } from './GameController';

/** Subscribes a component to the controller's state and history. */
export function useGame(controller: GameController) {
  const subscribe = useMemo(() => (cb: () => void) => controller.subscribe(cb), [controller]);
  const state = useSyncExternalStore(subscribe, () => controller.state, () => controller.state);
  const historyLength = useSyncExternalStore(subscribe, () => controller.history.length, () => controller.history.length);
  return { state, historyLength, history: controller.history };
}
