import type { Building, GameState, Harbor, HexTile, PlayerId } from '@/engine/types';

/** Minimal projection of GameState that the Phaser scene renders. */
export interface BoardView {
  hexes: readonly HexTile[];
  harbors: readonly Harbor[];
  robber: number;
  roads: readonly (PlayerId | -1)[];
  buildings: readonly (Building | null)[];
  playerColors: readonly string[];
}

export interface Highlights {
  vertices: readonly number[];
  edges: readonly number[];
  hexes: readonly number[];
}

export type Ghost =
  | { kind: 'settlement' | 'city'; vertex: number; player: PlayerId }
  | { kind: 'road'; edge: number; player: PlayerId }
  | { kind: 'robber'; hex: number }
  | null;

export const NO_HIGHLIGHTS: Highlights = { vertices: [], edges: [], hexes: [] };

const cache = new WeakMap<GameState, BoardView>();

export function toBoardView(state: GameState): BoardView {
  let v = cache.get(state);
  if (v) return v;
  v = {
    hexes: state.board.hexes,
    harbors: state.board.harbors,
    robber: state.robber,
    roads: state.roads,
    buildings: state.buildings,
    playerColors: state.players.map((p) => p.color),
  };
  cache.set(state, v);
  return v;
}
