/**
 * Core engine types. Everything here is plain JSON so that state can be
 * structured-cloned to a Web Worker, saved to localStorage, and compared in tests.
 */

export type PlayerId = 0 | 1 | 2 | 3;

export const RESOURCES = ['brick', 'lumber', 'ore', 'grain', 'wool'] as const;
export type Resource = (typeof RESOURCES)[number];

export const TERRAINS = ['hills', 'forest', 'mountains', 'fields', 'pasture', 'desert'] as const;
export type Terrain = (typeof TERRAINS)[number];

export const DEV_CARDS = ['knight', 'roadBuilding', 'yearOfPlenty', 'monopoly', 'victoryPoint'] as const;
export type DevCard = (typeof DEV_CARDS)[number];

export type HexId = number; // 0..18
export type VertexId = number; // 0..53
export type EdgeId = number; // 0..71

export type ResourceBag = Record<Resource, number>;

export interface HexTile {
  terrain: Terrain;
  /** Production number 2..12 (never 7); null on the desert. */
  token: number | null;
}

export type HarborKind = Resource | 'generic';

export interface Harbor {
  kind: HarborKind;
  /** The rim edge this harbor sits on. */
  edge: EdgeId;
  /** The two coastal vertices that grant the harbor's trade rate. */
  vertices: [VertexId, VertexId];
}

/** Static after newGame(); safe to memoize derived tables on by identity. */
export interface Board {
  hexes: readonly HexTile[];
  harbors: readonly Harbor[];
}

export type BuildingKind = 'settlement' | 'city';

export interface Building {
  owner: PlayerId;
  kind: BuildingKind;
}

export type PlayerKind = 'human' | 'bot';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Player {
  id: PlayerId;
  name: string;
  color: string;
  kind: PlayerKind;
  difficulty: Difficulty | null;
  resources: ResourceBag;
  /** Playable dev cards (bought on a previous turn) plus victory point cards. */
  devCards: DevCard[];
  /** Non-VP dev cards bought this turn; moved into devCards on END_TURN. */
  newDevCards: DevCard[];
  knightsPlayed: number;
  /** Pieces remaining in the player's supply. */
  pieces: { roads: number; settlements: number; cities: number };
  /** Cached length of this player's longest continuous road. */
  roadLength: number;
  /** Cached maritime trade rate per resource given, 4/3/2. */
  harborRates: Record<Resource, 2 | 3 | 4>;
}

export interface TradeOffer {
  from: PlayerId;
  /** What the offerer gives away. */
  give: ResourceBag;
  /** What the offerer wants in return. */
  want: ResourceBag;
}

export type TradeResponse =
  | { kind: 'pending' }
  | { kind: 'accept' }
  | { kind: 'reject' }
  /** A counter is expressed from the OFFERER's perspective: what the offerer would give / get. */
  | { kind: 'counter'; give: ResourceBag; want: ResourceBag };

export type RobberReturn = 'preRoll' | 'main';

export type Phase =
  | {
      kind: 'setup';
      /** Snake order of placements, length 8 for 4 players. */
      order: readonly PlayerId[];
      index: number;
      step: 'settlement' | 'road';
      lastSettlement: VertexId | null;
    }
  | { kind: 'preRoll' }
  | { kind: 'discard'; pending: readonly PlayerId[] }
  | { kind: 'moveRobber'; then: RobberReturn }
  | { kind: 'steal'; hex: HexId; victims: readonly PlayerId[]; then: RobberReturn }
  | { kind: 'main' }
  | { kind: 'roadBuilding'; roadsLeft: number }
  | {
      kind: 'tradeOffer';
      offer: TradeOffer;
      responses: Readonly<Record<PlayerId, TradeResponse>>;
    }
  | {
      kind: 'tradeResolve';
      offer: TradeOffer;
      responses: Readonly<Record<PlayerId, TradeResponse>>;
    }
  | { kind: 'ended'; winner: PlayerId };

export type SetupVariant = 'spiral' | 'random';

export interface GameConfig {
  setupVariant: SetupVariant;
  /** When true, applyAction honours `forced` outcomes (tests and search only). */
  allowForcedOutcomes: boolean;
  victoryPoints: number;
}

/** xoshiro128** state. */
export type RngState = readonly [number, number, number, number];

export interface TurnState {
  current: PlayerId;
  number: number;
  hasRolled: boolean;
  devPlayed: boolean;
  tradesOffered: number;
  /** Canonical keys of offers already rejected or cancelled this turn (bot spam guard). */
  rejectedOffers: readonly string[];
  lastRoll: readonly [number, number] | null;
}

export interface GameState {
  config: GameConfig;
  seed: number;
  rng: RngState;
  board: Board;
  /** Owner per edge, -1 when empty. Length 72. */
  roads: readonly (PlayerId | -1)[];
  /** Building per vertex. Length 54. */
  buildings: readonly (Building | null)[];
  robber: HexId;
  players: readonly Player[];
  bank: ResourceBag;
  /** Shuffled at newGame; drawn from the end. */
  devDeck: readonly DevCard[];
  turn: TurnState;
  phase: Phase;
  longestRoad: { holder: PlayerId | null; length: number };
  largestArmy: { holder: PlayerId | null; size: number };
  actionCount: number;
}

export interface PlayerSetup {
  name: string;
  color: string;
  kind: PlayerKind;
  difficulty?: Difficulty;
}
