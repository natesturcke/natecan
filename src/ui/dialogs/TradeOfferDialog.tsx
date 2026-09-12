import { bagCovers } from '@/engine/bag';
import type { GameState, PlayerId, ResourceBag } from '@/engine/types';
import { RESOURCES } from '@/engine/types';
import { Modal } from './Modal';
import { ResourceIcon } from '../ResourceIcon';

function Cards({ bag }: { bag: ResourceBag }): React.JSX.Element {
  return (
    <span className="offer-cards">
      {RESOURCES.flatMap((r) => Array.from({ length: bag[r] }, (_, i) => <ResourceIcon key={`${r}${i}`} resource={r} size={34} />))}
    </span>
  );
}

/** A bot's trade offer to the human, presented centre-screen. */
export function TradeOfferDialog({ state, human, onAccept, onDecline }: { state: GameState; human: PlayerId; onAccept: () => void; onDecline: () => void }): React.JSX.Element | null {
  if (state.phase.kind !== 'tradeOffer') return null;
  const { offer } = state.phase;
  const from = state.players[offer.from].name;
  const canAccept = bagCovers(state.players[human].resources, offer.want);
  return (
    <Modal title={`${from} offers you a trade`}>
      <div className="offer-grid">
        <div className="offer-side">
          <div className="pick-label">You would receive</div>
          <Cards bag={offer.give} />
        </div>
        <div className="offer-arrow">⇄</div>
        <div className="offer-side">
          <div className="pick-label">You would give</div>
          <Cards bag={offer.want} />
        </div>
      </div>
      {!canAccept && <p className="error">You do not have the cards to accept this.</p>}
      <div className="modal-actions">
        <button className="btn" onClick={onDecline}>
          Decline
        </button>
        <button className="btn primary" disabled={!canAccept} onClick={onAccept}>
          Accept trade
        </button>
      </div>
    </Modal>
  );
}
