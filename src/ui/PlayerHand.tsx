import { useState } from 'react';
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

/** Widest angle the fan opens to on either side, in degrees. */
const MAX_SPREAD = 23;
/** Angle between neighbouring cards when the hand is small. */
const MAX_STEP = 7;

function CardFace({ resource }: { resource: Resource }): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={`card-face fallback ${resource}`}>{RESOURCE_LABEL[resource]}</div>;
  return <img className="card-face" src={`/art/card-${resource}.png`} alt={RESOURCE_LABEL[resource]} draggable={false} onError={() => setFailed(true)} />;
}

/**
 * The player's hand held as one fanned deck: every card in a single arc, grouped by resource,
 * with a count legend underneath. Resource flights land on the legend chips.
 */
export function PlayerHand({ resources, selectable, selected, onToggle }: PlayerHandProps): React.JSX.Element {
  const cards: { resource: Resource; index: number; isSelected: boolean }[] = [];
  for (const r of RESOURCES) {
    const count = resources[r];
    const sel = selected?.[r] ?? 0;
    for (let i = 0; i < count; i++) cards.push({ resource: r, index: i, isSelected: i >= count - sel });
  }
  const n = cards.length;
  const step = n > 1 ? Math.min(MAX_STEP, (MAX_SPREAD * 2) / (n - 1)) : 0;
  const label = (r: Resource) => RESOURCE_LABEL[r][0].toUpperCase() + RESOURCE_LABEL[r].slice(1);

  return (
    <div className="hand-deck">
      <div className={`hand-arc ${n === 0 ? 'empty' : ''}`}>
        {n === 0 && <div className="card-ghost">No cards yet</div>}
        {n > 0 && (
          <div className="hand-summary">
            {RESOURCES.filter((r) => resources[r] > 0)
              .map((r) => `${resources[r]} ${RESOURCE_LABEL[r]}`)
              .join(' · ')}
            <span className="muted"> · {n} card{n === 1 ? '' : 's'}</span>
          </div>
        )}
        {cards.map((c, i) => {
          const rot = (i - (n - 1) / 2) * step;
          const total = resources[c.resource];
          return (
            <button
              key={`${c.resource}-${c.index}`}
              type="button"
              className={`hand-card-btn ${c.isSelected ? 'picked' : ''}`}
              style={{ zIndex: i, ['--rot' as string]: `${rot}deg` }}
              disabled={!selectable}
              title={selectable ? (c.isSelected ? 'Keep this card' : 'Discard this card') : `${total} ${label(c.resource)}`}
              onClick={() => onToggle?.(c.resource, c.isSelected ? -1 : 1)}
            >
              <CardFace resource={c.resource} />
              <span className="hand-card-count">
                {total} {label(c.resource)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="hand-legend">
        {RESOURCES.map((r) => {
          const sel = selectable ? (selected?.[r] ?? 0) : 0;
          return (
            <div
              key={r}
              data-hand-card={r}
              className={`hand-chip ${resources[r] === 0 ? 'empty' : ''} ${sel > 0 ? 'picking' : ''}`}
              title={sel > 0 ? `Discarding ${sel} of ${resources[r]} ${label(r)}` : `${resources[r]} ${label(r)}`}
            >
              <ResourceIcon resource={r} size={18} />
              <span className="hand-chip-count">{sel > 0 ? `${sel} of ${resources[r]}` : resources[r]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
