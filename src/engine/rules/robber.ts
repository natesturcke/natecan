import { TOPOLOGY } from '../board/topology';
import { bagTotal } from '../bag';
import type { GameState, HexId, PlayerId } from '../types';

/** Players other than `mover` with a building on the hex and at least one card. */
export function robberVictims(state: GameState, mover: PlayerId, hex: HexId): PlayerId[] {
  const seen = new Set<PlayerId>();
  for (const v of TOPOLOGY.hexVertices[hex]) {
    const b = state.buildings[v];
    if (!b || b.owner === mover) continue;
    if (bagTotal(state.players[b.owner].resources) === 0) continue;
    seen.add(b.owner);
  }
  return [...seen].sort((a, b) => a - b);
}
