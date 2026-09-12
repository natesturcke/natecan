/**
 * Asset contract shared by the renderer and scripts/generate-art.ts.
 * Every image is drawn for the same oblique camera (see geometry.ts): ground
 * coordinates are squashed vertically by CAMERA_K.
 */
import type { HarborKind, Resource, Terrain } from '@/engine/types';

/** Vertical squash of the ground plane. 1 = top-down, 0.5 = classic dimetric. */
export const CAMERA_K = 0.6;

/** Ground-space circumradius of a hex (centre to corner), in world units. */
export const HEX_R = 100;

/** Pixels per world unit in the tile artwork. */
export const ART_SCALE = 512 / (Math.sqrt(3) * HEX_R);

export const TILE_IMAGE = {
  width: 512,
  height: 448,
  /** Where the hexagon's top face is centred inside the image. */
  faceCenterX: 256,
  faceCenterY: 2 + (2 * HEX_R * CAMERA_K * ART_SCALE) / 2,
  /** Height of the visible cliff/soil side under the south edges, in pixels. */
  sideHeight: 64,
} as const;

export const PIECE_IMAGE = {
  width: 256,
  height: 256,
  /** Ground contact point inside the image. */
  anchorX: 128,
  anchorY: 220,
} as const;

export const ROAD_IMAGE = { width: 256, height: 160, anchorX: 128, anchorY: 88 } as const;
export const TOKEN_IMAGE = { size: 128 } as const;
export const HARBOR_IMAGE = { width: 256, height: 256, anchorX: 128, anchorY: 200 } as const;
export const CARD_IMAGE = { width: 300, height: 420 } as const;

export const TILE_KEYS: Record<Terrain, string> = {
  hills: 'hex-hills',
  forest: 'hex-forest',
  mountains: 'hex-mountains',
  fields: 'hex-fields',
  pasture: 'hex-pasture',
  desert: 'hex-desert',
};

/**
 * Each terrain has up to this many alternative looks so tiles of the same type do not
 * repeat exactly. Variant 1 is the base key (`hex-forest`); others are `hex-forest-2`, `hex-forest-3`.
 */
export const TILE_VARIANTS = 3;

export function tileVariantKey(terrain: Terrain, variant: number): string {
  const base = TILE_KEYS[terrain];
  return variant <= 1 ? base : `${base}-${variant}`;
}

export const HARBOR_KEYS: Record<HarborKind, string> = {
  generic: 'harbor-generic',
  brick: 'harbor-brick',
  lumber: 'harbor-lumber',
  ore: 'harbor-ore',
  grain: 'harbor-grain',
  wool: 'harbor-wool',
};

/** Screen-space road orientations: "|" vertical, "\" descending, "/" ascending. */
export type RoadOrientation = 'vertical' | 'down' | 'up';
export const ROAD_KEYS: Record<RoadOrientation, string> = {
  vertical: 'road-vertical',
  down: 'road-down',
  up: 'road-up',
};

export const PIECE_KEYS = {
  settlement: 'settlement',
  city: 'city',
  robber: 'robber',
} as const;

export const CARD_KEYS: Record<Resource, string> = {
  brick: 'card-brick',
  lumber: 'card-lumber',
  ore: 'card-ore',
  grain: 'card-grain',
  wool: 'card-wool',
};

export const DEV_CARD_KEYS = {
  knight: 'dev-knight',
  roadBuilding: 'dev-road-building',
  yearOfPlenty: 'dev-year-of-plenty',
  monopoly: 'dev-monopoly',
  victoryPoint: 'dev-vp',
} as const;

export const MISC_KEYS = { sea: 'sea', cardBack: 'card-back' } as const;

export function tokenKey(n: number): string {
  return `token-${n}`;
}

/** All asset keys with their public paths. */
export function allAssetPaths(): { key: string; path: string }[] {
  const keys = [
    ...Object.values(TILE_KEYS),
    ...(Object.keys(TILE_KEYS) as Terrain[]).flatMap((t) => Array.from({ length: TILE_VARIANTS - 1 }, (_, i) => tileVariantKey(t, i + 2))),
    ...Object.values(HARBOR_KEYS),
    ...Object.values(ROAD_KEYS),
    ...Object.values(PIECE_KEYS),
    ...[1, 2, 3, 4].flatMap((n) => [`${PIECE_KEYS.settlement}-${n}`, `${PIECE_KEYS.city}-${n}`]),
    ...Object.values(CARD_KEYS),
    ...Object.values(DEV_CARD_KEYS),
    ...Object.values(MISC_KEYS),
    ...[2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map(tokenKey),
  ];
  return keys.map((key) => ({ key, path: `/art/${key}.png` }));
}
