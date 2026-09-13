import { bagCovers, bagTotal } from '@/engine/bag';
import { COSTS, DISCARD_THRESHOLD } from '@/engine/constants';
import { legalActions } from '@/engine/legal';
import { discardCount } from '@/engine/rules/trade';
import { currentActor } from '@/engine/state';
import { hiddenVictoryPoints, totalVictoryPoints } from '@/engine/rules/victory';
import type { GameState, PlayerId } from '@/engine/types';
import type { Mode, Pending } from './interaction';
import { bagText } from './text';

export interface StepPrompt {
  /** One sentence: what to do now. */
  title: string;
  /** Optional second line with context. */
  detail?: string;
  /** Whether the human is the one who must act. */
  yourMove: boolean;
}

/** "Turn 2, player 3 of 4." A turn is one full round: every player goes once. */
export function turnOfRound(state: GameState): string {
  const n = state.players.length;
  const t = state.turn.number;
  const round = Math.floor((t - 1) / n) + 1;
  const pos = ((t - 1) % n) + 1;
  return `Turn ${round}, player ${pos} of ${n}.`;
}

/**
 * Derives the prompt-bar text purely from engine state plus the UI's pending selection
 * and mode, so it can never disagree with what the engine will accept.
 */
export function describeStep(state: GameState, human: PlayerId, mode: Mode, pending: Pending | null): StepPrompt {
  const { phase } = state;
  const actor = phase.kind === 'ended' ? null : currentActor(state);
  const me = state.players[human];
  const name = (p: PlayerId) => state.players[p].name;

  if (phase.kind === 'ended') {
    const winner = phase.winner;
    const total = totalVictoryPoints(state, winner);
    const settlements = state.buildings.filter((b) => b && b.owner === winner && b.kind === 'settlement').length;
    const cities = state.buildings.filter((b) => b && b.owner === winner && b.kind === 'city').length;
    const vpCards = hiddenVictoryPoints(state, winner);
    const parts: string[] = [];
    if (settlements > 0) parts.push(`${settlements} settlement${settlements === 1 ? '' : 's'} (${settlements})`);
    if (cities > 0) parts.push(`${cities} cit${cities === 1 ? 'y' : 'ies'} (${cities * 2})`);
    if (state.longestRoad.holder === winner) parts.push('Longest Road (2)');
    if (state.largestArmy.holder === winner) parts.push('Largest Army (2)');
    if (vpCards > 0) parts.push(`${vpCards} hidden Victory Point card${vpCards === 1 ? '' : 's'} (${vpCards})`);
    const how = `${parts.join(' + ')} = ${total} points.`;
    return winner === human ? { title: `You reached ${total} points. You win!`, detail: how, yourMove: false } : { title: `${name(winner)} wins with ${total} points.`, detail: how, yourMove: false };
  }

  if (pending) {
    return { title: pending.question, detail: pending.note ?? 'Press Confirm, or Cancel to choose again.', yourMove: true };
  }

  if (actor !== human) {
    const who = name(actor!);
    switch (phase.kind) {
      case 'setup':
        return { title: `${who} is placing ${phase.step === 'settlement' ? 'a settlement' : 'a road'}…`, yourMove: false };
      case 'discard':
        return { title: `${who} is discarding cards…`, yourMove: false };
      case 'tradeOffer':
        return { title: `${who} is considering the trade…`, yourMove: false };
      default:
        return { title: `${who} is taking their turn…`, detail: turnOfRound(state), yourMove: false };
    }
  }

  switch (phase.kind) {
    case 'setup': {
      const round = phase.index < 4 ? 'first' : 'second';
      if (phase.step === 'settlement') {
        return {
          title: `Place your ${round} settlement.`,
          detail: 'Click a highlighted corner. Corners next to the numbers 6 and 8 produce most often. Scroll to zoom, drag to pan, double-click the water to reset.',
          yourMove: true,
        };
      }
      return { title: 'Place a road next to your new settlement.', detail: 'Click a highlighted path.', yourMove: true };
    }
    case 'preRoll': {
      const hasKnight = me.devCards.includes('knight') && !state.turn.devPlayed;
      return {
        title: 'Roll the dice.',
        detail: hasKnight ? 'You may play your Knight before rolling.' : `${turnOfRound(state)} Every settlement next to the rolled number produces.`,
        yourMove: true,
      };
    }
    case 'discard': {
      const n = discardCount(me.resources, DISCARD_THRESHOLD);
      return { title: `A 7 was rolled. Discard ${n} cards.`, detail: 'Tap cards in your hand to choose, then press Confirm.', yourMove: true };
    }
    case 'moveRobber':
      return { title: 'Move the robber.', detail: 'Click a hex. That hex stops producing until the robber moves again.', yourMove: true };
    case 'steal':
      return { title: 'Choose a player to steal from.', detail: 'You take one random card from them.', yourMove: true };
    case 'roadBuilding':
      return {
        title: phase.roadsLeft === 2 ? 'Place your first free road.' : 'Place your second free road.',
        detail: 'Click a highlighted path.',
        yourMove: true,
      };
    case 'tradeOffer': {
      const offer = phase.offer;
      return {
        title: `${name(offer.from)} offers you ${bagText(offer.give)} for ${bagText(offer.want)}.`,
        detail: bagCovers(me.resources, offer.want) ? 'Accept or decline.' : 'You cannot afford it. Decline to continue.',
        yourMove: true,
      };
    }
    case 'tradeResolve':
      return { title: 'Choose who to trade with, or cancel.', yourMove: true };
    case 'main': {
      if (mode === 'road') return { title: 'Choose where to build the road.', detail: 'Click a highlighted path, or Cancel.', yourMove: true };
      if (mode === 'settlement') return { title: 'Choose where to build the settlement.', detail: 'Click a highlighted corner, or Cancel.', yourMove: true };
      if (mode === 'city') return { title: 'Choose a settlement to upgrade.', detail: 'Click one of your highlighted settlements, or Cancel.', yourMove: true };
      const roll = state.turn.lastRoll;
      const rolled = roll ? `You rolled ${roll[0] + roll[1]}. ` : '';
      const legal = legalActions(state, human);
      const can: string[] = [];
      const cannot: string[] = [];
      const check = (kind: 'road' | 'settlement' | 'city' | 'devCard', label: string) => {
        const why = buildDisabledReason(state, human, kind);
        if (why) cannot.push(`${label} (${why.toLowerCase()})`);
        else can.push(label);
      };
      check('road', 'build a road');
      check('settlement', 'build a settlement');
      check('city', 'build a city');
      check('devCard', 'buy a development card');
      if (legal.some((a) => a.type === 'MARITIME_TRADE')) can.push('trade with the bank');
      if (bagTotal(me.resources) > 0) can.push('offer a trade');
      const playable = me.devCards.filter((c) => c !== 'victoryPoint');
      if (playable.length > 0 && !state.turn.devPlayed) can.push('play a development card');
      const buildable = legal.some((a) => a.type === 'BUILD_ROAD' || a.type === 'BUILD_SETTLEMENT' || a.type === 'BUILD_CITY');
      const canLine = can.length > 0 ? `You can ${can.join(', ')}.${buildable ? ' Click a flashing spot on the board to build there.' : ''}` : 'You cannot build anything yet.';
      const cannotLine = cannot.length > 0 ? ` Not yet: ${cannot.join('; ')}.` : '';
      return {
        title: 'Your turn: trade or build.',
        detail: `${rolled}${canLine}${cannotLine}`,
        yourMove: true,
      };
    }
  }
}

/** Why a build button is disabled, or null when it is available. */
export function buildDisabledReason(state: GameState, human: PlayerId, kind: 'road' | 'settlement' | 'city' | 'devCard'): string | null {
  if (state.phase.kind !== 'main' || currentActor(state) !== human) return 'Not now';
  const me = state.players[human];
  const cost = COSTS[kind];
  if (!bagCovers(me.resources, cost)) {
    const missing = (['brick', 'lumber', 'ore', 'grain', 'wool'] as const).filter((r) => me.resources[r] < cost[r]).map((r) => `${cost[r] - me.resources[r]} more ${r}`);
    return `Need ${missing.join(' and ')}`;
  }
  if (kind === 'road' && me.pieces.roads === 0) return 'No roads left';
  if (kind === 'settlement' && me.pieces.settlements === 0) return 'No settlements left';
  if (kind === 'city' && me.pieces.cities === 0) return 'No cities left';
  if (kind === 'devCard' && state.devDeck.length === 0) return 'Sold out';
  const legal = legalActions(state, human);
  const type = kind === 'road' ? 'BUILD_ROAD' : kind === 'settlement' ? 'BUILD_SETTLEMENT' : kind === 'city' ? 'BUILD_CITY' : 'BUY_DEV_CARD';
  if (!legal.some((a) => a.type === type)) {
    if (kind === 'road') return 'No open path next to your roads';
    if (kind === 'settlement') return 'No free corner on your roads';
    if (kind === 'city') return 'No settlement to upgrade';
  }
  return null;
}
