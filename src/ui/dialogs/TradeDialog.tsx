import { useState } from 'react';
import { bag, bagIsEmpty } from '@/engine/bag';
import { offerShapeError } from '@/engine/rules/trade';
import type { GameState, PlayerId, Resource, ResourceBag } from '@/engine/types';
import { RESOURCES } from '@/engine/types';
import { Modal } from './Modal';
import { ResourceIcon } from '../ResourceIcon';
import { RESOURCE_LABEL } from '../text';

function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }): React.JSX.Element {
  return (
    <span className="stepper">
      <button className="btn tiny" onClick={() => onChange(value - 1)} disabled={value <= 0}>
        −
      </button>
      <span>{value}</span>
      <button className="btn tiny" onClick={() => onChange(value + 1)} disabled={value >= max}>
        +
      </button>
    </span>
  );
}

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
  const set = (which: 'give' | 'want', r: Resource, v: number) => {
    const upd = which === 'give' ? setGive : setWant;
    upd((b) => ({ ...b, [r]: v }));
  };
  return (
    <Modal title="Offer a trade" onClose={onClose}>
      <p className="muted">Every other player will accept or decline. Then you pick who to trade with.</p>
      <table className="trade-table">
        <thead>
          <tr>
            <th></th>
            <th>You give</th>
            <th>You want</th>
          </tr>
        </thead>
        <tbody>
          {RESOURCES.map((r) => (
            <tr key={r}>
              <td>
                <ResourceIcon resource={r} size={18} /> {RESOURCE_LABEL[r]} <span className="muted">({me.resources[r]})</span>
              </td>
              <td>
                <Stepper value={give[r]} max={me.resources[r]} onChange={(v) => set('give', r, v)} />
              </td>
              <td>
                <Stepper value={want[r]} max={19} onChange={(v) => set('want', r, v)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="error">{error}</p>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={bagIsEmpty(give) || bagIsEmpty(want) || !!error} onClick={() => onConfirm(give, want)}>
          Send offer
        </button>
      </div>
    </Modal>
  );
}
