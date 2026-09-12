import type { Resource, ResourceBag } from '@/engine/types';
import { RESOURCES } from '@/engine/types';
import { ResourceIcon } from './ResourceIcon';
import { RESOURCE_LABEL } from './text';

export interface PlayerHandProps {
  resources: ResourceBag;
  /** When set, cards are selectable and `selected` shows how many of each are chosen. */
  selectable?: boolean;
  selected?: ResourceBag;
  onToggle?: (r: Resource, delta: 1 | -1) => void;
}

export function PlayerHand({ resources, selectable, selected, onToggle }: PlayerHandProps): React.JSX.Element {
  return (
    <div className="hand">
      {RESOURCES.map((r) => {
        const count = resources[r];
        const sel = selected?.[r] ?? 0;
        return (
          <div key={r} className={`hand-card ${count === 0 ? 'empty' : ''} ${sel > 0 ? 'selected' : ''}`}>
            <ResourceIcon resource={r} size={36} />
            <div className="hand-label">{RESOURCE_LABEL[r]}</div>
            <div className="hand-count">{count}</div>
            {selectable && count > 0 && (
              <div className="hand-select">
                <button className="btn tiny" onClick={() => onToggle?.(r, -1)} disabled={sel === 0} aria-label={`Remove ${r}`}>
                  −
                </button>
                <span>{sel}</span>
                <button className="btn tiny" onClick={() => onToggle?.(r, 1)} disabled={sel >= count} aria-label={`Add ${r}`}>
                  +
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
