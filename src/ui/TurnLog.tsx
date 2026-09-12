import { useEffect, useRef } from 'react';
import type { LogLine } from './narrate';

export function TurnLog({ lines }: { lines: LogLine[] }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [lines.length]);
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
