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

const MAX_SHOWN = 10;

/** The player's hand as physical card stacks, one row per resource. */
export function PlayerHand({ resources, selectable, selected, onToggle }: PlayerHandProps): React.JSX.Element {
  return (
    <div className="hand">
      {RESOURCES.map((r) => {
        const count = resources[r];
        const sel = selected?.[r] ?? 0;
        const shown = Math.min(count, MAX_SHOWN);
        const label = RESOURCE_LABEL[r][0].toUpperCase() + RESOURCE_LABEL[r].slice(1);
        return (
          <div key={r} data-hand-card={r} className={`hand-row ${count === 0 ? 'empty' : ''} ${sel > 0 ? 'selected' : ''}`}>
            <div className="hand-row-head">
              <span className="hand-label">{label}</span>
              <span className="hand-count">{count}</span>
            </div>
            <div className="hand-stack" style={{ height: 58 }}>
              {count === 0 && <div className="hand-slot" />}
              {Array.from({ length: shown }, (_, i) => {
                const isSelected = i >= shown - sel;
                return (
                  <button
                    key={i}
                    type="button"
                    className={`hand-stack-card ${isSelected ? 'picked' : ''}`}
                    style={{ left: i * 16, zIndex: i }}
                    disabled={!selectable}
                    title={selectable ? (isSelected ? 'Keep this card' : 'Discard this card') : label}
                    onClick={() => onToggle?.(r, isSelected ? -1 : 1)}
                  >
                    <ResourceIcon resource={r} size={40} />
                  </button>
                );
              })}
              {count > MAX_SHOWN && <span className="hand-more" style={{ left: shown * 16 + 44 }}>+{count - MAX_SHOWN}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
