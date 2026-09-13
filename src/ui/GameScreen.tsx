import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action } from '@/engine/actions';
import { bag, bagTotal } from '@/engine/bag';
import { DISCARD_THRESHOLD } from '@/engine/constants';
import { legalActions } from '@/engine/legal';
import { legalCityVertices, legalRoadEdges, legalSettlementVertices } from '@/engine/rules/placement';
import { discardCount } from '@/engine/rules/trade';
import { currentActor } from '@/engine/state';
import { RESOURCES, type DevCard, type GameState, type PlayerId, type Resource, type ResourceBag } from '@/engine/types';
import type { GameController } from '@/game/GameController';
import { useGame } from '@/game/useGame';
import { PhaserBoard } from '@/board-phaser/PhaserBoard';
import { NO_HIGHLIGHTS, toBoardView, type Ghost, type Highlights } from '@/board-phaser/view';
import { ActionBar } from './ActionBar';
import { BuildPanel } from './BuildPanel';
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
import { Presence } from './Presence';
import { buildDisabledReason, describeStep } from './prompts';
import { humanPortraitKey, portraitKey } from './portraits';
import { RulesDrawer } from './RulesDrawer';
import { TurnLog } from './TurnLog';
import { MaritimeDialog } from './dialogs/MaritimeDialog';
import { PickResourcesDialog } from './dialogs/PickResourcesDialog';
import { TradeDialog } from './dialogs/TradeDialog';
import { TradeResolveDialog } from './dialogs/TradeResolveDialog';
import { TradeOfferDialog } from './dialogs/TradeOfferDialog';
import { DiscardDialog } from './dialogs/DiscardDialog';
import { bagText } from './text';

export interface GameScreenProps {
  controller: GameController;
  human: PlayerId;
  onQuit: () => void;
}

function computeHighlights(state: GameState, legal: readonly Action[], mode: Mode, human: PlayerId): Highlights {
  const { phase } = state;
  const vertices: number[] = [];
  const edges: number[] = [];
  const hexes: number[] = [];
  const dimVertices: number[] = [];
  const dimEdges: number[] = [];
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
      // Idle: flash everything you can afford right now, exactly like the setup turn does.
      if (mode === 'idle' || mode === 'road') for (const a of want('BUILD_ROAD')) if (a.type === 'BUILD_ROAD') edges.push(a.edge);
      if (mode === 'idle' || mode === 'settlement') for (const a of want('BUILD_SETTLEMENT')) if (a.type === 'BUILD_SETTLEMENT') vertices.push(a.vertex);
      if (mode === 'idle' || mode === 'city') for (const a of want('BUILD_CITY')) if (a.type === 'BUILD_CITY') vertices.push(a.vertex);
      // Idle: also outline every spot the rules allow but the hand cannot pay for yet.
      if (mode === 'idle' && legal.length > 0) {
        const me = state.players[human];
        const lit = new Set(vertices);
        const litE = new Set(edges);
        if (me.pieces.roads > 0) for (const e of legalRoadEdges(state, human)) if (!litE.has(e)) dimEdges.push(e);
        if (me.pieces.settlements > 0) for (const v of legalSettlementVertices(state, human, false)) if (!lit.has(v)) dimVertices.push(v);
        if (me.pieces.cities > 0) for (const v of legalCityVertices(state, human)) if (!lit.has(v)) dimVertices.push(v);
      }
      break;
    default:
      break;
  }
  if (vertices.length + edges.length + hexes.length + dimVertices.length + dimEdges.length === 0) return NO_HIGHLIGHTS;
  return { vertices, edges, hexes, dimVertices, dimEdges };
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

/** Fallback screen space for the bars until they have been measured. */
const BOARD_INSETS = { left: 16, right: 16, top: 100, bottom: 214, headerBottom: 90 };

interface BarInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Where the instruction card goes: just under the header, in board-area pixels. */
  headerBottom: number;
}

/** Room reserved under the header for the instruction card, whether or not one is showing. */
const CARD_ALLOWANCE = 64;

/**
 * Measures the two bars so the island fits between them. The instruction card is deliberately
 * not measured: it comes and goes with every click, and refitting the camera each time made the
 * island jump. A fixed allowance keeps the view steady instead.
 */
function useBarInsets(): BarInsets {
  const [insets, setInsets] = useState<BarInsets>(BOARD_INSETS);
  useEffect(() => {
    const measure = () => {
      const area = document.querySelector('.board-area')?.getBoundingClientRect();
      const top = document.querySelector('.top-bar')?.getBoundingClientRect();
      const bottom = document.querySelector('.bottom-bar')?.getBoundingClientRect();
      if (!area) return;
      const headerBottom = top ? Math.round(top.bottom - area.top + 10) : BOARD_INSETS.headerBottom;
      const next: BarInsets = {
        left: 16,
        right: 16,
        top: headerBottom + CARD_ALLOWANCE,
        bottom: bottom ? Math.round(area.bottom - bottom.top + 12) : BOARD_INSETS.bottom,
        headerBottom,
      };
      setInsets((cur) => (cur.top === next.top && cur.bottom === next.bottom && cur.headerBottom === next.headerBottom ? cur : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const sel of ['.top-bar', '.bottom-bar', '.board-area']) {
      const el = document.querySelector(sel);
      if (el) ro.observe(el);
    }
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  return insets;
}

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
  const [produce, setProduce] = useState<{ id: number; hexes: number[] } | null>(null);
  const clearFlights = useCallback(() => {
    setFlights([]);
    // Safety net: whatever is still held back once every flight has finished, show it.
    setHeld(bag());
  }, []);
  // Cards on their way to your hand are held back from the fan until their flight lands.
  const [held, setHeld] = useState<ResourceBag>(bag());
  const hold = useCallback((b: ResourceBag) => setHeld((h) => ({ ...h, ...Object.fromEntries(RESOURCES.map((r) => [r, h[r] + b[r]])) }) as ResourceBag), []);
  const release = useCallback((r: Resource, n = 1) => setHeld((h) => ({ ...h, [r]: Math.max(0, h[r] - n) })), []);
  // Animations only play for moves made after this screen opened, never for a reopened game's history.
  const historyAtMount = useRef(history.length);
  const freshEntry = (): boolean => history.length > historyAtMount.current;

  const yourMove = state.phase.kind !== 'ended' && currentActor(state) === human;
  const legal = useMemo(() => (yourMove ? legalActions(state, human) : []), [state, human, yourMove]);
  const me = state.players[human];
  const shownHand = useMemo(() => Object.fromEntries(RESOURCES.map((r) => [r, Math.max(0, me.resources[r] - held[r])])) as ResourceBag, [me.resources, held]);

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
      // A corner is never both a settlement spot and a city spot, so idle mode can take whichever is legal.
      const a =
        find((x) => x.type === 'SETUP_PLACE_SETTLEMENT' && x.vertex === v) ??
        (mode === 'settlement' || mode === 'idle' ? find((x) => x.type === 'BUILD_SETTLEMENT' && x.vertex === v) : undefined) ??
        (mode === 'city' || mode === 'idle' ? find((x) => x.type === 'BUILD_CITY' && x.vertex === v) : undefined);
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
  const highlights = useMemo(() => computeHighlights(state, legal, mode, human), [state, legal, mode, human]);
  const ghost = useMemo(() => ghostFor(pending, human), [pending, human]);

  const logLines = useMemo<LogLine[]>(() => {
    const lines: LogLine[] = [];
    for (const h of history) for (const ev of h.events) lines.push(...narrate(ev, state, human));
    return lines.slice(-80);
  }, [history, state, human]);

  // Show a physical dice roll whenever a diceRolled event lands, followed by its outcome.
  useEffect(() => {
    const last = history.at(-1);
    if (!last || !freshEntry()) return;
    const rolled = last.events.find((e) => e.type === 'diceRolled');
    if (!rolled || rolled.type !== 'diceRolled') return;
    const who = rolled.player === human ? 'You' : state.players[rolled.player].name;
    const outcome: string[] = [];
    const gains: { who: string; portrait: string; color: string; bag: ResourceBag }[] = [];
    const produced = last.events.find((e) => e.type === 'resourcesProduced');
    if (produced && produced.type === 'resourcesProduced') {
      produced.gains.forEach((g, p) => {
        if (Object.values(g).some((n) => n > 0)) {
          const player = state.players[p];
          gains.push({ who: p === human ? 'You' : player.name, portrait: p === human ? humanPortraitKey(state.seed) : portraitKey(player.name), color: player.color, bag: g });
        }
      });
      if (gains.length === 0) outcome.push('Nobody produced anything.');
    } else if (rolled.total === 7) {
      const discards = last.events.find((e) => e.type === 'discardRequired');
      outcome.push(discards && discards.type === 'discardRequired' ? `A 7! ${discards.players.map((p) => (p === human ? 'You' : state.players[p].name)).join(', ')} must discard half.` : 'A 7! The robber moves.');
    }
    setDiceRoll({ id: history.length, dice: rolled.dice, who, outcome, gains });
    // Resource flights start when the dice have settled (see DiceOverlay timing).
    if (produced && produced.type === 'resourcesProduced' && rolled.total !== 7) {
      const total = rolled.total;
      const producing = (boardIndex(state.board).hexesByToken.get(total) ?? []).filter((h) => h !== state.robber && !!TERRAIN_RESOURCE[state.board.hexes[h].terrain]);
      // First the rolled tiles light up and throw sparks, then the cards fly out from them.
      const flash = setTimeout(() => setProduce({ id: history.length, hexes: producing }), 2200);
      // Your new cards stay out of the fan until they visibly arrive.
      const mine = produced.gains[human];
      hold(mine);
      const releaseTimers: ReturnType<typeof setTimeout>[] = [];
      const t = setTimeout(() => {
        const project = projector.current;
        if (!project) {
          for (const r of RESOURCES) if (mine[r] > 0) release(r, mine[r]);
          return;
        }
        const list: Flight[] = [];
        const scheduled = bag();
        let n = 0;
        for (const h of producing) {
          const resource = TERRAIN_RESOURCE[state.board.hexes[h].terrain];
          if (!resource) continue;
          const at = project(h);
          if (!at) continue;
          for (const v of TOPOLOGY.hexVertices[h]) {
            const b = state.buildings[v];
            if (!b) continue;
            if (produced.gains[b.owner][resource] <= 0) continue;
            const card = (b.owner === human ? document.querySelector(`[data-hand-card="${resource}"]`) : document.querySelector(`[data-player="${b.owner}"]`))?.getBoundingClientRect();
            if (!card) continue;
            const count = b.kind === 'city' ? 2 : 1;
            for (let i = 0; i < count; i++) {
              list.push({
                id: `${history.length}-${h}-${v}-${i}`,
                resource,
                from: { x: at.x, y: at.y + 6 },
                via: { x: at.x + (i - 0.5) * 44, y: at.y - 24 },
                to: { x: card.left + card.width / 2, y: card.top + card.height / 2 },
                delay: n * 260,
              });
              if (b.owner === human) {
                scheduled[resource]++;
                releaseTimers.push(setTimeout(() => release(resource), n * 260 + 3050));
              }
              n++;
            }
          }
        }
        // Anything of yours that could not be animated shows up right away.
        for (const r of RESOURCES) if (mine[r] > scheduled[r]) release(r, mine[r] - scheduled[r]);
        setFlights(list);
      }, 2900);
      return () => {
        clearTimeout(flash);
        clearTimeout(t);
        releaseTimers.forEach(clearTimeout);
      };
    }
  }, [history, history.length, human, state.players, state.board, state.robber, state.buildings]);
  const clearDice = useCallback(() => setDiceRoll(null), []);

  // Cards physically change hands: trades fly between the two players, discards fly to a pile below the island.
  useEffect(() => {
    const last = history.at(-1);
    if (!last || !freshEntry()) return;
    const centre = (sel: string): { x: number; y: number } | null => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    };
    const spot = (p: PlayerId, resource: Resource) => (p === human ? centre(`[data-hand-card="${resource}"]`) : centre(`[data-player="${p}"]`));
    const list: Flight[] = [];
    let n = 0;
    const fly = (resource: Resource, from: { x: number; y: number } | null, to: { x: number; y: number } | null, tag: string) => {
      if (!from || !to) return;
      list.push({ id: `${history.length}-${tag}-${n}`, resource, from, via: { x: (from.x + to.x) / 2 + (n % 3) * 30, y: (from.y + to.y) / 2 }, to, delay: n * 260 });
      n++;
    };
    const releaseTimers: ReturnType<typeof setTimeout>[] = [];
    // A card flying into your hand stays hidden from the fan until it lands.
    const flyToMe = (r: Resource, from: { x: number; y: number } | null, to: { x: number; y: number } | null, tag: string) => {
      const before = list.length;
      fly(r, from, to, tag);
      if (list.length > before) {
        hold({ ...bag(), [r]: 1 });
        releaseTimers.push(setTimeout(() => release(r), list[list.length - 1].delay + 3050));
      }
    };
    for (const ev of last.events) {
      if (ev.type === 'traded') {
        for (const r of RESOURCES) {
          for (let i = 0; i < ev.gave[r]; i++) (ev.to === human ? flyToMe : fly)(r, spot(ev.from, r), spot(ev.to, r), 'gave');
          for (let i = 0; i < ev.got[r]; i++) (ev.from === human ? flyToMe : fly)(r, spot(ev.to, r), spot(ev.from, r), 'got');
        }
      } else if (ev.type === 'discarded') {
        const board = document.querySelector('.board-area')?.getBoundingClientRect();
        const bar = document.querySelector('.bottom-bar')?.getBoundingClientRect();
        const pile = board ? { x: board.left + board.width / 2, y: (bar ? bar.top : board.bottom) - 40 } : null;
        for (const r of RESOURCES) for (let i = 0; i < ev.resources[r]; i++) fly(r, spot(ev.player, r), pile, 'discard');
      }
    }
    if (list.length > 0) setFlights(list);
    return () => releaseTimers.forEach(clearTimeout);
  }, [history, history.length, human, hold, release]);

  /** Whether the hovered corner is one of your settlements awaiting a city upgrade (idle or city mode). */
  const hoverIsCity = useMemo(
    () => !!hover && hover.kind === 'vertex' && state.phase.kind === 'main' && (mode === 'city' || mode === 'idle') && legal.some((x) => x.type === 'BUILD_CITY' && x.vertex === hover.id),
    [hover, state.phase.kind, mode, legal],
  );

  const hoverText = useMemo(() => {
    if (!hover || pending) return null;
    const { phase } = state;
    if (phase.kind === 'setup') return hover.kind === 'vertex' ? 'Place your settlement here' : 'Place your road here';
    if (phase.kind === 'moveRobber') return 'Move the robber here';
    if (phase.kind === 'roadBuilding') return 'Place a free road here';
    // Dim outlines: the rules allow it here, but the hand cannot pay yet. Say what is missing.
    if (hover.kind === 'edge' && highlights.dimEdges.includes(hover.id)) return `Road: ${buildDisabledReason(state, human, 'road') ?? 'not yet'}`;
    if (hover.kind === 'vertex' && highlights.dimVertices.includes(hover.id)) {
      const kind = state.buildings[hover.id]?.owner === human ? 'city' : 'settlement';
      return `${kind === 'city' ? 'City' : 'Settlement'}: ${buildDisabledReason(state, human, kind) ?? 'not yet'}`;
    }
    if (hover.kind === 'edge') return 'Build a road here';
    if (hoverIsCity) return 'Upgrade to a city';
    if (hover.kind === 'vertex') return 'Build a settlement here';
    return null;
  }, [hover, pending, state, hoverIsCity, highlights, human]);

  const prompt = describeStep(state, human, mode, pending);
  // No instruction card while the dice are still on screen: the next step waits until the roll is read.
  const showPrompt = !pending && !diceRoll && !((state.phase.kind === 'tradeOffer' || state.phase.kind === 'discard') && yourMove);
  const promptCentered = yourMove && state.phase.kind !== 'main' && highlights === NO_HIGHLIGHTS;
  const barInsets = useBarInsets();

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
      case 'discard':
        // Handled by the DiscardDialog modal.
        break;
      case 'steal':
        for (const v of phase.victims) {
          buttons.push({ label: state.players[v].name, onClick: () => setStealPick(v), primary: stealPick === v });
        }
        buttons.push({ label: 'Confirm', onClick: () => stealPick !== null && dispatch({ player: human, type: 'STEAL', victim: stealPick }), disabled: stealPick === null, primary: true });
        break;
      case 'tradeOffer':
        // Presented as a centred dialog instead.
        break;
      case 'main':
        if (mode !== 'idle') buttons.push({ label: 'Cancel', onClick: () => setMode('idle') });
        else {
          const canBuild = legal.some((a) => a.type.startsWith('BUILD_') || a.type === 'BUY_DEV_CARD');
          // Ending the turn only asks for confirmation when there is still something you could build.
          buttons.push({
            label: 'End turn',
            onClick: () => {
              if (!canBuild) {
                dispatch({ player: human, type: 'END_TURN' });
                return;
              }
              // The instruction card fades out once something is pending, so anchor over the island instead of the button.
              const area = document.querySelector('.board-area')?.getBoundingClientRect();
              const anchor = area ? { x: area.left + area.width / 2, y: area.top + area.height * 0.5 } : null;
              select({ player: human, type: 'END_TURN' }, 'You can still afford to build something.', anchor);
            },
            primary: !canBuild,
            pulse: true,
          });
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
              insets={barInsets}
              onVertexClick={onVertexClick}
              onEdgeClick={onEdgeClick}
              onHexClick={onHexClick}
              onGhostPosition={setGhostPos}
              onHover={setHover}
              onTileHover={setTileHover}
              onPieceHover={setPieceHover}
              onProjector={(fn) => (projector.current = fn)}
              produce={produce}
            />
            {/* Pure button decisions sit over the middle of the island; everything else sits just below the header. */}
            <Presence show={showPrompt && promptCentered}>
              {showPrompt && promptCentered && <PromptBar key={prompt.title} prompt={prompt} buttons={buttons} floating centered />}
            </Presence>
            <Presence show={showPrompt && !promptCentered}>
              {showPrompt && !promptCentered && (
                <div className="below-bar" style={{ top: barInsets.headerBottom }}>
                  <PromptBar key={prompt.title} prompt={prompt} buttons={buttons} floating below />
                </div>
              )}
            </Presence>
            {hover && hoverText && hover.kind === 'vertex' && !hoverIsCity && <CornerTooltip state={state} vertex={hover.id} action={hoverText} x={hover.x} y={hover.y} />}
            {hover && hoverText && (hover.kind !== 'vertex' || hoverIsCity) && (
              <div className="hover-tip" style={{ left: hover.x, top: hover.y }}>
                {hoverText}
              </div>
            )}
            {/* While moving the robber, keep the piece and tile tooltips up so you can see who a hex borders. */}
            {pieceHover && (!hover || phase.kind === 'moveRobber') && !pending && <PieceTooltip state={state} human={human} hover={pieceHover} />}
            {tileHover && !pieceHover && (!hover || phase.kind === 'moveRobber') && !pending && <TileTooltip state={state} human={human} hover={tileHover} />}
            <DiceOverlay roll={diceRoll} onDone={clearDice} autoDismiss={fast} />
            <ResourceFlights flights={flights} onDone={clearFlights} />
            {/* Top bar: who is at the table, and the table-side controls. */}
            <header className="top-bar">
              <PlayerStrip state={state} human={human} />
              <ActionBar
                state={state}
                human={human}
                onMaritime={() => setDialog({ kind: 'maritime' })}
                onTrade={() => setDialog({ kind: 'trade' })}
                onRules={() => setDialog({ kind: 'rules' })}
                onQuit={onQuit}
              />
            </header>
            {/* Bottom bar: everything that is yours, plus the log. */}
            <footer className="bottom-bar">
              <section className="bar-hand">
                <div className="section-title">Your hand</div>
                <PlayerHand resources={shownHand} />
              </section>
              <section className="bar-dev">
                <DevCardPanel state={state} human={human} onPlay={onPlayDev} />
              </section>
              <section className="bar-build">
                <BuildPanel
                  state={state}
                  human={human}
                  mode={mode}
                  onMode={(m) => {
                    setPending(null);
                    setMode(m);
                  }}
                  onBuyDev={(e) => select({ player: human, type: 'BUY_DEV_CARD' }, 'Costs 1 ore, 1 grain, 1 wool. The card is drawn at random.', anchorFromEvent(e))}
                />
              </section>
              <section className="bar-log">
                <div className="section-title">
                  Log <span className="muted log-turns">· {Math.floor(Math.max(0, state.turn.number - 1) / state.players.length)} turns completed</span>
                </div>
                <TurnLog lines={logLines} state={state} human={human} />
              </section>
            </footer>
          </div>
        </div>
      </div>

      <Presence show={!!pending}>
        {pending && (
          <ConfirmPopover
            anchor={pending.anchorFromBoard ? ghostPos : (pending.anchor ?? null)}
            question={pending.question}
            note={pending.note}
            confirmLabel={pending.action.type === 'END_TURN' ? 'End anyway' : 'Confirm'}
            onConfirm={confirmPending}
            onCancel={cancelPending}
          />
        )}
      </Presence>
      {dialog.kind === 'rules' && <RulesDrawer onClose={() => setDialog({ kind: 'none' })} />}
      <Presence show={dialog.kind !== 'none' && dialog.kind !== 'rules'}>
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
      </Presence>
      <Presence show={phase.kind === 'discard' && yourMove}>
        {phase.kind === 'discard' && yourMove && (
          <DiscardDialog state={state} human={human} pick={discardPick} onToggle={toggleDiscard} onConfirm={() => dispatch({ player: human, type: 'DISCARD', resources: discardPick })} />
        )}
      </Presence>
      <Presence show={phase.kind === 'tradeOffer' && yourMove}>
        {phase.kind === 'tradeOffer' && yourMove && (
          <TradeOfferDialog state={state} human={human} onAccept={() => dispatch({ player: human, type: 'TRADE_ACCEPT' })} onDecline={() => dispatch({ player: human, type: 'TRADE_REJECT' })} />
        )}
      </Presence>
      <Presence show={phase.kind === 'tradeResolve' && yourMove}>
      {phase.kind === 'tradeResolve' && yourMove && (
        <TradeResolveDialog state={state} human={human} onConfirm={(w) => dispatch({ player: human, type: 'TRADE_CONFIRM', with: w })} onCancel={() => dispatch({ player: human, type: 'TRADE_CANCEL' })} />
      )}
      </Presence>
    </div>
  );
}
