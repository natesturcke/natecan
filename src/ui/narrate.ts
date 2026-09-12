import type { GameEvent } from '@/engine/events';
import type { GameState, PlayerId } from '@/engine/types';
import { TERRAIN_LABEL, bagText, DEV_LABEL, plural, RESOURCE_LABEL } from './text';

export interface LogLine {
  text: string;
  player: PlayerId | null;
  tone: 'normal' | 'good' | 'bad' | 'system';
}

/** Turns engine events into plain-English log lines from the viewer's perspective. */
export function narrate(event: GameEvent, state: GameState, viewer: PlayerId): LogLine[] {
  const name = (p: PlayerId) => (p === viewer ? 'You' : state.players[p].name);
  const verb = (p: PlayerId, you: string, they: string) => (p === viewer ? you : they);
  const line = (text: string, player: PlayerId | null = null, tone: LogLine['tone'] = 'normal'): LogLine => ({ text, player, tone });

  switch (event.type) {
    case 'setupPlaced':
      return [line(`${name(event.player)} placed a ${event.kind}.`, event.player)];
    case 'setupResources':
      return [line(`${name(event.player)} received ${bagText(event.resources)} for the second settlement.`, event.player, 'good')];
    case 'setupComplete':
      return [line(`Setup complete. ${name(event.first)} ${verb(event.first, 'roll', 'rolls')} first.`, null, 'system')];
    case 'diceRolled':
      return [line(`${name(event.player)} rolled ${event.total} (${event.dice[0]} + ${event.dice[1]}).`, event.player)];
    case 'resourcesProduced': {
      const out: LogLine[] = [];
      event.gains.forEach((g, p) => {
        const total = Object.values(g).reduce((a, b) => a + b, 0);
        if (total > 0) out.push(line(`${name(p as PlayerId)} got ${bagText(g)}.`, p as PlayerId, p === viewer ? 'good' : 'normal'));
      });
      if (event.shortages.length > 0) out.push(line(`The bank ran out of ${event.shortages.map((r) => RESOURCE_LABEL[r]).join(' and ')}, so nobody received it.`, null, 'system'));
      if (out.length === 0) out.push(line('Nobody received resources.', null, 'system'));
      return out;
    }
    case 'discardRequired':
      return [line(`A 7! ${event.players.map(name).join(', ')} must discard half.`, null, 'system')];
    case 'discarded':
      return [line(`${name(event.player)} discarded ${bagText(event.resources)}.`, event.player, event.player === viewer ? 'bad' : 'normal')];
    case 'robberMoved':
      return [line(`${name(event.player)} moved the robber to the ${TERRAIN_LABEL[state.board.hexes[event.hex].terrain]}${state.board.hexes[event.hex].token ? ` (${state.board.hexes[event.hex].token})` : ''}.`, event.player)];
    case 'stole': {
      if (event.resource === null) return [line(`${name(event.thief)} found nothing to steal from ${name(event.victim)}.`, event.thief)];
      const seen = event.thief === viewer || event.victim === viewer;
      const what = seen ? `1 ${RESOURCE_LABEL[event.resource]}` : 'a card';
      return [line(`${name(event.thief)} stole ${what} from ${name(event.victim)}.`, event.thief, event.victim === viewer ? 'bad' : event.thief === viewer ? 'good' : 'normal')];
    }
    case 'nobodyToRob':
      return [line(`Nobody to rob there.`, event.player)];
    case 'built':
      return [line(`${name(event.player)} built a ${event.kind}${event.free ? ' (free)' : ''}.`, event.player)];
    case 'devBought':
      return [line(`${name(event.player)} bought a development card${event.player === viewer ? `: ${DEV_LABEL[event.card]}` : ''}.`, event.player)];
    case 'devPlayed':
      return [line(`${name(event.player)} played ${DEV_LABEL[event.card]}.`, event.player)];
    case 'monopolyTaken': {
      const total = event.from.reduce((a, b) => a + b.count, 0);
      return [line(`${name(event.player)} took ${plural(total, RESOURCE_LABEL[event.resource])} with Monopoly.`, event.player, event.from.some((f) => f.player === viewer) ? 'bad' : 'normal')];
    }
    case 'yearOfPlenty':
      return [line(`${name(event.player)} took ${bagText(event.resources)} from the bank.`, event.player)];
    case 'tradeOffered':
      return [line(`${name(event.player)} ${verb(event.player, 'offer', 'offers')} ${bagText(event.give)} for ${bagText(event.want)}.`, event.player)];
    case 'tradeResponded':
      return [
        line(
          event.response === 'accept'
            ? `${name(event.player)} ${verb(event.player, 'accept', 'accepts')}.`
            : event.response === 'reject'
              ? `${name(event.player)} ${verb(event.player, 'decline', 'declines')}.`
              : `${name(event.player)} ${verb(event.player, 'counter', 'counters')}: ${bagText(event.want!)} for ${bagText(event.give!)}.`,
          event.player,
        ),
      ];
    case 'traded':
      return [line(`${name(event.from)} traded ${bagText(event.gave)} to ${name(event.to)} for ${bagText(event.got)}.`, event.from, 'good')];
    case 'tradeCancelled':
      return [line(`No trade happened.`, event.player, 'system')];
    case 'maritimeTrade':
      return [line(`${name(event.player)} traded ${plural(event.amount, RESOURCE_LABEL[event.gave])} to the bank for 1 ${RESOURCE_LABEL[event.got]}.`, event.player)];
    case 'longestRoad':
      if (event.holder === null) return [line(`Longest Road is set aside: nobody has the unique longest road.`, null, 'system')];
      return [line(`${name(event.holder)} ${verb(event.holder, 'take', 'takes')} Longest Road (${event.length} segments, 2 points).`, event.holder, event.holder === viewer ? 'good' : 'bad')];
    case 'largestArmy':
      return [line(`${name(event.holder)} ${verb(event.holder, 'take', 'takes')} Largest Army (${event.size} knights, 2 points).`, event.holder, event.holder === viewer ? 'good' : 'bad')];
    case 'turnEnded':
      return [line(`${name(event.player)} ended the turn. ${name(event.next)} ${verb(event.next, 'are', 'is')} up.`, event.next, 'system')];
    case 'gameEnded':
      return [line(`${name(event.winner)} ${verb(event.winner, 'win', 'wins')} with ${event.points} points!`, event.winner, event.winner === viewer ? 'good' : 'bad')];
  }
}
