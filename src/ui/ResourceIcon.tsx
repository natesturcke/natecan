import { useState } from 'react';
import type { Resource, ResourceBag } from '@/engine/types';
import { RESOURCES } from '@/engine/types';
import { RESOURCE_LABEL } from './text';

const COLORS: Record<Resource, string> = {
  brick: '#b5552e',
  lumber: '#2f6b2f',
  ore: '#6f7280',
  grain: '#d9b83a',
  wool: '#9ed16f',
};

export function ResourceIcon({ resource, size = 22 }: { resource: Resource; size?: number }): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  if (!failed) {
    return (
      <img
        className="res-icon"
        src={`/art/card-${resource}.png`}
        alt={RESOURCE_LABEL[resource]}
        title={RESOURCE_LABEL[resource]}
        style={{ height: size * 1.4, width: size }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="res-chip" title={RESOURCE_LABEL[resource]} style={{ background: COLORS[resource], width: size, height: size * 1.4 }}>
      {RESOURCE_LABEL[resource][0].toUpperCase()}
    </span>
  );
}

/** Inline cost display, e.g. for build buttons. */
export function CostIcons({ cost, size = 16 }: { cost: ResourceBag; size?: number }): React.JSX.Element {
  return (
    <span className="cost-icons">
      {RESOURCES.flatMap((r) => Array.from({ length: cost[r] }, (_, i) => <ResourceIcon key={`${r}${i}`} resource={r} size={size} />))}
    </span>
  );
}
