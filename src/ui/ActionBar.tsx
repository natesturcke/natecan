import type { GameState, PlayerId } from '@/engine/types';
import { currentActor } from '@/engine/state';

export interface ActionBarProps {
  state: GameState;
  human: PlayerId;
  onMaritime: () => void;
  onTrade: () => void;
  onRules: () => void;
  fast: boolean;
  onFast: (on: boolean) => void;
  onQuit: () => void;
}

/** Table-side controls: trading with others, rules and game settings. Building lives in the left BuildPanel. */
export function ActionBar(p: ActionBarProps): React.JSX.Element {
  const { state, human } = p;
  const inMain = state.phase.kind === 'main' && currentActor(state) === human;
  return (
    <div className="action-bar">
      <div className="section-title">Trade</div>
      <div className="row">
        <button className="btn" disabled={!inMain} onClick={p.onMaritime} title="Trade resources with the bank">
          With the bank
        </button>
        <button className="btn" disabled={!inMain} onClick={p.onTrade} title="Offer a trade to the other players">
          With players
        </button>
      </div>
      <div className="row bottom">
        <button className="btn" onClick={p.onRules}>
          Rules
        </button>
        <label className="toggle">
          <input type="checkbox" checked={p.fast} onChange={(e) => p.onFast(e.target.checked)} /> Fast bots
        </label>
        <button className="btn danger" onClick={p.onQuit}>
          Quit
        </button>
      </div>
    </div>
  );
}
