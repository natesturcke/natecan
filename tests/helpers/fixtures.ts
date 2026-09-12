import { newGame, type NewGameOptions } from '@/engine/state';
import type { Building, GameState, PlayerId, PlayerSetup, ResourceBag } from '@/engine/types';
import { bag } from '@/engine/bag';
import { legalActions } from '@/engine/legal';
import { applyAction } from '@/engine/reduce';
import { currentActor } from '@/engine/state';

export const FOUR_PLAYERS: PlayerSetup[] = [
  { name: 'You', color: '#d33', kind: 'human' },
  { name: 'Blue', color: '#36c', kind: 'bot', difficulty: 'easy' },
  { name: 'Orange', color: '#e83', kind: 'bot', difficulty: 'easy' },
  { name: 'White', color: '#eee', kind: 'bot', difficulty: 'easy' },
];

export function freshGame(seed = 1, config?: NewGameOptions['config']): GameState {
  return newGame({ seed, players: FOUR_PLAYERS, config: { allowForcedOutcomes: true, ...config } });
}

/** Plays the setup phase with the first legal choice each time. */
export function throughSetup(state: GameState): GameState {
  let s = state;
  while (s.phase.kind === 'setup') {
    const actor = currentActor(s);
    const legal = legalActions(s, actor);
    s = applyAction(s, legal[0]).state;
  }
  return s;
}

export interface Overrides {
  roads?: Record<number, PlayerId>;
  buildings?: Record<number, Building>;
  resources?: Partial<Record<PlayerId, Partial<ResourceBag>>>;
  robber?: number;
}

/** Builds a mid-game state directly, bypassing rules, for focused unit tests. */
export function stateWith(base: GameState, o: Overrides): GameState {
  const roads = base.roads.slice();
  const buildings = base.buildings.slice();
  const players = base.players.map((p) => ({ ...p, pieces: { ...p.pieces }, resources: { ...p.resources } }));
  for (const [e, owner] of Object.entries(o.roads ?? {})) {
    roads[Number(e)] = owner;
    players[owner].pieces.roads--;
  }
  for (const [v, b] of Object.entries(o.buildings ?? {})) {
    buildings[Number(v)] = b;
    if (b.kind === 'settlement') players[b.owner].pieces.settlements--;
    else players[b.owner].pieces.cities--;
  }
  for (const [id, res] of Object.entries(o.resources ?? {})) {
    players[Number(id)].resources = bag(res);
  }
  return { ...base, roads, buildings, players, robber: o.robber ?? base.robber };
}

export function mainPhaseFor(base: GameState, player: PlayerId): GameState {
  return { ...base, phase: { kind: 'main' }, turn: { ...base.turn, current: player, hasRolled: true } };
}
