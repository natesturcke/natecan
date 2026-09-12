import { useEffect, useRef } from 'react';
import type { Resource } from '@/engine/types';
import { RESOURCE_LABEL } from './text';

export interface Flight {
  id: string;
  resource: Resource;
  /** Where the card starts (the dice, or the giver's hand). */
  from: { x: number; y: number };
  /** A waypoint to pause at: the producing hex, or the midpoint of a trade. */
  via: { x: number; y: number };
  /** Where it lands: a player's card in the side panel, your hand, or the discard pile. */
  to: { x: number; y: number };
  /** Stagger in ms. */
  delay: number;
}

/** Card size while in flight. Big enough to read the name at a glance. */
const CARD_W = 52;
const CARD_H = 74;
/** One card's full journey, in ms. Slow enough to follow, with a clear pause at the waypoint. */
const DURATION = 3200;

/**
 * Animates readable mini cards from a source, pausing over a waypoint, then on to their owner.
 * Each card shows its art and name so you can tell what moved and where it went.
 */
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
      const at = (p: { x: number; y: number }, lift: number, scale: number) => `translate(${p.x - CARD_W / 2}px, ${p.y - CARD_H / 2 - lift}px) scale(${scale})`;
      const a = el.animate(
        [
          { transform: at(f.from, 0, 0.4), opacity: 0, offset: 0 },
          { transform: at(f.from, 10, 1), opacity: 1, offset: 0.08 },
          // Rise to the waypoint and hold there long enough to read.
          { transform: at(f.via, 36, 1.15), opacity: 1, offset: 0.38 },
          { transform: at(f.via, 36, 1.15), opacity: 1, offset: 0.62 },
          { transform: at(f.to, 0, 0.8), opacity: 1, offset: 0.95 },
          { transform: at(f.to, 0, 0.5), opacity: 0, offset: 1 },
        ],
        { duration: DURATION, delay: f.delay, easing: 'cubic-bezier(0.35, 0.6, 0.3, 1)', fill: 'both' },
      );
      anims.push(a);
      longest = Math.max(longest, DURATION + f.delay);
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
        <div key={f.id} data-flight={f.id} className={`flight ${f.resource}`} style={{ width: CARD_W, height: CARD_H }}>
          <img src={`/art/card-${f.resource}.png`} alt="" draggable={false} />
          <span className="flight-label">{RESOURCE_LABEL[f.resource]}</span>
        </div>
      ))}
    </div>
  );
}
