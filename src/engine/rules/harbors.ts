import { boardIndex } from '../board/index';
import type { GameState, PlayerId, Resource } from '../types';
import { RESOURCES } from '../types';

export function computeHarborRates(state: GameState, player: PlayerId): Record<Resource, 2 | 3 | 4> {
  const idx = boardIndex(state.board);
  const rates: Record<Resource, 2 | 3 | 4> = { brick: 4, lumber: 4, ore: 4, grain: 4, wool: 4 };
  state.buildings.forEach((b, v) => {
    if (!b || b.owner !== player) return;
    const kind = idx.vertexHarbor[v];
    if (!kind) return;
    if (kind === 'generic') {
      for (const r of RESOURCES) if (rates[r] > 3) rates[r] = 3;
    } else {
      rates[kind] = 2;
    }
  });
  return rates;
}
