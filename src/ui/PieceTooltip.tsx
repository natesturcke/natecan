import { boardIndex } from '@/engine/board/index';
import { TOPOLOGY } from '@/engine/board/topology';
import { DICE_PROBABILITY, TERRAIN_RESOURCE } from '@/engine/constants';
import type { GameState, PlayerId } from '@/engine/types';
import { RESOURCE_LABEL, TERRAIN_LABEL } from './text';

export interface PieceHover {
  kind: 'vertex' | 'edge' | 'harbor';
  id: number;
  x: number;
  y: number;
}

/** Rules-relevant facts about a settlement, city, road or harbour under the cursor. */
export function PieceTooltip({ state, human, hover }: { state: GameState; human: PlayerId; hover: PieceHover }): React.JSX.Element | null {
  if (hover.kind === 'harbor') {
    const harbor = state.board.harbors[hover.id];
    if (!harbor) return null;
    const resourceName = harbor.kind === 'generic' ? null : RESOURCE_LABEL[harbor.kind];
    const owners = harbor.vertices.map((v) => state.buildings[v]).filter((b): b is NonNullable<typeof b> => !!b);
    const yours = owners.some((b) => b.owner === human);
    const names = owners.map((b) => (b.owner === human ? 'you' : state.players[b.owner].name));
    return (
      <div className="tile-tip" style={{ left: hover.x + 18, top: hover.y + 18 }}>
        <div className="tile-tip-title">{resourceName ? `2:1 ${resourceName} Harbour` : '3:1 Harbour'}</div>
        <div className="tile-tip-line">{resourceName ? `Trade 2 ${resourceName} for 1 card of your choice.` : 'Trade any 3 identical cards for 1 card of your choice.'}</div>
        <div className="tile-tip-line">Without a harbour the bank charges 4 identical cards for 1.</div>
        <div className={`tile-tip-line ${yours ? 'good' : 'muted'}`}>
          {owners.length === 0 ? 'Build on one of its two corners to use it.' : yours ? 'You have a settlement here, so you can use it.' : `Used by ${names.join(' and ')}. Build on its other corner to share it.`}
        </div>
      </div>
    );
  }
  if (hover.kind === 'edge') {
    const owner = state.roads[hover.id];
    if (owner === -1) return null;
    const who = owner === human ? 'Your' : `${state.players[owner].name}'s`;
    const total = state.roads.filter((r) => r === owner).length;
    const [a, b] = TOPOLOGY.edgeVertices[hover.id];
    const ends = [a, b].map((v) => state.buildings[v]).filter((x) => x && x.owner === owner).length;
    return (
      <div className="tile-tip" style={{ left: hover.x + 18, top: hover.y + 18 }}>
        <div className="tile-tip-title">{who} road</div>
        <div className="tile-tip-line">
          {total} road{total === 1 ? '' : 's'} in total · {ends === 0 ? 'no town at either end yet' : `${ends} of their towns at its ends`}
        </div>
        <div className="tile-tip-line muted">Longest Road needs 5 or more connected roads (2 points)</div>
      </div>
    );
  }
  const b = state.buildings[hover.id];
  if (!b) return null;
  const owner = b.owner === human ? 'Your' : `${state.players[b.owner].name}'s`;
  const mult = b.kind === 'city' ? 2 : 1;
  const idx = boardIndex(state.board);
  const hexes = TOPOLOGY.vertexHexes[hover.id].map((h) => ({ h, tile: state.board.hexes[h] }));
  const harbor = idx.vertexHarbor[hover.id];
  let expected = 0;
  for (const { h, tile } of hexes) {
    if (tile.token !== null && h !== state.robber && TERRAIN_RESOURCE[tile.terrain]) expected += DICE_PROBABILITY[tile.token] * mult;
  }
  const roadsHere = TOPOLOGY.vertexEdges[hover.id].filter((e) => state.roads[e] === b.owner).length;
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
