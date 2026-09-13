import { useEffect, useState } from 'react';
import { bagCovers, bagTotal } from '@/engine/bag';
import type { GameState, PlayerId, ResourceBag } from '@/engine/types';
import { RESOURCES } from '@/engine/types';
import { Modal } from './Modal';
import { PlayerHand } from '../PlayerHand';
import { RESOURCE_LABEL, bagText } from '../text';

/** The cards in an offer, drawn large with their art and names so the deal reads at a glance. */
function Cards({ bag }: { bag: ResourceBag }): React.JSX.Element {
  const total = bagTotal(bag);
  if (total === 0) return <span className="offer-nothing">nothing</span>;
  return (
    <span className="offer-cards big">
      {RESOURCES.flatMap((r) =>
        Array.from({ length: bag[r] }, (_, i) => (
          <span key={`${r}${i}`} className="offer-card" title={RESOURCE_LABEL[r]}>
            <img src={`/art/card-${r}.png`} alt="" draggable={false} />
            <span className="offer-card-label">{RESOURCE_LABEL[r]}</span>
          </span>
        )),
      )}
    </span>
  );
}

/**
 * A bot's trade offer to the human, presented centre-screen. Clicking outside the card tucks it
 * away so you can look at your hand and the board; a small tab brings it back.
 */
export function TradeOfferDialog({ state, human, onAccept, onDecline }: { state: GameState; human: PlayerId; onAccept: () => void; onDecline: () => void }): React.JSX.Element | null {
  const [peeking, setPeeking] = useState(false);
  const offerKey = state.phase.kind === 'tradeOffer' ? `${state.actionCount}` : null;
  // A fresh offer always opens in full.
  useEffect(() => setPeeking(false), [offerKey]);

  if (state.phase.kind !== 'tradeOffer') return null;
  const { offer } = state.phase;
  const from = state.players[offer.from].name;
  const mine = state.players[human].resources;
  const canAccept = bagCovers(mine, offer.want);

  if (peeking) {
    return (
      <button className="offer-peek" onClick={() => setPeeking(false)}>
        <span className="offer-peek-title">{from} offers {bagText(offer.give)} for {bagText(offer.want)}</span>
        <span className="offer-peek-cta">Back to the offer</span>
      </button>
    );
  }

  return (
    <Modal title={`${from} offers you a trade`} onClose={() => setPeeking(true)} wide>
      <div className="offer-hand">
        <div className="offer-heading">Your hand <span className="muted">(the lifted cards are the ones you would hand over)</span></div>
        <PlayerHand resources={mine} selected={offer.want} />
      </div>
      <div className="offer-grid">
        <div className="offer-side">
          <div className="offer-heading get">You get</div>
          <Cards bag={offer.give} />
        </div>
        <div className="offer-arrow">⇄</div>
        <div className="offer-side">
          <div className="offer-heading give">You give</div>
          <Cards bag={offer.want} />
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={() => setPeeking(true)} title="Hide the offer for a moment to look at your hand and the board">
          Look at my hand
        </button>
        {!canAccept && <span className="error offer-cannot">You do not have the cards to accept this.</span>}
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
