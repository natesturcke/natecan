import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action } from '@/engine/actions';
import { bag, bagCovers, bagTotal } from '@/engine/bag';
import { DISCARD_THRESHOLD } from '@/engine/constants';
import { legalActions } from '@/engine/legal';
import { discardCount } from '@/engine/rules/trade';
import { currentActor } from '@/engine/state';
import type { DevCard, GameState, PlayerId, Resource, ResourceBag } from '@/engine/types';
import type { GameController } from '@/game/GameController';
import { useGame } from '@/game/useGame';
import { PhaserBoard } from '@/board-phaser/PhaserBoard';
import { NO_HIGHLIGHTS, toBoardView, type Ghost, type Highlights } from '@/board-phaser/view';
import { ActionBar } from './ActionBar';
import { DevCardPanel } from './DevCardPanel';
import { anchorFromEvent, describeAction, type Dialog, type Mode, type Pending } from './interaction';
import { ConfirmPopover } from './ConfirmPopover';
import { DiceOverlay, type DiceRoll } from './DiceOverlay';
import { TileTooltip, type TileHover } from './TileTooltip';
import { PieceTooltip, type PieceHover } from './PieceTooltip';
import { CornerTooltip } from './CornerTooltip';
import { ResourceFlights, type Flight } from './ResourceFlights';
import { boardIndex } from '@/engine/board/index';
import { TOPOLOGY } from '@/engine/board/topology';
import { TERRAIN_RESOURCE } from '@/engine/constants';
import { bagText as bagWords } from './text';
import { narrate, type LogLine } from './narrate';
import { PlayerHand } from './PlayerHand';
import { PlayerStrip } from './PlayerStrip';
import { PromptBar, type PromptButton } from './PromptBar';
import { describeStep } from './prompts';
import { RulesDrawer } from './RulesDrawer';
import { TurnLog } from './TurnLog';
import { MaritimeDialog } from './dialogs/MaritimeDialog';
import { PickResourcesDialog } from './dialogs/PickResourcesDialog';
import { TradeDialog } from './dialogs/TradeDialog';
import { TradeResolveDialog } from './dialogs/TradeResolveDialog';
import { bagText } from './text';

export interface GameScreenProps {
  controller: GameController;
  human: PlayerId;
  onQuit: () => void;
}

function computeHighlights(state: GameState, legal: readonly Action[], mode: Mode): Highlights {
  const { phase } = state;
  const vertices: number[] = [];
  const edges: number[] = [];
  const hexes: number[] = [];
  const want = (type: Action['type']) => legal.filter((a) => a.type === type);
  switch (phase.kind) {
    case 'setup':
      if (phase.step === 'settlement') for (const a of want('SETUP_PLACE_SETTLEMENT')) if (a.type === 'SETUP_PLACE_SETTLEMENT') vertices.push(a.vertex);
      if (phase.step === 'road') for (const a of want('SETUP_PLACE_ROAD')) if (a.type === 'SETUP_PLACE_ROAD') edges.push(a.edge);
      break;
    case 'moveRobber':
      for (const a of want('MOVE_ROBBER')) if (a.type === 'MOVE_ROBBER') hexes.push(a.hex);
      break;
    case 'roadBuilding':
      for (const a of want('BUILD_ROAD')) if (a.type === 'BUILD_ROAD') edges.push(a.edge);
      break;
    case 'main':
      if (mode === 'road') for (const a of want('BUILD_ROAD')) if (a.type === 'BUILD_ROAD') edges.push(a.edge);
      if (mode === 'settlement') for (const a of want('BUILD_SETTLEMENT')) if (a.type === 'BUILD_SETTLEMENT') vertices.push(a.vertex);
      if (mode === 'city') for (const a of want('BUILD_CITY')) if (a.type === 'BUILD_CITY') vertices.push(a.vertex);
      break;
    default:
      break;
  }
  if (vertices.length + edges.length + hexes.length === 0) return NO_HIGHLIGHTS;
  return { vertices, edges, hexes };
}

function ghostFor(pending: Pending | null, human: PlayerId): Ghost {
  if (!pending) return null;
  const a = pending.action;
  switch (a.type) {
    case 'SETUP_PLACE_SETTLEMENT':
    case 'BUILD_SETTLEMENT':
      return { kind: 'settlement', vertex: a.vertex, player: human };
    case 'BUILD_CITY':
      return { kind: 'city', vertex: a.vertex, player: human };
    case 'SETUP_PLACE_ROAD':
    case 'BUILD_ROAD':
      return { kind: 'road', edge: a.edge, player: human };
    case 'MOVE_ROBBER':
      return { kind: 'robber', hex: a.hex };
    default:
      return null;
  }
}

/** Screen space used by the hand panel (left), sidebar (right), instruction card (top). */
const BOARD_INSETS = { left: 282, right: 372, top: 96, bottom: 20 };

const AUTO_ADVANCE: ReadonlySet<Action['type']> = new Set(['SETUP_PLACE_ROAD', 'STEAL']);

export function GameScreen({ controller, human, onQuit }: GameScreenProps): React.JSX.Element {
  const { state, history } = useGame(controller);
  const [mode, setMode] = useState<Mode>('idle');
  const [pending, setPending] = useState<Pending | null>(null);
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' });
  const [discardPick, setDiscardPick] = useState<ResourceBag>(bag());
  const [stealPick, setStealPick] = useState<PlayerId | null>(null);
  const [fast, setFast] = useState(false);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ kind: 'vertex' | 'edge' | 'hex'; id: number; x: number; y: number } | null>(null);
  const [diceRoll, setDiceRoll] = useState<DiceRoll | null>(null);
  const [tileHover, setTileHover] = useState<TileHover | null>(null);
  const [pieceHover, setPieceHover] = useState<PieceHover | null>(null);
  const projector = useRef<((hex: number) => { x: number; y: number } | null) | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const clearFlights = useCallback(() => setFlights([]), []);

  const yourMove = state.phase.kind !== 'ended' && currentActor(state) === human;
  const legal = useMemo(() => (yourMove ? legalActions(state, human) : []), [state, human, yourMove]);
  const me = state.players[human];

  // Any state change means an action was applied: clear transient selections.
  useEffect(() => {
    setPending(null);
    setMode('idle');
    setDiscardPick(bag());
    setStealPick(null);
    setDialog((d) => (d.kind === 'rules' ? d : { kind: 'none' }));
  }, [state]);

  useEffect(() => {
    controller.setFastForward(fast);
  }, [controller, fast]);

  // Kick bots when mounting a game whose first actor is a bot.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __game?: unknown }).__game = controller;
    void controller.scheduleBots();
  }, [controller]);

  // Auto-advance steps with exactly one legal choice (nothing to decide).
  useEffect(() => {
    if (!yourMove || legal.length !== 1 || !AUTO_ADVANCE.has(legal[0].type)) return;
    const only = legal[0];
    const t = setTimeout(() => {
      if (controller.state === state) controller.dispatch(only);
    }, 500);
    return () => clearTimeout(t);
  }, [controller, state, legal, yourMove]);

  const dispatch = useCallback(
    (action: Action) => {
      controller.dispatch(action);
    },
    [controller],
  );

  const select = useCallback((action: Action, note?: string, anchor?: { x: number; y: number } | null) => {
    const boardTarget = ['SETUP_PLACE_SETTLEMENT', 'SETUP_PLACE_ROAD', 'BUILD_ROAD', 'BUILD_SETTLEMENT', 'BUILD_CITY', 'MOVE_ROBBER'].includes(action.type);
    setPending({ action, question: describeAction(action), note, anchor: anchor ?? null, anchorFromBoard: boardTarget });
  }, []);
  const cancelPending = useCallback(() => setPending(null), []);
  const confirmPending = useCallback(() => {
    if (pending) controller.dispatch(pending.action);
  }, [controller, pending]);

  const find = useCallback(
    (pred: (a: Action) => boolean): Action | undefined => legal.find(pred),
    [legal],
  );

  const onVertexClick = useCallback(
    (v: number) => {
      const a =
        find((x) => x.type === 'SETUP_PLACE_SETTLEMENT' && x.vertex === v) ??
        (mode === 'settlement' ? find((x) => x.type === 'BUILD_SETTLEMENT' && x.vertex === v) : undefined) ??
        (mode === 'city' ? find((x) => x.type === 'BUILD_CITY' && x.vertex === v) : undefined);
      if (a) select(a, a.type === 'BUILD_SETTLEMENT' ? 'Costs 1 brick, 1 lumber, 1 grain, 1 wool.' : a.type === 'BUILD_CITY' ? 'Costs 3 ore and 2 grain.' : undefined);
    },
    [find, mode, select],
  );
  const onEdgeClick = useCallback(
    (e: number) => {
      const a = find((x) => (x.type === 'SETUP_PLACE_ROAD' || x.type === 'BUILD_ROAD') && x.edge === e);
      if (a) select(a, a.type === 'BUILD_ROAD' && state.phase.kind === 'main' ? 'Costs 1 brick and 1 lumber.' : undefined);
    },
    [find, select, state.phase.kind],
  );
  const onHexClick = useCallback(
    (h: number) => {
      const a = find((x) => x.type === 'MOVE_ROBBER' && x.hex === h);
      if (a) select(a, 'That hex will stop producing. You will steal from a neighbour of it.');
    },
    [find, select],
  );

  const view = useMemo(() => toBoardView(state), [state]);
  const highlights = useMemo(() => computeHighlights(state, legal, mode), [state, legal, mode]);
  const ghost = useMemo(() => ghostFor(pending, human), [pending, human]);

  const logLines = useMemo<LogLine[]>(() => {
    const lines: LogLine[] = [];
    for (const h of history) for (const ev of h.events) lines.push(...narrate(ev, state, human));
    return lines.slice(-80);
  }, [history, state, human]);

  // Show a physical dice roll whenever a diceRolled event lands, followed by its outcome.
  useEffect(() => {
    const last = history.at(-1);
    if (!last) return;
    const rolled = last.events.find((e) => e.type === 'diceRolled');
    if (!rolled || rolled.type !== 'diceRolled') return;
    const who = rolled.player === human ? 'You' : state.players[rolled.player].name;
    const outcome: string[] = [];
    const produced = last.events.find((e) => e.type === 'resourcesProduced');
    if (produced && produced.type === 'resourcesProduced') {
      produced.gains.forEach((g, p) => {
        if (Object.values(g).some((n) => n > 0)) outcome.push(`${p === human ? 'You' : state.players[p].name} got ${bagWords(g)}`);
      });
      if (outcome.length === 0) outcome.push('Nobody produced anything.');
    } else if (rolled.total === 7) {
      const discards = last.events.find((e) => e.type === 'discardRequired');
      outcome.push(discards && discards.type === 'discardRequired' ? `A 7! ${discards.players.map((p) => (p === human ? 'You' : state.players[p].name)).join(', ')} must discard half.` : 'A 7! The robber moves.');
    }
    setDiceRoll({ id: history.length, dice: rolled.dice, who, outcome });
    // Resource flights start when the dice have settled (see DiceOverlay timing).
    if (produced && produced.type === 'resourcesProduced' && rolled.total !== 7) {
      const total = rolled.total;
      const t = setTimeout(() => {
        const project = projector.current;
        const board = document.querySelector('.board-area')?.getBoundingClientRect();
        if (!project || !board) return;
        const from = { x: board.left + board.width / 2, y: board.top + board.height / 2 };
        const list: Flight[] = [];
        const hexes = boardIndex(state.board).hexesByToken.get(total) ?? [];
        let n = 0;
        for (const h of hexes) {
          if (h === state.robber) continue;
          const resource = TERRAIN_RESOURCE[state.board.hexes[h].terrain];
          if (!resource) continue;
          const via = project(h);
          if (!via) continue;
          for (const v of TOPOLOGY.hexVertices[h]) {
            const b = state.buildings[v];
            if (!b) continue;
            if (produced.gains[b.owner][resource] <= 0) continue;
            const card = (b.owner === human ? document.querySelector(`[data-hand-card="${resource}"]`) : document.querySelector(`[data-player="${b.owner}"]`))?.getBoundingClientRect();
            if (!card) continue;
            const count = b.kind === 'city' ? 2 : 1;
            for (let i = 0; i < count; i++) {
              list.push({ id: `${history.length}-${h}-${v}-${i}`, resource, from, via: { x: via.x + (i - 0.5) * 18, y: via.y }, to: { x: card.left + card.width / 2, y: card.top + card.height / 2 }, delay: n * 90 });
              n++;
            }
          }
        }
        setFlights(list);
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [history, history.length, human, state.players, state.board, state.robber, state.buildings]);
  const clearDice = useCallback(() => setDiceRoll(null), []);

  const hoverText = useMemo(() => {
    if (!hover || pending) return null;
    const { phase } = state;
    if (phase.kind === 'setup') return hover.kind === 'vertex' ? 'Place your settlement here' : 'Place your road here';
    if (phase.kind === 'moveRobber') return 'Move the robber here';
    if (phase.kind === 'roadBuilding') return 'Place a free road here';
    if (mode === 'road') return 'Build a road here';
    if (mode === 'settlement') return 'Build a settlement here';
    if (mode === 'city') return 'Upgrade to a city';
    return null;
  }, [hover, pending, state, mode]);

  const prompt = describeStep(state, human, mode, pending);

  // ----- prompt bar buttons -----
  const buttons: PromptButton[] = [];
  const phase = state.phase;
  if (phase.kind === 'ended') {
    buttons.push({ label: 'Back to menu', onClick: onQuit, primary: true });
  } else if (pending) {
    // Confirm and Cancel live in the popover next to the selection.
  } else if (yourMove) {
    switch (phase.kind) {
      case 'preRoll':
        buttons.push({ label: 'Roll the dice', onClick: () => dispatch({ player: human, type: 'ROLL_DICE' }), primary: true });
        if (legal.some((a) => a.type === 'PLAY_KNIGHT')) buttons.push({ label: 'Play Knight first', onClick: (e) => select({ player: human, type: 'PLAY_KNIGHT' }, 'You will move the robber, then roll.', anchorFromEvent(e)) });
        break;
      case 'discard': {
        const need = discardCount(me.resources, DISCARD_THRESHOLD);
        const chosen = bagTotal(discardPick);
        buttons.push({
          label: chosen === need ? `Discard ${bagText(discardPick)}` : `Choose ${need - chosen} more`,
          onClick: () => dispatch({ player: human, type: 'DISCARD', resources: discardPick }),
          primary: true,
          disabled: chosen !== need,
        });
        break;
      }
      case 'steal':
        for (const v of phase.victims) {
          buttons.push({ label: state.players[v].name, onClick: () => setStealPick(v), primary: stealPick === v });
        }
        buttons.push({ label: 'Confirm', onClick: () => stealPick !== null && dispatch({ player: human, type: 'STEAL', victim: stealPick }), disabled: stealPick === null, primary: true });
        break;
      case 'tradeOffer': {
        const canAccept = bagCovers(me.resources, phase.offer.want);
        buttons.push({ label: 'Accept', onClick: () => dispatch({ player: human, type: 'TRADE_ACCEPT' }), primary: true, disabled: !canAccept, title: canAccept ? '' : 'You cannot afford this' });
        buttons.push({ label: 'Decline', onClick: () => dispatch({ player: human, type: 'TRADE_REJECT' }) });
        break;
      }
      case 'main':
        if (mode !== 'idle') buttons.push({ label: 'Cancel', onClick: () => setMode('idle') });
        else {
          const canBuild = legal.some((a) => a.type.startsWith('BUILD_') || a.type === 'BUY_DEV_CARD');
          buttons.push({ label: 'End turn', onClick: (e) => select({ player: human, type: 'END_TURN' }, canBuild ? 'You can still afford to build something.' : undefined, anchorFromEvent(e)), primary: !canBuild });
        }
        break;
      default:
        break;
    }
  } else {
    buttons.push({ label: fast ? 'Normal speed' : 'Skip ahead', onClick: () => setFast(!fast) });
  }

  const onPlayDev = (card: DevCard, e: React.MouseEvent<HTMLButtonElement>) => {
    switch (card) {
      case 'knight':
        select({ player: human, type: 'PLAY_KNIGHT' }, 'You will move the robber and steal a card.', anchorFromEvent(e));
        break;
      case 'roadBuilding':
        select({ player: human, type: 'PLAY_ROAD_BUILDING' }, 'You will place two roads for free.', anchorFromEvent(e));
        break;
      case 'yearOfPlenty':
        setDialog({ kind: 'yearOfPlenty' });
        break;
      case 'monopoly':
        setDialog({ kind: 'monopoly' });
        break;
      default:
        break;
    }
  };

  const toggleDiscard = (r: Resource, delta: 1 | -1) => {
    setDiscardPick((d) => {
      const next = { ...d, [r]: d[r] + delta };
      const need = discardCount(me.resources, DISCARD_THRESHOLD);
      if (next[r] < 0 || next[r] > me.resources[r] || bagTotal(next) > need) return d;
      return next;
    });
  };

  return (
    <div className="game-screen">
      <div className="game-body">
        <div className="board-column">
          <div className="board-area">
            <PhaserBoard
              view={view}
              highlights={highlights}
              ghost={ghost}
              insets={BOARD_INSETS}
              onVertexClick={onVertexClick}
              onEdgeClick={onEdgeClick}
              onHexClick={onHexClick}
              onGhostPosition={setGhostPos}
              onHover={setHover}
              onTileHover={setTileHover}
              onPieceHover={setPieceHover}
              onProjector={(fn) => (projector.current = fn)}
            />
            {!pending && <PromptBar prompt={prompt} buttons={buttons} floating />}
            {hover && hoverText && hover.kind === 'vertex' && mode !== 'city' && <CornerTooltip state={state} vertex={hover.id} action={hoverText} x={hover.x} y={hover.y} />}
            {hover && hoverText && (hover.kind !== 'vertex' || mode === 'city') && (
              <div className="hover-tip" style={{ left: hover.x, top: hover.y }}>
                {hoverText}
              </div>
            )}
            {pieceHover && !hover && !pending && <PieceTooltip state={state} human={human} hover={pieceHover} />}
            {tileHover && !pieceHover && !hover && !pending && <TileTooltip state={state} human={human} hover={tileHover} />}
            <DiceOverlay roll={diceRoll} onDone={clearDice} />
            <ResourceFlights flights={flights} onDone={clearFlights} />
          <div className="hand-panel">
              <div className="hand-panel-section">
                <div className="section-title">Your hand</div>
                <PlayerHand resources={me.resources} selectable={phase.kind === 'discard' && yourMove} selected={discardPick} onToggle={toggleDiscard} />
              </div>
              <div className="hand-panel-section">
                <DevCardPanel state={state} human={human} onPlay={onPlayDev} />
              </div>
            </div>
          </div>
        </div>
        <aside className="sidebar">
          <PlayerStrip state={state} human={human} />
          <ActionBar
            state={state}
            human={human}
            mode={mode}
            onMode={(m) => {
              setPending(null);
              setMode(m);
            }}
            onBuyDev={(e) => select({ player: human, type: 'BUY_DEV_CARD' }, 'Costs 1 ore, 1 grain, 1 wool. The card is drawn at random.', anchorFromEvent(e))}
            onMaritime={() => setDialog({ kind: 'maritime' })}
            onTrade={() => setDialog({ kind: 'trade' })}
            onRules={() => setDialog({ kind: 'rules' })}
            fast={fast}
            onFast={setFast}
            onQuit={onQuit}
          />
          <div className="section-title">Log</div>
          <TurnLog lines={logLines} />
        </aside>
      </div>

      {pending && (
        <ConfirmPopover
          anchor={pending.anchorFromBoard ? ghostPos : (pending.anchor ?? null)}
          question={pending.question}
          note={pending.note}
          confirmLabel={pending.action.type === 'END_TURN' ? 'End turn' : 'Confirm'}
          onConfirm={confirmPending}
          onCancel={cancelPending}
        />
      )}
      {dialog.kind === 'rules' && <RulesDrawer onClose={() => setDialog({ kind: 'none' })} />}
      {dialog.kind === 'maritime' && (
        <MaritimeDialog state={state} human={human} onClose={() => setDialog({ kind: 'none' })} onConfirm={(give, receive) => dispatch({ player: human, type: 'MARITIME_TRADE', give, receive })} />
      )}
      {dialog.kind === 'trade' && (
        <TradeDialog state={state} human={human} onClose={() => setDialog({ kind: 'none' })} onConfirm={(give, want) => dispatch({ player: human, type: 'TRADE_OFFER', give, want })} />
      )}
      {dialog.kind === 'yearOfPlenty' && (
        <PickResourcesDialog
          state={state}
          title="Year of Plenty"
          description="Take any 2 resources from the bank."
          count={2}
          fromBank
          onClose={() => setDialog({ kind: 'none' })}
          onConfirm={([first, second]) => dispatch({ player: human, type: 'PLAY_YEAR_OF_PLENTY', first, second: second ?? null })}
        />
      )}
      {dialog.kind === 'monopoly' && (
        <PickResourcesDialog
          state={state}
          title="Monopoly"
          description="Name one resource. Every other player gives you all of theirs."
          count={1}
          fromBank={false}
          onClose={() => setDialog({ kind: 'none' })}
          onConfirm={([resource]) => dispatch({ player: human, type: 'PLAY_MONOPOLY', resource })}
        />
      )}
      {phase.kind === 'tradeResolve' && yourMove && (
        <TradeResolveDialog state={state} human={human} onConfirm={(w) => dispatch({ player: human, type: 'TRADE_CONFIRM', with: w })} onCancel={() => dispatch({ player: human, type: 'TRADE_CANCEL' })} />
      )}
    </div>
  );
}
