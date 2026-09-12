import { boardIndex } from '@/engine/board/index';
import { TOPOLOGY } from '@/engine/board/topology';
import { DICE_PROBABILITY, TERRAIN_RESOURCE } from '@/engine/constants';
import type { GameState, PlayerId } from '@/engine/types';
import { RESOURCE_LABEL, TERRAIN_LABEL } from './text';

export interface PieceHover {
  vertex: number;
  x: number;
  y: number;
}

/** Rules-relevant facts about a settlement or city under the cursor. */
export function PieceTooltip({ state, human, hover }: { state: GameState; human: PlayerId; hover: PieceHover }): React.JSX.Element | null {
  const b = state.buildings[hover.vertex];
  if (!b) return null;
  const owner = b.owner === human ? 'Your' : `${state.players[b.owner].name}'s`;
  const mult = b.kind === 'city' ? 2 : 1;
  const idx = boardIndex(state.board);
  const hexes = TOPOLOGY.vertexHexes[hover.vertex].map((h) => ({ h, tile: state.board.hexes[h] }));
  const harbor = idx.vertexHarbor[hover.vertex];
  let expected = 0;
  for (const { h, tile } of hexes) {
    if (tile.token !== null && h !== state.robber && TERRAIN_RESOURCE[tile.terrain]) expected += DICE_PROBABILITY[tile.token] * mult;
  }
  const roadsHere = TOPOLOGY.vertexEdges[hover.vertex].filter((e) => state.roads[e] === b.owner).length;
  return (
    <div className="tile-tip" style={{ left: hover.x + 18, top: hover.y + 18 }}>
      <div className="tile-tip-title">
        {owner} {b.kind} <span className="muted">({mult} point{mult > 1 ? 's' : ''})</span>
      </div>
      {hexes.map(({ h, tile }) => {
        const res = TERRAIN_RESOURCE[tile.terrain];
        const blocked = h === state.robber;
        return (
          <div key={h} className={`tile-tip-line ${blocked ? 'bad' : ''}`}>
            {TERRAIN_LABEL[tile.terrain]}
            {tile.token !== null ? ` ${tile.token}` : ''}:{' '}
            {res ? (blocked ? 'blocked by the robber' : `${mult} ${RESOURCE_LABEL[res]} on a ${tile.token} (${Math.round(DICE_PROBABILITY[tile.token!] * 100)}%)`) : 'nothing'}
          </div>
        );
      })}
      <div className="tile-tip-line">About {expected.toFixed(2)} cards per roll</div>
      {harbor && <div className="tile-tip-line">Harbor access: {harbor === 'generic' ? '3:1 any resource' : `2:1 ${RESOURCE_LABEL[harbor]}`}</div>}
      <div className="tile-tip-line muted">
        {roadsHere} road{roadsHere === 1 ? '' : 's'} attached
        {b.kind === 'settlement' ? ' · upgrade to a city for 3 ore + 2 grain' : ' · cities produce double'}
      </div>
    </div>
  );
}
