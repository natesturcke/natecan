import { useEffect, useRef, useState } from 'react';
import { RESOURCES, type ResourceBag } from '@/engine/types';
import { RESOURCE_LABEL } from './text';
import { Portrait } from './Portrait';

export interface DiceRoll {
  /** Unique id per roll so the same values still re-animate. */
  id: number;
  dice: [number, number];
  who: string;
  /** Text lines to reveal after the dice settle, e.g. "A 7! The robber moves." */
  outcome: string[];
  /** Who got what, shown as cards next to their portrait. */
  gains: { who: string; portrait: string; color: string; bag: ResourceBag }[];
}

function GainCards({ bag }: { bag: ResourceBag }): React.JSX.Element {
  return (
    <span className="gain-cards">
      {RESOURCES.flatMap((r) =>
        Array.from({ length: bag[r] }, (_, i) => (
          <span key={`${r}${i}`} className="gain-card" title={RESOURCE_LABEL[r]}>
            <img src={`/art/card-${r}.png`} alt={RESOURCE_LABEL[r]} draggable={false} />
            <span className="gain-card-label">{RESOURCE_LABEL[r]}</span>
          </span>
        )),
      )}
    </span>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
};

/** Cube orientation that brings the given face to the front. */
const FACE_TRANSFORM: Record<number, string> = {
  1: 'rotateX(0deg) rotateY(0deg)',
  2: 'rotateX(-90deg) rotateY(0deg)',
  3: 'rotateX(0deg) rotateY(-90deg)',
  4: 'rotateX(0deg) rotateY(90deg)',
  5: 'rotateX(90deg) rotateY(0deg)',
  6: 'rotateX(180deg) rotateY(0deg)',
};

function Face({ value, className }: { value: number; className: string }): React.JSX.Element {
  return (
    <div className={`die-face ${className}`}>
      {PIPS[value].map(([x, y], i) => (
        <span key={i} className="pip" style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
    </div>
  );
}

function Die({ value, color, settled, spin }: { value: number; color: 'yellow' | 'red'; settled: boolean; spin: number }): React.JSX.Element {
  // While tumbling, add whole extra turns so the cube visibly spins before landing.
  const transform = settled ? `${FACE_TRANSFORM[value]}` : `rotateX(${720 + spin * 90}deg) rotateY(${540 + spin * 45}deg) rotateZ(${spin * 30}deg)`;
  return (
    <div className={`die-scene ${settled ? 'settled' : 'tumbling'}`}>
      <div className={`die ${color}`} style={{ transform }}>
        <Face value={1} className="front" />
        <Face value={6} className="back" />
        <Face value={3} className="right" />
        <Face value={4} className="left" />
        <Face value={2} className="top" />
        <Face value={5} className="bottom" />
      </div>
    </div>
  );
}

export interface DiceOverlayProps {
  roll: DiceRoll | null;
  onDone: () => void;
  /** Close on a timer instead of waiting for the Okay button (used while skipping ahead). */
  autoDismiss?: boolean;
}

/**
 * Shows two dice tumbling across the board, landing on the rolled values, then the
 * total and what it produced. It stays up until you press Okay, so a roll is never
 * missed. Purely presentational: the engine has already rolled.
 */
export function DiceOverlay({ roll, onDone, autoDismiss }: DiceOverlayProps): React.JSX.Element | null {
  const [stage, setStage] = useState<'tumble' | 'settled' | 'outcome' | 'leaving' | 'hidden'>('hidden');
  const [spin, setSpin] = useState(0);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!roll) {
      setStage('hidden');
      return;
    }
    setStage('tumble');
    setSpin(0);
    const t0 = setTimeout(() => setSpin(1), 30);
    // Tumble, then rest on the result long enough to read it, then reveal what it caused.
    const t1 = setTimeout(() => setStage('settled'), 1100);
    const t2 = setTimeout(() => setStage('outcome'), 2600);
    const t3 = autoDismiss
      ? setTimeout(() => {
          setStage('hidden');
          onDone();
        }, 2600 + 2600)
      : null;
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      if (t3) clearTimeout(t3);
    };
  }, [roll, onDone, autoDismiss]);

  // Focus Okay once the outcome shows, so Enter or Space dismisses it without reaching for the mouse.
  useEffect(() => {
    if (stage === 'outcome') okRef.current?.focus({ preventScroll: true });
  }, [stage]);

  if (!roll || stage === 'hidden') return null;
  const total = roll.dice[0] + roll.dice[1];
  const settled = stage !== 'tumble';
  const dismiss = () => {
    // Short fade-out before the panel goes, so the dismissal reads as a transition.
    setStage('leaving');
    setTimeout(() => {
      setStage('hidden');
      onDone();
    }, 180);
  };
  return (
    <div className={`dice-overlay stage-${stage}`} aria-live="polite">
      <div className="dice-backdrop" />
      <div className="dice-row">
        <Die value={roll.dice[0]} color="yellow" settled={settled} spin={spin} />
        <Die value={roll.dice[1]} color="red" settled={settled} spin={spin + 2} />
      </div>
      <div className="dice-caption">
        <div className="dice-total">{settled ? `${roll.who} rolled ${total}` : `${roll.who} rolls…`}</div>
        {(stage === 'outcome' || stage === 'leaving') && (
          <div className={`dice-outcome ${roll.gains.length > 0 ? 'panel' : ''}`}>
            {roll.gains.map((g, i) => (
              <div key={i} className="gain-row" style={{ borderColor: g.color }}>
                <Portrait portraitKey={g.portrait} name={g.who} color={g.color} size={34} className="gain-portrait" />
                <span className="gain-who">{g.who}</span>
                <GainCards bag={g.bag} />
              </div>
            ))}
            {roll.outcome.map((line, i) => (
              <div key={`t${i}`} className="dice-note">
                {line}
              </div>
            ))}
          </div>
        )}
        {(stage === 'outcome' || stage === 'leaving') && !autoDismiss && (
          <button ref={okRef} className="btn primary dice-ok" onClick={dismiss}>
            Okay <kbd>↵</kbd>
          </button>
        )}
      </div>
    </div>
  );
}
