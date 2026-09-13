import { COSTS } from '@/engine/constants';
import { RESOURCES, type GameState, type PlayerId } from '@/engine/types';
import { RESOURCE_LABEL } from './text';
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
  const pop = (kind: 'road' | 'settlement' | 'city' | 'devCard') => {
    const cost = COSTS[kind];
    const about: Record<typeof kind, string> = {
      road: 'Connects your settlements and opens new corners to build on. The longest road of 5 or more earns Longest Road, worth 2 points.',
      settlement: 'Worth 1 point. Every tile it touches gives you 1 card when its number is rolled. Must be 2 corners away from any other settlement, on your own road.',
      city: 'Upgrade one of your settlements. Worth 2 points, and every tile it touches gives 2 cards instead of 1.',
      devCard: 'A random card: a Knight (move the robber), Road Building (2 free roads), Year of Plenty (2 free cards), Monopoly (take one resource from everyone), or a hidden Victory Point.',
    };
    return (
      <span className="build-pop" aria-hidden="true">
        <span className="build-pop-title">Costs</span>
        <span className="build-pop-cards">
          {RESOURCES.flatMap((r) =>
            Array.from({ length: cost[r] }, (_, i) => (
              <span key={`${r}${i}`} className={`build-pop-card ${me.resources[r] > i ? 'have' : 'missing'}`} title={RESOURCE_LABEL[r]}>
                <img src={`/art/card-${r}.png`} alt="" draggable={false} />
                <span className="build-pop-card-label">{RESOURCE_LABEL[r]}</span>
              </span>
            )),
          )}
        </span>
        <span className="build-pop-about">{about[kind]}</span>
        {reason[kind] && <span className="build-pop-reason">{reason[kind]}</span>}
      </span>
    );
  };
  const build = (kind: 'road' | 'settlement' | 'city', label: string) => (
    <span className="build-wrap">
      <button className={`btn build ${p.mode === kind ? 'on' : ''}`} disabled={!!reason[kind]} onClick={() => p.onMode(p.mode === kind ? 'idle' : kind)}>
        <span className="build-label">
          {label} <span className="muted">({me.pieces[kind === 'road' ? 'roads' : kind === 'settlement' ? 'settlements' : 'cities']} left)</span>
        </span>
        <CostIcons cost={COSTS[kind]} />
        {reason[kind] && <span className="reason">{reason[kind]}</span>}
      </button>
      {pop(kind)}
    </span>
  );
  return (
    <div className="build-panel">
      <div className="section-title">Build</div>
      {build('road', 'Road')}
      {build('settlement', 'Settlement')}
      {build('city', 'City')}
      <span className="build-wrap">
        <button className="btn build" data-build="devCard" disabled={!!reason.devCard} onClick={p.onBuyDev}>
          <span className="build-label">
            Development card <span className="muted">({state.devDeck.length} left)</span>
          </span>
          <CostIcons cost={COSTS.devCard} />
          {reason.devCard && <span className="reason">{reason.devCard}</span>}
        </button>
        {pop('devCard')}
      </span>
    </div>
  );
}
