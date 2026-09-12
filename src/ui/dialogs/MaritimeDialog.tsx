import { useState } from 'react';
import type { Resource, GameState, PlayerId } from '@/engine/types';
import { RESOURCES } from '@/engine/types';
import { maritimeTradeError } from '@/engine/rules/trade';
import { Modal } from './Modal';
import { ResourceIcon } from '../ResourceIcon';
import { RESOURCE_LABEL } from '../text';

export function MaritimeDialog({
  state,
  human,
  onConfirm,
  onClose,
}: {
  state: GameState;
  human: PlayerId;
  onConfirm: (give: Resource, receive: Resource) => void;
  onClose: () => void;
}): React.JSX.Element {
  const me = state.players[human];
  const [give, setGive] = useState<Resource | null>(null);
  const [receive, setReceive] = useState<Resource | null>(null);
  const error = give && receive ? maritimeTradeError(state, human, give, receive) : null;
  return (
    <Modal title="Trade with the bank" onClose={onClose}>
      <p className="muted">Give a number of one resource for 1 of another. Your rate depends on harbors you have settled.</p>
      <div className="pick-row">
        <div>
          <div className="pick-label">Give</div>
          {RESOURCES.map((r) => {
            const rate = me.harborRates[r];
            const ok = me.resources[r] >= rate;
            return (
              <button key={r} className={`pick ${give === r ? 'on' : ''}`} disabled={!ok} onClick={() => setGive(r)} title={ok ? '' : `You need ${rate} ${r}`}>
                <ResourceIcon resource={r} size={18} /> {rate} {RESOURCE_LABEL[r]}
              </button>
            );
          })}
        </div>
        <div>
          <div className="pick-label">Receive</div>
          {RESOURCES.map((r) => (
            <button key={r} className={`pick ${receive === r ? 'on' : ''}`} disabled={r === give || state.bank[r] < 1} onClick={() => setReceive(r)}>
              <ResourceIcon resource={r} size={18} /> 1 {RESOURCE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={!give || !receive || !!error} onClick={() => give && receive && onConfirm(give, receive)}>
          Confirm trade
        </button>
      </div>
    </Modal>
  );
}
