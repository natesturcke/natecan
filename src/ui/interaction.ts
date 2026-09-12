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
  /** Viewport point the confirm popover anchors to (a board piece or the button pressed). */
  anchor?: { x: number; y: number } | null;
  /** Board selections get their anchor from the Phaser ghost position. */
  anchorFromBoard?: boolean;
}

export function anchorFromEvent(e?: { clientX: number; clientY: number; currentTarget?: EventTarget | null }): { x: number; y: number } | null {
  if (!e) return null;
  const el = e.currentTarget as HTMLElement | null;
  if (el && typeof el.getBoundingClientRect === 'function') {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top };
  }
  return { x: e.clientX, y: e.clientY };
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
      return 'You could still build something. End your turn anyway?';
    default:
      return 'Confirm?';
  }
}
