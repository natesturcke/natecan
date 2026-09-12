import type { EdgeId, HexId, PlayerId, Resource, ResourceBag, VertexId } from './types';

export type ActionBody =
  | { type: 'SETUP_PLACE_SETTLEMENT'; vertex: VertexId }
  | { type: 'SETUP_PLACE_ROAD'; edge: EdgeId }
  | { type: 'ROLL_DICE' }
  | { type: 'DISCARD'; resources: ResourceBag }
  | { type: 'MOVE_ROBBER'; hex: HexId }
  | { type: 'STEAL'; victim: PlayerId }
  | { type: 'TRADE_OFFER'; give: ResourceBag; want: ResourceBag }
  | { type: 'TRADE_ACCEPT' }
  | { type: 'TRADE_REJECT' }
  /** From the offerer's perspective: what the offerer would give and receive. */
  | { type: 'TRADE_COUNTER'; give: ResourceBag; want: ResourceBag }
  | { type: 'TRADE_CONFIRM'; with: PlayerId }
  | { type: 'TRADE_CANCEL' }
  | { type: 'MARITIME_TRADE'; give: Resource; receive: Resource }
  | { type: 'BUILD_ROAD'; edge: EdgeId }
  | { type: 'BUILD_SETTLEMENT'; vertex: VertexId }
  | { type: 'BUILD_CITY'; vertex: VertexId }
  | { type: 'BUY_DEV_CARD' }
  | { type: 'PLAY_KNIGHT' }
  | { type: 'PLAY_ROAD_BUILDING' }
  | { type: 'PLAY_YEAR_OF_PLENTY'; first: Resource; second: Resource | null }
  | { type: 'PLAY_MONOPOLY'; resource: Resource }
  | { type: 'END_TURN' };

export type Action = { player: PlayerId } & ActionBody;
export type ActionType = ActionBody['type'];

export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;

/** Stable string key for an action, used for de-duplication and rejected-offer tracking. */
export function actionKey(a: Action): string {
  return JSON.stringify(a);
}

export function bagKey(bag: ResourceBag): string {
  return `${bag.brick},${bag.lumber},${bag.ore},${bag.grain},${bag.wool}`;
}

export function offerKey(give: ResourceBag, want: ResourceBag): string {
  return `${bagKey(give)}>${bagKey(want)}`;
}
