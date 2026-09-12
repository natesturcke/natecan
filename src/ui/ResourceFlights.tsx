import { useEffect, useRef } from 'react';
import type { Resource } from '@/engine/types';
import { ResourceIcon } from './ResourceIcon';

export interface Flight {
  id: string;
  resource: Resource;
  /** Where the card starts (the dice). */
  from: { x: number; y: number };
  /** The producing hex. */
  via: { x: number; y: number };
  /** The receiving player's card in the side panel. */
  to: { x: number; y: number };
  /** Stagger in ms. */
  delay: number;
}

/** Animates resource cards from the dice to the hex that produced them and on to the player. */
export function ResourceFlights({ flights, onDone }: { flights: Flight[]; onDone: () => void }): React.JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || flights.length === 0) return;
    const anims: Animation[] = [];
    let longest = 0;
    for (const f of flights) {
      const el = host.querySelector<HTMLElement>(`[data-flight="${f.id}"]`);
      if (!el) continue;
      const a = el.animate(
        [
          { transform: `translate(${f.from.x}px, ${f.from.y}px) scale(0.4)`, opacity: 0, offset: 0 },
          { transform: `translate(${f.from.x}px, ${f.from.y}px) scale(0.9)`, opacity: 1, offset: 0.08 },
          { transform: `translate(${f.via.x}px, ${f.via.y - 30}px) scale(1.1)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${f.via.x}px, ${f.via.y - 30}px) scale(1.1)`, opacity: 1, offset: 0.58 },
          { transform: `translate(${f.to.x}px, ${f.to.y}px) scale(0.6)`, opacity: 1, offset: 0.96 },
          { transform: `translate(${f.to.x}px, ${f.to.y}px) scale(0.3)`, opacity: 0, offset: 1 },
        ],
        { duration: 1700, delay: f.delay, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)', fill: 'both' },
      );
      anims.push(a);
      longest = Math.max(longest, 1700 + f.delay);
    }
    const t = setTimeout(onDone, longest + 50);
    return () => {
      clearTimeout(t);
      anims.forEach((a) => a.cancel());
    };
  }, [flights, onDone]);

  if (flights.length === 0) return null;
  return (
    <div ref={ref} className="flights">
      {flights.map((f) => (
        <div key={f.id} data-flight={f.id} className="flight">
          <ResourceIcon resource={f.resource} size={26} />
        </div>
      ))}
    </div>
  );
}
