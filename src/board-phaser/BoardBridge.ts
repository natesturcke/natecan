import type { BoardView, Ghost, Highlights, Insets } from './view';

type Handler<T> = (payload: T) => void;

export interface ToScene {
  view: BoardView;
  highlights: Highlights;
  ghost: Ghost;
  insets: Insets;
}

export interface FromScene {
  vertexClick: number;
  edgeClick: number;
  hexClick: number;
  /** Canvas-pixel position of the current ghost target, or null when there is none. */
  ghostPosition: { x: number; y: number } | null;
  /** Cursor over a legal target: canvas-pixel position and what it is. */
  hover: { kind: 'vertex' | 'edge' | 'hex'; id: number; x: number; y: number } | null;
  /** Cursor over any hex tile (for the info tooltip), canvas pixels. */
  tileHover: { hex: number; x: number; y: number } | null;
  /** Cursor over a settlement, city (vertex) or road (edge), canvas pixels. */
  pieceHover: { kind: 'vertex' | 'edge'; id: number; x: number; y: number } | null;
  ready: void;
}

/** Tiny typed event bus between the React host and the Phaser scene. */
export class BoardBridge {
  /** Set by the scene: world point -> canvas pixel. */
  project: ((x: number, y: number) => { x: number; y: number }) | null = null;

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
