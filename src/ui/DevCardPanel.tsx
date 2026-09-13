import { useState } from 'react';
import type { DevCard, GameState, PlayerId } from '@/engine/types';
import { validateAction } from '@/engine/legal';
import { DEV_DESCRIPTION, DEV_LABEL } from './text';
import { Modal } from './dialogs/Modal';

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
  const [inspect, setInspect] = useState<number | null>(null);
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

  const reasonFor = (card: DevCard, isNew: boolean) => (isNew ? 'Bought this turn: playable from your next turn' : playable(card));
  const looking = inspect !== null ? cards[inspect] : null;

  return (
    <div className="dev-fan">
      <div className="hand-title">Development cards</div>
      <div className="dev-cards">
        {cards.map(({ card, isNew }, i) => {
          const reason = reasonFor(card, isNew);
          return (
            <div key={i} className={`dev-card-wrap ${isNew ? 'new' : ''}`}>
              <button type="button" className="dev-face-btn" title={`${DEV_LABEL[card]}: click to read it`} onClick={() => setInspect(i)}>
                <DevFace card={card} />
              </button>
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
      {looking && (
        <Modal title={DEV_LABEL[looking.card]} onClose={() => setInspect(null)} spotlight>
          <div className="dev-inspect">
            <div className="dev-inspect-art">
              <DevFace card={looking.card} />
            </div>
            <div className="dev-inspect-body">
              <h2 className="dev-inspect-title">{DEV_LABEL[looking.card]}</h2>
              <p className="dev-inspect-text">{DEV_DESCRIPTION[looking.card]}</p>
              <p className="muted dev-inspect-rule">
                {looking.card === 'victoryPoint'
                  ? 'Stays hidden from the other players and counts on its own. Nothing to play.'
                  : 'You may play one development card per turn, and never on the turn you bought it. Knights can be played before you roll.'}
              </p>
              {reasonFor(looking.card, looking.isNew) && looking.card !== 'victoryPoint' && <p className="error">{reasonFor(looking.card, looking.isNew)}</p>}
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setInspect(null)}>
              Close
            </button>
            {looking.card !== 'victoryPoint' && (
              <button
                className="btn primary"
                disabled={!!reasonFor(looking.card, looking.isNew)}
                onClick={(e) => {
                  setInspect(null);
                  onPlay(looking.card, e);
                }}
              >
                Play {DEV_LABEL[looking.card]}
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
