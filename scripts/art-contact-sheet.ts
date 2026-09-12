/**
 * Review sheets for the generated art (npm run art:sheet):
 *   scripts/.art-cache/contact-sheet.png  every asset at 1:1 (tiles at 0.75) with labels
 *   scripts/.art-cache/sample-board.png   a 19-hex board with roads, buildings, robber,
 *                                         tokens and harbors placed with the renderer's
 *                                         geometry, to check tessellation and anchors.
 * Missing assets are drawn as labelled magenta boxes.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { HARBOR_EDGES, TOPOLOGY } from '../src/engine/board/topology';
import {
  ART_SCALE,
  HARBOR_IMAGE,
  HARBOR_KEYS,
  PIECE_IMAGE,
  PIECE_KEYS,
  ROAD_IMAGE,
  ROAD_KEYS,
  TILE_IMAGE,
  TILE_KEYS,
  TOKEN_IMAGE,
  allAssetPaths,
  tokenKey,
} from '../src/board-phaser/assets';
import { EDGE_PX, HEX_PX, VERTEX_PX, boardBounds } from '../src/board-phaser/geometry';
import { PLAYER_PIECE_KEYS, TILE_VARIANT_KEYS } from './art-manifest';
import { ART_CACHE_DIR } from './templates';

const OUT_DIR = path.join(process.cwd(), 'public', 'art');

function assetPath(key: string): string {
  return path.join(OUT_DIR, `${key}.png`);
}

async function loadAsset(key: string, w: number, h: number): Promise<Buffer> {
  const p = assetPath(key);
  if (fs.existsSync(p)) return fs.readFileSync(p);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#ff00ff" fill-opacity="0.5" stroke="#ff00ff" stroke-width="4"/><text x="${w / 2}" y="${h / 2}" font-family="Helvetica, Arial, sans-serif" font-size="20" text-anchor="middle" fill="#fff">${key}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function label(text: string, w: number, h = 22): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#000" fill-opacity="0.55"/><text x="6" y="${h - 6}" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#fff">${text}</text></svg>`,
  );
}

/** Multiply RGB by a colour (what Phaser's setTint does), keeping alpha. */
async function tint(png: Buffer, rgb: [number, number, number]): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (data[i] * rgb[0]) / 255;
    data[i + 1] = (data[i + 1] * rgb[1]) / 255;
    data[i + 2] = (data[i + 2] * rgb[2]) / 255;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

// ---------------------------------------------------------------------------
// Contact sheet
// ---------------------------------------------------------------------------

interface Cell {
  key: string;
  w: number;
  h: number;
  scale: number;
}

async function contactSheet(): Promise<string> {
  const keys = [...new Set([...allAssetPaths().map((a) => a.key), ...TILE_VARIANT_KEYS, ...PLAYER_PIECE_KEYS])];
  const sizeOf = (key: string): { w: number; h: number; scale: number } => {
    if (key.startsWith('hex-')) return { w: TILE_IMAGE.width, h: TILE_IMAGE.height, scale: 0.75 };
    if (key.startsWith('road-')) return { w: ROAD_IMAGE.width, h: ROAD_IMAGE.height, scale: 1 };
    if (key.startsWith('harbor-')) return { w: HARBOR_IMAGE.width, h: HARBOR_IMAGE.height, scale: 1 };
    if (key.startsWith('token-')) return { w: TOKEN_IMAGE.size, h: TOKEN_IMAGE.size, scale: 1 };
    if (key.startsWith('card-') || key.startsWith('dev-')) return { w: 300, h: 420, scale: 0.6 };
    if (key === 'sea') return { w: 512, h: 512, scale: 0.5 };
    return { w: PIECE_IMAGE.width, h: PIECE_IMAGE.height, scale: 1 };
  };
  const cells: Cell[] = keys.map((key) => ({ key, ...sizeOf(key) }));

  const maxW = 2400;
  const pad = 12;
  const labelH = 22;
  const placed: { cell: Cell; x: number; y: number; cw: number; ch: number }[] = [];
  let x = pad;
  let y = pad;
  let rowH = 0;
  for (const cell of cells) {
    const cw = Math.round(cell.w * cell.scale);
    const ch = Math.round(cell.h * cell.scale) + labelH;
    if (x + cw > maxW - pad && x > pad) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    placed.push({ cell, x, y, cw, ch });
    x += cw + pad;
    rowH = Math.max(rowH, ch);
  }
  const height = y + rowH + pad;

  const comps: OverlayOptions[] = [];
  for (const p of placed) {
    const png = await loadAsset(p.cell.key, p.cell.w, p.cell.h);
    let img = sharp(png);
    if (p.cell.scale !== 1) img = img.resize(p.cw, p.ch - labelH);
    comps.push({ input: await img.png().toBuffer(), left: p.x, top: p.y });
    comps.push({ input: label(p.cell.key, p.cw, labelH), left: p.x, top: p.y + p.ch - labelH });
  }
  // checkerboard-ish neutral background so transparency is visible
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${maxW}" height="${height}"><defs><pattern id="c" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#6a6a6a"/><rect x="16" y="16" width="16" height="16" fill="#6a6a6a"/><rect x="16" width="16" height="16" fill="#5a5a5a"/><rect y="16" width="16" height="16" fill="#5a5a5a"/></pattern></defs><rect width="${maxW}" height="${height}" fill="url(#c)"/></svg>`,
  );
  const out = path.join(ART_CACHE_DIR, 'contact-sheet.png');
  await sharp(bg).composite(comps).png().toFile(out);
  return out;
}

// ---------------------------------------------------------------------------
// Sample board
// ---------------------------------------------------------------------------

const PLAYER_TINTS: [number, number, number][] = [
  [220, 60, 50], // red
  [60, 110, 220], // blue
  [245, 245, 245], // white
  [235, 140, 30], // orange
];

async function sampleBoard(): Promise<string> {
  const b = boardBounds();
  const ox = -b.minX * ART_SCALE;
  const oy = -b.minY * ART_SCALE;
  const W = Math.ceil((b.maxX - b.minX) * ART_SCALE);
  const H = Math.ceil((b.maxY - b.minY) * ART_SCALE);

  type Layer = { y: number; comp: OverlayOptions };
  const layers: Layer[] = [];

  // Sea, tiled
  const sea = await loadAsset('sea', 512, 512);
  const seaComps: OverlayOptions[] = [];
  for (let ty = 0; ty < H; ty += 512) for (let tx = 0; tx < W; tx += 512) seaComps.push({ input: sea, left: tx, top: ty });
  const base = await sharp({ create: { width: W, height: H, channels: 4, background: '#1d4f6e' } })
    .composite(seaComps)
    .png()
    .toBuffer();

  // Terrain assignment: standard counts in reading order, desert in the middle.
  const terrains = [
    'mountains', 'pasture', 'forest',
    'fields', 'hills', 'pasture', 'hills',
    'fields', 'forest', 'desert', 'forest', 'mountains',
    'forest', 'mountains', 'fields', 'pasture',
    'hills', 'fields', 'pasture',
  ] as const;
  const tokens = [10, 2, 9, 12, 6, 4, 10, 9, 11, 0, 3, 8, 8, 3, 4, 5, 5, 6, 11];

  const tileCache = new Map<string, Buffer>();
  const variantCount = new Map<string, number>();
  for (let h = 0; h < HEX_PX.length; h++) {
    // Cycle through the composition variants (hex-x, hex-x-2, hex-x-3) when they exist.
    const base = TILE_KEYS[terrains[h]];
    const n = variantCount.get(base) ?? 0;
    variantCount.set(base, n + 1);
    const candidate = n % 3 === 0 ? base : `${base}-${(n % 3) + 1}`;
    const key = fs.existsSync(assetPath(candidate)) ? candidate : base;
    if (!tileCache.has(key)) tileCache.set(key, await loadAsset(key, TILE_IMAGE.width, TILE_IMAGE.height));
    const cx = ox + HEX_PX[h].x * ART_SCALE;
    const cy = oy + HEX_PX[h].y * ART_SCALE;
    layers.push({
      y: cy,
      comp: {
        input: tileCache.get(key)!,
        left: Math.round(cx - TILE_IMAGE.faceCenterX),
        top: Math.round(cy - TILE_IMAGE.faceCenterY),
      },
    });
  }
  // Tiles first (sorted by y), then everything else on top sorted by y.
  layers.sort((a, c) => a.y - c.y);
  const tileLayers = layers.splice(0, layers.length);

  // Tokens: on the tile, slightly north of centre
  for (let h = 0; h < HEX_PX.length; h++) {
    if (!tokens[h]) continue;
    const cx = ox + HEX_PX[h].x * ART_SCALE;
    const cy = oy + HEX_PX[h].y * ART_SCALE - 28;
    layers.push({
      y: -1e9, // tokens sit flat, draw before pieces
      comp: { input: await loadAsset(tokenKey(tokens[h]), 128, 128), left: Math.round(cx - 64), top: Math.round(cy - 64) },
    });
  }

  // Harbors on the first three harbor edges, pushed outward; mirrored on the west coast.
  const harborKinds = [HARBOR_KEYS.generic, HARBOR_KEYS.brick, HARBOR_KEYS.wool];
  for (let i = 0; i < 3; i++) {
    const e = EDGE_PX[HARBOR_EDGES[i]];
    const px = ox + (e.mid.x + e.outward.x * 62) * ART_SCALE;
    const py = oy + (e.mid.y + e.outward.y * 62) * ART_SCALE;
    let img = sharp(await loadAsset(harborKinds[i], HARBOR_IMAGE.width, HARBOR_IMAGE.height));
    if (e.outward.x < 0) img = img.flop();
    layers.push({
      y: py,
      comp: { input: await img.png().toBuffer(), left: Math.round(px - HARBOR_IMAGE.anchorX), top: Math.round(py - HARBOR_IMAGE.anchorY) },
    });
  }

  // Roads: a few of each orientation, coloured per player.
  const roadEdges: { edge: number; player: number }[] = [];
  const seen = new Set<string>();
  for (let e = 0; e < EDGE_PX.length && roadEdges.length < 9; e++) {
    const o = EDGE_PX[e].orientation;
    const hexes = TOPOLOGY.edgeHexes[e];
    if (hexes.length < 2) continue; // interior edges only, easier to judge
    const k = `${o}-${roadEdges.filter((r) => EDGE_PX[r.edge].orientation === o).length}`;
    if (seen.has(k) || roadEdges.filter((r) => EDGE_PX[r.edge].orientation === o).length >= 3) continue;
    if (e % 4 !== 0) continue;
    seen.add(k);
    roadEdges.push({ edge: e, player: roadEdges.length % 4 });
  }
  const roadCache = new Map<string, Buffer>();
  for (const { edge, player } of roadEdges) {
    const e = EDGE_PX[edge];
    const key = ROAD_KEYS[e.orientation];
    const cacheKey = `${key}-${player}`;
    if (!roadCache.has(cacheKey)) {
      roadCache.set(cacheKey, await tint(await loadAsset(key, ROAD_IMAGE.width, ROAD_IMAGE.height), PLAYER_TINTS[player]));
    }
    const px = ox + e.mid.x * ART_SCALE;
    const py = oy + e.mid.y * ART_SCALE;
    layers.push({
      y: py,
      comp: { input: roadCache.get(cacheKey)!, left: Math.round(px - ROAD_IMAGE.anchorX), top: Math.round(py - ROAD_IMAGE.anchorY) },
    });
  }

  // Buildings at the endpoints of the first few roads.
  const settlement = await loadAsset(PIECE_KEYS.settlement, PIECE_IMAGE.width, PIECE_IMAGE.height);
  const city = await loadAsset(PIECE_KEYS.city, PIECE_IMAGE.width, PIECE_IMAGE.height);
  const usedVertices = new Set<number>();
  let n = 0;
  for (const { edge, player } of roadEdges) {
    const v = TOPOLOGY.edgeVertices[edge][n % 2];
    if (usedVertices.has(v)) continue;
    usedVertices.add(v);
    const isCity = n % 3 === 2;
    // Prefer the per-player full-colour piece; fall back to the tinted neutral one.
    const perPlayer = assetPath(`${isCity ? 'city' : 'settlement'}-${player + 1}`);
    const img = fs.existsSync(perPlayer) ? fs.readFileSync(perPlayer) : await tint(isCity ? city : settlement, PLAYER_TINTS[player]);
    const px = ox + VERTEX_PX[v].x * ART_SCALE;
    const py = oy + VERTEX_PX[v].y * ART_SCALE;
    layers.push({ y: py, comp: { input: img, left: Math.round(px - PIECE_IMAGE.anchorX), top: Math.round(py - PIECE_IMAGE.anchorY) } });
    n++;
  }

  // Robber on the desert.
  const desert = terrains.indexOf('desert');
  {
    const px = ox + HEX_PX[desert].x * ART_SCALE;
    const py = oy + HEX_PX[desert].y * ART_SCALE + 30;
    layers.push({
      y: py,
      comp: {
        input: await loadAsset(PIECE_KEYS.robber, PIECE_IMAGE.width, PIECE_IMAGE.height),
        left: Math.round(px - PIECE_IMAGE.anchorX),
        top: Math.round(py - PIECE_IMAGE.anchorY),
      },
    });
  }

  layers.sort((a, c) => a.y - c.y);
  const out = path.join(ART_CACHE_DIR, 'sample-board.png');
  await sharp(base)
    .composite([...tileLayers.map((l) => l.comp), ...layers.map((l) => l.comp)])
    .png()
    .toFile(out);
  return out;
}

async function main(): Promise<void> {
  fs.mkdirSync(ART_CACHE_DIR, { recursive: true });
  console.log('wrote', await contactSheet());
  console.log('wrote', await sampleBoard());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
