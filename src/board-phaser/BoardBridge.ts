import type { BoardView, Ghost, Highlights } from './view';

type Handler<T> = (payload: T) => void;

export interface ToScene {
  view: BoardView;
  highlights: Highlights;
  ghost: Ghost;
}

export interface FromScene {
  vertexClick: number;
  edgeClick: number;
  hexClick: number;
  ready: void;
}

/** Tiny typed event bus between the React host and the Phaser scene. */
export class BoardBridge {
  private toScene = new Map<keyof ToScene, Set<Handler<unknown>>>();
  private fromScene = new Map<keyof FromScene, Set<Handler<unknown>>>();
  private latest: Partial<ToScene> = {};

  /** React -> scene. The latest value is kept so a scene that boots late still receives it. */
  send<K extends keyof ToScene>(key: K, payload: ToScene[K]): void {
    this.latest[key] = payload;
    for (const h of this.toScene.get(key) ?? []) h(payload);
  }

  onScene<K extends keyof ToScene>(key: K, handler: Handler<ToScene[K]>): () => void {
    const set = this.toScene.get(key) ?? new Set();
    set.add(handler as Handler<unknown>);
    this.toScene.set(key, set);
    if (key in this.latest) handler(this.latest[key] as ToScene[K]);
    return () => set.delete(handler as Handler<unknown>);
  }

  /** Scene -> React. */
  emit<K extends keyof FromScene>(key: K, payload: FromScene[K]): void {
    for (const h of this.fromScene.get(key) ?? []) h(payload);
  }

  onReact<K extends keyof FromScene>(key: K, handler: Handler<FromScene[K]>): () => void {
    const set = this.fromScene.get(key) ?? new Set();
    set.add(handler as Handler<unknown>);
    this.fromScene.set(key, set);
    return () => set.delete(handler as Handler<unknown>);
  }
}
