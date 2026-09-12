import type { Action } from '@/engine/actions';
import type { GameEvent } from '@/engine/events';
import { legalActions } from '@/engine/legal';
import { applyAction } from '@/engine/reduce';
import { currentActor, newGame, type NewGameOptions } from '@/engine/state';
import type { GameState, PlayerId } from '@/engine/types';
import type { BotRunner } from '@/bots/runner';

export interface HistoryEntry {
  action: Action;
  events: GameEvent[];
}

export interface ControllerOptions {
  runner: BotRunner;
  /** Delay before a bot acts, per action type, for readability. 0 headless. */
  botDelayMs?: (state: GameState, lastEvents: readonly GameEvent[]) => number;
  maxActions?: number;
}

type Listener = () => void;

/**
 * Owns the authoritative GameState, applies actions, keeps history, and drives bot
 * turns whenever the current actor is a bot.
 */
export class GameController {
  private _state: GameState;
  private _history: HistoryEntry[] = [];
  private listeners = new Set<Listener>();
  private inFlight = false;
  private disposed = false;
  private fastForward = false;
  private _lastEvents: GameEvent[] = [];

  constructor(
    initial: GameState | NewGameOptions,
    private readonly opts: ControllerOptions,
  ) {
    this._state = 'players' in initial && !('phase' in initial) ? newGame(initial) : (initial as GameState);
  }

  get state(): GameState {
    return this._state;
  }

  get history(): readonly HistoryEntry[] {
    return this._history;
  }

  get lastEvents(): readonly GameEvent[] {
    return this._lastEvents;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setFastForward(on: boolean): void {
    this.fastForward = on;
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  isBotTurn(): boolean {
    const s = this._state;
    if (s.phase.kind === 'ended') return false;
    return s.players[currentActor(s)].kind === 'bot';
  }

  /** Applies a human (or scripted) action and then lets bots continue. */
  dispatch(action: Action): void {
    const result = applyAction(this._state, action);
    this._state = result.state;
    this._lastEvents = result.events;
    this._history.push({ action, events: result.events });
    this.notify();
    void this.scheduleBots();
  }

  /** Starts bot play if a bot is the current actor. Safe to call repeatedly. */
  async scheduleBots(): Promise<void> {
    if (this.inFlight || this.disposed) return;
    this.inFlight = true;
    try {
      while (!this.disposed && this.isBotTurn()) {
        if ((this.opts.maxActions ?? Infinity) <= this._state.actionCount) break;
        const before = this._state;
        const actor = currentActor(before);
        const legal = legalActions(before, actor);
        if (legal.length === 0) throw new Error(`Bot ${actor} has no legal actions in phase ${before.phase.kind}`);
        const delay = this.fastForward ? 0 : (this.opts.botDelayMs?.(before, this._lastEvents) ?? 0);
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        if (this.disposed || this._state !== before) break;
        const action = await this.opts.runner.decide(actor, before, legal);
        if (this.disposed || this._state !== before) break;
        const result = applyAction(before, action);
        this._state = result.state;
        this._lastEvents = result.events;
        this._history.push({ action, events: result.events });
        this.notify();
      }
    } finally {
      this.inFlight = false;
    }
  }

  /** Headless helper: runs bots synchronously when the runner supports it. */
  runToCompletionSync(decideSync: (player: PlayerId, state: GameState, legal: readonly Action[]) => Action): void {
    while (this.isBotTurn()) {
      if ((this.opts.maxActions ?? Infinity) <= this._state.actionCount) return;
      const actor = currentActor(this._state);
      const legal = legalActions(this._state, actor);
      if (legal.length === 0) throw new Error(`Bot ${actor} has no legal actions in phase ${this._state.phase.kind}`);
      const action = decideSync(actor, this._state, legal);
      const result = applyAction(this._state, action);
      this._state = result.state;
      this._lastEvents = result.events;
      this._history.push({ action, events: result.events });
    }
    this.notify();
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.opts.runner.dispose();
  }
}
