import { BANK_PER_RESOURCE, DEV_DECK, PIECE_LIMITS, PLAYER_COUNT, VICTORY_POINTS } from './constants';
import { generateBoard } from './board/generate';
import { boardIndex } from './board/index';
import { EDGE_COUNT, VERTEX_COUNT } from './board/topology';
import { nextInt, seedRng, shuffle } from './rng';
import type { GameConfig, GameState, Phase, Player, PlayerId, PlayerSetup, RngState } from './types';
import { bag } from './bag';

export interface NewGameOptions {
  seed: number;
  players: readonly PlayerSetup[];
  config?: Partial<GameConfig>;
}

export const DEFAULT_CONFIG: GameConfig = {
  setupVariant: 'spiral',
  allowForcedOutcomes: false,
  victoryPoints: VICTORY_POINTS,
};

export function newGame(opts: NewGameOptions): GameState {
  if (opts.players.length !== PLAYER_COUNT) {
    throw new Error(`Expected ${PLAYER_COUNT} players, got ${opts.players.length}`);
  }
  const config: GameConfig = { ...DEFAULT_CONFIG, ...opts.config };
  let rng: RngState = seedRng(opts.seed);

  const [board, r1] = generateBoard(rng, config.setupVariant);
  rng = r1;
  const [devDeck, r2] = shuffle(rng, DEV_DECK);
  rng = r2;
  const [startIndex, r3] = nextInt(rng, PLAYER_COUNT);
  rng = r3;
  const start = startIndex as PlayerId;

  const players: Player[] = opts.players.map((p, i) => ({
    id: i as PlayerId,
    name: p.name,
    color: p.color,
    kind: p.kind,
    difficulty: p.difficulty ?? null,
    resources: bag(),
    devCards: [],
    newDevCards: [],
    knightsPlayed: 0,
    pieces: { ...PIECE_LIMITS },
    roadLength: 0,
    harborRates: { brick: 4, lumber: 4, ore: 4, grain: 4, wool: 4 },
  }));

  const forward: PlayerId[] = [];
  for (let i = 0; i < PLAYER_COUNT; i++) forward.push(((start + i) % PLAYER_COUNT) as PlayerId);
  const order = [...forward, ...forward.slice().reverse()];

  const phase: Phase = { kind: 'setup', order, index: 0, step: 'settlement', lastSettlement: null };

  return {
    config,
    seed: opts.seed,
    rng,
    board,
    roads: Array<PlayerId | -1>(EDGE_COUNT).fill(-1),
    buildings: Array(VERTEX_COUNT).fill(null),
    robber: boardIndex(board).desert,
    players,
    bank: bag({
      brick: BANK_PER_RESOURCE,
      lumber: BANK_PER_RESOURCE,
      ore: BANK_PER_RESOURCE,
      grain: BANK_PER_RESOURCE,
      wool: BANK_PER_RESOURCE,
    }),
    devDeck,
    turn: {
      current: start,
      number: 0,
      hasRolled: false,
      devPlayed: false,
      tradesOffered: 0,
      rejectedOffers: [],
      lastRoll: null,
    },
    phase,
    longestRoad: { holder: null, length: 0 },
    largestArmy: { holder: null, size: 0 },
    actionCount: 0,
  };
}

/** The single player who must act now. */
export function currentActor(state: GameState): PlayerId {
  const { phase } = state;
  switch (phase.kind) {
    case 'setup':
      return phase.order[phase.index];
    case 'discard':
      return phase.pending[0];
    case 'tradeOffer': {
      const from = phase.offer.from;
      for (let i = 1; i < PLAYER_COUNT; i++) {
        const p = ((from + i) % PLAYER_COUNT) as PlayerId;
        if (phase.responses[p].kind === 'pending') return p;
      }
      return from;
    }
    default:
      return state.turn.current;
  }
}

export function nextPlayer(p: PlayerId): PlayerId {
  return ((p + 1) % PLAYER_COUNT) as PlayerId;
}

export function otherPlayers(p: PlayerId): PlayerId[] {
  const out: PlayerId[] = [];
  for (let i = 1; i < PLAYER_COUNT; i++) out.push(((p + i) % PLAYER_COUNT) as PlayerId);
  return out;
}
