import type { DevCard, EdgeId, HexId, PlayerId, Resource, ResourceBag, VertexId } from './types';

/** Facts produced by applyAction, used for logs, narration and animation. */
export type GameEvent =
  | { type: 'setupPlaced'; player: PlayerId; kind: 'settlement' | 'road'; vertex?: VertexId; edge?: EdgeId }
  | { type: 'setupResources'; player: PlayerId; resources: ResourceBag }
  | { type: 'setupComplete'; first: PlayerId }
  | { type: 'diceRolled'; player: PlayerId; dice: [number, number]; total: number }
  | { type: 'resourcesProduced'; gains: ResourceBag[]; shortages: Resource[] }
  | { type: 'discardRequired'; players: PlayerId[] }
  | { type: 'discarded'; player: PlayerId; resources: ResourceBag }
  | { type: 'robberMoved'; player: PlayerId; hex: HexId }
  | { type: 'stole'; thief: PlayerId; victim: PlayerId; resource: Resource | null }
  | { type: 'nobodyToRob'; player: PlayerId }
  | { type: 'built'; player: PlayerId; kind: 'road' | 'settlement' | 'city'; vertex?: VertexId; edge?: EdgeId; free?: boolean }
  | { type: 'devBought'; player: PlayerId; card: DevCard }
  | { type: 'devPlayed'; player: PlayerId; card: DevCard; detail?: string }
  | { type: 'monopolyTaken'; player: PlayerId; resource: Resource; from: { player: PlayerId; count: number }[] }
  | { type: 'yearOfPlenty'; player: PlayerId; resources: ResourceBag }
  | { type: 'tradeOffered'; player: PlayerId; give: ResourceBag; want: ResourceBag }
  | { type: 'tradeResponded'; player: PlayerId; response: 'accept' | 'reject' | 'counter'; give?: ResourceBag; want?: ResourceBag }
  | { type: 'traded'; from: PlayerId; to: PlayerId; gave: ResourceBag; got: ResourceBag }
  | { type: 'tradeCancelled'; player: PlayerId }
  | { type: 'maritimeTrade'; player: PlayerId; gave: Resource; amount: number; got: Resource }
  | { type: 'longestRoad'; holder: PlayerId | null; previous: PlayerId | null; length: number }
  | { type: 'largestArmy'; holder: PlayerId; previous: PlayerId | null; size: number }
  | { type: 'turnEnded'; player: PlayerId; next: PlayerId }
  | { type: 'gameEnded'; winner: PlayerId; points: number };
