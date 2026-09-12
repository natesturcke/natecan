import { HEX_COUNT } from './board/layout';
import { bag, bagCovers, bagTotal } from './bag';
import { COSTS, DISCARD_THRESHOLD } from './constants';
import type { Action } from './actions';
import {
  canPlaceRoad,
  canPlaceSettlement,
  canPlaceSetupRoad,
  canUpgradeToCity,
  legalCityVertices,
  legalRoadEdges,
  legalSettlementVertices,
} from './rules/placement';
import { discardCandidates, discardCount, maritimeTradeError, offerCandidates, offerShapeError } from './rules/trade';
import { currentActor } from './state';
import type { GameState, PlayerId, Resource, ResourceBag } from './types';
import { RESOURCES } from './types';
import { TOPOLOGY } from './board/topology';

export class IllegalActionError extends Error {
  constructor(
    message: string,
    public readonly action: Action,
  ) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

function holdsPlayable(state: GameState, player: PlayerId, card: 'knight' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly'): boolean {
  return state.players[player].devCards.includes(card);
}

function devPlayError(state: GameState, player: PlayerId, card: 'knight' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly'): string | null {
  if (!holdsPlayable(state, player, card)) return `You do not hold a ${card} card you can play this turn`;
  if (state.turn.devPlayed) return 'You have already played a development card this turn';
  return null;
}

/**
 * Returns null when the action is legal in the current state, otherwise a short
 * human-readable reason. This is the single source of truth for legality.
 */
export function validateAction(state: GameState, action: Action): string | null {
  const { phase } = state;
  if (phase.kind === 'ended') return 'The game is over';
  const actor = currentActor(state);
  if (action.player !== actor) return 'It is not your turn to act';
  const me = state.players[actor];
  const hand = me.resources;

  switch (phase.kind) {
    case 'setup': {
      if (phase.step === 'settlement') {
        if (action.type !== 'SETUP_PLACE_SETTLEMENT') return 'Place a settlement first';
        if (!canPlaceSettlement(state, actor, action.vertex, true)) return 'That corner is not available';
        return null;
      }
      if (action.type !== 'SETUP_PLACE_ROAD') return 'Place a road next to your new settlement';
      if (!canPlaceSetupRoad(state, action.edge, phase.lastSettlement!)) return 'The road must touch your new settlement';
      return null;
    }
    case 'preRoll': {
      if (action.type === 'ROLL_DICE') return null;
      if (action.type === 'PLAY_KNIGHT') return devPlayError(state, actor, 'knight');
      return 'Roll the dice first';
    }
    case 'discard': {
      if (action.type !== 'DISCARD') return 'You must discard first';
      const need = discardCount(hand, DISCARD_THRESHOLD);
      if (bagTotal(action.resources) !== need) return `Discard exactly ${need} cards`;
      if (!bagCovers(hand, action.resources)) return 'You cannot discard cards you do not hold';
      return null;
    }
    case 'moveRobber': {
      if (action.type !== 'MOVE_ROBBER') return 'Move the robber first';
      if (action.hex < 0 || action.hex >= HEX_COUNT) return 'Invalid hex';
      if (action.hex === state.robber) return 'The robber must move to a different hex';
      return null;
    }
    case 'steal': {
      if (action.type !== 'STEAL') return 'Choose a player to steal from';
      if (!phase.victims.includes(action.victim)) return 'You cannot steal from that player';
      return null;
    }
    case 'roadBuilding': {
      if (action.type !== 'BUILD_ROAD') return 'Place your free road';
      if (me.pieces.roads <= 0) return 'You have no roads left';
      if (!canPlaceRoad(state, actor, action.edge)) return 'That path is not connected to your roads';
      return null;
    }
    case 'tradeOffer': {
      const offer = phase.offer;
      switch (action.type) {
        case 'TRADE_ACCEPT':
          return bagCovers(hand, offer.want) ? null : 'You cannot afford this trade';
        case 'TRADE_REJECT':
          return null;
        case 'TRADE_COUNTER': {
          const err = offerShapeError(action.give, action.want);
          if (err) return err;
          if (!bagCovers(hand, action.want)) return 'You cannot afford your counter-offer';
          return null;
        }
        default:
          return 'Respond to the trade offer first';
      }
    }
    case 'tradeResolve': {
      const offer = phase.offer;
      if (action.type === 'TRADE_CANCEL') return null;
      if (action.type !== 'TRADE_CONFIRM') return 'Finish the trade first';
      const resp = phase.responses[action.with];
      if (!resp || resp.kind === 'pending' || resp.kind === 'reject') return 'That player did not accept';
      const give = resp.kind === 'accept' ? offer.give : resp.give;
      const want = resp.kind === 'accept' ? offer.want : resp.want;
      if (!bagCovers(hand, give)) return 'You can no longer afford this trade';
      if (!bagCovers(state.players[action.with].resources, want)) return 'They can no longer afford this trade';
      return null;
    }
    case 'main': {
      switch (action.type) {
        case 'BUILD_ROAD':
          if (me.pieces.roads <= 0) return 'You have no roads left';
          if (!bagCovers(hand, COSTS.road)) return 'A road costs 1 brick and 1 lumber';
          if (!canPlaceRoad(state, actor, action.edge)) return 'That path is not connected to your roads';
          return null;
        case 'BUILD_SETTLEMENT':
          if (me.pieces.settlements <= 0) return 'You have no settlements left';
          if (!bagCovers(hand, COSTS.settlement)) return 'A settlement costs brick, lumber, grain and wool';
          if (!canPlaceSettlement(state, actor, action.vertex, false)) return 'That corner is not available';
          return null;
        case 'BUILD_CITY':
          if (me.pieces.cities <= 0) return 'You have no cities left';
          if (!bagCovers(hand, COSTS.city)) return 'A city costs 3 ore and 2 grain';
          if (!canUpgradeToCity(state, actor, action.vertex)) return 'You can only upgrade one of your own settlements';
          return null;
        case 'BUY_DEV_CARD':
          if (state.devDeck.length === 0) return 'The development cards are sold out';
          if (!bagCovers(hand, COSTS.devCard)) return 'A development card costs ore, grain and wool';
          return null;
        case 'MARITIME_TRADE':
          return maritimeTradeError(state, actor, action.give, action.receive);
        case 'TRADE_OFFER': {
          const err = offerShapeError(action.give, action.want);
          if (err) return err;
          if (!bagCovers(hand, action.give)) return 'You cannot offer cards you do not hold';
          return null;
        }
        case 'PLAY_KNIGHT':
          return devPlayError(state, actor, 'knight');
        case 'PLAY_ROAD_BUILDING': {
          const err = devPlayError(state, actor, 'roadBuilding');
          if (err) return err;
          if (me.pieces.roads <= 0) return 'You have no roads left to place';
          if (legalRoadEdges(state, actor).length === 0) return 'You have nowhere to place a road';
          return null;
        }
        case 'PLAY_YEAR_OF_PLENTY': {
          const err = devPlayError(state, actor, 'yearOfPlenty');
          if (err) return err;
          const bankTotal = bagTotal(state.bank);
          if (action.second === null) {
            if (bankTotal !== 1) return 'Pick two resources';
            if (state.bank[action.first] < 1) return 'The bank has none of that resource';
            return null;
          }
          const need = bag({ [action.first]: 1 });
          need[action.second] += 1;
          if (!bagCovers(state.bank, need)) return 'The bank cannot supply those resources';
          return null;
        }
        case 'PLAY_MONOPOLY':
          return devPlayError(state, actor, 'monopoly');
        case 'END_TURN':
          return null;
        default:
          return 'That action is not available now';
      }
    }
  }
}

/** Enumerates every legal action for the player (empty unless they are the current actor). */
export function legalActions(state: GameState, player: PlayerId): Action[] {
  const { phase } = state;
  if (phase.kind === 'ended') return [];
  if (currentActor(state) !== player) return [];
  const me = state.players[player];
  const hand = me.resources;
  const out: Action[] = [];
  const p = player;

  switch (phase.kind) {
    case 'setup':
      if (phase.step === 'settlement') {
        for (const vertex of legalSettlementVertices(state, p, true)) out.push({ player: p, type: 'SETUP_PLACE_SETTLEMENT', vertex });
      } else {
        for (const edge of TOPOLOGY.vertexEdges[phase.lastSettlement!]) {
          if (state.roads[edge] === -1) out.push({ player: p, type: 'SETUP_PLACE_ROAD', edge });
        }
      }
      return out;
    case 'preRoll':
      out.push({ player: p, type: 'ROLL_DICE' });
      if (!devPlayError(state, p, 'knight')) out.push({ player: p, type: 'PLAY_KNIGHT' });
      return out;
    case 'discard': {
      const need = discardCount(hand, DISCARD_THRESHOLD);
      for (const resources of discardCandidates(hand, need)) out.push({ player: p, type: 'DISCARD', resources });
      return out;
    }
    case 'moveRobber':
      for (let hex = 0; hex < HEX_COUNT; hex++) if (hex !== state.robber) out.push({ player: p, type: 'MOVE_ROBBER', hex });
      return out;
    case 'steal':
      for (const victim of phase.victims) out.push({ player: p, type: 'STEAL', victim });
      return out;
    case 'roadBuilding':
      if (me.pieces.roads > 0) for (const edge of legalRoadEdges(state, p)) out.push({ player: p, type: 'BUILD_ROAD', edge });
      return out;
    case 'tradeOffer': {
      if (bagCovers(hand, phase.offer.want)) out.push({ player: p, type: 'TRADE_ACCEPT' });
      out.push({ player: p, type: 'TRADE_REJECT' });
      // Counter candidates: keep what they give, ask for more of it, or swap what we return.
      const offer = phase.offer;
      for (const g of RESOURCES) {
        if (offer.give[g] === 0) continue;
        for (const w of RESOURCES) {
          if (w === g || hand[w] === 0) continue;
          const give = bag({ [g]: offer.give[g] + 1 });
          const want = bag({ [w]: 1 });
          if (!offerShapeError(give, want)) out.push({ player: p, type: 'TRADE_COUNTER', give, want });
        }
      }
      return out;
    }
    case 'tradeResolve': {
      for (const other of Object.keys(phase.responses).map(Number) as PlayerId[]) {
        const a: Action = { player: p, type: 'TRADE_CONFIRM', with: other };
        if (!validateAction(state, a)) out.push(a);
      }
      out.push({ player: p, type: 'TRADE_CANCEL' });
      return out;
    }
    case 'main': {
      if (me.pieces.roads > 0 && bagCovers(hand, COSTS.road)) {
        for (const edge of legalRoadEdges(state, p)) out.push({ player: p, type: 'BUILD_ROAD', edge });
      }
      if (me.pieces.settlements > 0 && bagCovers(hand, COSTS.settlement)) {
        for (const vertex of legalSettlementVertices(state, p, false)) out.push({ player: p, type: 'BUILD_SETTLEMENT', vertex });
      }
      if (me.pieces.cities > 0 && bagCovers(hand, COSTS.city)) {
        for (const vertex of legalCityVertices(state, p)) out.push({ player: p, type: 'BUILD_CITY', vertex });
      }
      if (state.devDeck.length > 0 && bagCovers(hand, COSTS.devCard)) out.push({ player: p, type: 'BUY_DEV_CARD' });
      for (const give of RESOURCES) {
        for (const receive of RESOURCES) {
          if (!maritimeTradeError(state, p, give, receive)) out.push({ player: p, type: 'MARITIME_TRADE', give, receive });
        }
      }
      for (const { give, want } of offerCandidates(state, p)) out.push({ player: p, type: 'TRADE_OFFER', give, want });
      if (!devPlayError(state, p, 'knight')) out.push({ player: p, type: 'PLAY_KNIGHT' });
      if (!validateAction(state, { player: p, type: 'PLAY_ROAD_BUILDING' })) out.push({ player: p, type: 'PLAY_ROAD_BUILDING' });
      if (!devPlayError(state, p, 'yearOfPlenty')) {
        const bankTotal = bagTotal(state.bank);
        if (bankTotal === 1) {
          for (const r of RESOURCES) if (state.bank[r] > 0) out.push({ player: p, type: 'PLAY_YEAR_OF_PLENTY', first: r, second: null });
        } else {
          for (let i = 0; i < RESOURCES.length; i++) {
            for (let j = i; j < RESOURCES.length; j++) {
              const first: Resource = RESOURCES[i];
              const second: Resource = RESOURCES[j];
              const need: ResourceBag = bag({ [first]: 1 });
              need[second] += 1;
              if (bagCovers(state.bank, need)) out.push({ player: p, type: 'PLAY_YEAR_OF_PLENTY', first, second });
            }
          }
        }
      }
      if (!devPlayError(state, p, 'monopoly')) {
        for (const resource of RESOURCES) out.push({ player: p, type: 'PLAY_MONOPOLY', resource });
      }
      out.push({ player: p, type: 'END_TURN' });
      return out;
    }
  }
}
