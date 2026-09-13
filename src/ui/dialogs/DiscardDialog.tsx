import { bagTotal } from '@/engine/bag';
import { DISCARD_THRESHOLD } from '@/engine/constants';
import { discardCount } from '@/engine/rules/trade';
import type { GameState, PlayerId, Resource, ResourceBag } from '@/engine/types';
import { RESOURCES } from '@/engine/types';
import { Modal } from './Modal';
import { PlayerHand } from '../PlayerHand';
import { RESOURCE_LABEL, bagText } from '../text';

/** A 7 was rolled and you hold too many cards: pick which ones to give up. */
export function DiscardDialog({
  state,
  human,
  pick,
  onToggle,
  onConfirm,
}: {
  state: GameState;
  human: PlayerId;
  pick: ResourceBag;
  onToggle: (r: Resource, delta: 1 | -1) => void;
  onConfirm: () => void;
}): React.JSX.Element {
  const me = state.players[human];
  const need = discardCount(me.resources, DISCARD_THRESHOLD);
  const chosen = bagTotal(pick);
  const left = need - chosen;
  return (
    <Modal title={`A 7 was rolled. Discard ${need} card${need === 1 ? '' : 's'}.`} wide>
      <p className="muted discard-intro">
        You hold {bagTotal(me.resources)} cards, more than {DISCARD_THRESHOLD}, so half go back to the bank. Click cards in your hand to choose; click again to keep.
      </p>
      <div className="offer-hand">
        <div className="offer-heading">
          Your hand <span className="muted">(lifted cards will be discarded)</span>
        </div>
        <PlayerHand resources={me.resources} selectable selected={pick} onToggle={onToggle} />
      </div>
      <div className="discard-tally">
        {chosen > 0 ? (
          <span className="offer-cards big">
            {RESOURCES.flatMap((r) =>
              Array.from({ length: pick[r] }, (_, i) => (
                <button key={`${r}${i}`} type="button" className="offer-card clickable" title={`Keep ${RESOURCE_LABEL[r]}`} onClick={() => onToggle(r, -1)}>
                  <img src={`/art/card-${r}.png`} alt="" draggable={false} />
                  <span className="offer-card-label">{RESOURCE_LABEL[r]}</span>
                  <span className="offer-card-x">×</span>
                </button>
              )),
            )}
          </span>
        ) : (
          <span className="offer-nothing">nothing chosen yet</span>
        )}
      </div>
      <div className="modal-actions">
        <span className="discard-count muted">{left > 0 ? `Choose ${left} more` : `Discarding ${bagText(pick)}`}</span>
        <button className="btn primary" disabled={left !== 0} onClick={onConfirm}>
          Discard
        </button>
      </div>
    </Modal>
  );
}
