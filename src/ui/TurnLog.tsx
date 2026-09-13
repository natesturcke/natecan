import { useEffect, useRef } from 'react';
import type { GameState, PlayerId } from '@/engine/types';
import type { LogLine } from './narrate';
import { Portrait } from './Portrait';
import { humanPortraitKey, portraitKey } from './portraits';

export function TurnLog({ lines, state, human }: { lines: LogLine[]; state: GameState; human: PlayerId }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  // Keyed on the last line, not the count: the list is capped, so the count stops changing.
  const last = lines.length > 0 ? `${lines.length}:${lines[lines.length - 1].text}` : '';
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [last]);
  return (
    <div className="turn-log" ref={ref}>
      {lines.map((l, i) => {
        const p = l.player !== null ? state.players[l.player] : null;
        return (
          <div key={i} className={`log-line ${l.tone}`}>
            {p ? (
              <Portrait portraitKey={l.player === human ? humanPortraitKey(state.seed) : portraitKey(p.name)} name={p.name} color={p.color} size={13} className="log-portrait" />
            ) : (
              <span className="log-portrait spacer" />
            )}
            <span className="log-text">{l.text}</span>
          </div>
        );
      })}
    </div>
  );
}
