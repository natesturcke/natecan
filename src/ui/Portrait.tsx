import { useState } from 'react';
import { portraitPath } from './portraits';

/** A painted character card, or a coloured monogram when the PNG has not been generated yet. */
export function Portrait({ portraitKey, name, color, size = 40, className = '' }: { portraitKey: string; name: string; color: string; size?: number; className?: string }): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const style = { width: size, height: Math.round(size * 1.4) };
  if (failed) {
    return (
      <span className={`portrait fallback ${className}`} style={{ ...style, background: color }} title={name}>
        {initials}
      </span>
    );
  }
  return <img className={`portrait ${className}`} style={style} src={portraitPath(portraitKey)} alt={name} title={name} draggable={false} onError={() => setFailed(true)} />;
}
