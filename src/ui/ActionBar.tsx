import { COSTS } from '@/engine/constants';
import type { GameState, PlayerId } from '@/engine/types';
import { currentActor } from '@/engine/state';
import { buildDisabledReason } from './prompts';
import { CostIcons } from './ResourceIcon';
import type { Mode } from './interaction';

export interface ActionBarProps {
  state: GameState;
  human: PlayerId;
  mode: Mode;
  onMode: (mode: Mode) => void;
  onBuyDev: () => void;
  onMaritime: () => void;
  onTrade: () => void;
  onRules: () => void;
  fast: boolean;
  onFast: (on: boolean) => void;
  onQuit: () => void;
}

export function ActionBar(p: ActionBarProps): React.JSX.Element {
  const { state, human } = p;
  const inMain = state.phase.kind === 'main' && currentActor(state) === human;
  const reason = {
    road: buildDisabledReason(state, human, 'road'),
    settlement: buildDisabledReason(state, human, 'settlement'),
    city: buildDisabledReason(state, human, 'city'),
    devCard: buildDisabledReason(state, human, 'devCard'),
  };
  const me = state.players[human];
  const build = (kind: 'road' | 'settlement' | 'city', label: string) => (
    <button
      className={`btn build ${p.mode === kind ? 'on' : ''}`}
      disabled={!!reason[kind]}
      title={reason[kind] ?? `Choose where to build a ${kind}`}
      onClick={() => p.onMode(p.mode === kind ? 'idle' : kind)}
    >
      <span className="build-label">
        {label} <span className="muted">({me.pieces[kind === 'road' ? 'roads' : kind === 'settlement' ? 'settlements' : 'cities']} left)</span>
      </span>
      <CostIcons cost={COSTS[kind]} />
      {reason[kind] && <span className="reason">{reason[kind]}</span>}
    </button>
  );
  return (
    <div className="action-bar">
      <div className="section-title">Build</div>
      {build('road', 'Road')}
      {build('settlement', 'Settlement')}
      {build('city', 'City')}
      <button className="btn build" disabled={!!reason.devCard} title={reason.devCard ?? 'Buy a development card'} onClick={p.onBuyDev}>
        <span className="build-label">
          Development card <span className="muted">({state.devDeck.length} left)</span>
        </span>
        <CostIcons cost={COSTS.devCard} />
        {reason.devCard && <span className="reason">{reason.devCard}</span>}
      </button>
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
