import type { Action } from './actions';
import { offerKey } from './actions';
import { TOPOLOGY } from './board/topology';
import { bag, bagAdd, bagSub, bagToList, bagTotal } from './bag';
import { COSTS, DISCARD_THRESHOLD, PLAYER_COUNT } from './constants';
import type { GameEvent } from './events';
import { IllegalActionError, validateAction } from './legal';
import { computeHarborRates } from './rules/harbors';
import { updateLargestArmy } from './rules/largestArmy';
import { longestTrail, updateLongestRoadHolder } from './rules/longestRoad';
import { legalRoadEdges } from './rules/placement';
import { distributeResources, setupResources } from './rules/production';
import { robberVictims } from './rules/robber';
import { discardCount } from './rules/trade';
import { hasWon, totalVictoryPoints } from './rules/victory';
import { nextInt, rollDie } from './rng';
import { nextPlayer, otherPlayers } from './state';
import type { DevCard, GameState, Phase, Player, PlayerId, Resource, ResourceBag, RobberReturn, TradeResponse } from './types';
import { RESOURCES } from './types';

export interface ForcedOutcomes {
  dice?: [number, number];
  stolen?: Resource;
}

export interface ApplyOptions {
  forced?: ForcedOutcomes;
  /** Internal: search may force outcomes regardless of config. */
  trustForced?: boolean;
}

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

type Draft = {
  state: GameState;
  events: GameEvent[];
};

function patchPlayer(d: Draft, id: PlayerId, patch: Partial<Player>): void {
  const players = d.state.players.slice();
  players[id] = { ...players[id], ...patch };
  d.state = { ...d.state, players };
}

function setPhase(d: Draft, phase: Phase): void {
  d.state = { ...d.state, phase };
}

function moveResources(d: Draft, from: PlayerId | 'bank', to: PlayerId | 'bank', amount: ResourceBag): void {
  if (from === 'bank') d.state = { ...d.state, bank: bagSub(d.state.bank, amount) };
  else patchPlayer(d, from, { resources: bagSub(d.state.players[from].resources, amount) });
  if (to === 'bank') d.state = { ...d.state, bank: bagAdd(d.state.bank, amount) };
  else patchPlayer(d, to, { resources: bagAdd(d.state.players[to].resources, amount) });
}

function placeRoad(d: Draft, player: PlayerId, edge: number): void {
  const roads = d.state.roads.slice();
  roads[edge] = player;
  d.state = { ...d.state, roads };
  const me = d.state.players[player];
  patchPlayer(d, player, { pieces: { ...me.pieces, roads: me.pieces.roads - 1 } });
  patchPlayer(d, player, { roadLength: longestTrail(d.state, player) });
  applyLongestRoad(d);
}

function placeSettlement(d: Draft, player: PlayerId, vertex: number): void {
  const buildings = d.state.buildings.slice();
  buildings[vertex] = { owner: player, kind: 'settlement' };
  d.state = { ...d.state, buildings };
  const me = d.state.players[player];
  patchPlayer(d, player, { pieces: { ...me.pieces, settlements: me.pieces.settlements - 1 } });
  patchPlayer(d, player, { harborRates: computeHarborRates(d.state, player) });
  // A new settlement may split an opponent's road running through this vertex.
  const affected = new Set<PlayerId>();
  for (const e of TOPOLOGY.vertexEdges[vertex]) {
    const owner = d.state.roads[e];
    if (owner !== -1 && owner !== player) affected.add(owner);
  }
  for (const other of affected) patchPlayer(d, other, { roadLength: longestTrail(d.state, other) });
  if (affected.size > 0) applyLongestRoad(d);
}

function placeCity(d: Draft, player: PlayerId, vertex: number): void {
  const buildings = d.state.buildings.slice();
  buildings[vertex] = { owner: player, kind: 'city' };
  d.state = { ...d.state, buildings };
  const me = d.state.players[player];
  patchPlayer(d, player, {
    pieces: { ...me.pieces, cities: me.pieces.cities - 1, settlements: me.pieces.settlements + 1 },
  });
}

function applyLongestRoad(d: Draft): void {
  const update = updateLongestRoadHolder(d.state);
  if (!update.changed) return;
  const previous = d.state.longestRoad.holder;
  d.state = { ...d.state, longestRoad: { holder: update.holder, length: update.length } };
  if (update.holder !== previous) d.events.push({ type: 'longestRoad', holder: update.holder, previous, length: update.length });
}

function beginRobber(d: Draft, then: RobberReturn): void {
  setPhase(d, { kind: 'moveRobber', then });
}

function afterRobber(d: Draft, then: RobberReturn): void {
  setPhase(d, then === 'main' ? { kind: 'main' } : { kind: 'preRoll' });
}

function doSteal(d: Draft, thief: PlayerId, victim: PlayerId, forced: Resource | undefined): void {
  const cards = bagToList(d.state.players[victim].resources);
  let resource: Resource | null = null;
  if (cards.length > 0) {
    if (forced && d.state.players[victim].resources[forced] > 0) {
      resource = forced;
    } else {
      const [i, rng] = nextInt(d.state.rng, cards.length);
      d.state = { ...d.state, rng };
      resource = cards[i];
    }
    moveResources(d, victim, thief, bag({ [resource]: 1 }));
  }
  d.events.push({ type: 'stole', thief, victim, resource });
}

function endTurn(d: Draft, player: PlayerId): void {
  const me = d.state.players[player];
  patchPlayer(d, player, { devCards: [...me.devCards, ...me.newDevCards], newDevCards: [] });
  const next = nextPlayer(player);
  d.state = {
    ...d.state,
    turn: {
      current: next,
      number: d.state.turn.number + 1,
      hasRolled: false,
      devPlayed: false,
      tradesOffered: 0,
      rejectedOffers: [],
      lastRoll: null,
    },
  };
  setPhase(d, { kind: 'preRoll' });
  d.events.push({ type: 'turnEnded', player, next });
}

function consumeDevCard(d: Draft, player: PlayerId, card: DevCard): void {
  const me = d.state.players[player];
  const i = me.devCards.indexOf(card);
  const devCards = me.devCards.slice();
  devCards.splice(i, 1);
  patchPlayer(d, player, { devCards });
  d.state = { ...d.state, turn: { ...d.state.turn, devPlayed: true } };
}

function startTrade(d: Draft, from: PlayerId, give: ResourceBag, want: ResourceBag): void {
  const responses = {} as Record<PlayerId, TradeResponse>;
  for (const p of otherPlayers(from)) responses[p] = { kind: 'pending' };
  d.state = { ...d.state, turn: { ...d.state.turn, tradesOffered: d.state.turn.tradesOffered + 1 } };
  setPhase(d, { kind: 'tradeOffer', offer: { from, give, want }, responses });
  d.events.push({ type: 'tradeOffered', player: from, give, want });
}

function recordResponse(d: Draft, player: PlayerId, response: TradeResponse): void {
  const phase = d.state.phase;
  if (phase.kind !== 'tradeOffer') return;
  const responses = { ...phase.responses, [player]: response } as Record<PlayerId, TradeResponse>;
  const stillPending = Object.values(responses).some((r) => r.kind === 'pending');
  if (stillPending) {
    setPhase(d, { ...phase, responses });
    return;
  }
  const anyPositive = Object.values(responses).some((r) => r.kind === 'accept' || r.kind === 'counter');
  if (anyPositive) {
    setPhase(d, { kind: 'tradeResolve', offer: phase.offer, responses });
  } else {
    // Everyone rejected: back to the offerer's main phase, remembering the offer.
    const key = offerKey(phase.offer.give, phase.offer.want);
    d.state = { ...d.state, turn: { ...d.state.turn, rejectedOffers: [...d.state.turn.rejectedOffers, key] } };
    setPhase(d, { kind: 'main' });
    d.events.push({ type: 'tradeCancelled', player: phase.offer.from });
  }
}

function checkWin(d: Draft): void {
  const phase = d.state.phase;
  if (phase.kind === 'setup' || phase.kind === 'ended') return;
  const current = d.state.turn.current;
  if (hasWon(d.state, current)) {
    setPhase(d, { kind: 'ended', winner: current });
    d.events.push({ type: 'gameEnded', winner: current, points: totalVictoryPoints(d.state, current) });
  }
}

/** Pure reducer: returns the next state and the events that explain what happened. */
export function applyAction(state: GameState, action: Action, opts: ApplyOptions = {}): ApplyResult {
  const error = validateAction(state, action);
  if (error) throw new IllegalActionError(error, action);

  const forced = opts.trustForced || state.config.allowForcedOutcomes ? opts.forced : undefined;
  const d: Draft = { state: { ...state, actionCount: state.actionCount + 1 }, events: [] };
  const p = action.player;
  const phase = state.phase;

  switch (action.type) {
    case 'SETUP_PLACE_SETTLEMENT': {
      if (phase.kind !== 'setup') break;
      placeSettlement(d, p, action.vertex);
      d.events.push({ type: 'setupPlaced', player: p, kind: 'settlement', vertex: action.vertex });
      if (phase.index >= PLAYER_COUNT) {
        const gained = setupResources(d.state, action.vertex);
        if (bagTotal(gained) > 0) moveResources(d, 'bank', p, gained);
        d.events.push({ type: 'setupResources', player: p, resources: gained });
      }
      setPhase(d, { ...phase, step: 'road', lastSettlement: action.vertex });
      break;
    }
    case 'SETUP_PLACE_ROAD': {
      if (phase.kind !== 'setup') break;
      placeRoad(d, p, action.edge);
      d.events.push({ type: 'setupPlaced', player: p, kind: 'road', edge: action.edge });
      const index = phase.index + 1;
      if (index >= phase.order.length) {
        const first = phase.order[0];
        d.state = { ...d.state, turn: { ...d.state.turn, current: first, number: 1 } };
        setPhase(d, { kind: 'preRoll' });
        d.events.push({ type: 'setupComplete', first });
      } else {
        setPhase(d, { ...phase, index, step: 'settlement', lastSettlement: null });
      }
      break;
    }
    case 'ROLL_DICE': {
      let dice: [number, number];
      if (forced?.dice) {
        dice = forced.dice;
      } else {
        const [a, r1] = rollDie(d.state.rng);
        const [b, r2] = rollDie(r1);
        d.state = { ...d.state, rng: r2 };
        dice = [a, b];
      }
      const total = dice[0] + dice[1];
      d.state = { ...d.state, turn: { ...d.state.turn, hasRolled: true, lastRoll: dice } };
      d.events.push({ type: 'diceRolled', player: p, dice, total });
      if (total !== 7) {
        const { gains, shortages } = distributeResources(d.state, total);
        gains.forEach((g, id) => {
          if (bagTotal(g) > 0) moveResources(d, 'bank', id as PlayerId, g);
        });
        d.events.push({ type: 'resourcesProduced', gains, shortages });
        setPhase(d, { kind: 'main' });
        break;
      }
      const pending: PlayerId[] = [];
      for (let i = 0; i < PLAYER_COUNT; i++) {
        const id = ((p + i) % PLAYER_COUNT) as PlayerId;
        if (discardCount(d.state.players[id].resources, DISCARD_THRESHOLD) > 0) pending.push(id);
      }
      if (pending.length > 0) {
        d.events.push({ type: 'discardRequired', players: pending });
        setPhase(d, { kind: 'discard', pending });
      } else {
        beginRobber(d, 'main');
      }
      break;
    }
    case 'DISCARD': {
      if (phase.kind !== 'discard') break;
      moveResources(d, p, 'bank', action.resources);
      d.events.push({ type: 'discarded', player: p, resources: action.resources });
      const pending = phase.pending.slice(1);
      if (pending.length > 0) setPhase(d, { kind: 'discard', pending });
      else beginRobber(d, 'main');
      break;
    }
    case 'MOVE_ROBBER': {
      if (phase.kind !== 'moveRobber') break;
      d.state = { ...d.state, robber: action.hex };
      d.events.push({ type: 'robberMoved', player: p, hex: action.hex });
      const victims = robberVictims(d.state, p, action.hex);
      if (victims.length === 0) {
        d.events.push({ type: 'nobodyToRob', player: p });
        afterRobber(d, phase.then);
      } else if (victims.length === 1) {
        doSteal(d, p, victims[0], forced?.stolen);
        afterRobber(d, phase.then);
      } else {
        setPhase(d, { kind: 'steal', hex: action.hex, victims, then: phase.then });
      }
      break;
    }
    case 'STEAL': {
      if (phase.kind !== 'steal') break;
      doSteal(d, p, action.victim, forced?.stolen);
      afterRobber(d, phase.then);
      break;
    }
    case 'BUILD_ROAD': {
      const free = phase.kind === 'roadBuilding';
      if (!free) moveResources(d, p, 'bank', COSTS.road);
      placeRoad(d, p, action.edge);
      d.events.push({ type: 'built', player: p, kind: 'road', edge: action.edge, free });
      if (free && phase.kind === 'roadBuilding') {
        const roadsLeft = phase.roadsLeft - 1;
        const canContinue = roadsLeft > 0 && d.state.players[p].pieces.roads > 0 && legalRoadEdges(d.state, p).length > 0;
        setPhase(d, canContinue ? { kind: 'roadBuilding', roadsLeft } : { kind: 'main' });
      }
      break;
    }
    case 'BUILD_SETTLEMENT': {
      moveResources(d, p, 'bank', COSTS.settlement);
      placeSettlement(d, p, action.vertex);
      d.events.push({ type: 'built', player: p, kind: 'settlement', vertex: action.vertex });
      break;
    }
    case 'BUILD_CITY': {
      moveResources(d, p, 'bank', COSTS.city);
      placeCity(d, p, action.vertex);
      d.events.push({ type: 'built', player: p, kind: 'city', vertex: action.vertex });
      break;
    }
    case 'BUY_DEV_CARD': {
      moveResources(d, p, 'bank', COSTS.devCard);
      const deck = d.state.devDeck.slice();
      const card = deck.pop()!;
      d.state = { ...d.state, devDeck: deck };
      const me = d.state.players[p];
      if (card === 'victoryPoint') patchPlayer(d, p, { devCards: [...me.devCards, card] });
      else patchPlayer(d, p, { newDevCards: [...me.newDevCards, card] });
      d.events.push({ type: 'devBought', player: p, card });
      break;
    }
    case 'PLAY_KNIGHT': {
      consumeDevCard(d, p, 'knight');
      const me = d.state.players[p];
      patchPlayer(d, p, { knightsPlayed: me.knightsPlayed + 1 });
      d.events.push({ type: 'devPlayed', player: p, card: 'knight' });
      const army = updateLargestArmy(d.state, p);
      if (army.changed) {
        const previous = d.state.largestArmy.holder;
        d.state = { ...d.state, largestArmy: { holder: army.holder, size: army.size } };
        d.events.push({ type: 'largestArmy', holder: p, previous, size: army.size });
      } else if (army.holder === p && army.size !== d.state.largestArmy.size) {
        d.state = { ...d.state, largestArmy: { holder: p, size: army.size } };
      }
      beginRobber(d, d.state.turn.hasRolled ? 'main' : 'preRoll');
      break;
    }
    case 'PLAY_ROAD_BUILDING': {
      consumeDevCard(d, p, 'roadBuilding');
      d.events.push({ type: 'devPlayed', player: p, card: 'roadBuilding' });
      const roadsLeft = Math.min(2, d.state.players[p].pieces.roads);
      setPhase(d, { kind: 'roadBuilding', roadsLeft });
      break;
    }
    case 'PLAY_YEAR_OF_PLENTY': {
      consumeDevCard(d, p, 'yearOfPlenty');
      const gained = bag({ [action.first]: 1 });
      if (action.second) gained[action.second] += 1;
      moveResources(d, 'bank', p, gained);
      d.events.push({ type: 'devPlayed', player: p, card: 'yearOfPlenty' });
      d.events.push({ type: 'yearOfPlenty', player: p, resources: gained });
      break;
    }
    case 'PLAY_MONOPOLY': {
      consumeDevCard(d, p, 'monopoly');
      const from: { player: PlayerId; count: number }[] = [];
      for (const other of otherPlayers(p)) {
        const count = d.state.players[other].resources[action.resource];
        if (count > 0) {
          moveResources(d, other, p, bag({ [action.resource]: count }));
          from.push({ player: other, count });
        }
      }
      d.events.push({ type: 'devPlayed', player: p, card: 'monopoly' });
      d.events.push({ type: 'monopolyTaken', player: p, resource: action.resource, from });
      break;
    }
    case 'MARITIME_TRADE': {
      const rate = d.state.players[p].harborRates[action.give];
      moveResources(d, p, 'bank', bag({ [action.give]: rate }));
      moveResources(d, 'bank', p, bag({ [action.receive]: 1 }));
      d.events.push({ type: 'maritimeTrade', player: p, gave: action.give, amount: rate, got: action.receive });
      break;
    }
    case 'TRADE_OFFER': {
      startTrade(d, p, action.give, action.want);
      break;
    }
    case 'TRADE_ACCEPT': {
      d.events.push({ type: 'tradeResponded', player: p, response: 'accept' });
      recordResponse(d, p, { kind: 'accept' });
      break;
    }
    case 'TRADE_REJECT': {
      d.events.push({ type: 'tradeResponded', player: p, response: 'reject' });
      recordResponse(d, p, { kind: 'reject' });
      break;
    }
    case 'TRADE_COUNTER': {
      d.events.push({ type: 'tradeResponded', player: p, response: 'counter', give: action.give, want: action.want });
      recordResponse(d, p, { kind: 'counter', give: action.give, want: action.want });
      break;
    }
    case 'TRADE_CONFIRM': {
      if (phase.kind !== 'tradeResolve') break;
      const resp = phase.responses[action.with];
      const give = resp.kind === 'counter' ? resp.give : phase.offer.give;
      const want = resp.kind === 'counter' ? resp.want : phase.offer.want;
      moveResources(d, p, action.with, give);
      moveResources(d, action.with, p, want);
      d.events.push({ type: 'traded', from: p, to: action.with, gave: give, got: want });
      setPhase(d, { kind: 'main' });
      break;
    }
    case 'TRADE_CANCEL': {
      if (phase.kind !== 'tradeResolve') break;
      const key = offerKey(phase.offer.give, phase.offer.want);
      d.state = { ...d.state, turn: { ...d.state.turn, rejectedOffers: [...d.state.turn.rejectedOffers, key] } };
      setPhase(d, { kind: 'main' });
      d.events.push({ type: 'tradeCancelled', player: p });
      break;
    }
    case 'END_TURN': {
      endTurn(d, p);
      break;
    }
  }

  checkWin(d);
  return { state: d.state, events: d.events };
}

/** Convenience for tests: apply a sequence, throwing on the first illegal action. */
export function applyAll(state: GameState, actions: readonly Action[], opts?: ApplyOptions): GameState {
  let s = state;
  for (const a of actions) s = applyAction(s, a, opts).state;
  return s;
}

export { RESOURCES };
