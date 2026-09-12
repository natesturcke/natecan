import { TOPOLOGY } from '@/engine/board/topology';
import { DICE_PROBABILITY, TERRAIN_RESOURCE } from '@/engine/constants';
import type { GameState, PlayerId } from '@/engine/types';
import { RESOURCE_LABEL, TERRAIN_LABEL } from './text';

export interface TileHover {
  hex: number;
  x: number;
  y: number;
}

/** Facts about the hex under the cursor: terrain, number, odds, who is settled around it. */
export function TileTooltip({ state, human, hover }: { state: GameState; human: PlayerId; hover: TileHover }): React.JSX.Element {
  const tile = state.board.hexes[hover.hex];
  const resource = TERRAIN_RESOURCE[tile.terrain];
  const odds = tile.token !== null ? Math.round(DICE_PROBABILITY[tile.token] * 100) : 0;
  const pips = tile.token !== null ? 6 - Math.abs(7 - tile.token) : 0;
  const around = new Map<PlayerId, { settlements: number; cities: number }>();
  for (const v of TOPOLOGY.hexVertices[hover.hex]) {
    const b = state.buildings[v];
    if (!b) continue;
    const entry = around.get(b.owner) ?? { settlements: 0, cities: 0 };
    if (b.kind === 'city') entry.cities++;
    else entry.settlements++;
    around.set(b.owner, entry);
  }
  const robber = state.robber === hover.hex;
  const harbors = state.board.harbors.filter((h) => TOPOLOGY.edgeHexes[h.edge].includes(hover.hex));
  return (
    <div className="tile-tip" style={{ left: hover.x + 18, top: hover.y + 18 }}>
      <div className="tile-tip-title">
        {TERRAIN_LABEL[tile.terrain]}
        {tile.token !== null && <span className={`tile-tip-token ${tile.token === 6 || tile.token === 8 ? 'red' : ''}`}>{tile.token}</span>}
      </div>
      <div className="tile-tip-line">{resource ? `Produces ${RESOURCE_LABEL[resource]}` : 'Produces nothing'}</div>
      {tile.token !== null && (
        <div className="tile-tip-line">
          Rolled about {odds}% of turns ({'•'.repeat(pips)})
        </div>
      )}
      {robber && <div className="tile-tip-line bad">Blocked by the robber</div>}
      {harbors.map((h) => (
        <div key={h.edge} className="tile-tip-line">
          Harbor: {h.kind === 'generic' ? '3:1 any resource' : `2:1 ${RESOURCE_LABEL[h.kind]}`}
        </div>
      ))}
      <div className="tile-tip-line muted">
        {around.size === 0
          ? 'Nobody settled here yet'
          : [...around.entries()]
              .map(([p, c]) => `${p === human ? 'You' : state.players[p].name}: ${[c.settlements ? `${c.settlements} settlement${c.settlements > 1 ? 's' : ''}` : '', c.cities ? `${c.cities} cit${c.cities > 1 ? 'ies' : 'y'}` : ''].filter(Boolean).join(', ')}`)
              .join(' · ')}
      </div>
    </div>
  );
}
