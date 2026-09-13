/**
 * Decorative depth behind the menu: cards and island tiles drifting at different sizes and
 * opacities. Far pieces are small, faint and blurred; near pieces are large and crisp.
 */
const ART = [
  'card-brick',
  'card-lumber',
  'card-ore',
  'card-grain',
  'card-wool',
  'dev-knight',
  'dev-year-of-plenty',
  'hex-forest',
  'hex-hills',
  'hex-mountains',
  'hex-fields',
  'hex-pasture',
  'hex-forest-2',
  'hex-fields-3',
];

interface Piece {
  art: string;
  /** Percent of the viewport. */
  x: number;
  y: number;
  /** 0 = far, 1 = near. */
  depth: number;
  rotate: number;
  duration: number;
  delay: number;
}

// Hand-placed so the composition is balanced around the centred menu card.
const PIECES: Piece[] = [
  { art: 'card-wool', x: 8, y: 14, depth: 0.9, rotate: -14, duration: 26, delay: -4 },
  { art: 'hex-forest', x: 84, y: 12, depth: 0.85, rotate: 8, duration: 30, delay: -12 },
  { art: 'card-ore', x: 90, y: 62, depth: 0.95, rotate: 12, duration: 24, delay: -8 },
  { art: 'hex-mountains', x: 6, y: 70, depth: 0.8, rotate: -6, duration: 34, delay: -20 },
  { art: 'dev-knight', x: 20, y: 86, depth: 0.7, rotate: 10, duration: 28, delay: -15 },
  { art: 'card-grain', x: 72, y: 88, depth: 0.75, rotate: -9, duration: 27, delay: -2 },
  { art: 'hex-fields', x: 30, y: 8, depth: 0.55, rotate: 4, duration: 38, delay: -25 },
  { art: 'card-brick', x: 64, y: 4, depth: 0.5, rotate: 16, duration: 36, delay: -9 },
  { art: 'hex-pasture', x: 50, y: 92, depth: 0.45, rotate: -12, duration: 40, delay: -30 },
  { art: 'card-lumber', x: 3, y: 42, depth: 0.4, rotate: 7, duration: 42, delay: -18 },
  { art: 'hex-hills', x: 95, y: 36, depth: 0.35, rotate: -5, duration: 44, delay: -6 },
  { art: 'dev-year-of-plenty', x: 40, y: 60, depth: 0.2, rotate: 5, duration: 50, delay: -22 },
  { art: 'hex-forest-2', x: 16, y: 55, depth: 0.25, rotate: 14, duration: 48, delay: -33 },
  { art: 'hex-fields-3', x: 78, y: 72, depth: 0.3, rotate: -16, duration: 46, delay: -11 },
];

export function MenuBackdrop(): React.JSX.Element {
  return (
    <div className="menu-backdrop" aria-hidden="true">
      {PIECES.filter((p) => ART.includes(p.art)).map((p, i) => {
        const size = 60 + p.depth * 140;
        const opacity = 0.12 + p.depth * 0.5;
        const blur = (1 - p.depth) * 3.5;
        return (
          <img
            key={i}
            className={`menu-piece ${p.art.startsWith('hex') ? 'tile' : 'card'}`}
            src={`/art/${p.art}.png`}
            alt=""
            draggable={false}
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: size,
              opacity,
              filter: `blur(${blur.toFixed(1)}px)`,
              zIndex: Math.round(p.depth * 10),
              ['--rot' as string]: `${p.rotate}deg`,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            }}
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
          />
        );
      })}
    </div>
  );
}
