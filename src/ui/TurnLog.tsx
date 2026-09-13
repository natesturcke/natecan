import { useEffect, useRef } from 'react';
import type { LogLine } from './narrate';

export function TurnLog({ lines }: { lines: LogLine[] }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  // Keyed on the last line, not the count: the list is capped, so the count stops changing.
  const last = lines.length > 0 ? `${lines.length}:${lines[lines.length - 1].text}` : '';
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [last]);
  return (
    <div className="turn-log" ref={ref}>
      {lines.map((l, i) => (
        <div key={i} className={`log-line ${l.tone}`}>
          {l.text}
        </div>
      ))}
    </div>
  );
}
