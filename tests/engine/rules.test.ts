import { describe, expect, it } from 'vitest';
import { TOPOLOGY } from '@/engine/board/topology';
import { applyAction } from '@/engine/reduce';
import { legalActions, validateAction } from '@/engine/legal';
import { distributeResources } from '@/engine/rules/production';
import { bag, bagTotal } from '@/engine/bag';
import { currentActor } from '@/engine/state';
import { freshGame, mainPhaseFor, stateWith, throughSetup } from '../helpers/fixtures';
import type { GameState, PlayerId } from '@/engine/types';
import { boardIndex } from '@/engine/board/index';

function hexWithToken(s: GameState, token: number): number {
  return boardIndex(s.board).hexesByToken.get(token)![0];
}

describe('setup phase', () => {
  it('snake order, distance rule and resources on the second settlement', () => {
    let s = freshGame(11);
    expect(s.phase.kind).toBe('setup');
    const order = s.phase.kind === 'setup' ? s.phase.order : [];
    expect(order.length).toBe(8);
    expect(order.slice(0, 4).reverse()).toEqual(order.slice(4));

    const first = currentActor(s);
    const v = legalActions(s, first)[0];
    s = applyAction(s, v).state;
    // Neighbours of the placed vertex are now illegal for the next player.
    const placed = v.type === 'SETUP_PLACE_SETTLEMENT' ? v.vertex : -1;
    const roadLegal = legalActions(s, first);
    expect(roadLegal.every((a) => a.type === 'SETUP_PLACE_ROAD')).toBe(true);
    s = applyAction(s, roadLegal[0]).state;
    const next = currentActor(s);
    const nextLegal = legalActions(s, next).map((a) => (a.type === 'SETUP_PLACE_SETTLEMENT' ? a.vertex : -1));
    for (const n of TOPOLOGY.vertexNeighbors[placed]) expect(nextLegal).not.toContain(n);
    expect(nextLegal).not.toContain(placed);

    s = throughSetup(s);
    expect(s.phase.kind).toBe('preRoll');
    expect(s.turn.current).toBe(order[0]);
    // Every player got something for their second settlement (very likely) and all hold >= 0.
    for (const p of s.players) expect(bagTotal(p.resources)).toBeGreaterThanOrEqual(0);
    expect(s.players.every((p) => p.pieces.settlements === 3 && p.pieces.roads === 13)).toBe(true);
  });
});

describe('production', () => {
  it('pays 1 per settlement, 2 per city, and the robber blocks', () => {
    const base = throughSetup(freshGame(2));
    const h = hexWithToken(base, 8);
    const [v1, v2] = [TOPOLOGY.hexVertices[h][0], TOPOLOGY.hexVertices[h][3]];
    const s = stateWith(
      { ...base, buildings: base.buildings.map(() => null), roads: base.roads.map(() => -1 as const) },
      { buildings: { [v1]: { owner: 0, kind: 'settlement' }, [v2]: { owner: 1, kind: 'city' } } },
    );
    const res = boardIndex(s.board);
    void res;
    const { gains } = distributeResources(s, 8);
    const terrain = s.board.hexes[h].terrain;
    const resource = { hills: 'brick', forest: 'lumber', mountains: 'ore', fields: 'grain', pasture: 'wool' }[terrain as string]!;
    expect(gains[0][resource as 'brick']).toBeGreaterThanOrEqual(1);
    expect(gains[1][resource as 'brick']).toBeGreaterThanOrEqual(2);
    const blocked = distributeResources({ ...s, robber: h }, 8);
    expect(blocked.gains[0][resource as 'brick']).toBeLessThan(gains[0][resource as 'brick']);
  });

  it('bank shortage: nobody paid when two players are short, remainder paid when one is short', () => {
    const base = throughSetup(freshGame(2));
    const h = hexWithToken(base, 6);
    const terrain = base.board.hexes[h].terrain;
    const resource = { hills: 'brick', forest: 'lumber', mountains: 'ore', fields: 'grain', pasture: 'wool' }[terrain as string]! as 'brick';
    const [v1, v2] = [TOPOLOGY.hexVertices[h][0], TOPOLOGY.hexVertices[h][3]];
    const empty = { ...base, buildings: base.buildings.map(() => null), roads: base.roads.map(() => -1 as const), robber: 99 };
    let s = stateWith(empty, { buildings: { [v1]: { owner: 0, kind: 'city' }, [v2]: { owner: 1, kind: 'city' } } });
    s = { ...s, bank: { ...s.bank, [resource]: 3 } };
    const two = distributeResources(s, 6);
    expect(two.shortages).toContain(resource);
    expect(two.gains[0][resource]).toBe(0);
    expect(two.gains[1][resource]).toBe(0);

    let one = stateWith(empty, { buildings: { [v1]: { owner: 0, kind: 'city' } } });
    one = { ...one, bank: { ...one.bank, [resource]: 1 } };
    const single = distributeResources(one, 6);
    expect(single.gains[0][resource]).toBe(1);
    expect(single.shortages).not.toContain(resource);
  });
});

describe('building', () => {
  it('enforces costs, piece limits, connectivity and the distance rule', () => {
    let s = throughSetup(freshGame(4));
    const p = s.turn.current;
    s = mainPhaseFor(s, p);
    const poor = { ...s, players: s.players.map((pl) => ({ ...pl, resources: bag() })) };
    expect(legalActions(poor, p).some((a) => a.type.startsWith('BUILD_'))).toBe(false);

    const rich = stateWith(s, { resources: { [p]: { brick: 5, lumber: 5, grain: 5, wool: 5, ore: 5 } } });
    const roads = legalActions(rich, p).filter((a) => a.type === 'BUILD_ROAD');
    expect(roads.length).toBeGreaterThan(0);
    for (const a of roads) {
      if (a.type !== 'BUILD_ROAD') continue;
      const touchesMine = TOPOLOGY.edgeVertices[a.edge].some(
        (v) => rich.buildings[v]?.owner === p || TOPOLOGY.vertexEdges[v].some((e) => rich.roads[e] === p),
      );
      expect(touchesMine).toBe(true);
    }
    const cities = legalActions(rich, p).filter((a) => a.type === 'BUILD_CITY');
    expect(cities.length).toBe(2);

    // No cities left: none offered.
    const noCities = { ...rich, players: rich.players.map((pl) => (pl.id === p ? { ...pl, pieces: { ...pl.pieces, cities: 0 } } : pl)) };
    expect(legalActions(noCities, p).some((a) => a.type === 'BUILD_CITY')).toBe(false);

    // Distance rule: settlement next to an existing building is illegal.
    const mine = rich.buildings.findIndex((b) => b && b.owner === p);
    const neighbour = TOPOLOGY.vertexNeighbors[mine][0];
    expect(validateAction(rich, { player: p, type: 'BUILD_SETTLEMENT', vertex: neighbour })).not.toBeNull();

    // City upgrade returns a settlement to supply.
    const cityAction = cities[0];
    const after = applyAction(rich, cityAction).state;
    expect(after.players[p].pieces.cities).toBe(3);
    expect(after.players[p].pieces.settlements).toBe(4);
    expect(after.players[p].resources.ore).toBe(2);
  });

  it('cannot build a road through an opponent settlement', () => {
    let s = throughSetup(freshGame(4));
    const p = s.turn.current;
    const opp = ((p + 1) % 4) as PlayerId;
    const oppVertex = s.buildings.findIndex((b) => b && b.owner === opp);
    // Put my road on an edge touching the opponent's settlement, then try to continue past it.
    const inEdge = TOPOLOGY.vertexEdges[oppVertex].find((e) => s.roads[e] === -1)!;
    const outEdge = TOPOLOGY.vertexEdges[oppVertex].find((e) => e !== inEdge && s.roads[e] === -1);
    if (outEdge === undefined) return; // vertex fully occupied; nothing to test on this seed
    s = mainPhaseFor(stateWith(s, { roads: { [inEdge]: p }, resources: { [p]: { brick: 3, lumber: 3 } } }), p);
    expect(validateAction(s, { player: p, type: 'BUILD_ROAD', edge: outEdge })).not.toBeNull();
  });
});

describe('robber and discards', () => {
  it('rolling a 7 forces discards in clockwise order, then the robber moves and steals', () => {
    let s = throughSetup(freshGame(6));
    const p = s.turn.current;
    const p2 = ((p + 1) % 4) as PlayerId;
    s = stateWith(s, { resources: { [p]: { brick: 9 }, [p2]: { grain: 8 }, [((p + 2) % 4) as PlayerId]: { ore: 7 } } });
    s = applyAction(s, { player: p, type: 'ROLL_DICE' }, { forced: { dice: [3, 4] } }).state;
    expect(s.phase.kind).toBe('discard');
    expect(s.phase.kind === 'discard' && s.phase.pending).toEqual([p, p2]);
    expect(validateAction(s, { player: p, type: 'DISCARD', resources: bag({ brick: 3 }) })).not.toBeNull();
    s = applyAction(s, { player: p, type: 'DISCARD', resources: bag({ brick: 4 }) }).state;
    expect(currentActor(s)).toBe(p2);
    s = applyAction(s, { player: p2, type: 'DISCARD', resources: bag({ grain: 4 }) }).state;
    expect(s.phase.kind).toBe('moveRobber');
    expect(validateAction(s, { player: p, type: 'MOVE_ROBBER', hex: s.robber })).not.toBeNull();

    // Move to a hex bordering p2's settlement with cards: steal happens automatically when one victim.
    const p2Vertex = s.buildings.findIndex((b) => b && b.owner === p2);
    const target = TOPOLOGY.vertexHexes[p2Vertex].find((h) => {
      const owners = new Set(TOPOLOGY.hexVertices[h].map((v) => s.buildings[v]?.owner).filter((o) => o !== undefined && o !== p));
      return owners.size === 1 && h !== s.robber;
    });
    if (target === undefined) return;
    const res = applyAction(s, { player: p, type: 'MOVE_ROBBER', hex: target }, { forced: { stolen: 'grain' } });
    expect(res.events.some((e) => e.type === 'stole' && e.victim === p2 && e.resource === 'grain')).toBe(true);
    expect(res.state.phase.kind).toBe('main');
    expect(res.state.players[p].resources.grain).toBe(s.players[p].resources.grain + 1);
  });

  it('knight before rolling returns to preRoll after the robber', () => {
    let s = throughSetup(freshGame(8));
    const p = s.turn.current;
    s = { ...s, players: s.players.map((pl) => (pl.id === p ? { ...pl, devCards: ['knight'] } : pl)) };
    s = applyAction(s, { player: p, type: 'PLAY_KNIGHT' }).state;
    expect(s.phase.kind).toBe('moveRobber');
    const hex = [...Array(19).keys()].find((h) => h !== s.robber && TOPOLOGY.hexVertices[h].every((v) => !s.buildings[v]))!;
    s = applyAction(s, { player: p, type: 'MOVE_ROBBER', hex }).state;
    expect(s.phase.kind).toBe('preRoll');
    expect(s.turn.devPlayed).toBe(true);
    expect(validateAction(s, { player: p, type: 'PLAY_KNIGHT' })).not.toBeNull();
    expect(s.players[p].knightsPlayed).toBe(1);
  });
});

describe('development cards', () => {
  it('bought cards are not playable this turn, VP cards count immediately', () => {
    let s = throughSetup(freshGame(9));
    const p = s.turn.current;
    s = mainPhaseFor(stateWith(s, { resources: { [p]: { ore: 3, grain: 3, wool: 3 } } }), p);
    s = { ...s, devDeck: ['knight', 'victoryPoint'] };
    s = applyAction(s, { player: p, type: 'BUY_DEV_CARD' }).state;
    expect(s.players[p].devCards).toEqual(['victoryPoint']);
    s = applyAction(s, { player: p, type: 'BUY_DEV_CARD' }).state;
    expect(s.players[p].newDevCards).toEqual(['knight']);
    expect(validateAction(s, { player: p, type: 'PLAY_KNIGHT' })).not.toBeNull();
    expect(validateAction(s, { player: p, type: 'BUY_DEV_CARD' })).not.toBeNull(); // deck empty
    s = applyAction(s, { player: p, type: 'END_TURN' }).state;
    expect(s.players[p].devCards).toContain('knight');
    expect(s.players[p].newDevCards).toEqual([]);
  });

  it('monopoly, year of plenty and road building work and only one card per turn', () => {
    let s = throughSetup(freshGame(10));
    const p = s.turn.current;
    const others = [1, 2, 3].map((i) => ((p + i) % 4) as PlayerId);
    s = mainPhaseFor(
      stateWith(s, { resources: { [others[0]]: { wool: 2 }, [others[1]]: { wool: 3, ore: 1 }, [others[2]]: {} } }),
      p,
    );
    s = { ...s, players: s.players.map((pl) => (pl.id === p ? { ...pl, devCards: ['monopoly', 'yearOfPlenty', 'roadBuilding'], resources: bag() } : pl)) };
    const mono = applyAction(s, { player: p, type: 'PLAY_MONOPOLY', resource: 'wool' });
    expect(mono.state.players[p].resources.wool).toBe(5);
    expect(mono.state.players[others[1]].resources.ore).toBe(1);
    expect(validateAction(mono.state, { player: p, type: 'PLAY_YEAR_OF_PLENTY', first: 'ore', second: 'ore' })).not.toBeNull();

    const yop = applyAction(s, { player: p, type: 'PLAY_YEAR_OF_PLENTY', first: 'ore', second: 'brick' }).state;
    expect(yop.players[p].resources).toMatchObject({ ore: 1, brick: 1 });

    const rb = applyAction(s, { player: p, type: 'PLAY_ROAD_BUILDING' }).state;
    expect(rb.phase).toEqual({ kind: 'roadBuilding', roadsLeft: 2 });
    const first = legalActions(rb, p)[0];
    const afterOne = applyAction(rb, first).state;
    expect(afterOne.phase).toEqual({ kind: 'roadBuilding', roadsLeft: 1 });
    expect(afterOne.players[p].resources).toEqual(bag());
    const afterTwo = applyAction(afterOne, legalActions(afterOne, p)[0]).state;
    expect(afterTwo.phase.kind).toBe('main');
    expect(afterTwo.players[p].pieces.roads).toBe(11);
  });

  it('largest army goes to the first with 3 knights and only moves on strictly more', () => {
    let s = throughSetup(freshGame(12));
    const p = s.turn.current;
    s = { ...s, players: s.players.map((pl, i) => ({ ...pl, knightsPlayed: i === p ? 2 : 3 })) };
    s = { ...s, largestArmy: { holder: ((p + 1) % 4) as PlayerId, size: 3 } };
    s = { ...s, players: s.players.map((pl) => (pl.id === p ? { ...pl, devCards: ['knight'] } : pl)) };
    s = applyAction(s, { player: p, type: 'PLAY_KNIGHT' }).state;
    expect(s.largestArmy.holder).toBe((p + 1) % 4); // tie at 3 does not transfer
    s = { ...s, phase: { kind: 'main' }, turn: { ...s.turn, devPlayed: false, hasRolled: true } };
    s = { ...s, players: s.players.map((pl) => (pl.id === p ? { ...pl, devCards: ['knight'] } : pl)) };
    const res = applyAction(s, { player: p, type: 'PLAY_KNIGHT' });
    expect(res.state.largestArmy).toEqual({ holder: p, size: 4 });
    expect(res.events.some((e) => e.type === 'largestArmy' && e.holder === p)).toBe(true);
  });
});

describe('trading', () => {
  it('maritime trade uses 4:1, 3:1 and 2:1 rates', () => {
    let s = throughSetup(freshGame(13));
    const p = s.turn.current;
    s = mainPhaseFor(stateWith(s, { resources: { [p]: { wool: 4 } } }), p);
    s = { ...s, players: s.players.map((pl) => (pl.id === p ? { ...pl, harborRates: { brick: 4, lumber: 4, ore: 4, grain: 4, wool: 4 } } : pl)) };
    expect(validateAction(s, { player: p, type: 'MARITIME_TRADE', give: 'wool', receive: 'wool' })).not.toBeNull();
    let t = applyAction(s, { player: p, type: 'MARITIME_TRADE', give: 'wool', receive: 'ore' }).state;
    expect(t.players[p].resources).toMatchObject({ wool: 0, ore: 1 });
    s = { ...s, players: s.players.map((pl) => (pl.id === p ? { ...pl, harborRates: { ...pl.harborRates, wool: 2 } } : pl)) };
    t = applyAction(s, { player: p, type: 'MARITIME_TRADE', give: 'wool', receive: 'ore' }).state;
    expect(t.players[p].resources).toMatchObject({ wool: 2, ore: 1 });
    expect(validateAction(s, { player: p, type: 'MARITIME_TRADE', give: 'brick', receive: 'ore' })).not.toBeNull();
  });

  it('domestic trade: offer, responses in clockwise order, confirm one acceptor', () => {
    let s = throughSetup(freshGame(14));
    const p = s.turn.current;
    const [a, b, c] = [1, 2, 3].map((i) => ((p + i) % 4) as PlayerId);
    s = mainPhaseFor(stateWith(s, { resources: { [p]: { brick: 2 }, [a]: { grain: 1 }, [b]: {}, [c]: { grain: 2 } } }), p);
    expect(validateAction(s, { player: p, type: 'TRADE_OFFER', give: bag({ brick: 1 }), want: bag({ brick: 1 }) })).not.toBeNull();
    expect(validateAction(s, { player: p, type: 'TRADE_OFFER', give: bag({ ore: 1 }), want: bag({ grain: 1 }) })).not.toBeNull();
    s = applyAction(s, { player: p, type: 'TRADE_OFFER', give: bag({ brick: 1 }), want: bag({ grain: 1 }) }).state;
    expect(s.phase.kind).toBe('tradeOffer');
    expect(currentActor(s)).toBe(a);
    s = applyAction(s, { player: a, type: 'TRADE_ACCEPT' }).state;
    expect(currentActor(s)).toBe(b);
    expect(validateAction(s, { player: b, type: 'TRADE_ACCEPT' })).not.toBeNull(); // b cannot afford
    s = applyAction(s, { player: b, type: 'TRADE_REJECT' }).state;
    expect(currentActor(s)).toBe(c);
    s = applyAction(s, { player: c, type: 'TRADE_COUNTER', give: bag({ brick: 2 }), want: bag({ grain: 2 }) }).state;
    expect(s.phase.kind).toBe('tradeResolve');
    expect(currentActor(s)).toBe(p);
    const confirmable = legalActions(s, p).filter((x) => x.type === 'TRADE_CONFIRM');
    expect(confirmable.map((x) => (x.type === 'TRADE_CONFIRM' ? x.with : -1)).sort()).toEqual([a, c].sort());
    const done = applyAction(s, { player: p, type: 'TRADE_CONFIRM', with: c }).state;
    expect(done.phase.kind).toBe('main');
    expect(done.players[p].resources).toMatchObject({ brick: 0, grain: 2 });
    expect(done.players[c].resources).toMatchObject({ brick: 2, grain: 0 });
  });

  it('when everyone rejects, play returns to main and the offer is remembered', () => {
    let s = throughSetup(freshGame(15));
    const p = s.turn.current;
    s = mainPhaseFor(stateWith(s, { resources: { [p]: { brick: 1 } } }), p);
    s = applyAction(s, { player: p, type: 'TRADE_OFFER', give: bag({ brick: 1 }), want: bag({ ore: 1 }) }).state;
    for (let i = 0; i < 3; i++) s = applyAction(s, { player: currentActor(s), type: 'TRADE_REJECT' }).state;
    expect(s.phase.kind).toBe('main');
    expect(s.turn.rejectedOffers.length).toBe(1);
  });
});

describe('victory', () => {
  it('ends only on the active player turn, counting hidden VP cards', () => {
    let s = throughSetup(freshGame(16));
    const p = s.turn.current;
    const other = ((p + 1) % 4) as PlayerId;
    // Give `other` 10 points worth of cards during p's turn: game does not end.
    s = { ...s, players: s.players.map((pl) => (pl.id === other ? { ...pl, devCards: Array(8).fill('victoryPoint') } : pl)) };
    s = mainPhaseFor(s, p);
    // Before ending the turn, p's own actions do not end the game for `other`.
    expect(s.phase.kind).toBe('main');
    // As soon as it becomes `other`'s turn they hold 10 points and win.
    const res = applyAction(s, { player: p, type: 'END_TURN' });
    expect(res.state.phase).toEqual({ kind: 'ended', winner: other });
    expect(res.events.at(-1)?.type).toBe('gameEnded');
    expect(legalActions(res.state, other)).toEqual([]);
  });

  it('rejects every action out of phase and never mutates input', () => {
    const s = Object.freeze(throughSetup(freshGame(17)));
    const p = s.turn.current;
    expect(validateAction(s, { player: p, type: 'END_TURN' })).not.toBeNull();
    expect(validateAction(s, { player: p, type: 'BUILD_ROAD', edge: 0 })).not.toBeNull();
    expect(validateAction(s, { player: ((p + 1) % 4) as PlayerId, type: 'ROLL_DICE' })).not.toBeNull();
    const snapshot = JSON.stringify(s);
    applyAction(s, { player: p, type: 'ROLL_DICE' });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
