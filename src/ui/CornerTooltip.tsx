import { boardIndex } from '@/engine/board/index';
import { TOPOLOGY } from '@/engine/board/topology';
import { DICE_PROBABILITY, TERRAIN_RESOURCE } from '@/engine/constants';
import type { GameState } from '@/engine/types';
import { RESOURCE_LABEL, TERRAIN_LABEL } from './text';

/** Hover card for a legal corner: what a settlement there would touch. */
export function CornerTooltip({ state, vertex, action, x, y }: { state: GameState; vertex: number; action: string; x: number; y: number }): React.JSX.Element {
  const idx = boardIndex(state.board);
  const hexes = TOPOLOGY.vertexHexes[vertex].map((h) => state.board.hexes[h]);
  const harbor = idx.vertexHarbor[vertex];
  let expected = 0;
  for (const tile of hexes) if (tile.token !== null && TERRAIN_RESOURCE[tile.terrain]) expected += DICE_PROBABILITY[tile.token];
  return (
    <div className="tile-tip corner-tip" style={{ left: x + 18, top: y + 18 }}>
      <div className="tile-tip-title">{action}</div>
      {hexes.map((tile, i) => {
        const res = TERRAIN_RESOURCE[tile.terrain];
        return (
          <div key={i} className="tile-tip-line">
            {TERRAIN_LABEL[tile.terrain]}
            {tile.token !== null ? ` ${tile.token}` : ''}: {res ? `${RESOURCE_LABEL[res]} (${Math.round(DICE_PROBABILITY[tile.token!] * 100)}% of rolls)` : 'nothing'}
          </div>
        );
      })}
      {hexes.length < 3 && <div className="tile-tip-line muted">Coastal corner: touches only {hexes.length} hex{hexes.length === 1 ? '' : 'es'}</div>}
      <div className="tile-tip-line">About {expected.toFixed(2)} cards per roll</div>
      {harbor && <div className="tile-tip-line">Harbor: {harbor === 'generic' ? '3:1 any resource' : `2:1 ${RESOURCE_LABEL[harbor]}`}</div>}
    </div>
  );
}
