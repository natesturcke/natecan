import { useState } from 'react';
import type { DevCard, GameState, PlayerId } from '@/engine/types';
import { validateAction } from '@/engine/legal';
import { DEV_DESCRIPTION, DEV_LABEL } from './text';

const ART: Record<DevCard, string> = {
  knight: 'dev-knight',
  roadBuilding: 'dev-road-building',
  yearOfPlenty: 'dev-year-of-plenty',
  monopoly: 'dev-monopoly',
  victoryPoint: 'dev-vp',
};

function DevFace({ card }: { card: DevCard }): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="card-face fallback dev">{DEV_LABEL[card]}</div>;
  return <img className="card-face" src={`/art/${ART[card]}.png`} alt={DEV_LABEL[card]} draggable={false} onError={() => setFailed(true)} />;
}

export function DevCardPanel({ state, human, onPlay }: { state: GameState; human: PlayerId; onPlay: (card: DevCard, e: React.MouseEvent<HTMLButtonElement>) => void }): React.JSX.Element | null {
  const me = state.players[human];
  if (me.devCards.length === 0 && me.newDevCards.length === 0) return null;

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

  const cards: { card: DevCard; isNew: boolean }[] = [
    ...me.devCards.map((card) => ({ card, isNew: false })),
    ...me.newDevCards.map((card) => ({ card, isNew: true })),
  ];

  return (
    <div className="dev-fan">
      <div className="hand-title">Development cards</div>
      <div className="dev-cards">
        {cards.map(({ card, isNew }, i) => {
          const reason = isNew ? 'Bought this turn: playable from your next turn' : playable(card);
          return (
            <div key={i} className={`dev-card-wrap ${isNew ? 'new' : ''}`} title={`${DEV_LABEL[card]}: ${DEV_DESCRIPTION[card]}`}>
              <DevFace card={card} />
              {card !== 'victoryPoint' && (
                <button className="btn small dev-play" disabled={!!reason} title={reason ?? DEV_DESCRIPTION[card]} onClick={(e) => onPlay(card, e)}>
                  Play
                </button>
              )}
              {isNew && <span className="dev-new">new</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
