import type { DevCard, Resource, ResourceBag, Terrain } from './types';

export const PLAYER_COUNT = 4;
export const VICTORY_POINTS = 10;

export const PIECE_LIMITS = { roads: 15, settlements: 5, cities: 4 } as const;
export const BANK_PER_RESOURCE = 19;
export const DISCARD_THRESHOLD = 7;

export const TERRAIN_COUNTS: Record<Terrain, number> = {
  forest: 4,
  pasture: 4,
  fields: 4,
  hills: 3,
  mountains: 3,
  desert: 1,
};

export const TERRAIN_RESOURCE: Record<Terrain, Resource | null> = {
  hills: 'brick',
  forest: 'lumber',
  mountains: 'ore',
  fields: 'grain',
  pasture: 'wool',
  desert: null,
};

/** Tokens in alphabetical (A..R) spiral order per the rulebook. */
export const TOKEN_SPIRAL: readonly number[] = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

export const HARBOR_KINDS = [
  'generic',
  'generic',
  'generic',
  'generic',
  'brick',
  'lumber',
  'ore',
  'grain',
  'wool',
] as const;

export const DEV_DECK: readonly DevCard[] = [
  ...Array<DevCard>(14).fill('knight'),
  ...Array<DevCard>(2).fill('roadBuilding'),
  ...Array<DevCard>(2).fill('yearOfPlenty'),
  ...Array<DevCard>(2).fill('monopoly'),
  ...Array<DevCard>(5).fill('victoryPoint'),
];

export const COSTS = {
  road: { brick: 1, lumber: 1, ore: 0, grain: 0, wool: 0 },
  settlement: { brick: 1, lumber: 1, ore: 0, grain: 1, wool: 1 },
  city: { brick: 0, lumber: 0, ore: 3, grain: 2, wool: 0 },
  devCard: { brick: 0, lumber: 0, ore: 1, grain: 1, wool: 1 },
} as const satisfies Record<string, ResourceBag>;

/** Probability of rolling each sum with two dice. */
export const DICE_PROBABILITY: Record<number, number> = {
  2: 1 / 36,
  3: 2 / 36,
  4: 3 / 36,
  5: 4 / 36,
  6: 5 / 36,
  7: 6 / 36,
  8: 5 / 36,
  9: 4 / 36,
  10: 3 / 36,
  11: 2 / 36,
  12: 1 / 36,
};

export const LONGEST_ROAD_MIN = 5;
export const LARGEST_ARMY_MIN = 3;

export const EMPTY_BAG: ResourceBag = { brick: 0, lumber: 0, ore: 0, grain: 0, wool: 0 };
