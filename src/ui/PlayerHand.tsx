import { useState } from 'react';
import type { Resource, ResourceBag } from '@/engine/types';
import { RESOURCES } from '@/engine/types';
import { RESOURCE_LABEL } from './text';

export interface PlayerHandProps {
  resources: ResourceBag;
  /** When set, cards are selectable and `selected` shows how many of each are chosen. */
  selectable?: boolean;
  selected?: ResourceBag;
  onToggle?: (r: Resource, delta: 1 | -1) => void;
}

const MAX_SHOWN = 8;
const CARD_W = 84;
const OVERLAP = 30;

function CardFace({ resource }: { resource: Resource }): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={`card-face fallback ${resource}`}>{RESOURCE_LABEL[resource]}</div>;
  return <img className="card-face" src={`/art/card-${resource}.png`} alt={RESOURCE_LABEL[resource]} draggable={false} onError={() => setFailed(true)} />;
}

/** The player's hand as fanned real cards, one fan per resource. */
export function PlayerHand({ resources, selectable, selected, onToggle }: PlayerHandProps): React.JSX.Element {
  return (
    <div className="hand-fans">
      {RESOURCES.map((r) => {
        const count = resources[r];
        const sel = selected?.[r] ?? 0;
        const shown = Math.min(count, MAX_SHOWN);
        const label = RESOURCE_LABEL[r][0].toUpperCase() + RESOURCE_LABEL[r].slice(1);
        const width = count === 0 ? CARD_W : CARD_W + (shown - 1) * OVERLAP;
        return (
          <div key={r} data-hand-card={r} className={`hand-fan ${count === 0 ? 'empty' : ''}`} style={{ width }}>
            {count === 0 && (
              <div className="card-ghost">
                <span>{label}</span>
              </div>
            )}
            {Array.from({ length: shown }, (_, i) => {
              const isSelected = i >= shown - sel;
              const tilt = (i - (shown - 1) / 2) * 2.2;
              return (
                <button
                  key={i}
                  type="button"
                  className={`hand-card-btn ${isSelected ? 'picked' : ''}`}
                  style={{ left: i * OVERLAP, zIndex: i, transform: `rotate(${tilt}deg) translateY(${Math.abs(tilt) * 0.6}px)` }}
                  disabled={!selectable}
                  title={selectable ? (isSelected ? 'Keep this card' : 'Discard this card') : `${count} ${label}`}
                  onClick={() => onToggle?.(r, isSelected ? -1 : 1)}
                >
                  <CardFace resource={r} />
                </button>
              );
            })}
            {count > 0 && (
              <span className="card-count" style={{ left: width - 16 }}>
                {count}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
