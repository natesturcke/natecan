import { useState } from 'react';
import { bag, bagCovers, bagTotal } from '@/engine/bag';
import type { GameState, Resource, ResourceBag } from '@/engine/types';
import { RESOURCES } from '@/engine/types';
import { Modal } from './Modal';
import { ResourceIcon } from '../ResourceIcon';
import { RESOURCE_LABEL } from '../text';

/** Shared picker for Year of Plenty (2 from the bank) and Monopoly (1 resource type). */
export function PickResourcesDialog({
  state,
  title,
  description,
  count,
  fromBank,
  onConfirm,
  onClose,
}: {
  state: GameState;
  title: string;
  description: string;
  count: number;
  fromBank: boolean;
  onConfirm: (picked: Resource[]) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [picked, setPicked] = useState<Resource[]>([]);
  const asBag = (list: Resource[]): ResourceBag => {
    const b = bag();
    for (const r of list) b[r]++;
    return b;
  };
  const canAdd = (r: Resource) => picked.length < count && (!fromBank || bagCovers(state.bank, asBag([...picked, r])));
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{description}</p>
      <div className="pick-grid">
        {RESOURCES.map((r) => (
          <button key={r} className="pick" disabled={!canAdd(r)} onClick={() => setPicked((p) => [...p, r])}>
            <ResourceIcon resource={r} size={20} /> {RESOURCE_LABEL[r]}
            {fromBank && <span className="muted"> ({state.bank[r]} in bank)</span>}
          </button>
        ))}
      </div>
      <p>
        Chosen: {picked.length === 0 ? 'nothing yet' : picked.map((r) => RESOURCE_LABEL[r]).join(', ')}{' '}
        {picked.length > 0 && (
          <button className="btn tiny" onClick={() => setPicked([])}>
            clear
          </button>
        )}
      </p>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={bagTotal(asBag(picked)) !== count} onClick={() => onConfirm(picked)}>
          Confirm
        </button>
      </div>
    </Modal>
  );
}
