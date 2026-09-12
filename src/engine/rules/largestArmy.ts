import { LARGEST_ARMY_MIN } from '../constants';
import type { GameState, PlayerId } from '../types';

export function updateLargestArmy(state: GameState, player: PlayerId): { holder: PlayerId | null; size: number; changed: boolean } {
  const knights = state.players[player].knightsPlayed;
  const prev = state.largestArmy;
  if (knights >= LARGEST_ARMY_MIN && knights > prev.size) {
    return { holder: player, size: knights, changed: prev.holder !== player };
  }
  return { ...prev, changed: false };
}
