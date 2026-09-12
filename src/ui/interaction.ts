import type { Action } from '@/engine/actions';

/** What the human is currently doing in the main phase. Purely UI state. */
export type Mode = 'idle' | 'road' | 'settlement' | 'city';

/** A selected action awaiting the Confirm click. The engine never sees it until then. */
export interface Pending {
  action: Action;
  /** Question shown in the prompt bar, e.g. "Build a settlement here?" */
  question: string;
  /** Optional extra note, e.g. costs. */
  note?: string;
}

export type Dialog =
  | { kind: 'none' }
  | { kind: 'maritime' }
  | { kind: 'trade' }
  | { kind: 'yearOfPlenty' }
  | { kind: 'monopoly' }
  | { kind: 'rules' };

export function describeAction(a: Action): string {
  switch (a.type) {
    case 'SETUP_PLACE_SETTLEMENT':
      return 'Place your settlement here?';
    case 'SETUP_PLACE_ROAD':
      return 'Place your road here?';
    case 'BUILD_ROAD':
      return 'Build a road here?';
    case 'BUILD_SETTLEMENT':
      return 'Build a settlement here?';
    case 'BUILD_CITY':
      return 'Upgrade this settlement to a city?';
    case 'MOVE_ROBBER':
      return 'Move the robber here?';
    case 'STEAL':
      return 'Steal from this player?';
    case 'BUY_DEV_CARD':
      return 'Buy a development card?';
    case 'PLAY_KNIGHT':
      return 'Play your Knight?';
    case 'PLAY_ROAD_BUILDING':
      return 'Play Road Building?';
    case 'END_TURN':
      return 'End your turn?';
    default:
      return 'Confirm?';
  }
}
