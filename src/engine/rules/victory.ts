import type { GameState, PlayerId } from '../types';

export function publicVictoryPoints(state: GameState, player: PlayerId): number {
  let vp = 0;
  for (const b of state.buildings) {
    if (b && b.owner === player) vp += b.kind === 'city' ? 2 : 1;
  }
  if (state.longestRoad.holder === player) vp += 2;
  if (state.largestArmy.holder === player) vp += 2;
  return vp;
}

export function hiddenVictoryPoints(state: GameState, player: PlayerId): number {
  return state.players[player].devCards.filter((c) => c === 'victoryPoint').length;
}

export function totalVictoryPoints(state: GameState, player: PlayerId): number {
  return publicVictoryPoints(state, player) + hiddenVictoryPoints(state, player);
}

export function hasWon(state: GameState, player: PlayerId): boolean {
  return totalVictoryPoints(state, player) >= state.config.victoryPoints;
}
