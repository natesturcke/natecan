import Phaser from 'phaser';
import { HEX_COUNT } from '@/engine/board/layout';
import { EDGE_COUNT, TOPOLOGY, VERTEX_COUNT } from '@/engine/board/topology';
import type { Terrain } from '@/engine/types';
import {
  ART_SCALE,
  CAMERA_K,
  HARBOR_IMAGE,
  HARBOR_KEYS,
  HEX_R,
  MISC_KEYS,
  PIECE_IMAGE,
  PIECE_KEYS,
  ROAD_IMAGE,
  ROAD_KEYS,
  TILE_IMAGE,
  TILE_VARIANTS,
  tileVariantKey,
  TOKEN_IMAGE,
  tokenKey,
} from './assets';
import type { BoardBridge } from './BoardBridge';
import { boardBounds, EDGE_PX, HEX_PX, hexPolygon, VERTEX_PX, type Point } from './geometry';
import type { BoardView, Ghost, Highlights, Insets } from './view';

export const SCENE_KEY = 'board';

const TERRAIN_COLORS: Record<Terrain, number> = {
  hills: 0xb5552e,
  forest: 0x2f6b2f,
  mountains: 0x7d7f86,
  fields: 0xd9b83a,
  pasture: 0x7fbf4d,
  desert: 0xd9c98a,
};

const DEPTH = { sea: 0, tile: 10, token: 100, harbor: 200, piece: 300, highlight: 900, zone: 1000 } as const;

/** Pixels per world unit at which images are displayed. */
const DISPLAY_SCALE = 1 / ART_SCALE;

function colorInt(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16);
}

function darken(color: number, f: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * f);
  const g = Math.floor(((color >> 8) & 0xff) * f);
  const b = Math.floor((color & 0xff) * f);
  return (r << 16) | (g << 8) | b;
}

interface SceneData {
  bridge: BoardBridge;
  /** Art files verified to exist; anything else uses drawn fallbacks. */
  assets: { key: string; path: string }[];
}

export class BoardScene extends Phaser.Scene {
  private bridge!: BoardBridge;
  private assets: { key: string; path: string }[] = [];
  private view: BoardView | null = null;
  private highlights: Highlights = { vertices: [], edges: [], hexes: [], dimVertices: [], dimEdges: [] };
  private ghost: Ghost = null;

  private tiles: Phaser.GameObjects.GameObject[] = [];
  private tokens: Phaser.GameObjects.GameObject[] = [];
  private harborObjs: Phaser.GameObjects.GameObject[] = [];
  private roadObjs: (Phaser.GameObjects.GameObject | null)[] = [];
  private buildingObjs: (Phaser.GameObjects.GameObject | null)[] = [];
  private robberObj: Phaser.GameObjects.GameObject | null = null;
  private ghostObj: Phaser.GameObjects.GameObject | null = null;
  private highlightGfx!: Phaser.GameObjects.Graphics;
  private hoverGfx!: Phaser.GameObjects.Graphics;
  private vertexZones: Phaser.GameObjects.Zone[] = [];
  private edgeZones: Phaser.GameObjects.Zone[] = [];
  private hexZones: Phaser.GameObjects.Zone[] = [];
  private pulse = 0;
  private unsubscribe: (() => void)[] = [];
  private lastView: BoardView | null = null;
  private seaLayers: Phaser.GameObjects.TileSprite[] = [];
  private insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };

  constructor() {
    super(SCENE_KEY);
  }

  init(data: SceneData): void {
    this.bridge = data.bridge;
    this.assets = data.assets ?? [];
  }

  preload(): void {
    for (const { key, path } of this.assets) this.load.image(key, path);
  }

  create(): void {
    const b = boardBounds();
    const width = b.maxX - b.minX;
    const height = b.maxY - b.minY;
    // Sea far beyond the island so it reaches every edge whatever the window shape.
    this.drawSea(b.minX - width * 2, b.minY - height * 2, width * 5, height * 5);
    this.fitCamera();
    this.highlightGfx = this.add.graphics().setDepth(DEPTH.highlight);
    this.hoverGfx = this.add.graphics().setDepth(DEPTH.highlight + 1);
    this.createZones();
    this.createInfoZones();

    this.unsubscribe.push(this.bridge.onScene('view', (v) => this.setView(v)));
    this.unsubscribe.push(this.bridge.onScene('highlights', (h) => this.setHighlights(h)));
    this.unsubscribe.push(this.bridge.onScene('ghost', (g) => this.setGhost(g)));
    this.unsubscribe.push(
      this.bridge.onScene('insets', (i) => {
        this.insets = i;
        this.fitCamera();
        this.emitGhostPosition();
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe.forEach((u) => u()));
    this.scale.on(Phaser.Scale.Events.RESIZE, () => {
      this.fitCamera();
      this.emitGhostPosition();
    });
    this.bridge.project = (x, y) => {
      const cam = this.cameras.main;
      return { x: (x - cam.worldView.x) * cam.zoom, y: (y - cam.worldView.y) * cam.zoom };
    };
    this.bridge.emit('ready', undefined);
  }

  /** Zooms so the island fills the canvas area not covered by overlay panels, centred there. */
  private fitCamera(): void {
    const b = boardBounds();
    const width = b.maxX - b.minX;
    const height = b.maxY - b.minY;
    // Insets arrive in CSS pixels; the canvas is 1:1 with CSS pixels under RESIZE scaling.
    const freeW = Math.max(200, this.scale.width - this.insets.left - this.insets.right);
    const freeH = Math.max(200, this.scale.height - this.insets.top - this.insets.bottom);
    const zoom = Math.min(freeW / width, freeH / height);
    const cam = this.cameras.main;
    cam.setZoom(zoom);
    // Centre of the free area in canvas pixels, relative to the canvas centre.
    const freeCx = this.insets.left + freeW / 2 - this.scale.width / 2;
    const freeCy = this.insets.top + freeH / 2 - this.scale.height / 2;
    cam.centerOn((b.minX + b.maxX) / 2 - freeCx / zoom, (b.minY + b.maxY) / 2 - freeCy / zoom);
  }

  override update(time: number, delta: number): void {
    this.pulse += delta / 600;
    this.drawHighlights();
    if (this.seaLayers.length === 2) {
      const [base, shimmer] = this.seaLayers;
      const t = time / 1000;
      base.tilePositionX += delta * 0.012;
      base.tilePositionY = Math.sin(t * 0.35) * 6;
      shimmer.tilePositionX -= delta * 0.02;
      shimmer.tilePositionY += delta * 0.008;
      shimmer.setAlpha(0.28 + 0.1 * Math.sin(t * 0.8));
    }
  }

  private has(key: string): boolean {
    return this.textures.exists(key);
  }

  /** Picks an available variant of the terrain art for this hex, or null if none exist. */
  private pickTileKey(terrain: Terrain, hex: number): string | null {
    const available: string[] = [];
    for (let v = 1; v <= TILE_VARIANTS; v++) {
      const k = tileVariantKey(terrain, v);
      if (this.has(k)) available.push(k);
    }
    if (available.length === 0) return null;
    // Deterministic spread: neighbouring hexes of the same terrain get different variants.
    return available[(hex * 5 + 3) % available.length];
  }

  // ---------- static layers ----------

  private drawSea(x: number, y: number, w: number, h: number): void {
    if (this.has(MISC_KEYS.sea)) {
      // Two drifting copies of the seamless texture at different speeds read as moving
      // water; each is a single textured quad, so the cost is negligible.
      const scale = DISPLAY_SCALE * 1.5;
      const base = this.add.tileSprite(x, y, w / scale, h / scale, MISC_KEYS.sea).setOrigin(0, 0).setScale(scale).setDepth(DEPTH.sea);
      const shimmer = this.add
        .tileSprite(x, y, w / (scale * 1.35), h / (scale * 1.35), MISC_KEYS.sea)
        .setOrigin(0, 0)
        .setScale(scale * 1.35)
        .setAlpha(0.35)
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .setDepth(DEPTH.sea + 0.5);
      this.seaLayers = [base, shimmer];
    } else {
      this.add.rectangle(x, y, w, h, 0x2a6f97).setOrigin(0, 0).setDepth(DEPTH.sea);
    }
  }

  private buildStatic(view: BoardView): void {
    this.tiles.forEach((t) => t.destroy());
    this.tokens.forEach((t) => t.destroy());
    this.harborObjs.forEach((t) => t.destroy());
    this.tiles = [];
    this.tokens = [];
    this.harborObjs = [];

    const order = [...Array(HEX_COUNT).keys()].sort((a, b) => HEX_PX[a].y - HEX_PX[b].y);
    for (const h of order) {
      const tile = view.hexes[h];
      const c = HEX_PX[h];
      const key = this.pickTileKey(tile.terrain, h);
      const depth = DEPTH.tile + c.y * 0.001;
      if (key) {
        // Subtle per-hex brightness jitter so identical variants still read as distinct.
        const jitter = 0.94 + ((h * 7919) % 13) / 100;
        const shade = Math.round(255 * Math.min(1, jitter));
        const img = this.add
          .image(c.x, c.y, key)
          .setOrigin(TILE_IMAGE.faceCenterX / TILE_IMAGE.width, TILE_IMAGE.faceCenterY / TILE_IMAGE.height)
          .setScale(DISPLAY_SCALE)
          .setTint((shade << 16) | (shade << 8) | shade)
          .setDepth(depth);
        this.tiles.push(img);
      } else {
        this.tiles.push(this.drawFallbackTile(h, tile.terrain, depth));
      }
      if (tile.token !== null) {
        const tk = tokenKey(tile.token);
        const ty = c.y - HEX_R * CAMERA_K * 0.05;
        if (this.has(tk)) {
          this.tokens.push(
            this.add
              .image(c.x, ty, tk)
              .setScale((HEX_R * 0.62) / TOKEN_IMAGE.size)
              .setDepth(DEPTH.token + c.y * 0.001),
          );
        } else {
          this.tokens.push(this.drawFallbackToken(c.x, ty, tile.token, DEPTH.token + c.y * 0.001));
        }
      }
    }

    for (const harbor of view.harbors) {
      const eg = EDGE_PX[harbor.edge];
      const x = eg.mid.x + eg.outward.x * HEX_R * 0.55;
      const y = eg.mid.y + eg.outward.y * HEX_R * 0.55 * CAMERA_K;
      const key = HARBOR_KEYS[harbor.kind];
      const depth = DEPTH.harbor + y * 0.001;
      if (this.has(key)) {
        const img = this.add
          .image(x, y, key)
          .setOrigin(HARBOR_IMAGE.anchorX / HARBOR_IMAGE.width, HARBOR_IMAGE.anchorY / HARBOR_IMAGE.height)
          .setScale(DISPLAY_SCALE * 0.9)
          .setDepth(depth);
        this.harborObjs.push(img);
      } else {
        this.harborObjs.push(this.drawFallbackHarbor(x, y, harbor.kind, depth));
      }
      // Faint dashed lines to the two harbor vertices help players see which corners count.
      const g = this.add.graphics().setDepth(depth - 0.0005);
      g.lineStyle(2, 0xffffff, 0.35);
      for (const v of harbor.vertices) {
        g.lineBetween(x, y, VERTEX_PX[v].x, VERTEX_PX[v].y);
      }
      this.harborObjs.push(g);
    }
  }

  private drawFallbackTile(h: number, terrain: Terrain, depth: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics().setDepth(depth);
    const poly = hexPolygon(h);
    const color = TERRAIN_COLORS[terrain];
    const side = HEX_R * 0.22;
    // side faces under SE, S, SW edges
    g.fillStyle(darken(color, 0.55), 1);
    const sidePts = [poly[1], poly[2], poly[3], poly[4], poly[5]];
    g.beginPath();
    g.moveTo(sidePts[0].x, sidePts[0].y);
    for (const p of sidePts.slice(1)) g.lineTo(p.x, p.y);
    for (const p of sidePts.slice().reverse()) g.lineTo(p.x, p.y + side);
    g.closePath();
    g.fillPath();
    g.fillStyle(color, 1);
    g.fillPoints(poly, true);
    g.lineStyle(2, darken(color, 0.7), 1);
    g.strokePoints(poly, true);
    return g;
  }

  private drawFallbackToken(x: number, y: number, n: number, depth: number): Phaser.GameObjects.Container {
    const red = n === 6 || n === 8;
    const disc = this.add.ellipse(0, 0, HEX_R * 0.62, HEX_R * 0.62 * CAMERA_K, 0xf3e6c4).setStrokeStyle(2, 0x7a6a4a);
    const pips = '•'.repeat(6 - Math.abs(7 - n));
    const text = this.add
      .text(0, -2, `${n}\n${pips}`, {
        fontFamily: 'Georgia, serif',
        fontSize: `${HEX_R * 0.26}px`,
        color: red ? '#b3261e' : '#2b2118',
        align: 'center',
        lineSpacing: -HEX_R * 0.12,
      })
      .setOrigin(0.5, 0.45);
    return this.add.container(x, y, [disc, text]).setDepth(depth);
  }

  private drawFallbackHarbor(x: number, y: number, kind: string, depth: number): Phaser.GameObjects.Container {
    const label = kind === 'generic' ? '3:1' : `2:1\n${kind}`;
    const bg = this.add.rectangle(0, 0, HEX_R * 0.7, HEX_R * 0.42, 0x5a3b1e, 0.9).setStrokeStyle(2, 0xe8d5a8);
    const text = this.add
      .text(0, 0, label, { fontFamily: 'Georgia, serif', fontSize: `${HEX_R * 0.16}px`, color: '#f7efdd', align: 'center' })
      .setOrigin(0.5);
    return this.add.container(x, y, [bg, text]).setDepth(depth);
  }

  // ---------- dynamic layers ----------

  private setView(view: BoardView): void {
    const staticChanged = !this.lastView || this.lastView.hexes !== view.hexes || this.lastView.harbors !== view.harbors;
    this.view = view;
    if (staticChanged) this.buildStatic(view);
    this.syncRoads(view);
    this.syncBuildings(view);
    this.syncRobber(view);
    this.lastView = view;
    this.setGhost(this.ghost);
  }

  private makeRoad(e: number, owner: number, colors: readonly string[], alpha = 1): Phaser.GameObjects.GameObject {
    const eg = EDGE_PX[e];
    const tint = colorInt(colors[owner]);
    const key = ROAD_KEYS[eg.orientation];
    const depth = DEPTH.piece + eg.mid.y * 0.001;
    if (this.has(key)) {
      return this.add
        .image(eg.mid.x, eg.mid.y, key)
        .setOrigin(ROAD_IMAGE.anchorX / ROAD_IMAGE.width, ROAD_IMAGE.anchorY / ROAD_IMAGE.height)
        .setScale(DISPLAY_SCALE)
        .setTint(tint)
        .setAlpha(alpha)
        .setDepth(depth);
    }
    const [a, b] = TOPOLOGY.edgeVertices[e];
    const len = Math.hypot(VERTEX_PX[b].x - VERTEX_PX[a].x, VERTEX_PX[b].y - VERTEX_PX[a].y) * 0.8;
    return this.add
      .rectangle(eg.mid.x, eg.mid.y, len, HEX_R * 0.14, tint, alpha)
      .setRotation(eg.angle)
      .setStrokeStyle(2, darken(tint, 0.6), alpha)
      .setDepth(depth);
  }

  private makeBuilding(v: number, kind: 'settlement' | 'city', owner: number, colors: readonly string[], alpha = 1): Phaser.GameObjects.GameObject {
    const p = VERTEX_PX[v];
    const tint = colorInt(colors[owner]);
    const depth = DEPTH.piece + p.y * 0.001 + 0.0001;
    const scale = kind === 'city' ? 0.95 : 0.78;
    // Per-player architecture when available (full colour, no tint); neutral tinted art otherwise.
    const styled = `${PIECE_KEYS[kind]}-${owner + 1}`;
    const key = this.has(styled) ? styled : PIECE_KEYS[kind];
    if (this.has(key)) {
      const img = this.add
        .image(0, 0, key)
        .setOrigin(PIECE_IMAGE.anchorX / PIECE_IMAGE.width, PIECE_IMAGE.anchorY / PIECE_IMAGE.height)
        .setScale(DISPLAY_SCALE * scale * 1.15);
      if (key !== styled) img.setTint(tint);
      // Coloured base plate so every town is easy to spot and attribute at a glance.
      const rx = HEX_R * (kind === 'city' ? 0.34 : 0.28);
      const base = this.add.graphics();
      base.fillStyle(0x000000, 0.28);
      base.fillEllipse(0, HEX_R * 0.02, rx * 2.2, rx * 2.2 * CAMERA_K);
      base.lineStyle(4, 0xffffff, 0.85);
      base.strokeEllipse(0, 0, rx * 2, rx * 2 * CAMERA_K);
      base.lineStyle(3, tint, 1);
      base.strokeEllipse(0, 0, rx * 2 - 6, (rx * 2 - 6) * CAMERA_K);
      return this.add.container(p.x, p.y, [base, img]).setAlpha(alpha).setDepth(depth);
    }
    const g = this.add.graphics().setDepth(depth).setAlpha(alpha);
    const s = HEX_R * 0.26 * (kind === 'city' ? 1.35 : 1);
    g.fillStyle(tint, 1);
    g.lineStyle(2, darken(tint, 0.55), 1);
    // house: body + roof
    g.fillRect(p.x - s / 2, p.y - s * 0.8, s, s * 0.8);
    g.strokeRect(p.x - s / 2, p.y - s * 0.8, s, s * 0.8);
    g.fillStyle(darken(tint, 0.75), 1);
    g.fillTriangle(p.x - s * 0.6, p.y - s * 0.8, p.x + s * 0.6, p.y - s * 0.8, p.x, p.y - s * 1.35);
    if (kind === 'city') {
      g.fillStyle(darken(tint, 0.75), 1);
      g.fillRect(p.x + s * 0.15, p.y - s * 1.7, s * 0.25, s * 0.9);
    }
    return g;
  }

  private makeRobber(hex: number, alpha = 1): Phaser.GameObjects.GameObject {
    const c = HEX_PX[hex];
    const x = c.x + HEX_R * 0.32;
    const y = c.y + HEX_R * 0.18 * CAMERA_K;
    const depth = DEPTH.piece + y * 0.001 + 0.0002;
    if (this.has(PIECE_KEYS.robber)) {
      return this.add
        .image(x, y, PIECE_KEYS.robber)
        .setOrigin(PIECE_IMAGE.anchorX / PIECE_IMAGE.width, PIECE_IMAGE.anchorY / PIECE_IMAGE.height)
        .setScale(DISPLAY_SCALE * 0.6)
        .setAlpha(alpha)
        .setDepth(depth);
    }
    const g = this.add.graphics().setDepth(depth).setAlpha(alpha);
    g.fillStyle(0x1b1b1f, 1);
    g.fillEllipse(x, y, HEX_R * 0.22, HEX_R * 0.1);
    g.fillRoundedRect(x - HEX_R * 0.08, y - HEX_R * 0.42, HEX_R * 0.16, HEX_R * 0.42, HEX_R * 0.06);
    g.fillCircle(x, y - HEX_R * 0.46, HEX_R * 0.08);
    return g;
  }

  private syncRoads(view: BoardView): void {
    if (this.roadObjs.length !== EDGE_COUNT) this.roadObjs = Array(EDGE_COUNT).fill(null);
    for (let e = 0; e < EDGE_COUNT; e++) {
      const owner = view.roads[e];
      const prev = this.lastView?.roads[e] ?? -1;
      if (owner === prev && this.roadObjs[e]) continue;
      this.roadObjs[e]?.destroy();
      this.roadObjs[e] = owner === -1 ? null : this.makeRoad(e, owner, view.playerColors);
      if (owner !== -1 && this.lastView) this.popIn(this.roadObjs[e]!);
    }
  }

  private syncBuildings(view: BoardView): void {
    if (this.buildingObjs.length !== VERTEX_COUNT) this.buildingObjs = Array(VERTEX_COUNT).fill(null);
    for (let v = 0; v < VERTEX_COUNT; v++) {
      const b = view.buildings[v];
      const prev = this.lastView?.buildings[v] ?? null;
      const same = b === prev || (b && prev && b.owner === prev.owner && b.kind === prev.kind);
      if (same && this.buildingObjs[v]) continue;
      this.buildingObjs[v]?.destroy();
      this.buildingObjs[v] = b ? this.makeBuilding(v, b.kind, b.owner, view.playerColors) : null;
      if (b && this.lastView) this.popIn(this.buildingObjs[v]!);
    }
  }

  private syncRobber(view: BoardView): void {
    if (this.robberObj && this.lastView && this.lastView.robber === view.robber) return;
    const previous = this.robberObj;
    this.robberObj = this.makeRobber(view.robber);
    if (previous && this.lastView) {
      const target = this.robberObj as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;
      const from = previous as unknown as { x: number; y: number };
      if ('x' in target && typeof from.x === 'number') {
        const tx = (target as { x: number }).x;
        const ty = (target as { y: number }).y;
        (target as { x: number }).x = from.x;
        (target as { y: number }).y = from.y;
        this.tweens.add({ targets: target, x: tx, y: ty, duration: 450, ease: 'Cubic.easeInOut' });
      }
      previous.destroy();
    } else {
      previous?.destroy();
    }
  }

  private popIn(obj: Phaser.GameObjects.GameObject): void {
    const t = obj as unknown as { scaleX?: number; scaleY?: number; y?: number; alpha?: number };
    if (typeof t.scaleX !== 'number' || typeof t.y !== 'number') return;
    const sx = t.scaleX;
    const sy = t.scaleY ?? sx;
    const y = t.y;
    t.scaleX = sx * 0.6;
    t.scaleY = sy * 0.6;
    t.y = y - HEX_R * 0.3;
    t.alpha = 0;
    this.tweens.add({ targets: obj, scaleX: sx, scaleY: sy, y, alpha: 1, duration: 320, ease: 'Back.easeOut' });
  }

  // ---------- interaction ----------

  /**
   * Phaser also listens for mousedown on the window, so a click on a DOM element floating over
   * the board (the confirm popover, a tooltip) would otherwise hit-test the board underneath it.
   */
  private fromCanvas(pointer: Phaser.Input.Pointer): boolean {
    const target = (pointer.event as { target?: EventTarget | null } | undefined)?.target;
    return !target || target === this.game.canvas;
  }

  private createZones(): void {
    for (let v = 0; v < VERTEX_COUNT; v++) {
      const p = VERTEX_PX[v];
      const zone = this.add.zone(p.x, p.y, HEX_R * 0.36, HEX_R * 0.36).setDepth(DEPTH.zone);
      zone.setInteractive(new Phaser.Geom.Circle(HEX_R * 0.18, HEX_R * 0.18, HEX_R * 0.18), Phaser.Geom.Circle.Contains);
      zone.disableInteractive();
      zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.fromCanvas(pointer) && this.bridge.emit('vertexClick', v));
      zone.on('pointerover', () => this.hover({ kind: 'vertex', id: v }));
      zone.on('pointerout', () => this.hover(null));
      this.vertexZones.push(zone);
    }
    for (let e = 0; e < EDGE_COUNT; e++) {
      const eg = EDGE_PX[e];
      const [a, b] = TOPOLOGY.edgeVertices[e];
      const len = Math.hypot(VERTEX_PX[b].x - VERTEX_PX[a].x, VERTEX_PX[b].y - VERTEX_PX[a].y) * 0.7;
      const w = HEX_R * 0.26;
      const zone = this.add.zone(eg.mid.x, eg.mid.y, len, w).setDepth(DEPTH.zone - 1).setRotation(eg.angle);
      zone.setInteractive(new Phaser.Geom.Rectangle(0, 0, len, w), Phaser.Geom.Rectangle.Contains);
      zone.disableInteractive();
      zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.fromCanvas(pointer) && this.bridge.emit('edgeClick', e));
      zone.on('pointerover', () => this.hover({ kind: 'edge', id: e }));
      zone.on('pointerout', () => this.hover(null));
      this.edgeZones.push(zone);
    }
    for (let h = 0; h < HEX_COUNT; h++) {
      const poly = hexPolygon(h);
      const c = HEX_PX[h];
      const w = Math.sqrt(3) * HEX_R;
      const hh = 2 * HEX_R * CAMERA_K;
      const zone = this.add.zone(c.x, c.y, w, hh).setDepth(DEPTH.zone - 2);
      const local = poly.map((p) => new Phaser.Geom.Point(p.x - c.x + w / 2, p.y - c.y + hh / 2));
      zone.setInteractive(new Phaser.Geom.Polygon(local), Phaser.Geom.Polygon.Contains);
      zone.disableInteractive();
      zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.fromCanvas(pointer) && this.bridge.emit('hexClick', h));
      zone.on('pointerover', () => this.hover({ kind: 'hex', id: h }));
      zone.on('pointerout', () => this.hover(null));
      this.hexZones.push(zone);
    }
  }

  private hovered: { kind: 'vertex' | 'edge' | 'hex'; id: number } | null = null;
  /** A built piece under the cursor, drawn with a glow so hovering feels tactile. */
  private pieceHovered: { kind: 'vertex' | 'edge'; id: number } | null = null;
  private infoZones: Phaser.GameObjects.Zone[] = [];

  private setPieceHover(target: { kind: 'vertex' | 'edge'; id: number } | null, pointer?: Phaser.Input.Pointer): void {
    const prev = this.pieceHovered;
    this.pieceHovered = target;
    const changed = prev?.kind !== target?.kind || prev?.id !== target?.id;
    if (changed) {
      // Lift the piece slightly while hovered, and settle it back afterwards.
      const lift = (t: { kind: 'vertex' | 'edge'; id: number } | null, up: boolean) => {
        if (!t) return;
        const obj = t.kind === 'vertex' ? this.buildingObjs[t.id] : this.roadObjs[t.id];
        if (!obj) return;
        const base = t.kind === 'vertex' ? VERTEX_PX[t.id].y : EDGE_PX[t.id].mid.y;
        this.tweens.killTweensOf(obj);
        this.tweens.add({ targets: obj, y: up ? base - HEX_R * 0.06 : base, duration: 140, ease: 'Quad.easeOut' });
      };
      lift(prev, false);
      lift(target, true);
    }
    if (!target || !pointer) {
      if (!target) this.bridge.emit('pieceHover', null);
      return;
    }
    const cam = this.cameras.main;
    this.bridge.emit('pieceHover', { ...target, x: (pointer.worldX - cam.worldView.x) * cam.zoom, y: (pointer.worldY - cam.worldView.y) * cam.zoom });
  }

  /** Always-on, lowest-priority hex zones that only report which tile the cursor is over. */
  private createInfoZones(): void {
    for (let h = 0; h < HEX_COUNT; h++) {
      const poly = hexPolygon(h);
      const c = HEX_PX[h];
      const w = Math.sqrt(3) * HEX_R;
      const hh = 2 * HEX_R * CAMERA_K;
      const zone = this.add.zone(c.x, c.y, w, hh).setDepth(DEPTH.zone - 3);
      const local = poly.map((p) => new Phaser.Geom.Point(p.x - c.x + w / 2, p.y - c.y + hh / 2));
      zone.setInteractive(new Phaser.Geom.Polygon(local), Phaser.Geom.Polygon.Contains);
      zone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        const cam = this.cameras.main;
        this.bridge.emit('tileHover', { hex: h, x: (pointer.worldX - cam.worldView.x) * cam.zoom, y: (pointer.worldY - cam.worldView.y) * cam.zoom });
      });
      zone.on('pointerout', () => this.bridge.emit('tileHover', null));
      this.infoZones.push(zone);
    }
    for (let v = 0; v < VERTEX_COUNT; v++) {
      const p = VERTEX_PX[v];
      const zone = this.add.zone(p.x, p.y - HEX_R * 0.12, HEX_R * 0.42, HEX_R * 0.42).setDepth(DEPTH.zone - 2.5);
      zone.setInteractive(new Phaser.Geom.Circle(HEX_R * 0.21, HEX_R * 0.21, HEX_R * 0.21), Phaser.Geom.Circle.Contains);
      zone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (!this.view?.buildings[v]) return;
        this.setPieceHover({ kind: 'vertex', id: v }, pointer);
      });
      zone.on('pointerout', () => {
        if (this.pieceHovered?.kind === 'vertex' && this.pieceHovered.id === v) this.setPieceHover(null);
      });
      this.infoZones.push(zone);
    }
    // Roads: a slim zone along each edge that only speaks up when a road is built there.
    for (let e = 0; e < EDGE_COUNT; e++) {
      const eg = EDGE_PX[e];
      const [a, b] = TOPOLOGY.edgeVertices[e];
      const len = Math.hypot(VERTEX_PX[b].x - VERTEX_PX[a].x, VERTEX_PX[b].y - VERTEX_PX[a].y) * 0.6;
      const w = HEX_R * 0.2;
      const zone = this.add.zone(eg.mid.x, eg.mid.y, len, w).setDepth(DEPTH.zone - 2.7).setRotation(eg.angle);
      zone.setInteractive(new Phaser.Geom.Rectangle(0, 0, len, w), Phaser.Geom.Rectangle.Contains);
      zone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (!this.view || this.view.roads[e] === -1) return;
        // A building at either end wins: it is the more interesting thing to inspect.
        if (this.pieceHovered?.kind === 'vertex') return;
        this.setPieceHover({ kind: 'edge', id: e }, pointer);
      });
      zone.on('pointerout', () => {
        if (this.pieceHovered?.kind === 'edge' && this.pieceHovered.id === e) this.setPieceHover(null);
      });
      this.infoZones.push(zone);
    }
    this.input.setTopOnly(false);
  }

  private hover(target: { kind: 'vertex' | 'edge' | 'hex'; id: number } | null): void {
    this.hovered = target;
    this.input.setDefaultCursor(target ? 'pointer' : 'default');
    if (!target) {
      this.bridge.emit('hover', null);
      return;
    }
    const world = target.kind === 'vertex' ? VERTEX_PX[target.id] : target.kind === 'edge' ? EDGE_PX[target.id].mid : HEX_PX[target.id];
    const cam = this.cameras.main;
    this.bridge.emit('hover', { ...target, x: (world.x - cam.worldView.x) * cam.zoom, y: (world.y - cam.worldView.y) * cam.zoom });
  }

  private setHighlights(h: Highlights): void {
    this.highlights = h;
    // Dim spots stay hoverable so the tooltip can say what is missing, but clicking them does nothing.
    const vs = new Set([...h.vertices, ...h.dimVertices]);
    const es = new Set([...h.edges, ...h.dimEdges]);
    const hs = new Set(h.hexes);
    this.vertexZones.forEach((z, i) => (vs.has(i) ? z.setInteractive() : z.disableInteractive()));
    this.edgeZones.forEach((z, i) => (es.has(i) ? z.setInteractive() : z.disableInteractive()));
    this.hexZones.forEach((z, i) => (hs.has(i) ? z.setInteractive() : z.disableInteractive()));
    if (this.hovered) {
      const set = this.hovered.kind === 'vertex' ? vs : this.hovered.kind === 'edge' ? es : hs;
      if (!set.has(this.hovered.id)) this.hover(null);
    }
  }

  private drawHighlights(): void {
    const g = this.highlightGfx;
    g.clear();
    const a = 0.55 + 0.35 * Math.sin(this.pulse * Math.PI);
    const color = 0xfff3b0;
    g.lineStyle(3, color, a);
    g.fillStyle(color, a * 0.35);
    for (const v of this.highlights.vertices) {
      const p = VERTEX_PX[v];
      g.fillCircle(p.x, p.y, HEX_R * 0.15);
      g.strokeCircle(p.x, p.y, HEX_R * 0.15);
    }
    for (const e of this.highlights.edges) {
      const [va, vb] = TOPOLOGY.edgeVertices[e];
      const pa = VERTEX_PX[va];
      const pb = VERTEX_PX[vb];
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      g.lineStyle(HEX_R * 0.12, color, a * 0.8);
      g.lineBetween(pa.x + dx * 0.18, pa.y + dy * 0.18, pb.x - dx * 0.18, pb.y - dy * 0.18);
      g.lineStyle(3, color, a);
    }
    for (const h of this.highlights.hexes) {
      const poly = hexPolygon(h).map((p) => ({ x: HEX_PX[h].x + (p.x - HEX_PX[h].x) * 0.9, y: HEX_PX[h].y + (p.y - HEX_PX[h].y) * 0.9 }));
      g.strokePoints(poly, true);
    }
    // Faint, steady outlines for "you could build here once you can pay".
    g.lineStyle(2, 0xffffff, 0.32);
    for (const v of this.highlights.dimVertices) {
      const p = VERTEX_PX[v];
      g.strokeCircle(p.x, p.y, HEX_R * 0.13);
    }
    for (const e of this.highlights.dimEdges) {
      const [va, vb] = TOPOLOGY.edgeVertices[e];
      const pa = VERTEX_PX[va];
      const pb = VERTEX_PX[vb];
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      g.lineStyle(HEX_R * 0.09, 0xffffff, 0.22);
      g.lineBetween(pa.x + dx * 0.2, pa.y + dy * 0.2, pb.x - dx * 0.2, pb.y - dy * 0.2);
    }
    const hg = this.hoverGfx;
    hg.clear();
    if (this.pieceHovered && !this.hovered) {
      // Soft halo around the piece under the cursor.
      const glow = 0.45 + 0.25 * Math.sin(this.pulse * Math.PI * 1.5);
      if (this.pieceHovered.kind === 'vertex') {
        const p = VERTEX_PX[this.pieceHovered.id];
        hg.lineStyle(5, 0xffffff, glow);
        hg.strokeEllipse(p.x, p.y, HEX_R * 0.7, HEX_R * 0.7 * CAMERA_K);
      } else {
        const [va, vb] = TOPOLOGY.edgeVertices[this.pieceHovered.id];
        hg.lineStyle(HEX_R * 0.2, 0xffffff, glow * 0.6);
        hg.lineBetween(VERTEX_PX[va].x, VERTEX_PX[va].y, VERTEX_PX[vb].x, VERTEX_PX[vb].y);
      }
    }
    if (this.hovered) {
      hg.lineStyle(3, 0xffffff, 0.9);
      if (this.hovered.kind === 'vertex') {
        const p = VERTEX_PX[this.hovered.id];
        hg.strokeCircle(p.x, p.y, HEX_R * 0.2);
      } else if (this.hovered.kind === 'edge') {
        const [va, vb] = TOPOLOGY.edgeVertices[this.hovered.id];
        hg.lineStyle(HEX_R * 0.16, 0xffffff, 0.5);
        hg.lineBetween(VERTEX_PX[va].x, VERTEX_PX[va].y, VERTEX_PX[vb].x, VERTEX_PX[vb].y);
      } else {
        hg.strokePoints(hexPolygon(this.hovered.id), true);
      }
    }
  }

  private setGhost(ghost: Ghost): void {
    this.ghost = ghost;
    this.ghostObj?.destroy();
    this.ghostObj = null;
    if (!ghost || !this.view) return;
    const colors = this.view.playerColors;
    if (ghost.kind === 'road') this.ghostObj = this.makeRoad(ghost.edge, ghost.player, colors, 0.6);
    else if (ghost.kind === 'robber') this.ghostObj = this.makeRobber(ghost.hex, 0.6);
    else this.ghostObj = this.makeBuilding(ghost.vertex, ghost.kind, ghost.player, colors, 0.6);
    const t = this.ghostObj as unknown as { setDepth?: (d: number) => void };
    t.setDepth?.(DEPTH.highlight - 1);
    this.tweens.add({ targets: this.ghostObj, alpha: { from: 0.35, to: 0.8 }, duration: 700, yoyo: true, repeat: -1 });
    this.emitGhostPosition();
  }

  /** Tells React where the ghost sits on the canvas so a confirm popover can anchor to it. */
  private emitGhostPosition(): void {
    const ghost = this.ghost;
    if (!ghost) {
      this.bridge.emit('ghostPosition', null);
      return;
    }
    let world: Point;
    if (ghost.kind === 'road') world = EDGE_PX[ghost.edge].mid;
    else if (ghost.kind === 'robber') world = HEX_PX[ghost.hex];
    else world = VERTEX_PX[ghost.vertex];
    const cam = this.cameras.main;
    const x = (world.x - cam.worldView.x) * cam.zoom;
    const y = (world.y - cam.worldView.y) * cam.zoom;
    this.bridge.emit('ghostPosition', { x, y });
  }
}

export function boardPixelSize(): Point {
  const b = boardBounds();
  return { x: b.maxX - b.minX, y: b.maxY - b.minY };
}
