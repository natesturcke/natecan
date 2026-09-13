import { useState } from 'react';
import { bag, bagIsEmpty, bagTotal } from '@/engine/bag';
import { offerShapeError } from '@/engine/rules/trade';
import type { GameState, PlayerId, Resource, ResourceBag } from '@/engine/types';
import { RESOURCES } from '@/engine/types';
import { Modal } from './Modal';
import { PlayerHand } from '../PlayerHand';
import { RESOURCE_LABEL, bagText } from '../text';

/** Big named cards; clicking one removes it from that side of the deal. */
function Cards({ bag: b, onRemove, empty }: { bag: ResourceBag; onRemove: (r: Resource) => void; empty: string }): React.JSX.Element {
  if (bagTotal(b) === 0) return <span className="offer-nothing">{empty}</span>;
  return (
    <span className="offer-cards big">
      {RESOURCES.flatMap((r) =>
        Array.from({ length: b[r] }, (_, i) => (
          <button key={`${r}${i}`} type="button" className="offer-card clickable" title={`Remove ${RESOURCE_LABEL[r]}`} onClick={() => onRemove(r)}>
            <img src={`/art/card-${r}.png`} alt="" draggable={false} />
            <span className="offer-card-label">{RESOURCE_LABEL[r]}</span>
            <span className="offer-card-x">×</span>
          </button>
        )),
      )}
    </span>
  );
}

/**
 * Make an offer to the other players. Click cards in your hand to put them on the table,
 * and click the bank's cards to say what you want back. Same look as an incoming offer.
 */
export function TradeDialog({
  state,
  human,
  onConfirm,
  onClose,
}: {
  state: GameState;
  human: PlayerId;
  onConfirm: (give: ResourceBag, want: ResourceBag) => void;
  onClose: () => void;
}): React.JSX.Element {
  const me = state.players[human];
  const [give, setGive] = useState<ResourceBag>(bag());
  const [want, setWant] = useState<ResourceBag>(bag());
  const error = bagIsEmpty(give) || bagIsEmpty(want) ? null : offerShapeError(give, want);
  const ready = !bagIsEmpty(give) && !bagIsEmpty(want) && !error;

  const addGive = (r: Resource, delta: 1 | -1) => setGive((b) => ({ ...b, [r]: Math.max(0, Math.min(me.resources[r], b[r] + delta)) }));
  const addWant = (r: Resource, delta: 1 | -1) => setWant((b) => ({ ...b, [r]: Math.max(0, Math.min(19, b[r] + delta)) }));

  return (
    <Modal title="Offer a trade" onClose={onClose} wide>
      <div className="offer-hand">
        <div className="offer-heading">
          Your hand <span className="muted">(click cards to put them on the table)</span>
        </div>
        <PlayerHand resources={me.resources} selectable selected={give} onToggle={addGive} />
      </div>
      <div className="offer-grid">
        <div className="offer-side">
          <div className="offer-heading give">You give</div>
          <Cards bag={give} onRemove={(r) => addGive(r, -1)} empty="Click cards in your hand above" />
        </div>
        <div className="offer-arrow">⇄</div>
        <div className="offer-side">
          <div className="offer-heading get">You want</div>
          <Cards bag={want} onRemove={(r) => addWant(r, -1)} empty="Pick from the bank below" />
          <div className="offer-picker" aria-label="Add a resource you want">
            {RESOURCES.map((r) => (
              <button key={r} type="button" className="offer-pick" title={`Ask for 1 ${RESOURCE_LABEL[r]}`} onClick={() => addWant(r, 1)} disabled={give[r] > 0}>
                <img src={`/art/card-${r}.png`} alt="" draggable={false} />
                <span className="offer-pick-plus">+</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className={error ? 'error' : 'muted offer-summary'}>
        {error ?? (ready ? `You offer ${bagText(give)} for ${bagText(want)}. Every other player will accept or decline, then you pick who to trade with.` : 'Every other player will accept or decline. Then you pick who to trade with.')}
      </p>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={!ready} onClick={() => onConfirm(give, want)}>
          Send offer
        </button>
      </div>
    </Modal>
  );
}
