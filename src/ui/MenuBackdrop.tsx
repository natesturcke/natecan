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

/**
 * Small far-off details: number tokens, harbour ships, settlements, a city, the robber and a
 * few roads. They are tiny, faint and mostly blurred, filling the gaps between the big pieces.
 */
const DETAILS: Piece[] = [
  { art: 'token-6', x: 24, y: 30, depth: 0.3, rotate: 0, duration: 52, delay: -7 },
  { art: 'token-8', x: 62, y: 20, depth: 0.25, rotate: 0, duration: 56, delay: -19 },
  { art: 'token-5', x: 88, y: 84, depth: 0.2, rotate: 0, duration: 60, delay: -3 },
  { art: 'token-9', x: 12, y: 96, depth: 0.35, rotate: 0, duration: 49, delay: -27 },
  { art: 'token-11', x: 46, y: 40, depth: 0.12, rotate: 0, duration: 64, delay: -40 },
  { art: 'harbor-generic', x: 36, y: 74, depth: 0.28, rotate: 0, duration: 58, delay: -14 },
  { art: 'harbor-wool', x: 70, y: 48, depth: 0.18, rotate: 0, duration: 62, delay: -33 },
  { art: 'harbor-ore', x: 4, y: 4, depth: 0.32, rotate: 0, duration: 54, delay: -21 },
  { art: 'settlement-1', x: 56, y: 78, depth: 0.3, rotate: 0, duration: 50, delay: -9 },
  { art: 'settlement-2', x: 33, y: 22, depth: 0.22, rotate: 0, duration: 57, delay: -36 },
  { art: 'settlement-3', x: 92, y: 22, depth: 0.15, rotate: 0, duration: 63, delay: -16 },
  { art: 'settlement-4', x: 14, y: 78, depth: 0.26, rotate: 0, duration: 55, delay: -29 },
  { art: 'city-2', x: 76, y: 32, depth: 0.34, rotate: 0, duration: 51, delay: -12 },
  { art: 'city-4', x: 44, y: 12, depth: 0.16, rotate: 0, duration: 66, delay: -44 },
  { art: 'robber', x: 60, y: 66, depth: 0.2, rotate: 0, duration: 59, delay: -24 },
  { art: 'road-up', x: 26, y: 46, depth: 0.14, rotate: 0, duration: 68, delay: -5 },
  { art: 'road-down', x: 82, y: 54, depth: 0.12, rotate: 0, duration: 70, delay: -38 },
];

/** Soft drifting motes, like dust in a sunbeam, on their own very slow cycles. */
const DUST = Array.from({ length: 22 }, (_, i) => ({
  x: (i * 37 + 11) % 100,
  y: (i * 53 + 7) % 100,
  size: 2 + (i % 4),
  duration: 40 + (i % 7) * 6,
  delay: -(i * 5),
  opacity: 0.1 + (i % 5) * 0.05,
}));

function Layer({ pieces, small }: { pieces: Piece[]; small?: boolean }): React.JSX.Element {
  return (
    <>
      {pieces.map((p, i) => {
        const size = small ? 22 + p.depth * 60 : 48 + p.depth * 96;
        const opacity = small ? 0.1 + p.depth * 0.45 : 0.12 + p.depth * 0.5;
        const blur = (1 - p.depth) * (small ? 2.5 : 3.5);
        const kind = p.art.startsWith('hex') ? 'tile' : p.art.startsWith('card') || p.art.startsWith('dev') ? 'card' : 'detail';
        return (
          <img
            key={`${p.art}-${i}`}
            className={`menu-piece ${kind}`}
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
    </>
  );
}

export function MenuBackdrop(): React.JSX.Element {
  return (
    <div className="menu-backdrop" aria-hidden="true">
      <div className="menu-vignette" />
      {DUST.map((d, i) => (
        <span
          key={i}
          className="menu-dust"
          style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.size, height: d.size, opacity: d.opacity, animationDuration: `${d.duration}s`, animationDelay: `${d.delay}s` }}
        />
      ))}
      <Layer pieces={DETAILS} small />
      <Layer pieces={PIECES.filter((p) => ART.includes(p.art))} />
    </div>
  );
}
