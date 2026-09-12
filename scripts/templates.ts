/**
 * Geometry templates and masks for the art pipeline.
 *
 * Everything is derived from the asset contract in src/board-phaser/assets.ts so
 * that the generated artwork lines up with the renderer's oblique camera. Every
 * function takes a `scale` (API images are generated at 2x/4x the asset size and
 * shrunk afterwards) and returns a PNG buffer.
 *
 * Mask convention (OpenAI images.edit): transparent pixels (alpha 0) are the area
 * the model may repaint; opaque pixels must stay untouched.
 *
 * Run `npx tsx scripts/templates.ts` to dump every template into
 * scripts/.art-cache/templates/ for inspection.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  ART_SCALE,
  CAMERA_K,
  HEX_R,
  PIECE_IMAGE,
  ROAD_IMAGE,
  TILE_IMAGE,
  type RoadOrientation,
} from '../src/board-phaser/assets';

export interface Pt {
  x: number;
  y: number;
}

/** Cache dir for raw API output, templates and review sheets (gitignored). */
export const ART_CACHE_DIR = path.resolve(process.cwd(), 'scripts/.art-cache');

const SVG_NS = 'xmlns="http://www.w3.org/2000/svg"';

// ---------------------------------------------------------------------------
// Tile geometry
// ---------------------------------------------------------------------------

/** Screen-space corners of the top face inside the tile image (1x), N first, clockwise. */
export function tileTopCorners(scale = 1): Pt[] {
  const rx = HEX_R * ART_SCALE;
  const ry = HEX_R * CAMERA_K * ART_SCALE;
  const out: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (-90 + 60 * i);
    out.push({
      x: (TILE_IMAGE.faceCenterX + rx * Math.cos(a)) * scale,
      y: (TILE_IMAGE.faceCenterY + ry * Math.sin(a)) * scale,
    });
  }
  return out;
}

/** Full prism silhouette: top face plus the two south side faces. */
export function tileSilhouette(scale = 1): Pt[] {
  const [n, ne, se, s, sw, nw] = tileTopCorners(scale);
  const h = TILE_IMAGE.sideHeight * scale;
  return [n, ne, se, { x: se.x, y: se.y + h }, { x: s.x, y: s.y + h }, { x: sw.x, y: sw.y + h }, sw, nw];
}

/** Top face hexagon grown outward by `px` pixels (in screen space, isotropic). */
export function dilatedTopFace(px: number, scale = 1): Pt[] {
  const corners = tileTopCorners(scale);
  const c = { x: TILE_IMAGE.faceCenterX * scale, y: TILE_IMAGE.faceCenterY * scale };
  // Offsetting a convex polygon: move each edge outward along its normal by px and
  // intersect adjacent offset edges.
  const n = corners.length;
  const lines = corners.map((p, i) => {
    const q = corners[(i + 1) % n];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy);
    let nx = dy / len;
    let ny = -dx / len;
    // make the normal point away from the centre
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    if ((mid.x - c.x) * nx + (mid.y - c.y) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { p: { x: p.x + nx * px, y: p.y + ny * px }, d: { x: dx, y: dy } };
  });
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i + n - 1) % n];
    const b = lines[i];
    // intersect a.p + t*a.d with b.p + u*b.d
    const det = a.d.x * b.d.y - a.d.y * b.d.x;
    const t = ((b.p.x - a.p.x) * b.d.y - (b.p.y - a.p.y) * b.d.x) / det;
    out.push({ x: a.p.x + t * a.d.x, y: a.p.y + t * a.d.y });
  }
  return out;
}

function poly(pts: Pt[]): string {
  return pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

function tileSize(scale: number): { w: number; h: number } {
  return { w: TILE_IMAGE.width * scale, h: TILE_IMAGE.height * scale };
}

/** Blank hex prism: flat mid-grey top face, grey-brown rock side faces, transparent outside. */
export function tileTemplateSvg(scale = 2): string {
  const { w, h } = tileSize(scale);
  const [, , se, s, sw] = tileTopCorners(scale);
  const sh = TILE_IMAGE.sideHeight * scale;
  const top = poly(tileTopCorners(scale));
  const faceSE = poly([se, s, { x: s.x, y: s.y + sh }, { x: se.x, y: se.y + sh }]);
  const faceSW = poly([s, sw, { x: sw.x, y: sw.y + sh }, { x: s.x, y: s.y + sh }]);
  const strata = [0.22, 0.48, 0.71, 0.9]
    .map((f) => {
      const y1 = se.y + sh * f;
      const y2 = s.y + sh * f;
      const y3 = sw.y + sh * f;
      return `<polyline points="${se.x},${y1} ${s.x},${y2} ${sw.x},${y3}" fill="none" stroke="#3c2f22" stroke-opacity="0.35" stroke-width="${1.5 * scale}"/>`;
    })
    .join('');
  return `<svg ${SVG_NS} width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <filter id="rock" x="0" y="0" width="1" height="1">
      <feTurbulence type="fractalNoise" baseFrequency="${0.045 / scale} ${0.09 / scale}" numOctaves="4" seed="7"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.45"/></feComponentTransfer>
    </filter>
    <filter id="grain" x="0" y="0" width="1" height="1">
      <feTurbulence type="fractalNoise" baseFrequency="${0.03 / scale}" numOctaves="3" seed="3"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.18"/></feComponentTransfer>
    </filter>
    <clipPath id="clipSE"><polygon points="${faceSE}"/></clipPath>
    <clipPath id="clipSW"><polygon points="${faceSW}"/></clipPath>
    <clipPath id="clipTop"><polygon points="${top}"/></clipPath>
    <linearGradient id="gSE" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6e5a44"/><stop offset="1" stop-color="#4a3b2b"/></linearGradient>
    <linearGradient id="gSW" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a745a"/><stop offset="1" stop-color="#5c4a37"/></linearGradient>
  </defs>
  <!-- south-east face: in shadow (light from top-left) -->
  <polygon points="${faceSE}" fill="url(#gSE)"/>
  <rect width="${w}" height="${h}" filter="url(#rock)" clip-path="url(#clipSE)"/>
  <!-- south-west face: lit -->
  <polygon points="${faceSW}" fill="url(#gSW)"/>
  <rect width="${w}" height="${h}" filter="url(#rock)" clip-path="url(#clipSW)"/>
  ${strata}
  <!-- top face -->
  <polygon points="${top}" fill="#8f8a80"/>
  <rect width="${w}" height="${h}" filter="url(#grain)" clip-path="url(#clipTop)"/>
  <polygon points="${top}" fill="none" stroke="#5a5650" stroke-opacity="0.5" stroke-width="${1.5 * scale}"/>
</svg>`;
}

export async function tileTemplatePng(scale = 2): Promise<Buffer> {
  return sharp(Buffer.from(tileTemplateSvg(scale))).png().toBuffer();
}

/**
 * Edit mask for tiles: transparent (editable) over the top face dilated by
 * `dilatePx` (asset-space pixels), opaque everywhere else.
 */
export async function tileMaskPng(scale = 2, dilatePx = 12): Promise<Buffer> {
  const { w, h } = tileSize(scale);
  const svg = `<svg ${SVG_NS} width="${w}" height="${h}">
  <defs><mask id="m"><rect width="${w}" height="${h}" fill="white"/><polygon points="${poly(dilatedTopFace(dilatePx * scale, scale))}" fill="black"/></mask></defs>
  <rect width="${w}" height="${h}" fill="black" mask="url(#m)"/>
</svg>`;
  return sharp(Buffer.from(svg)).ensureAlpha().png().toBuffer();
}

/**
 * Clip used in post-processing, meant for `composite([{ input, blend: 'dest-in' }])`:
 * opaque white where a tile pixel may exist (prism silhouette union the top face
 * dilated by `dilatePx`), fully transparent outside.
 */
export async function tileClipPng(scale = 1, dilatePx = 12): Promise<Buffer> {
  const { w, h } = tileSize(scale);
  const svg = `<svg ${SVG_NS} width="${w}" height="${h}">
  <polygon points="${poly(tileSilhouette(scale))}" fill="white"/>
  <polygon points="${poly(dilatedTopFace(dilatePx * scale, scale))}" fill="white"/>
</svg>`;
  return sharp(Buffer.from(svg)).ensureAlpha().png().toBuffer();
}

/** Same as tileClipPng but only the exact prism silhouette (no dilation). */
export async function tileSilhouettePng(scale = 1): Promise<Buffer> {
  const { w, h } = tileSize(scale);
  const svg = `<svg ${SVG_NS} width="${w}" height="${h}">
  <polygon points="${poly(tileSilhouette(scale))}" fill="white"/>
</svg>`;
  return sharp(Buffer.from(svg)).ensureAlpha().png().toBuffer();
}

// ---------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------

/** Fraction of the full edge length a road sprite covers (leaves room for buildings). */
export const ROAD_LENGTH_FRACTION = 0.82;
export const ROAD_WIDTH = 36;

export interface RoadGeom {
  /** Screen-space angle in degrees (y down). */
  angleDeg: number;
  /** Length in asset pixels. */
  length: number;
}

export function roadGeom(orientation: RoadOrientation): RoadGeom {
  const vertical = HEX_R * CAMERA_K * ART_SCALE; // 177
  const dx = HEX_R * (Math.sqrt(3) / 2) * ART_SCALE;
  const dy = HEX_R * 0.5 * CAMERA_K * ART_SCALE;
  const diag = Math.hypot(dx, dy); // 271
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI; // 19.1
  switch (orientation) {
    case 'vertical':
      return { angleDeg: 90, length: vertical * ROAD_LENGTH_FRACTION };
    case 'down':
      return { angleDeg: angle, length: diag * ROAD_LENGTH_FRACTION };
    case 'up':
      return { angleDeg: -angle, length: diag * ROAD_LENGTH_FRACTION };
  }
}

/** Axis-aligned bounding box of the plank, in pixels at `scale`. */
export function roadBBox(orientation: RoadOrientation, scale = 1): { left: number; top: number; width: number; height: number } {
  const g = roadGeom(orientation);
  const len = g.length * scale;
  const wid = ROAD_WIDTH * scale;
  const a = (g.angleDeg * Math.PI) / 180;
  const hw = (Math.abs(Math.cos(a)) * len + Math.abs(Math.sin(a)) * wid) / 2;
  const hh = (Math.abs(Math.sin(a)) * len + Math.abs(Math.cos(a)) * wid) / 2;
  const cx = ROAD_IMAGE.anchorX * scale;
  const cy = ROAD_IMAGE.anchorY * scale;
  return { left: cx - hw, top: cy - hh, width: 2 * hw, height: 2 * hh };
}

function roadRect(orientation: RoadOrientation, scale: number, grow = 0): string {
  const g = roadGeom(orientation);
  const len = g.length * scale + grow * 2;
  const wid = ROAD_WIDTH * scale + grow * 2;
  const cx = ROAD_IMAGE.anchorX * scale;
  const cy = ROAD_IMAGE.anchorY * scale;
  return `<rect x="${-len / 2}" y="${-wid / 2}" width="${len}" height="${wid}" rx="${wid / 2}" transform="translate(${cx} ${cy}) rotate(${g.angleDeg})"`;
}

/** A flat light-grey plank on transparent, for the edits endpoint. */
export function roadTemplateSvg(orientation: RoadOrientation, scale = 4): string {
  const w = ROAD_IMAGE.width * scale;
  const h = ROAD_IMAGE.height * scale;
  return `<svg ${SVG_NS} width="${w}" height="${h}">
  ${roadRect(orientation, scale)} fill="#d9d6d0" stroke="#9a968f" stroke-width="${1.5 * scale}"/>
</svg>`;
}

export async function roadTemplatePng(orientation: RoadOrientation, scale = 4): Promise<Buffer> {
  return sharp(Buffer.from(roadTemplateSvg(orientation, scale))).png().toBuffer();
}

/** Editable (transparent) over the plank dilated by `dilatePx` asset pixels. */
export async function roadMaskPng(orientation: RoadOrientation, scale = 4, dilatePx = 10): Promise<Buffer> {
  const w = ROAD_IMAGE.width * scale;
  const h = ROAD_IMAGE.height * scale;
  const svg = `<svg ${SVG_NS} width="${w}" height="${h}">
  <defs><mask id="m"><rect width="${w}" height="${h}" fill="white"/>${roadRect(orientation, scale, dilatePx * scale)} fill="black"/></mask></defs>
  <rect width="${w}" height="${h}" fill="black" mask="url(#m)"/>
</svg>`;
  return sharp(Buffer.from(svg)).ensureAlpha().png().toBuffer();
}

/** Opaque white where a road pixel may exist (plank dilated), transparent elsewhere; for `dest-in`. */
export async function roadClipPng(orientation: RoadOrientation, scale = 1, dilatePx = 10): Promise<Buffer> {
  const w = ROAD_IMAGE.width * scale;
  const h = ROAD_IMAGE.height * scale;
  const svg = `<svg ${SVG_NS} width="${w}" height="${h}">
  ${roadRect(orientation, scale, dilatePx * scale)} fill="white"/>
</svg>`;
  return sharp(Buffer.from(svg)).ensureAlpha().png().toBuffer();
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** Empty transparent canvas used as the base image for piece/harbor edits. */
export async function pieceTemplatePng(scale = 4): Promise<Buffer> {
  return sharp({
    create: {
      width: PIECE_IMAGE.width * scale,
      height: PIECE_IMAGE.height * scale,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// CLI: dump templates for inspection
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dir = path.join(ART_CACHE_DIR, 'templates');
  fs.mkdirSync(dir, { recursive: true });
  const write = async (name: string, buf: Promise<Buffer>) => {
    fs.writeFileSync(path.join(dir, name), await buf);
    console.log(`wrote ${path.join(dir, name)}`);
  };
  await write('tile-template@2x.png', tileTemplatePng(2));
  await write('tile-mask@2x.png', tileMaskPng(2));
  await write('tile-clip@1x.png', tileClipPng(1));
  await write('tile-silhouette@1x.png', tileSilhouettePng(1));
  for (const o of ['vertical', 'down', 'up'] as RoadOrientation[]) {
    await write(`road-${o}-template@4x.png`, roadTemplatePng(o, 4));
    await write(`road-${o}-mask@4x.png`, roadMaskPng(o, 4));
  }
  await write('piece-template@4x.png', pieceTemplatePng(4));
  console.log('top face corners (1x):', tileTopCorners(1).map((p) => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).join(' '));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
