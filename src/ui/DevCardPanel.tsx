import type { DevCard, GameState, PlayerId } from '@/engine/types';
import { validateAction } from '@/engine/legal';
import { DEV_DESCRIPTION, DEV_LABEL } from './text';

export function DevCardPanel({ state, human, onPlay }: { state: GameState; human: PlayerId; onPlay: (card: DevCard) => void }): React.JSX.Element | null {
  const me = state.players[human];
  if (me.devCards.length === 0 && me.newDevCards.length === 0) return null;
  const counts = new Map<DevCard, number>();
  for (const c of me.devCards) counts.set(c, (counts.get(c) ?? 0) + 1);
  const newCounts = new Map<DevCard, number>();
  for (const c of me.newDevCards) newCounts.set(c, (newCounts.get(c) ?? 0) + 1);

  const playable = (card: DevCard): string | null => {
    switch (card) {
      case 'knight':
        return validateAction(state, { player: human, type: 'PLAY_KNIGHT' });
      case 'roadBuilding':
        return validateAction(state, { player: human, type: 'PLAY_ROAD_BUILDING' });
      case 'yearOfPlenty':
        return validateAction(state, { player: human, type: 'PLAY_YEAR_OF_PLENTY', first: 'brick', second: 'brick' }) && 'Not now';
      case 'monopoly':
        return validateAction(state, { player: human, type: 'PLAY_MONOPOLY', resource: 'brick' });
      case 'victoryPoint':
        return 'Counts automatically';
    }
  };

  return (
    <div className="dev-panel">
      <div className="section-title">Development cards</div>
      {[...counts.entries()].map(([card, n]) => {
        const reason = playable(card);
        return (
          <div key={card} className="dev-card" title={DEV_DESCRIPTION[card]}>
            <span>
              <b>{DEV_LABEL[card]}</b> ×{n}
            </span>
            {card !== 'victoryPoint' && (
              <button className="btn small" disabled={!!reason} title={reason ?? DEV_DESCRIPTION[card]} onClick={() => onPlay(card)}>
                Play
              </button>
            )}
          </div>
        );
      })}
      {[...newCounts.entries()].map(([card, n]) => (
        <div key={`new-${card}`} className="dev-card muted" title="Bought this turn: playable from your next turn">
          <span>
            <b>{DEV_LABEL[card]}</b> ×{n} <em>(new)</em>
          </span>
        </div>
      ))}
    </div>
  );
}
