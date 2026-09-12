import { COSTS } from '@/engine/constants';
import { CostIcons } from './ResourceIcon';

export function RulesDrawer({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal rules" onClick={(e) => e.stopPropagation()}>
        <h2>How to play</h2>
        <p>Be the first to reach 10 victory points on your turn. Settlements are worth 1, cities 2, Longest Road and Largest Army 2 each, and some development cards 1.</p>
        <h3>Each turn</h3>
        <ol>
          <li>Roll the dice. Every settlement next to a hex with that number produces 1 card (cities 2).</li>
          <li>Trade with other players or the bank (4 of one kind for 1, better at harbors).</li>
          <li>Build roads, settlements and cities, or buy development cards. Then end your turn.</li>
        </ol>
        <h3>Building costs</h3>
        <table>
          <tbody>
            <tr>
              <td>Road</td>
              <td>
                <CostIcons cost={COSTS.road} />
              </td>
            </tr>
            <tr>
              <td>Settlement (1 point)</td>
              <td>
                <CostIcons cost={COSTS.settlement} />
              </td>
            </tr>
            <tr>
              <td>City (2 points)</td>
              <td>
                <CostIcons cost={COSTS.city} />
              </td>
            </tr>
            <tr>
              <td>Development card</td>
              <td>
                <CostIcons cost={COSTS.devCard} />
              </td>
            </tr>
          </tbody>
        </table>
        <h3>Terrain</h3>
        <p>Hills make brick, Forest lumber, Mountains ore, Fields grain, Pasture wool. The Desert makes nothing.</p>
        <h3>Placing pieces</h3>
        <p>Settlements go on corners, at least two corners away from any other settlement, and must touch one of your roads. Roads go on paths connected to your roads or settlements. A city replaces one of your settlements.</p>
        <h3>The robber</h3>
        <p>On a 7 nobody produces. Anyone holding more than 7 cards discards half. The roller moves the robber to a new hex, which stops producing, and steals one card from a neighbour of that hex.</p>
        <h3>Special cards</h3>
        <p>Longest Road: first to 5 connected road pieces; a longer road takes it. Largest Army: first to play 3 Knights; more knights take it.</p>
        <button className="btn primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
