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
  TILE_KEYS,
  TOKEN_IMAGE,
  tokenKey,
} from './assets';
import type { BoardBridge } from './BoardBridge';
import { boardBounds, EDGE_PX, HEX_PX, hexPolygon, VERTEX_PX, type Point } from './geometry';
import type { BoardView, Ghost, Highlights } from './view';

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
  private highlights: Highlights = { vertices: [], edges: [], hexes: [] };
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
    this.cameras.main.setBounds(b.minX, b.minY, width, height);
    this.cameras.main.centerOn((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    const zoom = Math.min(this.scale.width / width, this.scale.height / height);
    this.cameras.main.setZoom(zoom);

    this.drawSea(b.minX, b.minY, width, height);
    this.highlightGfx = this.add.graphics().setDepth(DEPTH.highlight);
    this.hoverGfx = this.add.graphics().setDepth(DEPTH.highlight + 1);
    this.createZones();

    this.unsubscribe.push(this.bridge.onScene('view', (v) => this.setView(v)));
    this.unsubscribe.push(this.bridge.onScene('highlights', (h) => this.setHighlights(h)));
    this.unsubscribe.push(this.bridge.onScene('ghost', (g) => this.setGhost(g)));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe.forEach((u) => u()));
    this.scale.on(Phaser.Scale.Events.RESIZE, () => {
      const z = Math.min(this.scale.width / width, this.scale.height / height);
      this.cameras.main.setZoom(z);
      this.cameras.main.centerOn((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    });
    this.bridge.emit('ready', undefined);
  }

  override update(_time: number, delta: number): void {
    this.pulse += delta / 600;
    this.drawHighlights();
  }

  private has(key: string): boolean {
    return this.textures.exists(key);
  }

  // ---------- static layers ----------

  private drawSea(x: number, y: number, w: number, h: number): void {
    if (this.has(MISC_KEYS.sea)) {
      const scale = DISPLAY_SCALE * 1.5;
      this.add
        .tileSprite(x, y, w / scale, h / scale, MISC_KEYS.sea)
        .setOrigin(0, 0)
        .setScale(scale)
        .setDepth(DEPTH.sea);
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
      const key = TILE_KEYS[tile.terrain];
      const depth = DEPTH.tile + c.y * 0.001;
      if (this.has(key)) {
        const img = this.add
          .image(c.x, c.y, key)
          .setOrigin(TILE_IMAGE.faceCenterX / TILE_IMAGE.width, TILE_IMAGE.faceCenterY / TILE_IMAGE.height)
          .setScale(DISPLAY_SCALE)
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
        if (eg.outward.x < -0.2) img.setFlipX(true);
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
    const key = PIECE_KEYS[kind];
    const depth = DEPTH.piece + p.y * 0.001 + 0.0001;
    const scale = kind === 'city' ? 0.62 : 0.5;
    if (this.has(key)) {
      return this.add
        .image(p.x, p.y, key)
        .setOrigin(PIECE_IMAGE.anchorX / PIECE_IMAGE.width, PIECE_IMAGE.anchorY / PIECE_IMAGE.height)
        .setScale(DISPLAY_SCALE * scale * 1.15)
        .setTint(tint)
        .setAlpha(alpha)
        .setDepth(depth);
    }
    const g = this.add.graphics().setDepth(depth).setAlpha(alpha);
    const s = HEX_R * 0.18 * (kind === 'city' ? 1.35 : 1);
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

  private createZones(): void {
    for (let v = 0; v < VERTEX_COUNT; v++) {
      const p = VERTEX_PX[v];
      const zone = this.add.zone(p.x, p.y, HEX_R * 0.36, HEX_R * 0.36).setDepth(DEPTH.zone);
      zone.setInteractive(new Phaser.Geom.Circle(HEX_R * 0.18, HEX_R * 0.18, HEX_R * 0.18), Phaser.Geom.Circle.Contains);
      zone.disableInteractive();
      zone.on('pointerdown', () => this.bridge.emit('vertexClick', v));
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
      zone.on('pointerdown', () => this.bridge.emit('edgeClick', e));
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
      zone.on('pointerdown', () => this.bridge.emit('hexClick', h));
      zone.on('pointerover', () => this.hover({ kind: 'hex', id: h }));
      zone.on('pointerout', () => this.hover(null));
      this.hexZones.push(zone);
    }
  }

  private hovered: { kind: 'vertex' | 'edge' | 'hex'; id: number } | null = null;

  private hover(target: { kind: 'vertex' | 'edge' | 'hex'; id: number } | null): void {
    this.hovered = target;
    this.input.setDefaultCursor(target ? 'pointer' : 'default');
  }

  private setHighlights(h: Highlights): void {
    this.highlights = h;
    const vs = new Set(h.vertices);
    const es = new Set(h.edges);
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
    const hg = this.hoverGfx;
    hg.clear();
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
  }
}

export function boardPixelSize(): Point {
  const b = boardBounds();
  return { x: b.maxX - b.minX, y: b.maxY - b.minY };
}
