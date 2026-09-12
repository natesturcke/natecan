import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { describeAction, type Dialog, type Mode, type Pending } from './interaction';
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

const AUTO_ADVANCE: ReadonlySet<Action['type']> = new Set(['SETUP_PLACE_ROAD', 'STEAL']);

export function GameScreen({ controller, human, onQuit }: GameScreenProps): React.JSX.Element {
  const { state, history } = useGame(controller);
  const [mode, setMode] = useState<Mode>('idle');
  const [pending, setPending] = useState<Pending | null>(null);
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' });
  const [discardPick, setDiscardPick] = useState<ResourceBag>(bag());
  const [stealPick, setStealPick] = useState<PlayerId | null>(null);
  const [fast, setFast] = useState(false);

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

  const select = useCallback((action: Action, note?: string) => {
    setPending({ action, question: describeAction(action), note });
  }, []);

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

  const prompt = describeStep(state, human, mode, pending);

  // ----- prompt bar buttons -----
  const buttons: PromptButton[] = [];
  const phase = state.phase;
  if (phase.kind === 'ended') {
    buttons.push({ label: 'Back to menu', onClick: onQuit, primary: true });
  } else if (pending) {
    buttons.push({ label: 'Confirm', onClick: () => dispatch(pending.action), primary: true });
    buttons.push({ label: 'Cancel', onClick: () => setPending(null) });
  } else if (yourMove) {
    switch (phase.kind) {
      case 'preRoll':
        buttons.push({ label: 'Roll the dice', onClick: () => dispatch({ player: human, type: 'ROLL_DICE' }), primary: true });
        if (legal.some((a) => a.type === 'PLAY_KNIGHT')) buttons.push({ label: 'Play Knight first', onClick: () => select({ player: human, type: 'PLAY_KNIGHT' }, 'You will move the robber, then roll.') });
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
          buttons.push({ label: 'End turn', onClick: () => select({ player: human, type: 'END_TURN' }, canBuild ? 'You can still afford to build something.' : undefined), primary: !canBuild });
        }
        break;
      default:
        break;
    }
  } else {
    buttons.push({ label: fast ? 'Normal speed' : 'Skip ahead', onClick: () => setFast(!fast) });
  }

  const onPlayDev = (card: DevCard) => {
    switch (card) {
      case 'knight':
        select({ player: human, type: 'PLAY_KNIGHT' }, 'You will move the robber and steal a card.');
        break;
      case 'roadBuilding':
        select({ player: human, type: 'PLAY_ROAD_BUILDING' }, 'You will place two roads for free.');
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
      <PromptBar prompt={prompt} buttons={buttons} />
      <div className="game-body">
        <div className="board-area">
          <PhaserBoard view={view} highlights={highlights} ghost={ghost} onVertexClick={onVertexClick} onEdgeClick={onEdgeClick} onHexClick={onHexClick} />
        </div>
        <aside className="sidebar">
          <PlayerStrip state={state} human={human} />
          <div className="section-title">Your hand</div>
          <PlayerHand resources={me.resources} selectable={phase.kind === 'discard' && yourMove} selected={discardPick} onToggle={toggleDiscard} />
          <DevCardPanel state={state} human={human} onPlay={onPlayDev} />
          <ActionBar
            state={state}
            human={human}
            mode={mode}
            onMode={(m) => {
              setPending(null);
              setMode(m);
            }}
            onBuyDev={() => select({ player: human, type: 'BUY_DEV_CARD' }, 'Costs 1 ore, 1 grain, 1 wool. The card is drawn at random.')}
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
