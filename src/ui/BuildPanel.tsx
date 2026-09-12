import { COSTS } from '@/engine/constants';
import type { GameState, PlayerId } from '@/engine/types';
import { buildDisabledReason } from './prompts';
import { CostIcons } from './ResourceIcon';
import type { Mode } from './interaction';

export interface BuildPanelProps {
  state: GameState;
  human: PlayerId;
  mode: Mode;
  onMode: (mode: Mode) => void;
  onBuyDev: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

/** What you can build with your hand. Lives on the left, next to the cards that pay for it. */
export function BuildPanel(p: BuildPanelProps): React.JSX.Element {
  const { state, human } = p;
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
      title={reason[kind] ?? `Show only where you can build a ${kind}`}
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
    <div className="build-panel">
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
    </div>
  );
}
