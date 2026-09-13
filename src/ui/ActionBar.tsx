import { useState } from 'react';
import type { GameState, PlayerId } from '@/engine/types';
import { currentActor } from '@/engine/state';
import { UI_ART, uiArtPath } from './uiArt';

export interface ActionBarProps {
  state: GameState;
  human: PlayerId;
  onMaritime: () => void;
  onTrade: () => void;
  onRules: () => void;
  onQuit: () => void;
}

/** Table-side controls: the trading post, rules and game settings. Building lives in the BuildPanel. */
export function ActionBar(p: ActionBarProps): React.JSX.Element {
  const { state, human } = p;
  const inMain = state.phase.kind === 'main' && currentActor(state) === human;
  const [artMissing, setArtMissing] = useState(false);
  return (
    <div className="action-bar">
      <div className="trading-post" title={inMain ? 'Trade resources' : 'You can trade during your turn, after rolling'}>
        <div className="trading-post-centre">
          {!artMissing && <img className="trading-post-art" src={uiArtPath(UI_ART.tradingPost)} alt="" draggable={false} onError={() => setArtMissing(true)} />}
          <div className="trading-post-title">Trading Post</div>
        </div>
        <div className="trading-post-stack">
          <button className="btn small" disabled={!inMain} onClick={p.onMaritime} title="Trade resources with the bank at 4:1, or better with a harbour">
            Trade with Bank
          </button>
          <button className="btn small" disabled={!inMain} onClick={p.onTrade} title="Offer a trade to the other players">
            Trade with Players
          </button>
        </div>
      </div>
      <div className="row bottom">
        <button className="btn" onClick={p.onRules}>
          Rules
        </button>
        <button className="btn danger" onClick={p.onQuit}>
          Quit
        </button>
      </div>
    </div>
  );
}
