import Phaser from 'phaser';
import { useEffect, useRef, useState } from 'react';
import { allAssetPaths } from './assets';
import { BoardBridge } from './BoardBridge';
import { HEX_PX } from './geometry';
import { BoardScene, SCENE_KEY } from './BoardScene';
import type { BoardView, Ghost, Highlights, Insets } from './view';

export interface PhaserBoardProps {
  view: BoardView;
  highlights: Highlights;
  ghost: Ghost;
  /** Screen margins taken by overlay panels. */
  insets?: Insets;
  onVertexClick?: (vertex: number) => void;
  onEdgeClick?: (edge: number) => void;
  onHexClick?: (hex: number) => void;
  /** Viewport coordinates of the ghost target, for anchoring a confirm popover. */
  onGhostPosition?: (pos: { x: number; y: number } | null) => void;
  /** Cursor over a legal target, in viewport coordinates. */
  onHover?: (hover: { kind: 'vertex' | 'edge' | 'hex'; id: number; x: number; y: number } | null) => void;
  /** Cursor over any tile, in viewport coordinates. */
  onTileHover?: (hover: { hex: number; x: number; y: number } | null) => void;
  onPieceHover?: (hover: { kind: 'vertex' | 'edge'; id: number; x: number; y: number } | null) => void;
  /** Receives a function mapping a hex id to viewport coordinates once the board is ready. */
  onProjector?: (project: (hex: number) => { x: number; y: number } | null) => void;
}

let availableAssetsPromise: Promise<{ key: string; path: string }[]> | null = null;

/**
 * Checks which art files actually exist. The dev server answers missing files with
 * the SPA's HTML, which would stall Phaser's image loader, so we filter by content type.
 */
function availableAssets(): Promise<{ key: string; path: string }[]> {
  if (!availableAssetsPromise) {
    availableAssetsPromise = Promise.all(
      allAssetPaths().map(async (a) => {
        try {
          const res = await fetch(a.path, { method: 'HEAD' });
          const type = res.headers.get('content-type') ?? '';
          return res.ok && type.startsWith('image/') ? a : null;
        } catch {
          return null;
        }
      }),
    ).then((list) => list.filter((a): a is { key: string; path: string } => a !== null));
  }
  return availableAssetsPromise;
}

/** Hosts a single Phaser game and forwards state down / clicks up through a BoardBridge. */
export function PhaserBoard(props: PhaserBoardProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<BoardBridge>(new BoardBridge());
  const callbacks = useRef(props);
  callbacks.current = props;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const bridge = bridgeRef.current;
    let game: Phaser.Game | null = null;
    let cancelled = false;

    void availableAssets().then((assets) => {
      if (cancelled || !hostRef.current) return;
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        transparent: true,
        width: hostRef.current.clientWidth || 800,
        height: hostRef.current.clientHeight || 600,
        scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
        render: { antialias: true, pixelArt: false },
        scene: [],
      });
      game.scene.add(SCENE_KEY, BoardScene, true, { bridge, assets });
      if (import.meta.env.DEV) (window as unknown as { __board?: unknown }).__board = { game, bridge };
    });

    const offs = [
      bridge.onReact('ready', () => {
        setReady(true);
        callbacks.current.onProjector?.((hex) => {
          if (!game || !bridge.project) return null;
          const rect = game.canvas.getBoundingClientRect();
          const scale = rect.width / game.scale.width;
          const p = bridge.project(HEX_PX[hex].x, HEX_PX[hex].y);
          return { x: rect.left + p.x * scale, y: rect.top + p.y * scale };
        });
      }),
      bridge.onReact('vertexClick', (v) => callbacks.current.onVertexClick?.(v)),
      bridge.onReact('edgeClick', (e) => callbacks.current.onEdgeClick?.(e)),
      bridge.onReact('hexClick', (h) => callbacks.current.onHexClick?.(h)),
      bridge.onReact('hover', (h) => {
        if (!h || !game) {
          callbacks.current.onHover?.(null);
          return;
        }
        const rect = game.canvas.getBoundingClientRect();
        const scale = rect.width / game.scale.width;
        callbacks.current.onHover?.({ ...h, x: rect.left + h.x * scale, y: rect.top + h.y * scale });
      }),
      bridge.onReact('tileHover', (h) => {
        if (!h || !game) {
          callbacks.current.onTileHover?.(null);
          return;
        }
        const rect = game.canvas.getBoundingClientRect();
        const scale = rect.width / game.scale.width;
        callbacks.current.onTileHover?.({ hex: h.hex, x: rect.left + h.x * scale, y: rect.top + h.y * scale });
      }),
      bridge.onReact('pieceHover', (h) => {
        if (!h || !game) {
          callbacks.current.onPieceHover?.(null);
          return;
        }
        const rect = game.canvas.getBoundingClientRect();
        const scale = rect.width / game.scale.width;
        callbacks.current.onPieceHover?.({ kind: h.kind, id: h.id, x: rect.left + h.x * scale, y: rect.top + h.y * scale });
      }),
      bridge.onReact('ghostPosition', (pos) => {
        if (!pos || !game) {
          callbacks.current.onGhostPosition?.(null);
          return;
        }
        const rect = game.canvas.getBoundingClientRect();
        const scale = rect.width / game.scale.width;
        callbacks.current.onGhostPosition?.({ x: rect.left + pos.x * scale, y: rect.top + pos.y * scale });
      }),
    ];
    return () => {
      cancelled = true;
      offs.forEach((o) => o());
      const g = game;
      if (!g) return;
      // Destroying before boot is silently ignored by Phaser, so wait for boot first.
      if (g.isBooted) g.destroy(true);
      else g.events.once(Phaser.Core.Events.READY, () => g.destroy(true));
    };
  }, []);

  useEffect(() => {
    bridgeRef.current.send('view', props.view);
  }, [props.view]);
  useEffect(() => {
    bridgeRef.current.send('highlights', props.highlights);
  }, [props.highlights]);
  useEffect(() => {
    bridgeRef.current.send('ghost', props.ghost);
  }, [props.ghost]);
  useEffect(() => {
    bridgeRef.current.send('insets', props.insets ?? { left: 0, right: 0, top: 0, bottom: 0 });
  }, [props.insets]);

  return (
    <>
      <div ref={hostRef} className="phaser-host" />
      {!ready && (
        <div className="board-loading">
          <div className="board-loading-card">Preparing the island…</div>
        </div>
      )}
    </>
  );
}
