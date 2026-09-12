import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import { allAssetPaths } from './assets';
import { BoardBridge } from './BoardBridge';
import { BoardScene, boardPixelSize, SCENE_KEY } from './BoardScene';
import type { BoardView, Ghost, Highlights } from './view';

export interface PhaserBoardProps {
  view: BoardView;
  highlights: Highlights;
  ghost: Ghost;
  onVertexClick?: (vertex: number) => void;
  onEdgeClick?: (edge: number) => void;
  onHexClick?: (hex: number) => void;
  /** Viewport coordinates of the ghost target, for anchoring a confirm popover. */
  onGhostPosition?: (pos: { x: number; y: number } | null) => void;
  /** Cursor over a legal target, in viewport coordinates. */
  onHover?: (hover: { kind: 'vertex' | 'edge' | 'hex'; id: number; x: number; y: number } | null) => void;
  /** Cursor over any tile, in viewport coordinates. */
  onTileHover?: (hover: { hex: number; x: number; y: number } | null) => void;
  onPieceHover?: (hover: { vertex: number; x: number; y: number } | null) => void;
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

  useEffect(() => {
    const bridge = bridgeRef.current;
    let game: Phaser.Game | null = null;
    let cancelled = false;

    void availableAssets().then((assets) => {
      if (cancelled || !hostRef.current) return;
      const size = boardPixelSize();
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        transparent: true,
        width: Math.round(size.x),
        height: Math.round(size.y),
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        render: { antialias: true, pixelArt: false },
        scene: [],
      });
      game.scene.add(SCENE_KEY, BoardScene, true, { bridge, assets });
      if (import.meta.env.DEV) (window as unknown as { __board?: unknown }).__board = { game, bridge };
    });

    const offs = [
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
        callbacks.current.onPieceHover?.({ vertex: h.vertex, x: rect.left + h.x * scale, y: rect.top + h.y * scale });
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

  return <div ref={hostRef} className="phaser-host" />;
}
